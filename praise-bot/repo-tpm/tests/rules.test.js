'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { unowned, stalledPR, classifyRepoData, variant } = require('../rules');

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
  const v0 = variant('unowned', 0, 0);
  const v1 = variant('unowned', 1, 0);
  const v2 = variant('unowned', 2, 0);
  assert.notStrictEqual(v0, v1);
  assert.notStrictEqual(v1, v2);
  assert.strictEqual(variant('unowned', 3, 0), v0);
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
});
