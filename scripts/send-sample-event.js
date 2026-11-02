import crypto from 'node:crypto';
import http from 'node:http';
import 'dotenv/config';

const secret = process.env.WEBHOOK_SECRET;
const port = process.env.PORT || 3000;

if (!secret) {
  console.error('[error] WEBHOOK_SECRET is not set in .env.');
  process.exit(1);
}

const args = process.argv.slice(2);
const invalidSig = args.includes('--invalid-signature') || args.includes('--invalid-sig');
const testDuplicate = args.includes('--duplicate');
const testTooLarge = args.includes('--too-large');

const eventArg = args.find((a) => a.startsWith('--event='));
const eventType = eventArg ? eventArg.split('=')[1] : args.includes('--ping') ? 'ping' : 'push';

// Build sample payloads for different GitHub events
const samplePayloads = {
  ping: {
    zen: 'Design for failure.',
    hook_id: 123456789,
    hook: {
      type: 'Repository',
      id: 123456789,
      name: 'web',
      active: true,
      events: ['*'],
    },
    repository: {
      id: 987654321,
      name: 'sample-repo',
      full_name: 'octocat/sample-repo',
      private: false,
      html_url: 'https://github.com/octocat/sample-repo',
      owner: {
        id: 583231,
        login: 'octocat',
        avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
        html_url: 'https://github.com/octocat',
      },
    },
    sender: {
      id: 583231,
      login: 'octocat',
      avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
      html_url: 'https://github.com/octocat',
    },
  },
  push: {
    ref: 'refs/heads/main',
    before: '0000000000000000000000000000000000000000',
    after: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
    repository: {
      id: 987654321,
      name: 'sample-repo',
      full_name: 'octocat/sample-repo',
      private: false,
      html_url: 'https://github.com/octocat/sample-repo',
      owner: {
        id: 583231,
        login: 'octocat',
      },
    },
    commits: [
      {
        id: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
        message: 'fix: update configuration logic',
        timestamp: new Date().toISOString(),
        url: 'https://github.com/octocat/sample-repo/commit/6dcb09b',
      },
    ],
    sender: {
      id: 583231,
      login: 'octocat',
      avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
      html_url: 'https://github.com/octocat',
    },
  },
  issues: {
    action: 'opened',
    issue: {
      id: 10001,
      number: 42,
      title: 'Bug report: connection timeout on edge networks',
      html_url: 'https://github.com/octocat/sample-repo/issues/42',
      state: 'open',
    },
    repository: {
      id: 987654321,
      name: 'sample-repo',
      full_name: 'octocat/sample-repo',
      owner: { id: 583231, login: 'octocat' },
    },
    sender: {
      id: 583231,
      login: 'octocat',
      avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
    },
  },
  pull_request: {
    action: 'opened',
    number: 7,
    pull_request: {
      id: 20001,
      number: 7,
      title: 'feat: add real-time webhook ingestion',
      state: 'open',
      html_url: 'https://github.com/octocat/sample-repo/pull/7',
    },
    repository: {
      id: 987654321,
      name: 'sample-repo',
      full_name: 'octocat/sample-repo',
      owner: { id: 583231, login: 'octocat' },
    },
    sender: {
      id: 583231,
      login: 'octocat',
      avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
    },
  },
  watch: {
    action: 'started',
    repository: {
      id: 987654321,
      name: 'sample-repo',
      full_name: 'octocat/sample-repo',
      owner: { id: 583231, login: 'octocat' },
    },
    sender: {
      id: 583231,
      login: 'octocat',
      avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
    },
  },
};

const payloadObj = samplePayloads[eventType] || {
  eventType,
  timestamp: new Date().toISOString(),
  info: 'Generic sample payload',
};

let rawPayloadString = JSON.stringify(payloadObj);

if (testTooLarge) {
  // Generate a payload over 5 MB to test 413 rejection
  const bigChunk = 'X'.repeat(1024 * 1024 * 5.2);
  rawPayloadString = JSON.stringify({ tooLarge: bigChunk });
}

function sendRequest(deliveryId, signature) {
  return new Promise((resolve, reject) => {
    const postData = Buffer.from(rawPayloadString, 'utf8');

    const options = {
      hostname: 'localhost',
      port,
      path: '/webhooks/github',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
        'X-GitHub-Event': eventType,
        'X-GitHub-Delivery': deliveryId,
        'X-Hub-Signature-256': signature,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function run() {
  const deliveryId = crypto.randomUUID();
  let signature;

  if (invalidSig) {
    signature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    console.log(`[sample-sender] Simulating request with INVALID signature...`);
  } else {
    const calculatedHash = crypto
      .createHmac('sha256', secret)
      .update(Buffer.from(rawPayloadString, 'utf8'))
      .digest('hex');
    signature = `sha256=${calculatedHash}`;
    console.log(`[sample-sender] Generated valid HMAC signature.`);
  }

  console.log(`[sample-sender] Event: "${eventType}", Delivery ID: "${deliveryId}"`);
  console.log(`[sample-sender] Sending POST http://localhost:${port}/webhooks/github ...`);

  const response = await sendRequest(deliveryId, signature);
  console.log(`[sample-sender] HTTP Status: ${response.statusCode}`);
  console.log(`[sample-sender] Response: ${response.body}`);

  if (testDuplicate && !invalidSig && response.statusCode === 202) {
    console.log(`\n[sample-sender] Sending the SAME Delivery ID again to test duplicate blocking (FR-2.9)...`);
    const duplicateResponse = await sendRequest(deliveryId, signature);
    console.log(`[sample-sender] Duplicate HTTP Status: ${duplicateResponse.statusCode}`);
    console.log(`[sample-sender] Duplicate Response: ${duplicateResponse.body}`);
  }
}

run().catch((err) => {
  console.error('[sample-sender] Request failed:', err.message);
  process.exit(1);
});

