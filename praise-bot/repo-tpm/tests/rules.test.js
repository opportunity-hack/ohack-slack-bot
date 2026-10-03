'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  unowned, stalledPR, classifyRepoData, variant,
  normalizeBody, hasIssueRef, isBotAuthor, portfolioNudges,
  priorityFromLabels, isStarterIssue, directCommits, prSummary,
} = require('../rules');

test('unowned: open issue with no assignees', () => {
  assert.ok(unowned({ assignees: [], pull_request: undefined }));
});

test('unowned: open issue with assignee is not unowned', () => {
  assert.ok(!unowned({ assignees: [{ login: 'alice' }], pull_request: undefined }));
});

test('unowned: PRs are never unowned', () => {
  assert.ok(!unowned({ assignees: [], pull_request: {} }));
});

test('stalledPR: fresh PR returns null', () => {
  const pr = { state: 'open', draft: false, updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() };
  assert.strictEqual(stalledPR(pr, Date.now()), null);
});

test('stalledPR: 3-day PR returns gentle', () => {
  const pr = { state: 'open', draft: false, updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() };
  assert.strictEqual(stalledPR(pr, Date.now()), 'gentle');
});

test('stalledPR: 5-day PR returns firmer', () => {
  const pr = { state: 'open', draft: false, updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() };
  assert.strictEqual(stalledPR(pr, Date.now()), 'firmer');
});

test('stalledPR: 8-day PR returns decision', () => {
  const pr = { state: 'open', draft: false, updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() };
  assert.strictEqual(stalledPR(pr, Date.now()), 'decision');
});

test('stalledPR: draft PR is not stalled', () => {
  const pr = { state: 'open', draft: true, updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() };
  assert.strictEqual(stalledPR(pr, Date.now()), null);
});

test('stalledPR: closed PR is not stalled', () => {
  const pr = { state: 'closed', draft: false, updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() };
  assert.strictEqual(stalledPR(pr, Date.now()), null);
});

test('variant: cycles through 3 options', () => {
  const v0 = variant('stalledGentle', 0, 0);
  const v1 = variant('stalledGentle', 1, 0);
  const v2 = variant('stalledGentle', 2, 0);
  assert.notStrictEqual(v0, v1);
  assert.notStrictEqual(v1, v2);
  assert.strictEqual(variant('stalledGentle', 3, 0), v0);
});

test('priorityFromLabels: P0/critical/urgent variants → rank 0', () => {
  for (const name of ['P0', 'p0', 'priority: P0', 'critical', 'urgent', 'blocker', 'priority/critical']) {
    assert.strictEqual(priorityFromLabels([{ name }]), 0, name);
  }
});

test('priorityFromLabels: P1/high variants → rank 1', () => {
  for (const name of ['P1', 'priority: high', 'high priority', 'high-priority', 'priority/P1']) {
    assert.strictEqual(priorityFromLabels([{ name }]), 1, name);
  }
});

test('priorityFromLabels: unrelated or no labels → null', () => {
  assert.strictEqual(priorityFromLabels([{ name: 'bug' }, { name: 'frontend' }]), null);
  assert.strictEqual(priorityFromLabels([]), null);
  assert.strictEqual(priorityFromLabels(undefined), null);
  assert.strictEqual(priorityFromLabels([{ name: 'highlight' }]), null);
});

test('priorityFromLabels: highest rank wins across labels', () => {
  assert.strictEqual(priorityFromLabels([{ name: 'high' }, { name: 'P0' }]), 0);
});

test('isStarterIssue: good first issue / help wanted', () => {
  assert.ok(isStarterIssue([{ name: 'good first issue' }]));
  assert.ok(isStarterIssue([{ name: 'Help Wanted' }]));
  assert.ok(!isStarterIssue([{ name: 'bug' }]));
});

