'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  repoScoreboardText, buildParentBlocks, buildThreadReplies, buildThreadBlocks, isQuiet, mention,
} = require('../render');

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

test('buildThreadReplies: no nudge → bare issue link, no trailing dash', () => {
  const classified = {
    ...CLASSIFIED,
    unownedIssues: [{ number: 1, title: 'Bug', url: 'https://github.com/x/y/issues/1', priority: null, nudge: null }],
  };
  const text = buildThreadReplies('owner/repo', classified, {}).map(b => b.text.text).join('\n');
  assert.ok(/#1 Bug>$/m.test(text));
  assert.ok(!text.includes('#1 Bug> —'));
});

test('buildThreadReplies: P0 present escalates unowned header', () => {
  const classified = {
    ...CLASSIFIED,
    unownedIssues: [{ number: 1, title: 'Down', url: 'u1', priority: 0, nudge: '🚨 *P0 — needs an owner today*' }],
  };
  const text = buildThreadReplies('owner/repo', classified, {}).map(b => b.text.text).join('\n');
  assert.ok(text.includes('🚨 *Unowned issues — P0 needs an owner first*'));
  assert.ok(text.includes('needs an owner today'));
});

test('buildThreadReplies: unowned capped at 8 with overflow note', () => {
  const many = Array.from({ length: 12 }, (_, k) => ({
    number: k + 1, title: `Issue ${k + 1}`, url: `u${k + 1}`, priority: null, nudge: null,
  }));
  const classified = { ...CLASSIFIED, unownedIssues: many };
  const section = buildThreadReplies('owner/repo', classified, {})
    .map(b => b.text.text).find(t => t.includes('Unowned issues'));
  assert.strictEqual(section.split('\n').filter(l => l.startsWith('•')).length, 8);
  assert.ok(section.includes('plus 4 more'));
});

test('repoScoreboardText: surfaces P0 count when present', () => {
  const classified = {
    ...CLASSIFIED,
    unownedIssues: [
      { number: 1, title: 'Down', url: 'u1', priority: 0, nudge: null },
      { number: 2, title: 'Meh', url: 'u2', priority: null, nudge: null },
    ],
  };
  assert.ok(repoScoreboardText('owner/repo', classified).includes('1 🚨 P0'));
  assert.ok(!repoScoreboardText('owner/repo', CLASSIFIED).includes('P0'));
});

test('mention: returns @-mention when slack ID known', () => {
  assert.strictEqual(mention('alice', { alice: 'U123' }), '<@U123>');
});

test('mention: returns backtick handle when unknown', () => {
  assert.strictEqual(mention('bob', {}), '`bob`');
});

// --- TL;DR parent, direct pushes, thread header ---

const COMMIT = (n, overrides = {}) => ({
  sha: String(n).repeat(40).slice(0, 40), shortSha: `sha${n}`, subject: `Commit ${n}`, branch: 'main', onDefault: true,
  author: 'carol', url: `https://github.com/x/y/commit/${n}`, ...overrides,
});

test('repoScoreboardText: direct commits counted and celebrated even with zero merges', () => {
  const one = { ...CLASSIFIED, mergedPRs: [], directCommits: [COMMIT(1)] };
  assert.ok(repoScoreboardText('owner/repo', one).includes('0 merged · 1 direct commit since yesterday 🎉'));
  const two = { ...one, directCommits: [COMMIT(1), COMMIT(2)] };
  assert.ok(repoScoreboardText('owner/repo', two).includes('2 direct commits'));
  assert.ok(!repoScoreboardText('owner/repo', CLASSIFIED).includes('direct commit'));
});

test('repoScoreboardText: window label follows windowHours', () => {
  assert.ok(repoScoreboardText('o/r', CLASSIFIED, { windowHours: 1 }).includes('merged in the last hour'));
  assert.ok(repoScoreboardText('o/r', CLASSIFIED, { windowHours: 6 }).includes('merged in the last 6h'));
  assert.ok(repoScoreboardText('o/r', CLASSIFIED, { windowHours: 25 }).includes('merged since yesterday'));
  assert.ok(repoScoreboardText('o/r', CLASSIFIED, { windowHours: 72 }).includes('merged in the last 3 days'));
});

test('buildParentBlocks: one section per repo, dividers between, narrative omitted', () => {
  const summaries = [
    { text: '📊 *o/a* — …', classified: CLASSIFIED, narrative: 'Steady momentum.' },
    { text: '📊 *o/b* — …', classified: { ...CLASSIFIED, mergedPRs: [] } },
  ];
  const blocks = buildParentBlocks(summaries, {});
  assert.deepStrictEqual(blocks.map(b => b.type), ['section', 'divider', 'section']);
  const all = blocks.filter(b => b.type === 'section').map(b => b.text.text).join('\n');
  assert.ok(!all.includes('Steady momentum'));
  assert.ok(blocks[0].text.text.startsWith('📊 *o/a*'));
});

test('buildParentBlocks: TL;DR bullets link PRs and commits; branch shown only off-default', () => {
  const classified = { ...CLASSIFIED, directCommits: [COMMIT(1), COMMIT(2, { branch: 'develop', onDefault: false })] };
  const text = buildParentBlocks([{ text: 'head', classified }], { alice: 'U1' })[0].text.text;
  assert.ok(text.includes('• <https://github.com/x/y/pull/3|#3 Feature> — <@U1>'));
  assert.ok(text.includes('• <https://github.com/x/y/commit/1|sha1 Commit 1> — `carol`'));
  assert.ok(text.includes('sha2 Commit 2> — `carol` → `develop`'));
  assert.ok(!text.includes('→ `main`'));
});

test('buildParentBlocks: caps at 5 bullets with overflow pointing to the thread', () => {
  const classified = {
    ...CLASSIFIED,
    mergedPRs: [3, 4, 5].map(n => ({ ...CLASSIFIED.mergedPRs[0], number: n })),
    directCommits: [1, 2, 3, 4].map(n => COMMIT(n)),
  };
  const text = buildParentBlocks([{ text: 'head', classified }])[0].text.text;
  assert.strictEqual(text.split('\n').filter(l => l.startsWith('•')).length, 5);
  assert.ok(text.includes('plus 2 more in the thread'));
});

test('buildParentBlocks: nothing shipped → scoreboard line only', () => {
  const classified = { ...CLASSIFIED, mergedPRs: [] };
  assert.strictEqual(buildParentBlocks([{ text: 'head', classified }])[0].text.text, 'head');
});

test('buildThreadReplies: direct pushes section replaces the quiet line; capped at 10', () => {
  const base = { ...CLASSIFIED, mergedPRs: [], closedIssues: [], touchedItems: [] };
  const quiet = buildThreadReplies('o/r', base, {}).map(b => b.text.text).join('\n');
  assert.ok(quiet.includes('😴 Quiet since yesterday'));
  const many = { ...base, directCommits: Array.from({ length: 12 }, (_, k) => COMMIT(k + 1)) };
  const blocks = buildThreadReplies('o/r', many, {}).map(b => b.text.text);
  const pushes = blocks.find(t => t.includes('⬆️'));
  assert.strictEqual(pushes.split('\n').filter(l => l.startsWith('•')).length, 10);
  assert.ok(pushes.includes('plus 2 more on GitHub'));
  assert.ok(!blocks.join('\n').includes('😴'));
});

test('buildThreadReplies: wins line gets an excerpt when the PR has a summary', () => {
  const classified = { ...CLASSIFIED, mergedPRs: [{ ...CLASSIFIED.mergedPRs[0], summary: 'Adds retry logic.' }] };
  const text = buildThreadReplies('o/r', classified, {}).map(b => b.text.text).join('\n');
  assert.ok(text.includes('↳ _Adds retry logic._'));
  assert.ok(!buildThreadReplies('o/r', CLASSIFIED, {}).map(b => b.text.text).join('\n').includes('↳'));
});

test('buildThreadReplies: section headers follow windowHours', () => {
  const classified = { ...CLASSIFIED, touchedItems: [{ number: 9, title: 'T', url: 'u', actor: 'a', isPR: false }] };
  const text = buildThreadReplies('o/r', classified, {}, { windowHours: 1 }).map(b => b.text.text).join('\n');
  assert.ok(text.includes('🎉 *Wins in the last hour*'));
  assert.ok(text.includes('👀 *Activity in the last hour*'));
});

test('buildThreadBlocks: header names the repo, context links GitHub, narrative first, divider before AI block', () => {
  const llm = { narrative: 'Steady momentum.', risks: ['Two PRs overlap'], kudos: [] };
  const blocks = buildThreadBlocks('owner', 'repo', CLASSIFIED, {}, llm);
  assert.strictEqual(blocks[0].type, 'header');
  assert.strictEqual(blocks[0].text.text, 'owner/repo');
  assert.strictEqual(blocks[1].type, 'context');
  assert.ok(blocks[1].elements[0].text.includes('https://github.com/owner/repo'));
  assert.strictEqual(blocks[2].text.text, '_Steady momentum._');
  const dividerIdx = blocks.findIndex(b => b.type === 'divider');
  assert.ok(dividerIdx > 2);
  assert.ok(blocks[dividerIdx + 1].text.text.includes('Potential risks'));
  assert.strictEqual(blocks.length, dividerIdx + 2);
});

test('buildThreadBlocks: no LLM → no divider; quiet repo → header + context + quiet line only', () => {
  assert.ok(!buildThreadBlocks('owner', 'repo', CLASSIFIED, {}, null).some(b => b.type === 'divider'));
  const quiet = { unownedIssues: [], stalledPRs: [], mergedPRs: [], closedIssues: [], touchedItems: [], openIssues: [], openPRs: [] };
  const blocks = buildThreadBlocks('owner', 'repo', quiet, {}, { narrative: 'x', risks: ['r'], kudos: [] }, { windowHours: 1 });
  assert.deepStrictEqual(blocks.map(b => b.type), ['header', 'context', 'section']);
  assert.ok(blocks[2].text.text.includes('😴 Quiet in the last hour'));
});

test('isQuiet: false when anything is open, shipped or coached', () => {
  const quiet = { unownedIssues: [], stalledPRs: [], mergedPRs: [], closedIssues: [], touchedItems: [] };
  assert.ok(isQuiet(quiet));
  assert.ok(!isQuiet({ ...quiet, directCommits: [COMMIT(1)] }));
  assert.ok(!isQuiet({ ...quiet, portfolioNudges: [NUDGE(7)] }));
  assert.ok(!isQuiet(CLASSIFIED));
});
