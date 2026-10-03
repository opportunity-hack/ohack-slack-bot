'use strict';

const NUDGE_VARIANTS = {
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
  // Portfolio copy must not contain a literal #<digit> — reactions.js maps
  // thread lines to PRs by extracting #N.
  portfolioMergedBlank: [
    'This is merged — it\'s portfolio material now! Backfill 2–3 sentences (what/why/how) so recruiters browsing your GitHub see the story.',
    'Shipped! 🎉 A short description turns a merged PR into a portfolio piece — recruiters really do read these.',
    'Nice merge. Add a quick what/why/how to the description and this becomes something you can link in interviews.',
  ],
  portfolioOpenBlank: [
    'A 2–3 sentence description (what/why/how) helps reviewers today — and becomes portfolio material once it merges.',
    'Give this PR a short story: what it does, why, how you tested it. It speeds up review and shines on your profile.',
    'Add a description — this is open source, so future recruiters can read this PR. Show your thinking!',
  ],
  portfolioNoRef: [
    'Tip: add `Closes` + the issue number to the description — it auto-closes on merge and shows you work end-to-end.',
    'If this maps to an issue, linking it with `Fixes` + the number ties the work together nicely.',
    'Linking the issue makes the PR self-documenting — a small pro habit recruiters notice.',
  ],
};