test('classifyRepoData: identifies unowned issues and stalled PRs', () => {
  const now = Date.now();
  const repoData = {
    openIssues: [
      { number: 1, title: 'Bug', html_url: 'https://github.com/x/y/issues/1', assignees: [], state: 'open' },
      { number: 2, title: 'Feat', html_url: 'https://github.com/x/y/issues/2', assignees: [{ login: 'alice' }], state: 'open' },
    ],
    openPRs: [
      { number: 3, title: 'Fix', html_url: 'https://github.com/x/y/pull/3', state: 'open', draft: false,
        updated_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        user: { login: 'bob' }, assignees: [], requested_reviewers: [] },
    ],
    recentAll: [],
    allPullRequests: [],
    since: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
  };
  const result = classifyRepoData(repoData, now, 100);
  assert.strictEqual(result.unownedIssues.length, 1);
  assert.strictEqual(result.unownedIssues[0].number, 1);
  assert.strictEqual(result.stalledPRs.length, 1);
  assert.strictEqual(result.stalledPRs[0].tier, 'gentle');
  assert.deepStrictEqual(result.portfolioNudges, []);
});

test('classifyRepoData: unowned sorted P0 → high → rest; nudges only when confident', () => {
  const now = Date.now();
  const repoData = {
    openIssues: [
      { number: 1, title: 'Plain', html_url: 'u1', assignees: [], labels: [] },
      { number: 2, title: 'Urgent', html_url: 'u2', assignees: [], labels: [{ name: 'P0' }] },
      { number: 3, title: 'Starter', html_url: 'u3', assignees: [], labels: [{ name: 'good first issue' }] },
      { number: 4, title: 'Important', html_url: 'u4', assignees: [], labels: [{ name: 'priority: high' }] },
    ],
    openPRs: [], recentAll: [], allPullRequests: [],
    since: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
  };
  const result = classifyRepoData(repoData, now, 100);
  assert.deepStrictEqual(result.unownedIssues.map(i => i.number), [2, 4, 1, 3]);
  assert.match(result.unownedIssues[0].nudge, /P0/);
  assert.match(result.unownedIssues[1].nudge, /[Hh]igh/);
  assert.strictEqual(result.unownedIssues.find(i => i.number === 1).nudge, null);
  assert.match(result.unownedIssues.find(i => i.number === 3).nudge, /good first issue/);
});

test('normalizeBody: null and whitespace-only are empty', () => {
  assert.strictEqual(normalizeBody(null), '');
  assert.strictEqual(normalizeBody('   \n\t '), '');
});

test('normalizeBody: strips HTML comments and heading skeletons', () => {
  const template = '<!-- Describe your changes -->\n## Description\n\n## Testing\n';
  assert.strictEqual(normalizeBody(template), '');
});

test('normalizeBody: keeps real content under template headings', () => {
  const body = '<!-- Describe your changes -->\n## Description\nAdds retry logic to the API client.';
  assert.strictEqual(normalizeBody(body), 'Adds retry logic to the API client.');
});

test('hasIssueRef: matches #N in title or body, null-safe', () => {
  assert.ok(hasIssueRef('Fix #12', null));
  assert.ok(hasIssueRef('Fix login', 'Closes #34'));
  assert.ok(!hasIssueRef('Fix login', 'Adds validation'));
  assert.ok(!hasIssueRef(null, null));
});

test('isBotAuthor: detects bot type and [bot] login suffix', () => {
  assert.ok(isBotAuthor({ login: 'some-app', type: 'Bot' }));
  assert.ok(isBotAuthor({ login: 'dependabot[bot]', type: 'User' }));
  assert.ok(!isBotAuthor({ login: 'alice', type: 'User' }));
});

const SUBSTANTIAL = 'This PR adds retry logic with exponential backoff to the GitHub client so transient failures no longer abort the whole digest run. Tested with mocked 500s and a live dry run.';

function prFixture(overrides) {
  return {
    number: 1, title: 'Fix', html_url: 'https://github.com/x/y/pull/1',
    state: 'open', draft: false, user: { login: 'alice', type: 'User' },
    body: null, merged_at: null,
    ...overrides,
  };
}

test('portfolioNudges: open blank body → openBlank', () => {
  const nudges = portfolioNudges([prFixture({})], Date.now(), 100);
  assert.strictEqual(nudges.length, 1);
  assert.strictEqual(nudges[0].reason, 'openBlank');
  assert.ok(nudges[0].nudge.length > 0);
});

