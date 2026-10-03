'use strict';
const config = require('./config');

const MAX_COMMIT_BRANCHES = 5; // default branch + up to 4 more pushed in the window

function githubHeaders() {
  const h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (config.githubToken) h['Authorization'] = `Bearer ${config.githubToken}`;
  return h;
}

async function ghFetch(url) {
  const res = await fetch(url, { headers: githubHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} ${url}`);
  return res.json();
}

function parseRepoUrl(link) {
  const m = link.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

// Branches that received pushes in the window, per the repo events feed.
// Tags and PR head branches are skipped — PR work is reported via the PR.
function pushedBranches(events, since, prHeadBranches = new Set()) {
  const sinceMs = new Date(since).getTime();
  const names = new Set();
  for (const e of events || []) {
    if (e.type !== 'PushEvent' || new Date(e.created_at).getTime() < sinceMs) continue;
    const ref = e.payload?.ref || '';
    if (!ref.startsWith('refs/heads/')) continue;
    const branch = ref.slice('refs/heads/'.length);
    if (!prHeadBranches.has(branch)) names.add(branch);
  }
  return [...names];
}

async function getRepoData(owner, repo, windowHours = 25) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const warn = what => err => {
    console.warn(`[repo-tpm] ${what} fetch failed for ${owner}/${repo}: ${err.message}`);
    return null;
  };

  const [meta, allItems, recentItems, allPRs, events] = await Promise.all([
    ghFetch(base),
    ghFetch(`${base}/issues?state=open&per_page=100`),
    ghFetch(`${base}/issues?state=all&since=${since}&per_page=100`),
    ghFetch(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=50`),
    // Best-effort: only used to discover which branches were pushed to.
    ghFetch(`${base}/events?per_page=100`).catch(warn('events')),
  ]);

  if (allItems === null) return null; // 404 — repo doesn't exist

  const openIssues = (allItems || []).filter(i => !i.pull_request);
  const openPRs = (allItems || []).filter(i => i.pull_request);
  const recentAll = recentItems || [];
  const allPullRequests = allPRs || [];
  const defaultBranch = meta?.default_branch || 'main';

  // Direct commits (pushes without a PR) live on the default branch plus any
  // other branch pushed in the window. PushEvent payloads no longer include
  // commits, so each branch's commits come from /commits?since=.
  const prHeads = new Set(allPullRequests.map(pr => pr.head?.ref).filter(Boolean));
  const branches = [...new Set([defaultBranch, ...pushedBranches(events, since, prHeads)])].slice(0, MAX_COMMIT_BRANCHES);
  const branchCommits = {};
  await Promise.all(branches.map(async branch => {
    const commits = await ghFetch(`${base}/commits?sha=${encodeURIComponent(branch)}&since=${since}&per_page=100`)
      .catch(warn(`commits(${branch})`));
    if (commits) branchCommits[branch] = commits;
  }));

  return { owner, repo, openIssues, openPRs, recentAll, allPullRequests, branchCommits, defaultBranch, since };
}

module.exports = { parseRepoUrl, getRepoData, pushedBranches };
