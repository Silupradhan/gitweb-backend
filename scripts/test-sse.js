import http from 'node:http';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { sseManager } from '../src/modules/events/sse.manager.js';

async function runSseTests() {
  console.log('--- Starting Feature 7: SSE Real-Time Live Feed Tests ---\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test 1: Check SSE endpoint headers and initial greeting
    console.log('Testing SSE connection headers and keep-alive setup...');
    let sseConnected = false;
    let sseHeadersOk = false;
    let receivedBroadcast = null;

    const sseReq = http.get(`${baseUrl}/api/v1/events/stream`, (res) => {
      if (
        res.statusCode === 200 &&
        res.headers['content-type']?.includes('text/event-stream') &&
        res.headers['cache-control']?.includes('no-cache')
      ) {
        sseHeadersOk = true;
      }

      res.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes(': connected')) {
          sseConnected = true;
        }
        if (text.startsWith('data: ')) {
          try {
            receivedBroadcast = JSON.parse(text.replace('data: ', '').trim());
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      });
    });

    // Wait for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (!sseHeadersOk || !sseConnected) {
      throw new Error(`SSE handshake failed: headersOk=${sseHeadersOk}, connected=${sseConnected}`);
    }
    console.log('✔ Test 1 PASS: /api/v1/events/stream sets text/event-stream and connects (FR-7.1, FR-7.3)');

    // Test 2: Send webhook and verify real-time SSE broadcast
    console.log('Testing real-time broadcast on webhook event save...');
    const deliveryId = crypto.randomUUID();
    const payloadObj = {
      action: 'opened',
      issue: {
        number: 42,
        title: 'Real-time test issue',
        html_url: 'https://github.com/test-org/repo/issues/42',
      },
      repository: {
        id: 999991,
        name: 'sse-repo',
        full_name: 'test-org/sse-repo',
        private: false,
        html_url: 'https://github.com/test-org/sse-repo',
      },
      sender: {
        id: 888881,
        login: 'sse-tester',
        avatar_url: 'https://avatars.githubusercontent.com/u/888881',
        html_url: 'https://github.com/sse-tester',
      },
    };

    const rawPayload = JSON.stringify(payloadObj);
    const signature =
      'sha256=' +
      crypto
        .createHmac('sha256', env.webhookSecret)
        .update(rawPayload)
        .digest('hex');

    const webhookRes = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Delivery': deliveryId,
        'X-GitHub-Event': 'issues',
        'X-Hub-Signature-256': signature,
      },
      body: rawPayload,
    });

    if (webhookRes.status !== 202) {
      throw new Error(`Webhook delivery failed with status ${webhookRes.status}`);
    }

    // Wait for SSE broadcast
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (!receivedBroadcast) {
      throw new Error('SSE did not receive broadcast for saved webhook event');
    }

    if (
      receivedBroadcast.eventType !== 'issues' ||
      !receivedBroadcast.title.includes('Real-time test issue') ||
      receivedBroadcast.repositoryName !== 'test-org/sse-repo'
    ) {
      throw new Error(`Received broadcast data unexpected: ${JSON.stringify(receivedBroadcast)}`);
    }

    console.log('✔ Test 2 PASS: Newly saved event broadcast to SSE subscriber immediately (FR-7.2, Business Rule)');

    // Test 3: Disconnect cleanup
    const countBefore = sseManager.getClientCount();
    sseReq.destroy();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const countAfter = sseManager.getClientCount();

    if (countAfter !== countBefore - 1) {
      throw new Error(`Client cleanup failed: before=${countBefore}, after=${countAfter}`);
    }
    console.log('✔ Test 3 PASS: Disconnected clients cleanly removed from memory (FR-7.4)');

    console.log('\n🎉 ALL SSE BACKEND TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
  }
}

runSseTests().catch((err) => {
  console.error('SSE Test failed:', err);
  process.exit(1);
});