test('portfolioNudges: open substantial body without issue ref → openNoRef', () => {
  const nudges = portfolioNudges([prFixture({ body: SUBSTANTIAL })], Date.now(), 100);
  assert.strictEqual(nudges.length, 1);
  assert.strictEqual(nudges[0].reason, 'openNoRef');
});

test('portfolioNudges: substantial body with issue ref → no nudge', () => {
  const nudges = portfolioNudges([prFixture({ body: `${SUBSTANTIAL} Closes #7.` })], Date.now(), 100);
  assert.deepStrictEqual(nudges, []);
});

test('portfolioNudges: drafts and bots are skipped', () => {
  const nudges = portfolioNudges([
    prFixture({ draft: true }),
    prFixture({ number: 2, user: { login: 'dependabot[bot]', type: 'Bot' } }),
  ], Date.now(), 100);
  assert.deepStrictEqual(nudges, []);
});

test('portfolioNudges: merged 2d ago with blank body → mergedBlank', () => {
  const now = Date.now();
  const pr = prFixture({ state: 'closed', merged_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() });
  const nudges = portfolioNudges([pr], now, 100);
  assert.strictEqual(nudges.length, 1);
  assert.strictEqual(nudges[0].reason, 'mergedBlank');
});

test('portfolioNudges: merged 5d ago is outside lookback → no nudge', () => {
  const now = Date.now();
  const pr = prFixture({ state: 'closed', merged_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() });
  assert.deepStrictEqual(portfolioNudges([pr], now, 100), []);
});

test('portfolioNudges: mergedBlank ordered before open nudges', () => {
  const now = Date.now();
  const nudges = portfolioNudges([
    prFixture({ number: 10 }),
    prFixture({ number: 11, state: 'closed', merged_at: new Date(now - 1 * 60 * 60 * 1000).toISOString() }),
  ], now, 100);
  assert.deepStrictEqual(nudges.map(n => n.reason), ['mergedBlank', 'openBlank']);
});

test('classifyRepoData: greatWriteup flags merged PRs with substantial bodies', () => {
  const now = Date.now();
  const mergedAt = new Date(now - 1 * 60 * 60 * 1000).toISOString();
  const repoData = {
    openIssues: [], openPRs: [], recentAll: [],
    allPullRequests: [
      prFixture({ number: 20, state: 'closed', merged_at: mergedAt, body: SUBSTANTIAL }),
      prFixture({ number: 21, state: 'closed', merged_at: mergedAt }),
    ],
    since: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
  };
  const result = classifyRepoData(repoData, now, 100);
  assert.strictEqual(result.mergedPRs.length, 2);
  assert.strictEqual(result.mergedPRs.find(p => p.number === 20).greatWriteup, true);
  assert.strictEqual(result.mergedPRs.find(p => p.number === 21).greatWriteup, false);
  // Recent merged blank PR shows in both Wins and portfolio nudges.
  assert.deepStrictEqual(result.portfolioNudges.map(n => n.number), [21]);
});

test('variant: portfolio keys cycle', () => {
  const v0 = variant('portfolioMergedBlank', 0, 0);
  assert.strictEqual(variant('portfolioMergedBlank', 3, 0), v0);
  assert.notStrictEqual(variant('portfolioMergedBlank', 1, 0), v0);
});

// --- direct commits (pushes without a PR) ---

const HOUR = 60 * 60 * 1000;
const CTX = { defaultBranch: 'develop' };
const commit = (id, message, overrides = {}) => {
  const sha = String(id).padEnd(40, '0');
  const { hoursAgo = 1, ...rest } = overrides;
  const date = new Date(Date.now() - hoursAgo * HOUR).toISOString();
  return {
    sha, html_url: `https://github.com/x/y/commit/${sha}`,
    commit: { message, author: { name: 'Carol Name', date }, committer: { date } },
    author: { login: 'carol', type: 'User' }, parents: [{ sha: 'p' }],
    ...rest,
  };
};

