import crypto from 'node:crypto';
import http from 'node:http';
import { eq } from 'drizzle-orm';

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { db } from '../src/db/index.js';
import { events } from '../src/modules/events/event.schema.js';
import { repositories } from '../src/modules/repositories/repository.schema.js';
import { githubUsers } from '../src/modules/github-users/github-user.schema.js';

function makeRequest({ serverPort, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function computeSignature(payloadString, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(payloadString, 'utf8'))
    .digest('hex');
  return `sha256=${hash}`;
}

async function runTests() {
  console.log('--- Starting Webhook & Feature 4 Normalization Tests ---\n');

  const server = app.listen(0);
  const serverPort = server.address().port;

  let allPassed = true;

  try {
    // Test 1: Ping handshake (FR-2.7, FR-3.3)
    {
      const deliveryId = crypto.randomUUID();
      const payload = JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 123 });
      const signature = computeSignature(payload, env.webhookSecret);

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'ping',
          'X-GitHub-Delivery': deliveryId,
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      const inDb = await db.select().from(events).where(eq(events.deliveryId, deliveryId));

      if (res.status === 200 && inDb.length === 0) {
        console.log('✔ Test 1 PASS: Ping event returns 200 OK and is not stored in DB (FR-2.7, FR-3.3)');
      } else {
        console.error('✘ Test 1 FAIL: Expected 200 and not in DB. Got status:', res.status, 'db rows:', inDb.length);
        allPassed = false;
      }
    }

    // Test 2: Valid event saved with status 'received' (FR-2.8)
    let savedDeliveryId;
    {
      savedDeliveryId = crypto.randomUUID();
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        commits: [{ message: 'Initial commit' }],
        repository: { id: 111, full_name: 'test/repo', owner: { login: 'test' } },
        sender: { id: 222, login: 'alice' },
      });
      const signature = computeSignature(payload, env.webhookSecret);

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': savedDeliveryId,
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      const [inDb] = await db.select().from(events).where(eq(events.deliveryId, savedDeliveryId));

      if (res.status === 202 && inDb && inDb.status === 'received' && inDb.eventType === 'push') {
        console.log('✔ Test 2 PASS: Valid push event returns 202 Accepted and is saved with status "received" (FR-2.8)');
      } else {
        console.error('✘ Test 2 FAIL: Expected 202 Accepted and row in DB. Got:', res, inDb);
        allPassed = false;
      }
    }

    // Test 3: Idempotency / Duplicate delivery protection (FR-2.9, FR-1.4)
    {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        commits: [{ message: 'Initial commit' }],
      });
      const signature = computeSignature(payload, env.webhookSecret);

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': savedDeliveryId, // Reusing previous delivery ID
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      const inDb = await db.select().from(events).where(eq(events.deliveryId, savedDeliveryId));

      if (res.status === 200 && inDb.length === 1) {
        console.log('✔ Test 3 PASS: Duplicate delivery returns 200 OK and prevents duplicate DB rows (FR-2.9, FR-1.4)');
      } else {
        console.error('✘ Test 3 FAIL: Expected 200 OK and exactly 1 row. Got status:', res.status, 'db count:', inDb.length);
        allPassed = false;
      }
    }

    // Test 4: Invalid signature rejection (FR-2.5)
    {
      const deliveryId = crypto.randomUUID();
      const payload = JSON.stringify({ ref: 'refs/heads/main' });
      const badSignature = 'sha256=1111111111111111111111111111111111111111111111111111111111111111';

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': deliveryId,
          'X-Hub-Signature-256': badSignature,
        },
        body: payload,
      });

      const inDb = await db.select().from(events).where(eq(events.deliveryId, deliveryId));

      if (res.status === 401 && inDb.length === 0) {
        console.log('✔ Test 4 PASS: Invalid signature returns 401 Unauthorized and touches no DB records (FR-2.5)');
      } else {
        console.error('✘ Test 4 FAIL: Expected 401 Unauthorized and no DB rows. Got:', res.status, inDb.length);
        allPassed = false;
      }
    }

    // Test 5: Payload > 5 MB rejection (FR-2.11)
    {
      const deliveryId = crypto.randomUUID();
      const bigString = 'A'.repeat(1024 * 1024 * 5.2);
      const payload = JSON.stringify({ data: bigString });
      const signature = computeSignature(payload, env.webhookSecret);

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': deliveryId,
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      if (res.status === 413) {
        console.log('✔ Test 5 PASS: Payloads > 5 MB are rejected with 413 Payload Too Large (FR-2.11)');
      } else {
        console.error('✘ Test 5 FAIL: Expected 413 status code. Got:', res.status);
        allPassed = false;
      }
    }

    // Test 6: FR-4.1, FR-4.2, FR-4.3, FR-4.6: PR Normalization + Plain text title + Foreign keys
    {
      const deliveryId = crypto.randomUUID();
      const payload = JSON.stringify({
        action: 'opened',
        number: 4,
        pull_request: {
          number: 4,
          title: 'Fix login bug <script>alert(1)</script>',
          html_url: 'https://github.com/octocat/sample-repo/pull/4',
        },
        repository: {
          id: 555001,
          full_name: 'octocat/sample-repo',
          owner: { login: 'octocat' },
          html_url: 'https://github.com/octocat/sample-repo',
          private: false,
        },
        sender: {
          id: 777001,
          login: 'octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/777001',
          html_url: 'https://github.com/octocat',
        },
      });
      const signature = computeSignature(payload, env.webhookSecret);

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'pull_request',
          'X-GitHub-Delivery': deliveryId,
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      const [eventInDb] = await db.select().from(events).where(eq(events.deliveryId, deliveryId));
      const [repoInDb] = await db.select().from(repositories).where(eq(repositories.githubRepoId, 555001));
      const [userInDb] = await db.select().from(githubUsers).where(eq(githubUsers.githubUserId, 777001));

      const expectedTitle = 'PR #4 opened: Fix login bug';
      const expectedUrl = 'https://github.com/octocat/sample-repo/pull/4';

      if (
        res.status === 202 &&
        eventInDb &&
        eventInDb.title === expectedTitle &&
        eventInDb.sourceUrl === expectedUrl &&
        eventInDb.repositoryId === repoInDb.id &&
        eventInDb.senderId === userInDb.id &&
        eventInDb.payload.pull_request.title.includes('<script>') // original payload unchanged
      ) {
        console.log(`✔ Test 6 PASS: PR event normalized correctly: "${eventInDb.title}" with linked repo and user (FR-4.1, FR-4.2, FR-4.3, FR-4.6)`);
      } else {
        console.error('✘ Test 6 FAIL: Event normalization failed.', { res, eventInDb, repoInDb, userInDb });
        allPassed = false;
      }
    }

    // Test 7: FR-4.5: Events with NO repository and NO sender
    {
      const deliveryId = crypto.randomUUID();
      const payload = JSON.stringify({
        action: 'created',
        organization: { login: 'big-corp' },
      });
      const signature = computeSignature(payload, env.webhookSecret);

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'membership',
          'X-GitHub-Delivery': deliveryId,
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      const [eventInDb] = await db.select().from(events).where(eq(events.deliveryId, deliveryId));

      if (res.status === 202 && eventInDb && eventInDb.repositoryId === null && eventInDb.senderId === null) {
        console.log('✔ Test 7 PASS: Organization event without repo/sender saved without error (FR-4.5)');
      } else {
        console.error('✘ Test 7 FAIL: Event without repo/sender failed.', { res, eventInDb });
        allPassed = false;
      }
    }

    // Test 8: FR-4.4: Generic fallback title for unlisted event type
    {
      const deliveryId = crypto.randomUUID();
      const payload = JSON.stringify({ action: 're-routed' });
      const signature = computeSignature(payload, env.webhookSecret);

      const res = await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-GitHub-Event': 'custom_unlisted_event',
          'X-GitHub-Delivery': deliveryId,
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

      const [eventInDb] = await db.select().from(events).where(eq(events.deliveryId, deliveryId));

      if (res.status === 202 && eventInDb && eventInDb.title === 'custom_unlisted_event re-routed') {
        console.log(`✔ Test 8 PASS: Unlisted event gets generic title: "${eventInDb.title}" (FR-4.4)`);
      } else {
        console.error('✘ Test 8 FAIL: Unlisted event failed.', { res, eventInDb });
        allPassed = false;
      }
    }

    // Test 9: Acceptance criteria: Repository and user records fill up automatically and are NOT duplicated
    {
      const deliveryId1 = crypto.randomUUID();
      const deliveryId2 = crypto.randomUUID();

      const baseRepo = {
        id: 888123,
        full_name: 'test-org/shared-repo',
        owner: { login: 'test-org' },
        html_url: 'https://github.com/test-org/shared-repo',
      };
      const baseSender = {
        id: 999123,
        login: 'bob-developer',
        avatar_url: 'https://avatars.githubusercontent.com/u/999123',
      };

      // Send first event
      const payload1 = JSON.stringify({
        ref: 'refs/heads/main',
        commits: [{ message: 'commit 1' }],
        repository: baseRepo,
        sender: baseSender,
      });

      await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload1),
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': deliveryId1,
          'X-Hub-Signature-256': computeSignature(payload1, env.webhookSecret),
        },
        body: payload1,
      });

      // Send second event with same repository & sender, but repo was renamed
      const renamedRepo = { ...baseRepo, full_name: 'test-org/shared-repo-renamed' };
      const payload2 = JSON.stringify({
        ref: 'refs/heads/main',
        commits: [{ message: 'commit 2' }],
        repository: renamedRepo,
        sender: baseSender,
      });

      await makeRequest({
        serverPort,
        path: '/webhooks/github',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload2),
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': deliveryId2,
          'X-Hub-Signature-256': computeSignature(payload2, env.webhookSecret),
        },
        body: payload2,
      });

      const repos = await db.select().from(repositories).where(eq(repositories.githubRepoId, 888123));
      const users = await db.select().from(githubUsers).where(eq(githubUsers.githubUserId, 999123));

      if (repos.length === 1 && repos[0].fullName === 'test-org/shared-repo-renamed' && users.length === 1) {
        console.log('✔ Test 9 PASS: Repositories and senders are upserted and never duplicated across events (Acceptance Criteria)');
      } else {
        console.error('✘ Test 9 FAIL: Duplicates found or update failed.', { repos, users });
        allPassed = false;
      }
    }
  } finally {
    server.close();
  }

  if (allPassed) {
    console.log('\n🎉 ALL WEBHOOK & FEATURE 4 TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
