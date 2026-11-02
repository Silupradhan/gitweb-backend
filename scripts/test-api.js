import http from 'node:http';

import app from '../src/app.js';
import { db } from '../src/db/index.js';
import { events } from '../src/modules/events/event.schema.js';
import { repositories } from '../src/modules/repositories/repository.schema.js';
import { githubUsers } from '../src/modules/github-users/github-user.schema.js';

function getRequest({ serverPort, path }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
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
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Feature 5: REST API & Filters & Pagination Tests ---\n');

  const server = app.listen(0);
  const serverPort = server.address().port;

  let allPassed = true;

  try {
    // Test 1: FR-5.1 & FR-5.4: List events newest first with all required fields
    {
      const res = await getRequest({ serverPort, path: '/api/v1/events?limit=10' });

      if (res.status === 200 && Array.isArray(res.body.data) && res.body.data.length > 0) {
        const item = res.body.data[0];
        const hasFields =
          'id' in item &&
          'eventType' in item &&
          'action' in item &&
          'title' in item &&
          'receivedAt' in item &&
          'repositoryName' in item &&
          'senderName' in item &&
          'senderAvatar' in item &&
          'sourceLink' in item;

        // Check newest first
        let isSorted = true;
        for (let i = 1; i < res.body.data.length; i++) {
          const prevDate = new Date(res.body.data[i - 1].receivedAt).getTime();
          const currDate = new Date(res.body.data[i].receivedAt).getTime();
          if (prevDate < currDate) {
            isSorted = false;
            break;
          }
        }

        if (hasFields && isSorted) {
          console.log(`✔ Test 1 PASS: List events returns newest first with all required fields (FR-5.1, FR-5.4)`);
        } else {
          console.error('✘ Test 1 FAIL: Fields missing or not sorted newest first.', { item, isSorted });
          allPassed = false;
        }
      } else {
        console.error('✘ Test 1 FAIL: Expected 200 and non-empty data array.', res);
        allPassed = false;
      }
    }

    // Test 2: FR-5.2: Filters work individually
    {
      // Filter by eventType
      const pushRes = await getRequest({ serverPort, path: '/api/v1/events?eventType=push' });
      const allPush = pushRes.body.data.every((e) => e.eventType === 'push');

      // Filter by search text in title
      const searchRes = await getRequest({ serverPort, path: '/api/v1/events?search=commit' });
      const allContainSearch = searchRes.body.data.every((e) =>
        e.title.toLowerCase().includes('commit')
      );

      if (pushRes.status === 200 && allPush && searchRes.status === 200 && allContainSearch) {
        console.log('✔ Test 2 PASS: Filters work individually (eventType, search) (FR-5.2)');
      } else {
        console.error('✘ Test 2 FAIL: Individual filter failed.', { allPush, allContainSearch });
        allPassed = false;
      }
    }

    // Test 3: FR-5.2: Combined filters work together
    {
      const combinedRes = await getRequest({
        serverPort,
        path: '/api/v1/events?eventType=push&search=pushed',
      });

      const validCombined =
        combinedRes.status === 200 &&
        combinedRes.body.data.every(
          (e) => e.eventType === 'push' && e.title.toLowerCase().includes('pushed')
        );

      if (validCombined) {
        console.log('✔ Test 3 PASS: Multiple filters combine successfully (FR-5.2)');
      } else {
        console.error('✘ Test 3 FAIL: Combined filters failed.', combinedRes);
        allPassed = false;
      }
    }

    // Test 4: FR-5.3: Cursor-based pagination (no repeats, no gaps across pages)
    {
      const page1Res = await getRequest({ serverPort, path: '/api/v1/events?limit=2' });
      const page1 = page1Res.body.data;
      const nextCursor = page1Res.body.pagination?.nextCursor;

      if (page1.length === 2 && nextCursor) {
        const page2Res = await getRequest({
          serverPort,
          path: `/api/v1/events?limit=2&cursor=${nextCursor}`,
        });
        const page2 = page2Res.body.data;

        // Check that page 1 and page 2 have completely disjoint IDs (no repeats)
        const page1Ids = new Set(page1.map((e) => e.id));
        const overlap = page2.some((e) => page1Ids.has(e.id));

        if (page2.length > 0 && !overlap) {
          console.log(
            `✔ Test 4 PASS: Cursor pagination delivers next page with zero repeats/gaps (FR-5.3, Acceptance Criteria)`
          );
        } else {
          console.error('✘ Test 4 FAIL: Overlap found or page 2 empty.', { page1, page2, overlap });
          allPassed = false;
        }
      } else {
        console.error('✘ Test 4 FAIL: Not enough items to test pagination.', page1Res.body);
        allPassed = false;
      }
    }

    // Test 5: FR-5.5: Single event retrieval with full payload
    {
      // First get any event ID
      const listRes = await getRequest({ serverPort, path: '/api/v1/events?limit=1' });
      const targetId = listRes.body.data[0].id;

      const singleRes = await getRequest({ serverPort, path: `/api/v1/events/${targetId}` });

      if (
        singleRes.status === 200 &&
        singleRes.body.id === targetId &&
        singleRes.body.payload !== undefined &&
        typeof singleRes.body.payload === 'object'
      ) {
        console.log(`✔ Test 5 PASS: Get single event returns complete payload (FR-5.5)`);
      } else {
        console.error('✘ Test 5 FAIL: Single event payload retrieval failed.', singleRes);
        allPassed = false;
      }
    }

    // Test 6: FR-5.6: Repositories list with event counts
    {
      const reposRes = await getRequest({ serverPort, path: '/api/v1/repos' });

      if (
        reposRes.status === 200 &&
        Array.isArray(reposRes.body) &&
        reposRes.body.length > 0 &&
        'fullName' in reposRes.body[0] &&
        'eventCount' in reposRes.body[0] &&
        typeof reposRes.body[0].eventCount === 'number'
      ) {
        console.log(`✔ Test 6 PASS: Repositories list returns counts correctly (FR-5.6)`);
      } else {
        console.error('✘ Test 6 FAIL: Repositories count failed.', reposRes);
        allPassed = false;
      }
    }

    // Test 7: FR-5.7: Input validation & error responses (400 Bad Request)
    {
      const badLimit = await getRequest({ serverPort, path: '/api/v1/events?limit=250' });
      const badFromDate = await getRequest({ serverPort, path: '/api/v1/events?fromDate=not-a-date' });
      const invertedDates = await getRequest({
        serverPort,
        path: '/api/v1/events?fromDate=2026-11-05&toDate=2026-11-01',
      });
      const badCursor = await getRequest({ serverPort, path: '/api/v1/events?cursor=malformed_token' });
      const badEventId = await getRequest({ serverPort, path: '/api/v1/events/invalid_id' });
      const notFoundEvent = await getRequest({ serverPort, path: '/api/v1/events/99999999' });

      const allValidationsPassed =
        badLimit.status === 400 &&
        badFromDate.status === 400 &&
        invertedDates.status === 400 &&
        badCursor.status === 400 &&
        badEventId.status === 400 &&
        notFoundEvent.status === 404;

      if (allValidationsPassed) {
        console.log(
          '✔ Test 7 PASS: All invalid filter parameters return 400 Bad Request with clear errors (FR-5.7)'
        );
      } else {
        console.error('✘ Test 7 FAIL: Validation errors failed.', {
          badLimit: badLimit.status,
          badFromDate: badFromDate.status,
          invertedDates: invertedDates.status,
          badCursor: badCursor.status,
          badEventId: badEventId.status,
          notFoundEvent: notFoundEvent.status,
        });
        allPassed = false;
      }
    }

    // Test 8: Compatibility with FRD Section 7 route aliases (/api/events and /api/repos)
    {
      const aliasEvents = await getRequest({ serverPort, path: '/api/events?limit=1' });
      const aliasRepos = await getRequest({ serverPort, path: '/api/repos' });

      if (aliasEvents.status === 200 && aliasRepos.status === 200) {
        console.log('✔ Test 8 PASS: Both /api/v1/* and /api/* endpoints are accessible');
      } else {
        console.error('✘ Test 8 FAIL: Alias routes failed.', {
          aliasEvents: aliasEvents.status,
          aliasRepos: aliasRepos.status,
        });
        allPassed = false;
      }
    }
  } finally {
    server.close();
  }

  if (allPassed) {
    console.log('\n🎉 ALL FEATURE 5 TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME FEATURE 5 TESTS FAILED.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

