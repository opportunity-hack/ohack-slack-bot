'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fixSlackMentions } = require('../community/llm');

test('wraps bare @userid in mention syntax', () => {
  assert.strictEqual(
    fixSlackMentions('Welcome @U0BKEV6RA78, a skilled backend engineer.'),
    'Welcome <@U0BKEV6RA78>, a skilled backend engineer.'
  );
});

test('leaves correct <@userid> mentions untouched', () => {
  assert.strictEqual(
    fixSlackMentions('Say hi to <@U0BL64RNFLN>, a Google engineer.'),
    'Say hi to <@U0BL64RNFLN>, a Google engineer.'
  );
});

test('fixes multiple ids in one line', () => {
  assert.strictEqual(
    fixSlackMentions('@U0BKF38DPB9 and <@U0BKEV6RA78> should meet'),
    '<@U0BKF38DPB9> and <@U0BKEV6RA78> should meet'
  );
});

test('does not touch plain @names or short tokens', () => {
  assert.strictEqual(fixSlackMentions('Welcome @Preyansh from @UNICEF'), 'Welcome @Preyansh from @UNICEF');
});

test('handles non-string input', () => {
  assert.strictEqual(fixSlackMentions(null), null);
});

const { modelParams } = require('../openai_model');

test('defaults to gpt-5-mini with reasoning params (no temperature/max_tokens)', () => {
  const p = modelParams({ maxTokens: 300, temperature: 0.3 }, {});
  assert.strictEqual(p.model, 'gpt-5-mini');
  assert.strictEqual(p.reasoning_effort, 'low');
  assert.ok(p.max_completion_tokens > 300);
  assert.strictEqual(p.temperature, undefined);
  assert.strictEqual(p.max_tokens, undefined);
});

test('OPENAI_MODEL override to a non-reasoning model uses classic params', () => {
  const p = modelParams({ maxTokens: 300, temperature: 0.3 }, { OPENAI_MODEL: 'gpt-4.1-mini' });
  assert.deepStrictEqual(p, { model: 'gpt-4.1-mini', max_tokens: 300, temperature: 0.3 });
});
