'use strict';

const NUDGE_VARIANTS = {
  unowned: [
    'No one has claimed this yet — want to pick it up?',
    'Still unassigned — a good first task if you\'re looking for something to tackle.',
    'Unowned — grab it if it fits your work!',
  ],
  stalledGentle: [
    'Hasn\'t had activity in 2–4 days — any blockers?',
    'A bit quiet on this one — need a hand?',
    'No recent updates — ping a mentor if you\'re stuck!',
  ],
  stalledFirmer: [
    'No activity in 4–7 days — is this still in progress?',
    'This has been quiet for almost a week. Give it a push or flag it for help.',
    'Going on a week without updates — consider a quick status comment.',
  ],
  stalledDecision: [
    'No activity in 7+ days — finish, split, or close?',
    'Over a week stalled. Time to decide: merge, split, or close.',
    'Needs a decision: finish, split, or close? 7+ days without updates.',
  ],
};

function variant(key, dayOfYear, itemIndex) {
  const pool = NUDGE_VARIANTS[key];
  return pool[(dayOfYear + itemIndex) % pool.length];
}

function unowned(issue) {
  return !issue.pull_request && (!issue.assignees || issue.assignees.length === 0);
}

function stalledPR(pr, now) {
  if (pr.state !== 'open' || pr.draft) return null;
  const ageMs = now - new Date(pr.updated_at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 2) return null;
  if (ageDays < 4) return 'gentle';
  if (ageDays < 7) return 'firmer';
  return 'decision';
}

function wins(mergedPRs, closedIssues) {
  return { mergedPRs, closedIssues };
}

function touched(recentAll) {
  return recentAll.map(item => ({
    number: item.number,
    title: item.title,
    url: item.html_url,
    actor: item.user?.login || 'unknown',
    isPR: !!item.pull_request,
    updatedAt: item.updated_at,
  }));
}

function classifyRepoData(repoData, now, dayOfYear) {
  const { openIssues, openPRs, recentAll, allPullRequests, since } = repoData;

  const unownedIssues = openIssues
    .filter(unowned)
    .map((issue, i) => ({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      nudge: variant('unowned', dayOfYear, i),
    }));

  const stalledPRs = openPRs
    .map((pr, i) => {
      const tier = stalledPR(pr, now);
      if (!tier) return null;
      const variantKey = tier === 'gentle' ? 'stalledGentle' : tier === 'firmer' ? 'stalledFirmer' : 'stalledDecision';
      return {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        tier,
        author: pr.user?.login || 'unknown',
        assignees: (pr.assignees || []).map(a => a.login),
        requestedReviewers: (pr.requested_reviewers || []).map(r => r.login),
        nudge: variant(variantKey, dayOfYear, i),
      };
    })
    .filter(Boolean);

  const sinceDate = new Date(since);
  const mergedPRs = allPullRequests
    .filter(pr => pr.merged_at && new Date(pr.merged_at) >= sinceDate)
    .map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user?.login || 'unknown',
      mergedAt: pr.merged_at,
    }));

  const closedIssues = recentAll
    .filter(i => !i.pull_request && i.state === 'closed' && new Date(i.updated_at) >= sinceDate)
    .map(i => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
    }));

  const touchedItems = touched(recentAll);

  return { unownedIssues, stalledPRs, mergedPRs, closedIssues, touchedItems };
}

module.exports = { unowned, stalledPR, wins, touched, classifyRepoData, variant };
