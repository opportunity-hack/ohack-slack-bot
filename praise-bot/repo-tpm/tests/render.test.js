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

test('buildThreadReplies: no portfolioNudges key → no crash, no 💼 section', () => {
  const blocks = buildThreadReplies('owner/repo', CLASSIFIED, {});
  const text = blocks.map(b => b.text.text).join('\n');
  assert.ok(!text.includes('💼'));
});

const NUDGE = (n) => ({
  number: n, title: `PR ${n}`, url: `https://github.com/x/y/pull/${n}`,
  author: 'carol', reason: 'openBlank', nudge: 'Add a description!',
});

test('buildThreadReplies: renders portfolio section with mention and nudge', () => {
  const classified = { ...CLASSIFIED, portfolioNudges: [NUDGE(7)] };
  const blocks = buildThreadReplies('owner/repo', classified, { carol: 'U777' });
  const text = blocks.map(b => b.text.text).join('\n');
  assert.ok(text.includes('💼'));
  assert.ok(text.includes('Add a description!'));
  assert.ok(text.includes('<@U777>'));
});

test('buildThreadReplies: suppressed PR number hides its portfolio line', () => {
  const classified = { ...CLASSIFIED, portfolioNudges: [NUDGE(7)] };
  const blocks = buildThreadReplies('owner/repo', classified, {}, { suppressed: new Set(['7']) });
  const text = blocks.map(b => b.text.text).join('\n');
  assert.ok(!text.includes('💼'));
});

test('buildThreadReplies: portfolio section capped at 4 lines', () => {
  const classified = { ...CLASSIFIED, portfolioNudges: [5, 6, 7, 8, 9, 10].map(NUDGE) };
  const blocks = buildThreadReplies('owner/repo', classified, {});
  const portfolio = blocks.map(b => b.text.text).find(t => t.includes('💼'));
  assert.strictEqual(portfolio.split('\n').filter(l => l.startsWith('•')).length, 4);
});

test('buildThreadReplies: greatWriteup adds praise tag to wins line', () => {
  const classified = {
    ...CLASSIFIED,
    mergedPRs: [{ ...CLASSIFIED.mergedPRs[0], greatWriteup: true }],
  };
  const text = buildThreadReplies('owner/repo', classified, {}).map(b => b.text.text).join('\n');
  assert.ok(text.includes('great write-up'));
  const plain = buildThreadReplies('owner/repo', CLASSIFIED, {}).map(b => b.text.text).join('\n');
  assert.ok(!plain.includes('great write-up'));
});

test('mention: returns @-mention when slack ID known', () => {
  assert.strictEqual(mention('alice', { alice: 'U123' }), '<@U123>');
});

test('mention: returns backtick handle when unknown', () => {
  assert.strictEqual(mention('bob', {}), '`bob`');
});
