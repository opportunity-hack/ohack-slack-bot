'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { repoScoreboardText, buildThreadReplies, mention } = require('../render');

const CLASSIFIED = {
  unownedIssues: [{ number: 1, title: 'Bug', url: 'https://github.com/x/y/issues/1', nudge: 'Grab it!' }],
  stalledPRs: [{ number: 2, title: 'Fix', url: 'https://github.com/x/y/pull/2', tier: 'gentle', author: 'bob', assignees: [], nudge: 'Any blockers?' }],
  mergedPRs: [{ number: 3, title: 'Feature', url: 'https://github.com/x/y/pull/3', author: 'alice', mergedAt: new Date().toISOString() }],
  closedIssues: [],
  touchedItems: [],
  openIssues: [{ number: 1 }],
  openPRs: [{ number: 2 }],
};

test('repoScoreboardText includes repo name', () => {
  const text = repoScoreboardText('owner/repo', CLASSIFIED);
  assert.ok(text.includes('owner/repo'));
  assert.ok(text.includes('📊'));
  assert.ok(text.includes('🎉'));
});

test('buildThreadReplies includes wins section', () => {
  const blocks = buildThreadReplies('owner/repo', CLASSIFIED, {});
  const text = blocks.map(b => b.text.text).join('\n');
  assert.ok(text.includes('🎉'));
  assert.ok(text.includes('Feature'));
});

test('buildThreadReplies includes unowned section', () => {
  const blocks = buildThreadReplies('owner/repo', CLASSIFIED, {});
  const text = blocks.map(b => b.text.text).join('\n');
  assert.ok(text.includes('🔴'));
  assert.ok(text.includes('Bug'));
});

test('mention: returns @-mention when slack ID known', () => {
  assert.strictEqual(mention('alice', { alice: 'U123' }), '<@U123>');
});

test('mention: returns backtick handle when unknown', () => {
  assert.strictEqual(mention('bob', {}), '`bob`');
});
