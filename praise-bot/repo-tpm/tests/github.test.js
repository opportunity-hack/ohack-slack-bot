'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pushedBranches, parseRepoUrl } = require('../github');

const HOUR = 60 * 60 * 1000;
const since = new Date(Date.now() - 25 * HOUR).toISOString();
const push = (ref, hoursAgo = 1, type = 'PushEvent') => ({ type, created_at: new Date(Date.now() - hoursAgo * HOUR).toISOString(), payload: { ref } });

test('pushedBranches: branches pushed in window, deduped; tags, stale pushes, PR heads and other events skipped', () => {
  const events = [
    push('refs/heads/develop'),
    push('refs/heads/develop', 2),
    push('refs/heads/main', 3),
    push('refs/heads/feature/x', 1),          // PR head
    push('refs/tags/v1.0'),
    push('refs/heads/old', 30),               // outside window
    push('refs/heads/issue-branch', 1, 'CreateEvent'),
  ];
  assert.deepStrictEqual(pushedBranches(events, since, new Set(['feature/x'])), ['develop', 'main']);
  assert.deepStrictEqual(pushedBranches(null, since), []);
});

test('parseRepoUrl: extracts owner/repo and strips .git', () => {
  assert.deepStrictEqual(parseRepoUrl('https://github.com/opportunity-hack/backend-ohack.dev.git'), { owner: 'opportunity-hack', repo: 'backend-ohack.dev' });
  assert.strictEqual(parseRepoUrl('https://example.com/x'), null);
});
