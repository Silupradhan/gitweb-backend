import { pool } from '../../db/index.js';

/**
 * Formats seconds into human-readable duration (e.g., "2h 45m" or "3d 4h" or "18m").
 * @param {number|null} seconds
 * @returns {string|null}
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return null;
  }
  const sec = Math.round(seconds);
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export const analyticsService = {
  /**
   * Calculates all dashboard analytics figures strictly in the database (FR-8.1 to FR-8.10).
   *
   * @param {object} options
   * @param {string} [options.repository]
   * @param {string} [options.fromDate]
   * @param {string} [options.toDate]
   */
  async getDashboardStats({ repository, fromDate, toDate } = {}) {
    const baseWhereClauses = [];
    const baseValues = [];

    // Date range filter
    if (fromDate) {
      baseValues.push(new Date(fromDate).toISOString());
      baseWhereClauses.push(`e.received_at >= $${baseValues.length}::timestamptz`);
    }
    if (toDate) {
      baseValues.push(new Date(toDate).toISOString());
      baseWhereClauses.push(`e.received_at <= $${baseValues.length}::timestamptz`);
    }

    // Repository filter
    if (repository && String(repository).trim()) {
      baseValues.push(String(repository).trim());
      if (/^\d+$/.test(String(repository).trim())) {
        baseWhereClauses.push(
          `(e.repository_id = $${baseValues.length}::bigint OR r.full_name = $${baseValues.length})`
        );
      } else {
        baseWhereClauses.push(`r.full_name = $${baseValues.length}`);
      }
    }

    const whereSql =
      baseWhereClauses.length > 0 ? `WHERE ${baseWhereClauses.join(' AND ')}` : '';

    // 1. Summary Cards (FR-8.2): Total Events, Events Today, Open PRs, CI Pass Rate
    const summaryQuery = `
      WITH filtered_events AS (
        SELECT e.id, e.event_type, e.action, e.received_at, e.payload
        FROM events e
        LEFT JOIN repositories r ON e.repository_id = r.id
        ${whereSql}
      ),
      pr_open_count AS (
        SELECT COUNT(*)::int AS open_prs
        FROM filtered_events
        WHERE event_type = 'pull_request'
          AND (
            payload->'pull_request'->>'state' = 'open'
            OR (action IN ('opened', 'reopened') AND payload->'pull_request'->>'closed_at' IS NULL)
          )
      ),
      ci_pass_calc AS (
        SELECT
          COUNT(*) FILTER (
            WHERE payload->'workflow_run'->>'conclusion' = 'success'
               OR payload->'check_run'->>'conclusion' = 'success'
          )::int AS success_runs,
          COUNT(*) FILTER (
            WHERE payload->'workflow_run'->>'conclusion' IS NOT NULL
               OR payload->'check_run'->>'conclusion' IS NOT NULL
          )::int AS total_runs
        FROM filtered_events
        WHERE event_type IN ('workflow_run', 'check_run')
      )
      SELECT
        (SELECT COUNT(*)::int FROM filtered_events) AS total_events,
        (SELECT COUNT(*)::int FROM filtered_events WHERE received_at >= CURRENT_DATE) AS events_today,
        (SELECT open_prs FROM pr_open_count) AS open_pull_requests,
        (SELECT success_runs FROM ci_pass_calc) AS ci_success_runs,
        (SELECT total_runs FROM ci_pass_calc) AS ci_total_runs;
    `;

    // 2. Events Per Day Line Chart (FR-8.3 - default last 30 days if fromDate not specified)
    let lineChartWhereClauses = [...baseWhereClauses];
    let lineChartValues = [...baseValues];

    if (!fromDate) {
      lineChartValues.push('30 days');
      lineChartWhereClauses.push(`e.received_at >= NOW() - $${lineChartValues.length}::interval`);
    }

    const lineChartWhereSql =
      lineChartWhereClauses.length > 0 ? `WHERE ${lineChartWhereClauses.join(' AND ')}` : '';

    const eventsPerDayQuery = `
      SELECT
        TO_CHAR(DATE_TRUNC('day', e.received_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM events e
      LEFT JOIN repositories r ON e.repository_id = r.id
      ${lineChartWhereSql}
      GROUP BY 1
      ORDER BY 1 ASC;
    `;

    // 3. Event Type Share Doughnut Chart (FR-8.4)
    const eventTypeShareQuery = `
      SELECT
        e.event_type AS event_type,
        COUNT(*)::int AS count
      FROM events e
      LEFT JOIN repositories r ON e.repository_id = r.id
      ${whereSql}
      GROUP BY e.event_type
      ORDER BY count DESC;
    `;

    // 4. Top 10 Contributors Bar Chart (FR-8.5)
    const topContributorsQuery = `
      SELECT
        u.login AS login,
        u.avatar_url AS avatar_url,
        COUNT(e.id)::int AS event_count
      FROM events e
      JOIN github_users u ON e.sender_id = u.id
      LEFT JOIN repositories r ON e.repository_id = r.id
      ${whereSql}
      GROUP BY u.id, u.login, u.avatar_url
      ORDER BY event_count DESC
      LIMIT 10;
    `;

    // 5. Commit Activity Heatmap (FR-8.6 - Push events)
    const heatmapWhereClauses = [...baseWhereClauses, `e.event_type = 'push'`];
    const heatmapWhereSql = `WHERE ${heatmapWhereClauses.join(' AND ')}`;

    const commitHeatmapQuery = `
      SELECT
        TO_CHAR(DATE_TRUNC('day', e.received_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS push_count,
        COALESCE(
          SUM(
            CASE
              WHEN jsonb_typeof(e.payload->'commits') = 'array'
              THEN jsonb_array_length(e.payload->'commits')
              ELSE 1
            END
          ),
          COUNT(*)
        )::int AS commit_count
      FROM events e
      LEFT JOIN repositories r ON e.repository_id = r.id
      ${heatmapWhereSql}
      GROUP BY 1
      ORDER BY 1 ASC;
    `;

    // 6. Pull Request Metrics (FR-8.7)
    // Business rule: Averages that depend on merged timestamps must use only events that have both values
    const prMetricsQuery = `
      SELECT
        COUNT(*) FILTER (
          WHERE payload->'pull_request'->>'state' = 'open'
             OR (action IN ('opened', 'reopened') AND payload->'pull_request'->>'closed_at' IS NULL)
        )::int AS open_count,
        COUNT(*) FILTER (
          WHERE (payload->'pull_request'->>'merged')::boolean = true
             OR payload->'pull_request'->>'merged_at' IS NOT NULL
        )::int AS merged_count,
        COUNT(*) FILTER (
          WHERE (payload->'pull_request'->>'state' = 'closed' OR action = 'closed')
            AND (payload->'pull_request'->>'merged')::boolean IS NOT TRUE
            AND payload->'pull_request'->>'merged_at' IS NULL
        )::int AS closed_count,
        AVG(
          CASE
            WHEN payload->'pull_request'->>'merged_at' IS NOT NULL
             AND payload->'pull_request'->>'created_at' IS NOT NULL
             AND (payload->'pull_request'->>'merged_at')::timestamptz >= (payload->'pull_request'->>'created_at')::timestamptz
            THEN EXTRACT(EPOCH FROM ((payload->'pull_request'->>'merged_at')::timestamptz - (payload->'pull_request'->>'created_at')::timestamptz))
            ELSE NULL
          END
        ) AS avg_time_to_merge_seconds
      FROM events e
      LEFT JOIN repositories r ON e.repository_id = r.id
      ${whereSql ? `${whereSql} AND e.event_type = 'pull_request'` : `WHERE e.event_type = 'pull_request'`};
    `;

    // 7. Issue Metrics (FR-8.8)
    // Business rule: Averages that depend on closed timestamps must use only events that have both values
    const issueMetricsQuery = `
      SELECT
        COUNT(*) FILTER (
          WHERE payload->'issue'->>'state' = 'open'
             OR (action IN ('opened', 'reopened') AND payload->'issue'->>'closed_at' IS NULL)
        )::int AS open_count,
        COUNT(*) FILTER (
          WHERE payload->'issue'->>'state' = 'closed'
             OR action = 'closed'
        )::int AS closed_count,
        AVG(
          CASE
            WHEN payload->'issue'->>'closed_at' IS NOT NULL
             AND payload->'issue'->>'created_at' IS NOT NULL
             AND (payload->'issue'->>'closed_at')::timestamptz >= (payload->'issue'->>'created_at')::timestamptz
            THEN EXTRACT(EPOCH FROM ((payload->'issue'->>'closed_at')::timestamptz - (payload->'issue'->>'created_at')::timestamptz))
            ELSE NULL
          END
        ) AS avg_time_to_close_seconds
      FROM events e
      LEFT JOIN repositories r ON e.repository_id = r.id
      ${whereSql ? `${whereSql} AND e.event_type = 'issues'` : `WHERE e.event_type = 'issues'`};
    `;

    // 8. CI Metrics (FR-8.9)
    const ciMetricsQuery = `
      SELECT
        COUNT(*) FILTER (
          WHERE payload->'workflow_run'->>'conclusion' = 'success'
             OR payload->'check_run'->>'conclusion' = 'success'
        )::int AS successful,
        COUNT(*) FILTER (
          WHERE payload->'workflow_run'->>'conclusion' IN ('failure', 'timed_out', 'action_required')
             OR payload->'check_run'->>'conclusion' IN ('failure', 'timed_out', 'action_required')
        )::int AS failed,
        COUNT(*) FILTER (
          WHERE payload->'workflow_run'->>'conclusion' = 'cancelled'
             OR payload->'check_run'->>'conclusion' = 'cancelled'
        )::int AS cancelled,
        COUNT(*) FILTER (
          WHERE payload->'workflow_run'->>'conclusion' IS NOT NULL
             OR payload->'check_run'->>'conclusion' IS NOT NULL
        )::int AS total
      FROM events e
      LEFT JOIN repositories r ON e.repository_id = r.id
      ${whereSql ? `${whereSql} AND e.event_type IN ('workflow_run', 'check_run')` : `WHERE e.event_type IN ('workflow_run', 'check_run')`};
    `;

    // Execute all analytical queries concurrently using the connection pool
    const [
      summaryRes,
      eventsPerDayRes,
      eventTypeShareRes,
      topContributorsRes,
      commitHeatmapRes,
      prMetricsRes,
      issueMetricsRes,
      ciMetricsRes,
    ] = await Promise.all([
      pool.query(summaryQuery, baseValues),
      pool.query(eventsPerDayQuery, lineChartValues),
      pool.query(eventTypeShareQuery, baseValues),
      pool.query(topContributorsQuery, baseValues),
      pool.query(commitHeatmapQuery, baseValues),
      pool.query(prMetricsQuery, baseValues),
      pool.query(issueMetricsQuery, baseValues),
      pool.query(ciMetricsQuery, baseValues),
    ]);

    const summaryRow = summaryRes.rows[0] || {};
    const ciSuccessRuns = Number(summaryRow.ci_success_runs) || 0;
    const ciTotalRuns = Number(summaryRow.ci_total_runs) || 0;
    const ciPassRate =
      ciTotalRuns > 0 ? Number(((ciSuccessRuns / ciTotalRuns) * 100).toFixed(1)) : null;

    const prRow = prMetricsRes.rows[0] || {};
    const avgMergeSeconds = prRow.avg_time_to_merge_seconds
      ? Number(prRow.avg_time_to_merge_seconds)
      : null;

    const issueRow = issueMetricsRes.rows[0] || {};
    const avgCloseSeconds = issueRow.avg_time_to_close_seconds
      ? Number(issueRow.avg_time_to_close_seconds)
      : null;

    const ciRow = ciMetricsRes.rows[0] || {};

    // Calculate total events for percentage shares
    const totalEvents = Number(summaryRow.total_events) || 0;
    const eventTypeShare = eventTypeShareRes.rows.map((row) => ({
      eventType: row.event_type,
      count: Number(row.count),
      percentage:
        totalEvents > 0
          ? Number(((Number(row.count) / totalEvents) * 100).toFixed(1))
          : 0,
    }));

    return {
      summary: {
        totalEvents,
        eventsToday: Number(summaryRow.events_today) || 0,
        openPullRequests: Number(summaryRow.open_pull_requests) || 0,
        ciPassRate, // null when no CI runs recorded, otherwise number 0-100
      },
      eventsPerDay: eventsPerDayRes.rows.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
      eventTypeShare,
      topContributors: topContributorsRes.rows.map((r) => ({
        login: r.login,
        avatarUrl: r.avatar_url,
        eventCount: Number(r.event_count),
      })),
      commitHeatmap: commitHeatmapRes.rows.map((r) => ({
        date: r.date,
        pushCount: Number(r.push_count),
        commitCount: Number(r.commit_count),
      })),
      pullRequestMetrics: {
        open: Number(prRow.open_count) || 0,
        merged: Number(prRow.merged_count) || 0,
        closed: Number(prRow.closed_count) || 0,
        avgTimeToMergeSeconds: avgMergeSeconds,
        avgTimeToMergeFormatted: formatDuration(avgMergeSeconds),
      },
      issueMetrics: {
        open: Number(issueRow.open_count) || 0,
        closed: Number(issueRow.closed_count) || 0,
        avgTimeToCloseSeconds: avgCloseSeconds,
        avgTimeToCloseFormatted: formatDuration(avgCloseSeconds),
      },
      ciMetrics: {
        successful: Number(ciRow.successful) || 0,
        failed: Number(ciRow.failed) || 0,
        cancelled: Number(ciRow.cancelled) || 0,
        total: Number(ciRow.total) || 0,
      },
    };
  },
};

