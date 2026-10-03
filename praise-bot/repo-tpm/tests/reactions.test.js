'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getClaimedAndAcked, visibleText } = require('../reactions');

const BOT = 'UBOT';
const nowS = Date.now() / 1000;
const ts = hoursAgo => String(nowS - hoursAgo * 3600);
const section = text => ({ type: 'section', text: { type: 'mrkdwn', text } });

function fakeClient({ history, replies }) {
  const calls = { replies: [], reactionsGet: 0 };
  return {
    calls,
    conversations: {
      history: async () => ({ messages: history, response_metadata: {} }),
      replies: async ({ ts: parentTs }) => { calls.replies.push(parentTs); return { messages: replies[parentTs] || [] }; },
    },
    reactions: { get: async () => { calls.reactionsGet++; return { message: {} }; } },
  };
}

test('visibleText: joins fallback text with section and context block text', () => {
  const msg = {
    text: 'Digest for o/r',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'o/r' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '<u|github>' }] },
      section('• <u|#17 Bug>'),
    ],
  };
  assert.strictEqual(visibleText(msg), 'Digest for o/r\no/r\n<u|github>\n• <u|#17 Bug>');
  assert.strictEqual(visibleText({ text: 'plain #3' }), 'plain #3');
});

test('getClaimedAndAcked: reads #N from Block Kit blocks; ignores parent and human messages', async () => {
  const parent = ts(2);
  const parentMsg = {
    user: BOT, text: '📊 *o/r* — 1 merged', ts: parent,
    blocks: [section('📊 *o/r*\n• <u|#288 Merged thing> — `alice`')],
    reactions: [{ name: 'raised_hand', users: ['UHUMAN'] }],
  };
  const client = fakeClient({
    history: [{ user: 'UHUMAN', text: 'hi', ts: ts(1) }, parentMsg],
    replies: {
      [parent]: [
        parentMsg,
        {
          user: BOT, text: 'Digest for o/r', ts: ts(1.9),
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: 'o/r' } },
            section('🔴 *Unowned*\n• <u|#17 Bug>'),
            section('⚠️ *Stalled*\n• <u|#42 Fix>'),
          ],
          reactions: [{ name: 'raised_hand', users: [BOT, 'U1'] }, { name: 'white_check_mark', users: ['U2'] }],
        },
        { user: 'UHUMAN', text: 'on it #99', ts: ts(1.8), reactions: [{ name: 'raised_hand', users: ['U3'] }] },
      ],
    },
  });
  const { claimed, suppressed } = await getClaimedAndAcked(client, 'C1', BOT);
  assert.deepStrictEqual(claimed, { 17: 'U1', 42: 'U1' });
  assert.deepStrictEqual([...suppressed].sort(), ['17', '42']);
  assert.strictEqual(client.calls.reactionsGet, 0, 'uses reactions carried on the message');
});

test('getClaimedAndAcked: scans every digest parent inside the 3-day window; newest claim wins', async () => {
  const [p1, p2, p3] = [ts(1), ts(2), ts(80)]; // p3 is older than 3 days
  const reply = (age, text, reactions) => ({ user: BOT, text: 'x', ts: ts(age), blocks: [section(text)], reactions });
  const client = fakeClient({
    history: [
      { user: BOT, text: '📊 a', ts: p1 },
      { user: BOT, text: '📊 b', ts: p2 },
      { user: BOT, text: '📊 c', ts: p3 },
    ],
    replies: {
      [p1]: [reply(0.9, '• <u|#5 Bug>', [{ name: 'raised_hand', users: ['UNEW'] }])],
      [p2]: [reply(1.9, '• <u|#5 Bug>\n• <u|#6 Other>', [{ name: 'raised_hand', users: ['UOLD'] }, { name: 'eyes', users: ['U9'] }])],
      [p3]: [reply(79, '• <u|#7 Ancient>', [{ name: 'eyes', users: ['U9'] }])],
    },
  });
  const { claimed, suppressed } = await getClaimedAndAcked(client, 'C1', BOT);
  assert.deepStrictEqual(client.calls.replies, [p1, p2]);
  assert.deepStrictEqual(claimed, { 5: 'UNEW', 6: 'UOLD' });
  assert.deepStrictEqual([...suppressed].sort(), ['5', '6']);
});

test('getClaimedAndAcked: legacy text-only replies still work; no parents → empty', async () => {
  const p = ts(1);
  const client = fakeClient({
    history: [{ user: BOT, text: '📊 a', ts: p }],
    replies: { [p]: [{ user: BOT, text: '• #3 Old style', ts: ts(0.5), reactions: [{ name: 'white_check_mark', users: ['U1'] }] }] },
  });
  const { suppressed } = await getClaimedAndAcked(client, 'C1', BOT);
  assert.deepStrictEqual([...suppressed], ['3']);
  const empty = await getClaimedAndAcked(fakeClient({ history: [], replies: {} }), 'C1', BOT);
  assert.deepStrictEqual(empty, { claimed: {}, suppressed: new Set() });
});
