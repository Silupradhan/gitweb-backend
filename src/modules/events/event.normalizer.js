/**
 * Event normalizer for GitHub webhook payloads.
 * Implements title building and source link extraction according to Appendix A.
 */

/**
 * Strips HTML tags and trims whitespace to ensure titles are strictly plain text.
 * @param {string} str
 * @returns {string}
 */
export function sanitizePlainText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a human-readable title and extracts a source link from the event payload.
 * Follows Appendix A of FRD v1.0, with a generic fallback for other event types (FR-4.4).
 *
 * @param {string} eventType - GitHub event name (e.g. 'push', 'pull_request')
 * @param {string|null|undefined} action - Event action if any
 * @param {object} payload - Raw GitHub payload
 * @returns {{ title: string, sourceUrl: string | null }}
 */
export function normalizeEvent(eventType, action, payload = {}) {
  const senderLogin = payload.sender?.login || 'Someone';
  const repoHtmlUrl = payload.repository?.html_url || null;

  let title = '';
  let sourceUrl = repoHtmlUrl;

  switch (eventType) {
    case 'push': {
      const branch = payload.ref ? payload.ref.replace(/^refs\/heads\//, '') : 'unknown';
      const commitCount = Array.isArray(payload.commits) ? payload.commits.length : 1;
      const commitWord = commitCount === 1 ? 'commit' : 'commits';
      title = `${senderLogin} pushed ${commitCount} ${commitWord} to ${branch}`;
      sourceUrl = payload.compare || payload.head_commit?.url || repoHtmlUrl;
      break;
    }

    case 'pull_request': {
      const prNumber = payload.pull_request?.number || payload.number || '';
      const prTitle = sanitizePlainText(payload.pull_request?.title || '');
      const prAction = action || payload.action || 'opened';
      title = `PR #${prNumber} ${prAction}: ${prTitle}`;
      sourceUrl = payload.pull_request?.html_url || repoHtmlUrl;
      break;
    }

    case 'pull_request_review': {
      const prNumber = payload.pull_request?.number || '';
      let reviewAction = 'reviewed';
      const state = (payload.review?.state || '').toLowerCase();
      if (state === 'approved') {
        reviewAction = 'approved';
      } else if (state === 'changes_requested') {
        reviewAction = 'requested changes';
      } else if (state === 'commented') {
        reviewAction = 'commented';
      } else if (action) {
        reviewAction = action;
      }
      title = `${senderLogin} ${reviewAction} on PR #${prNumber}`;
      sourceUrl = payload.review?.html_url || payload.pull_request?.html_url || repoHtmlUrl;
      break;
    }

    case 'pull_request_review_comment': {
      const prNumber = payload.pull_request?.number || '';
      title = `${senderLogin} commented on PR #${prNumber} code`;
      sourceUrl = payload.comment?.html_url || repoHtmlUrl;
      break;
    }

    case 'issues': {
      const issueNumber = payload.issue?.number || payload.number || '';
      const issueTitle = sanitizePlainText(payload.issue?.title || '');
      const issueAction = action || payload.action || 'opened';
      title = `Issue #${issueNumber} ${issueAction}: ${issueTitle}`;
      sourceUrl = payload.issue?.html_url || repoHtmlUrl;
      break;
    }

    case 'issue_comment': {
      const issueNumber = payload.issue?.number || '';
      title = `${senderLogin} commented on #${issueNumber}`;
      sourceUrl = payload.comment?.html_url || repoHtmlUrl;
      break;
    }

    case 'create':
    case 'delete': {
      const refType = payload.ref_type || 'ref';
      const refName = payload.ref || '';
      const verb = eventType === 'create' ? 'created' : 'deleted';
      title = `${senderLogin} ${verb} ${refType} ${refName}`.trim();
      sourceUrl = repoHtmlUrl;
      break;
    }

    case 'release': {
      const relName = sanitizePlainText(payload.release?.name || payload.release?.tag_name || 'release');
      const relAction = action || payload.action || 'published';
      title = `Release ${relName} ${relAction}`;
      sourceUrl = payload.release?.html_url || repoHtmlUrl;
      break;
    }

    case 'star': {
      const isUnstar = (action || payload.action) === 'deleted';
      title = `${senderLogin} ${isUnstar ? 'unstarred' : 'starred'} the repository`;
      sourceUrl = repoHtmlUrl;
      break;
    }

    case 'fork': {
      title = `${senderLogin} forked the repository`;
      sourceUrl = payload.forkee?.html_url || repoHtmlUrl;
      break;
    }

    case 'watch': {
      title = `${senderLogin} started watching the repository`;
      sourceUrl = repoHtmlUrl;
      break;
    }

    case 'workflow_run': {
      const wfName = sanitizePlainText(payload.workflow?.name || payload.workflow_run?.name || 'workflow');
      const wfOutcome = payload.workflow_run?.conclusion || payload.workflow_run?.status || action || 'triggered';
      title = `Workflow '${wfName}' ${wfOutcome}`;
      sourceUrl = payload.workflow_run?.html_url || repoHtmlUrl;
      break;
    }

    case 'workflow_job': {
      const jobName = sanitizePlainText(payload.workflow_job?.name || 'job');
      const jobStatus = payload.workflow_job?.conclusion || payload.workflow_job?.status || action || 'completed';
      title = `Job '${jobName}' ${jobStatus}`;
      sourceUrl = payload.workflow_job?.html_url || repoHtmlUrl;
      break;
    }

    case 'check_run': {
      const checkName = sanitizePlainText(payload.check_run?.name || 'check');
      const checkConclusion = payload.check_run?.conclusion || payload.check_run?.status || action || 'completed';
      title = `Check '${checkName}' ${checkConclusion}`;
      sourceUrl = payload.check_run?.html_url || repoHtmlUrl;
      break;
    }

    case 'deployment_status': {
      const env = payload.deployment?.environment || 'environment';
      const state = payload.deployment_status?.state || action || 'updated';
      title = `Deployment to ${env} ${state}`;
      sourceUrl = payload.deployment_status?.target_url || payload.deployment?.url || repoHtmlUrl;
      break;
    }

    case 'member': {
      const member = payload.member?.login || 'user';
      const memberAction = action || payload.action || 'added';
      title = `${member} ${memberAction} as collaborator`;
      sourceUrl = repoHtmlUrl;
      break;
    }

    case 'repository': {
      const repoAction = action || payload.action || 'updated';
      title = `Repository ${repoAction}`;
      sourceUrl = repoHtmlUrl;
      break;
    }

    case 'dependabot_alert': {
      const alertAction = action || payload.action || 'created';
      const pkg = sanitizePlainText(payload.alert?.dependency?.package?.name || 'package');
      const severity = payload.alert?.security_advisory?.severity || 'unknown';
      title = `Dependabot alert ${alertAction}: ${pkg} (${severity})`;
      sourceUrl = payload.alert?.html_url || repoHtmlUrl;
      break;
    }

    case 'code_scanning_alert': {
      const alertAction = action || payload.action || 'created';
      const rule = sanitizePlainText(payload.alert?.rule?.description || payload.alert?.rule?.id || 'rule');
      title = `Code scanning alert ${alertAction}: ${rule}`;
      sourceUrl = payload.alert?.html_url || repoHtmlUrl;
      break;
    }

    case 'secret_scanning_alert': {
      const alertAction = action || payload.action || 'created';
      title = `Secret scanning alert ${alertAction}`;
      sourceUrl = payload.alert?.html_url || repoHtmlUrl;
      break;
    }

    default: {
      // FR-4.4: Generic title for any event type not explicitly defined
      const act = action || payload.action || '';
      title = act ? `${eventType} ${act}` : eventType;
      sourceUrl = repoHtmlUrl;
      break;
    }
  }

  return {
    title: sanitizePlainText(title),
    sourceUrl,
  };
}