test('directCommits: maps a commit on the default branch', () => {
  const [c] = directCommits({ develop: [commit('a', 'Add login page\n\nMore detail')] }, [], CTX);
  assert.strictEqual(c.shortSha, 'a000000');
  assert.strictEqual(c.subject, 'Add login page');
  assert.strictEqual(c.branch, 'develop');
  assert.strictEqual(c.onDefault, true);
  assert.strictEqual(c.author, 'carol');
  assert.strictEqual(c.url, `https://github.com/x/y/commit/${'a'.padEnd(40, '0')}`);
  assert.ok(c.committedAt);
});

test('directCommits: default branch first; shared sha attributed to it; newest first', () => {
  const shared = commit('s', 'Shared work', { hoursAgo: 5 });
  const out = directCommits({
    main: [shared],
    develop: [commit('n', 'Newest', { hoursAgo: 1 }), shared],
    'hotfix/x': [commit('h', 'Hotfix', { hoursAgo: 3 })],
  }, [], CTX);
  assert.deepStrictEqual(out.map(c => [c.subject, c.branch, c.onDefault]), [
    ['Newest', 'develop', true], ['Hotfix', 'hotfix/x', false], ['Shared work', 'develop', true],
  ]);
});

test('directCommits: skips PR head branches and PR merge commits', () => {
  const prs = [{ number: 1, merge_commit_sha: 'm'.padEnd(40, '0'), head: { ref: 'feature/login' } }];
  const out = directCommits({
    develop: [commit('m', 'Add login (squash)'), commit('d', 'Hotfix typo')],
    'feature/login': [commit('c', 'WIP')],
  }, prs, CTX);
  assert.deepStrictEqual(out.map(c => c.subject), ['Hotfix typo']);
});

test('directCommits: drops merge commits, merge/squash subjects, bots and duplicates; falls back to commit author name', () => {
  const out = directCommits({
    develop: [
      commit('1', "Merge branch 'feature' into develop", { parents: [{ sha: 'a' }, { sha: 'b' }] }),
      commit('2', 'Merge pull request #12 from x/feature'),
      commit('3', 'Add search (#12)'),
      commit('4', 'chore: bump deps', { author: { login: 'dependabot[bot]', type: 'Bot' } }),
      commit('5', 'Real work', { author: null }),
      commit('5', 'Real work', { author: null }),
    ],
  }, [], CTX);
  assert.deepStrictEqual(out.map(c => [c.subject, c.author]), [['Real work', 'Carol Name']]);
});

test('directCommits: subject truncated to 80 chars; empty input → []', () => {
  const [c] = directCommits({ develop: [commit('8', 'x'.repeat(120))] }, [], CTX);
  assert.strictEqual(c.subject.length, 80);
  assert.ok(c.subject.endsWith('…'));
  assert.deepStrictEqual(directCommits({}, [], CTX), []);
  assert.deepStrictEqual(directCommits(undefined, undefined), []);
});

test('prSummary: null for blank/template bodies, excerpt otherwise, truncated at 140', () => {
  assert.strictEqual(prSummary(null), null);
  assert.strictEqual(prSummary('<!-- x -->\n## Description\n'), null);
  assert.strictEqual(prSummary('## Description\nAdds retry logic.'), 'Adds retry logic.');
  const s = prSummary(SUBSTANTIAL);
  assert.ok(s.length <= 140 && s.endsWith('…'));
});

test('classifyRepoData: directCommits from branchCommits; empty when absent; mergedPRs carry summary', () => {
  const now = Date.now();
  const base = { openIssues: [], openPRs: [], recentAll: [], since: new Date(now - 25 * HOUR).toISOString() };
  assert.deepStrictEqual(classifyRepoData({ ...base, allPullRequests: [] }, now, 100).directCommits, []);
  const result = classifyRepoData({
    ...base, defaultBranch: 'develop',
    allPullRequests: [prFixture({ number: 20, state: 'closed', merged_at: new Date(now - HOUR).toISOString(), body: 'Adds retry logic.' })],
    branchCommits: { develop: [commit('a', 'Add login page')] },
  }, now, 100);
  assert.strictEqual(result.directCommits.length, 1);
  assert.strictEqual(result.directCommits[0].onDefault, true);
  assert.strictEqual(result.mergedPRs[0].summary, 'Adds retry logic.');
});
