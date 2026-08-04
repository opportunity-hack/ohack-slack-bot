'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

process.env.BACKEND_CONFIG_TOKEN = 'test-token';
process.env.MENTOR_CHANNEL = ''; // rollup should be disabled in env defaults

const remoteConfig = require('../remote_config');

beforeEach(() => remoteConfig._resetForTests());

function fakeFetchOk(payload) {
  return async () => ({ ok: true, json: async () => payload });
}

const REMOTE_CFG = {
  configured: true,
  global: { dry_run: true, llm_enabled: false },
  github_watchers: [{ id: 'abc', name: 'Remote watcher', enabled: true }],
  calendar_reminders: [],
  community: null,
};

test('envDefaultConfig mirrors env vars', () => {
  const cfg = remoteConfig.envDefaultConfig();
  assert.strictEqual(cfg.configured, false);
  assert.strictEqual(cfg.github_watchers.length, 1);
  const watcher = cfg.github_watchers[0];
  assert.strictEqual(watcher.source.mode, 'hackathon');
  assert.ok(watcher.source.event_id);
  assert.ok(watcher.digest.enabled);
  assert.ok(watcher.digest.cron);
  // MENTOR_CHANNEL empty → rollup disabled (preserves the old skip behavior)
  assert.strictEqual(watcher.rollup.enabled, false);
  assert.strictEqual(cfg.calendar_reminders.length, 1);
  assert.ok(cfg.calendar_reminders[0].poll_cron);
});

test('fetch failure falls back to env defaults', async () => {
  const failingFetch = async () => { throw new Error('network down'); };
  const cfg = await remoteConfig.refreshRemoteConfig(failingFetch);
  assert.strictEqual(cfg.configured, false); // env default
});

test('configured:false remote keeps env defaults', async () => {
  const cfg = await remoteConfig.refreshRemoteConfig(
    fakeFetchOk({ ...REMOTE_CFG, configured: false }));
  assert.strictEqual(cfg.configured, false);
  assert.strictEqual(cfg.github_watchers[0].source.mode, 'hackathon');
});

test('configured remote wins and is retained after later failures (last-good)', async () => {
  let cfg = await remoteConfig.refreshRemoteConfig(fakeFetchOk(REMOTE_CFG));
  assert.strictEqual(cfg.configured, true);
  assert.strictEqual(cfg.github_watchers[0].id, 'abc');

  // Backend goes down → last-good remote config is still served
  const failingFetch = async () => { throw new Error('boom'); };
  cfg = await remoteConfig.refreshRemoteConfig(failingFetch);
  assert.strictEqual(cfg.configured, true);
  assert.strictEqual(cfg.github_watchers[0].id, 'abc');

  // Non-OK HTTP responses are also treated as failures
  const http500 = async () => ({ ok: false, status: 500, json: async () => ({}) });
  cfg = await remoteConfig.refreshRemoteConfig(http500);
  assert.strictEqual(cfg.github_watchers[0].id, 'abc');
});