const THIN_BODY_MAX_CHARS = 40;
const SUBSTANTIAL_BODY_MIN_CHARS = 140;
const PORTFOLIO_MERGED_LOOKBACK_DAYS = 3;
const COMMIT_SUBJECT_MAX_CHARS = 80;
const PR_SUMMARY_MAX_CHARS = 140;
const MERGE_COMMIT_RE = /^Merge (branch|pull request|remote-tracking branch)\b/;
const SQUASH_MERGE_RE = /\(#\d+\)\s*$/;

function variant(key, dayOfYear, itemIndex) {
  const pool = NUDGE_VARIANTS[key];
  return pool[(dayOfYear + itemIndex) % pool.length];
}

function unowned(issue) {
  return !issue.pull_request && (!issue.assignees || issue.assignees.length === 0);
}

// Priority signal from GitHub labels. Rank 0 = P0/critical/urgent/blocker,
// rank 1 = P1/high, null = none. Tolerates common formats: "P0",
// "priority: high", "priority/P1", "high-priority", "urgent".
function priorityFromLabels(labels = []) {
  let best = null;
  for (const label of labels) {
    const name = (typeof label === 'string' ? label : label?.name || '')
      .toLowerCase().replace(/[\s_/:.-]+/g, ' ').trim();
    let rank = null;
    if (/^(priority )?(p0|critical|urgent|blocker|highest)( priority)?$/.test(name)) rank = 0;
    else if (/^(priority )?(p1|high)( priority)?$/.test(name)) rank = 1;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

function isStarterIssue(labels = []) {
  return labels.some(l =>
    /good first issue|help wanted/i.test(typeof l === 'string' ? l : l?.name || ''));
}

// Only nudge when the label gives high confidence it will drive pickup;
// unlabeled issues get a bare link — the section header is invitation enough.
const UNOWNED_NUDGE_BY_PRIORITY = {
  0: '🚨 *P0 — needs an owner today*',
  1: '🔥 *High priority*',
};

function unownedNudge(issue) {
  if (issue.priority !== null) return UNOWNED_NUDGE_BY_PRIORITY[issue.priority];
  if (issue.starter) return '🌱 good first issue';
  return null;
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

// What's left of a PR body once template boilerplate (HTML comments,
// untouched "## Heading" skeleton lines) is removed.
function normalizeBody(body) {
  return (body || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasIssueRef(title, body) {
  return /#\d+/.test(`${title || ''} ${body || ''}`);
}

function isBotAuthor(user) {
  return user?.type === 'Bot' || /\[bot\]$/i.test(user?.login || '');
}

function isBlankOrThin(body) {
  return normalizeBody(body).length < THIN_BODY_MAX_CHARS;
}

function isSubstantial(body) {
  return normalizeBody(body).length >= SUBSTANTIAL_BODY_MIN_CHARS;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Short excerpt of a PR description for the thread's Wins section.
function prSummary(body) {
  const clean = normalizeBody(body);
  return clean ? truncate(clean, PR_SUMMARY_MAX_CHARS) : null;
}

// Commits that landed without a PR — teams often push to develop/main
// directly. Input: { branch: commits[] } from the commits API for the default
// branch and any other branch pushed in the window. Excluded: PR head branches
// (PR work), merge commits, PR merge commits (squash/rebase merges leave a
// merge_commit_sha), and bot authors. A commit reachable from several branches
// is attributed to the first branch listed — the default branch comes first.
function directCommits(branchCommits, allPullRequests, { defaultBranch = 'main' } = {}) {
  const prHeadBranches = new Set((allPullRequests || []).map(pr => pr.head?.ref).filter(Boolean));
  const mergeShas = new Set((allPullRequests || []).map(pr => pr.merge_commit_sha).filter(Boolean));
  const branches = Object.keys(branchCommits || {})
    .sort((a, b) => (a === defaultBranch ? -1 : b === defaultBranch ? 1 : a.localeCompare(b)));
  const seen = new Set();
  const out = [];

  for (const branch of branches) {
    if (prHeadBranches.has(branch)) continue;
    for (const c of branchCommits[branch] || []) {
      if (!c?.sha || seen.has(c.sha)) continue;
      seen.add(c.sha);
      if (mergeShas.has(c.sha) || (c.parents || []).length > 1) continue;
      if (isBotAuthor(c.author)) continue;
      const subject = (c.commit?.message || '').split('\n')[0].trim();
      if (!subject || MERGE_COMMIT_RE.test(subject) || SQUASH_MERGE_RE.test(subject)) continue;
      out.push({
        sha: c.sha,
        shortSha: c.sha.slice(0, 7),
        subject: truncate(subject, COMMIT_SUBJECT_MAX_CHARS),
        branch,
        onDefault: branch === defaultBranch,
        author: c.author?.login || c.commit?.author?.name || 'unknown',
        committedAt: c.commit?.committer?.date || c.commit?.author?.date || null,
        url: c.html_url,
      });
    }
  }
  return out.sort((a, b) => new Date(b.committedAt || 0) - new Date(a.committedAt || 0));
}

// PR-description coaching for junior devs: their open-source PRs are
// portfolio material for recruiters, so a blank body is a missed opportunity.
// Priority order (one nudge max per PR): mergedBlank → openBlank → openNoRef.
function portfolioNudges(allPullRequests, now, dayOfYear) {
  const mergedCutoff = now - PORTFOLIO_MERGED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const mergedBlank = [];
  const openBlank = [];
  const openNoRef = [];

  for (const pr of allPullRequests || []) {
    if (isBotAuthor(pr.user)) continue;
    const item = {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user?.login || 'unknown',
    };
    if (pr.merged_at && new Date(pr.merged_at).getTime() >= mergedCutoff && isBlankOrThin(pr.body)) {
      mergedBlank.push({ ...item, reason: 'mergedBlank' });
    } else if (pr.state === 'open' && !pr.draft) {
      if (isBlankOrThin(pr.body)) openBlank.push({ ...item, reason: 'openBlank' });
      else if (!hasIssueRef(pr.title, pr.body)) openNoRef.push({ ...item, reason: 'openNoRef' });
    }
  }

  const keyFor = { mergedBlank: 'portfolioMergedBlank', openBlank: 'portfolioOpenBlank', openNoRef: 'portfolioNoRef' };
  return [...mergedBlank, ...openBlank, ...openNoRef]
    .map((p, i) => ({ ...p, nudge: variant(keyFor[p.reason], dayOfYear, i) }));
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
  const { openIssues, openPRs, recentAll, allPullRequests, since, branchCommits = {}, defaultBranch } = repoData;

  const unownedIssues = openIssues
    .filter(unowned)
    .map(issue => ({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      priority: priorityFromLabels(issue.labels),
      starter: isStarterIssue(issue.labels),
    }))
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.number - b.number)
    .map(i => ({ ...i, nudge: unownedNudge(i) }));

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
      greatWriteup: isSubstantial(pr.body),
      summary: prSummary(pr.body),
    }));

  const closedIssues = recentAll
    .filter(i => !i.pull_request && i.state === 'closed' && new Date(i.updated_at) >= sinceDate)
    .map(i => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
    }));

  const touchedItems = touched(recentAll);

  return {
    unownedIssues,
    stalledPRs,
    mergedPRs,
    directCommits: directCommits(branchCommits, allPullRequests, { defaultBranch }),
    closedIssues,
    touchedItems,
    portfolioNudges: portfolioNudges(allPullRequests, now, dayOfYear),
  };
}

module.exports = {
  unowned, stalledPR, wins, touched, classifyRepoData, variant,
  normalizeBody, hasIssueRef, isBotAuthor, isBlankOrThin, isSubstantial, portfolioNudges,
  priorityFromLabels, isStarterIssue, directCommits, prSummary,
};
