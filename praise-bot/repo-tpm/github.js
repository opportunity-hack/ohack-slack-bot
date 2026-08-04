'use strict';
const config = require('./config');

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

async function getRepoData(owner, repo, windowHours = 25) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const [meta, allItems, recentItems, allPRs] = await Promise.all([
    ghFetch(`https://api.github.com/repos/${owner}/${repo}`),
    ghFetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`),
    ghFetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&since=${since}&per_page=100`),
    ghFetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`),
  ]);

  if (allItems === null) return null; // 404 — repo doesn't exist

  const openIssues = (allItems || []).filter(i => !i.pull_request);
  const openPRs = (allItems || []).filter(i => i.pull_request);
  const recentAll = recentItems || [];
  const allPullRequests = allPRs || [];

  // pushed_at covers direct commits — teams often push to main without PRs/issues.
  return { owner, repo, openIssues, openPRs, recentAll, allPullRequests, since, pushedAt: meta?.pushed_at || null };
}

module.exports = { parseRepoUrl, getRepoData };
