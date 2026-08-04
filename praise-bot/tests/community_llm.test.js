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
