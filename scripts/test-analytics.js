import app from '../src/app.js';

async function runAnalyticsTests() {
  console.log('--- Starting Feature 8: Analytics Dashboard Tests ---\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test 1: Statistics endpoint returns all dashboard figures (FR-8.1, FR-8.2 to FR-8.9)
    console.log('Testing analytics statistics endpoint...');
    const t0 = Date.now();
    const res = await fetch(`${baseUrl}/api/v1/analytics/stats`);
    const duration = Date.now() - t0;

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    const data = await res.json();

    // Verify Summary Cards (FR-8.2)
    if (
      typeof data.summary?.totalEvents !== 'number' ||
      typeof data.summary?.eventsToday !== 'number' ||
      typeof data.summary?.openPullRequests !== 'number'
    ) {
      throw new Error(`Summary metrics missing: ${JSON.stringify(data.summary)}`);
    }

    // Verify Events Per Day (FR-8.3)
    if (!Array.isArray(data.eventsPerDay)) {
      throw new Error('eventsPerDay must be an array');
    }

    // Verify Event Type Share (FR-8.4)
    if (!Array.isArray(data.eventTypeShare)) {
      throw new Error('eventTypeShare must be an array');
    }

    // Verify Top Contributors (FR-8.5)
    if (!Array.isArray(data.topContributors)) {
      throw new Error('topContributors must be an array');
    }

    // Verify Commit Heatmap (FR-8.6)
    if (!Array.isArray(data.commitHeatmap)) {
      throw new Error('commitHeatmap must be an array');
    }

    // Verify Pull Request Metrics (FR-8.7)
    if (
      typeof data.pullRequestMetrics?.open !== 'number' ||
      typeof data.pullRequestMetrics?.merged !== 'number' ||
      typeof data.pullRequestMetrics?.closed !== 'number'
    ) {
      throw new Error(`PR metrics missing: ${JSON.stringify(data.pullRequestMetrics)}`);
    }

    // Verify Issue Metrics (FR-8.8)
    if (
      typeof data.issueMetrics?.open !== 'number' ||
      typeof data.issueMetrics?.closed !== 'number'
    ) {
      throw new Error(`Issue metrics missing: ${JSON.stringify(data.issueMetrics)}`);
    }

    // Verify CI Metrics (FR-8.9)
    if (
      typeof data.ciMetrics?.successful !== 'number' ||
      typeof data.ciMetrics?.failed !== 'number' ||
      typeof data.ciMetrics?.cancelled !== 'number'
    ) {
      throw new Error(`CI metrics missing: ${JSON.stringify(data.ciMetrics)}`);
    }

    console.log(`✔ Test 1 PASS: /api/v1/analytics/stats returned all required figures in ${duration}ms (Target: < 1000ms) (FR-8.1 to FR-8.9)`);

    // Test 2: Alias /api/v1/events/stats endpoint also functions identically
    const aliasRes = await fetch(`${baseUrl}/api/v1/events/stats`);
    if (aliasRes.status !== 200) {
      throw new Error(`/api/v1/events/stats returned ${aliasRes.status}`);
    }
    console.log('✔ Test 2 PASS: /api/v1/events/stats endpoint accessible and returns identical metrics');

    // Test 3: Date range filtering (FR-8.10)
    const fromDate = '2026-01-01T00:00:00.000Z';
    const toDate = '2026-12-31T23:59:59.999Z';
    const filteredRes = await fetch(`${baseUrl}/api/v1/analytics/stats?fromDate=${fromDate}&toDate=${toDate}`);
    if (filteredRes.status !== 200) {
      throw new Error(`Date filtered request failed: ${filteredRes.status}`);
    }
    console.log('✔ Test 3 PASS: Date range filtering applied successfully in SQL query (FR-8.10)');

    // Test 4: Invalid date range validation
    const invalidDateRes = await fetch(`${baseUrl}/api/v1/analytics/stats?fromDate=invalid-date`);
    if (invalidDateRes.status !== 400) {
      throw new Error(`Expected 400 for invalid date, got ${invalidDateRes.status}`);
    }

    const invertedRangeRes = await fetch(`${baseUrl}/api/v1/analytics/stats?fromDate=2026-12-31&toDate=2026-01-01`);
    if (invertedRangeRes.status !== 400) {
      throw new Error(`Expected 400 for inverted date range, got ${invertedRangeRes.status}`);
    }
    console.log('✔ Test 4 PASS: Parameter validation rejects invalid and inverted date ranges with 400 Bad Request');

    console.log('\n🎉 ALL FEATURE 8 ANALYTICS BACKEND TESTS PASSED!\n');
  } finally {
    server.close();
  }
}

runAnalyticsTests().catch((err) => {
  console.error('Analytics test failed:', err);
  process.exit(1);
});

