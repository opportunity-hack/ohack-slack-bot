'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { handleFaqReaction, handleFaqMention, faqSettings, sanitizeReply, allowMention } = require('../community/faq_responder');

const ASKER = 'U0ASKER0001';
const ADMIN = 'U0ADMIN0001';

function fakeClient({ messages, admin = true } = {}) {
  const posted = [];
  return {
    posted,
    users: { info: async () => ({ user: { is_admin: admin } }) },
    conversations: {
      replies: async () => ({
        messages: messages || [{ ts: '1.1', user: ASKER, text: 'How can I help? I am a cloud engineer.' }],
      }),
    },
    chat: { postMessage: async (args) => { posted.push(args); } },
  };
}

const event = (over = {}) => ({
  reaction: 'robot_face', user: ADMIN, item: { type: 'message', channel: 'C1', ts: '1.1' }, ...over,
});
const cfg = (faq = {}, global = {}) => ({ global, community: { faq } });
const goodReply = `Welcome <@${ASKER}>! Start with <https://www.ohack.dev/nonprofits|open projects>.`;

test('faqSettings: env defaults, remote overrides', () => {
  assert.deepStrictEqual(
    faqSettings({ community: null, global: {} }, {}),
    { enabled: true, mentionsEnabled: true, emoji: 'robot_face', allowedUserIds: [], dryRun: false, llmEnabled: true });
  const s = faqSettings(cfg({ enabled: false, emoji: ':wave:', allowed_user_ids: ['U1'] }, { dry_run: true }),
    { FAQ_ALLOWED_USER_IDS: 'U2' });
  assert.deepStrictEqual(s, { enabled: false, mentionsEnabled: true, emoji: 'wave', allowedUserIds: ['U1'], dryRun: true, llmEnabled: true });
  assert.strictEqual(faqSettings({}, { FAQ_RESPONDER_ENABLED: 'false' }).enabled, false);
});

test('sanitizeReply rejects off-site links and strips mass pings', () => {
  assert.strictEqual(sanitizeReply('Welcome! See <https://evil.example.com/x|this> for details.'), null);
  assert.strictEqual(sanitizeReply('Welcome! See https://ohack.dev.evil.com/nonprofits to start.'), null);
  assert.strictEqual(sanitizeReply('hi'), null);
  assert.strictEqual(
    sanitizeReply('<!channel> Welcome @here! See <https://www.ohack.dev/hack|hackathons>.'),
    ' Welcome here! See <https://www.ohack.dev/hack|hackathons>.'.trim());
  assert.strictEqual(sanitizeReply(goodReply), goodReply);
});

test('posts LLM reply in thread with dedupe metadata', async () => {
  const client = fakeClient();
  await handleFaqReaction({ event: event(), client },
    { cfg: cfg(), env: {}, apiKey: 'k', chat: async () => ({ reply: goodReply }) });
  assert.strictEqual(client.posted.length, 1);
  assert.strictEqual(client.posted[0].thread_ts, '1.1');
  assert.strictEqual(client.posted[0].text, goodReply);
  assert.deepStrictEqual(client.posted[0].metadata,
    { event_type: 'ohack_faq_reply', event_payload: { answered_ts: '1.1' } });
});

test('falls back to canned reply when LLM is off, fails, or goes off-site', async () => {
  for (const deps of [
    { apiKey: '' },
    { apiKey: 'k', chat: async () => null },
    { apiKey: 'k', chat: async () => ({ reply: 'Go to https://evil.example.com right now please.' }) },
  ]) {
    const client = fakeClient();
    await handleFaqReaction({ event: event(), client }, { cfg: cfg(), env: {}, ...deps });
    assert.match(client.posted[0].text, new RegExp(`^Welcome <@${ASKER}>`));
    assert.match(client.posted[0].text, /ohack\.dev\/projects/);
  }
});

