'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { getTargets, parseRepoRef } = require('../repo-tpm/targets');
const { topCandidates, isIntroMessage } = require('../community/intro_index');

test('parseRepoRef accepts owner/repo shorthand and URLs', () => {
  assert.deepStrictEqual(parseRepoRef('opportunity-hack/frontend-ohack.dev'),
    { owner: 'opportunity-hack', repo: 'frontend-ohack.dev' });
  assert.deepStrictEqual(parseRepoRef('https://github.com/opportunity-hack/backend-ohack.dev'),
    { owner: 'opportunity-hack', repo: 'backend-ohack.dev' });
  assert.strictEqual(parseRepoRef('not a repo'), null);
  assert.strictEqual(parseRepoRef(null), null);
});

test('repos-mode watcher expands to a single target', async () => {
  const targets = await getTargets({
    name: 'Core repos',
    source: {
      mode: 'repos',
      repos: ['o/r1', 'https://github.com/o/r2', 'garbage'],
      channels: ['dev', 'C123ABC'],
    },
  });
  assert.strictEqual(targets.length, 1);
  assert.deepStrictEqual(targets[0].repos, [
    { owner: 'o', repo: 'r1' },
    { owner: 'o', repo: 'r2' },
  ]);
  assert.deepStrictEqual(targets[0].channels, ['dev', 'C123ABC']);
  assert.strictEqual(targets[0].hackathonEndDate, null);
});

test('intro keyword matching surfaces overlapping members', () => {
  const newIntro = { userId: 'U1', text: 'Hi! I am a data science person in Phoenix who loves nonprofits and Python' };
  const intros = [
    { userId: 'U2', text: 'Software engineer into python and data science, based in Phoenix Arizona', ts: '2' },
    { userId: 'U3', text: 'Marketing volunteer from Boston, love photography', ts: '3' },
    { userId: 'U1', text: 'my own older intro about python', ts: '1' },
  ];
  const candidates = topCandidates(newIntro, intros);
  assert.ok(candidates.length >= 1);
  assert.strictEqual(candidates[0].userId, 'U2'); // best overlap first
  assert.ok(!candidates.some(c => c.userId === 'U1')); // never match self
});

test('isIntroMessage filters bots, threads, and one-liners', () => {
  const intro = { user: 'U1', text: 'Hello everyone! I am a designer from Tempe excited to volunteer with nonprofits.' };
  assert.ok(isIntroMessage(intro));
  assert.ok(!isIntroMessage({ ...intro, bot_id: 'B1' }));
  assert.ok(!isIntroMessage({ ...intro, thread_ts: '123.456' }));
  assert.ok(!isIntroMessage({ ...intro, subtype: 'channel_join' }));
  assert.ok(!isIntroMessage({ user: 'U1', text: 'hi!' }));
});