test('ignores wrong emoji, disabled, non-admin, bot messages, and repeats', async () => {
  const run = async (ev, c, client = fakeClient()) => {
    await handleFaqReaction({ event: ev, client }, { cfg: c, env: {}, apiKey: '' });
    return client.posted.length;
  };
  assert.strictEqual(await run(event({ reaction: 'tada' }), cfg()), 0);
  assert.strictEqual(await run(event(), cfg({ enabled: false })), 0);
  assert.strictEqual(await run(event(), cfg(), fakeClient({ admin: false })), 0);
  assert.strictEqual(await run(event(), cfg({ allowed_user_ids: ['U0SOMEONE'] })), 0);
  assert.strictEqual(await run(event(), cfg({ allowed_user_ids: [ADMIN] }), fakeClient({ admin: false })), 1);
  assert.strictEqual(await run(event(), cfg(), fakeClient({
    messages: [{ ts: '1.1', user: 'UBOT', bot_id: 'B1', text: 'digest' }] })), 0);
  assert.strictEqual(await run(event(), cfg(), fakeClient({ messages: [
    { ts: '1.1', user: ASKER, text: 'how do I start?' },
    { ts: '1.2', user: 'UBOT', metadata: { event_type: 'ohack_faq_reply', event_payload: { answered_ts: '1.1' } } },
  ] })), 0);
});

test('dry run logs instead of posting; reply-in-thread stays in that thread', async () => {
  const dry = fakeClient();
  await handleFaqReaction({ event: event(), client: dry }, { cfg: cfg({}, { dry_run: true }), env: {}, apiKey: '' });
  assert.strictEqual(dry.posted.length, 0);

  const client = fakeClient({ messages: [{ ts: '2.5', thread_ts: '2.0', user: ASKER, text: 'how can I help?' }] });
  await handleFaqReaction(
    { event: event({ item: { type: 'message', channel: 'C1', ts: '2.5' } }), client },
    { cfg: cfg(), env: {}, apiKey: '' });
  assert.strictEqual(client.posted[0].thread_ts, '2.0');
});

test('mention with a question answers the mentioner, mention stripped from the prompt', async () => {
  const client = fakeClient({ messages: [{ ts: '5.0', user: ASKER, text: '<@U0BOT00001> how do I become a mentor?' }] });
  let seen = '';
  await handleFaqMention(
    { event: { user: ASKER, channel: 'C1', ts: '5.0', text: '<@U0BOT00001> how do I become a mentor?' }, client },
    { cfg: cfg(), env: {}, apiKey: 'k', chat: async (prompt) => { seen = prompt; return { reply: goodReply }; } });
  assert.strictEqual(client.posted.length, 1);
  assert.strictEqual(client.posted[0].thread_ts, '5.0');
  assert.match(seen, /"how do I become a mentor\?"/);
  assert.doesNotMatch(seen, /U0BOT00001/);
});

test('bare mention in a thread answers the thread parent, once', async () => {
  const parent = { ts: '6.0', thread_ts: '6.0', user: ASKER, text: 'How can I help here?' };
  const ev = { user: ADMIN, channel: 'C1', ts: '6.3', thread_ts: '6.0', text: '<@U0BOT00001>' };
  const client = fakeClient({ messages: [parent] });
  await handleFaqMention({ event: ev, client }, { cfg: cfg(), env: {}, apiKey: '' });
  assert.strictEqual(client.posted[0].thread_ts, '6.0');
  assert.deepStrictEqual(client.posted[0].metadata.event_payload, { answered_ts: '6.0' });
  assert.match(client.posted[0].text, new RegExp(`<@${ASKER}>`));

  const again = fakeClient({ messages: [parent, { ts: '6.4', metadata: client.posted[0].metadata }] });
  await handleFaqMention({ event: ev, client: again }, { cfg: cfg(), env: {}, apiKey: '' });
  assert.strictEqual(again.posted.length, 0);
});

test('mentions can be disabled and are rate-limited per user', async () => {
  const client = fakeClient();
  const ev = { user: 'U0OFF000001', channel: 'C1', ts: '1.1', text: '<@U0BOT00001> hi there' };
  await handleFaqMention({ event: ev, client }, { cfg: cfg({ mentions_enabled: false }), env: {}, apiKey: '' });
  await handleFaqMention({ event: { ...ev, bot_id: 'B1' }, client }, { cfg: cfg(), env: {}, apiKey: '' });
  assert.strictEqual(client.posted.length, 0);

  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.strictEqual(allowMention('U0SPAM00001', t0 + i), true);
  assert.strictEqual(allowMention('U0SPAM00001', t0 + 10), false);
  assert.strictEqual(allowMention('U0SPAM00001', t0 + 11 * 60 * 1000), true);
});
