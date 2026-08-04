'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const scheduler = require('../scheduler');

beforeEach(() => scheduler._resetForTests());

function makeFakeCron() {
  const log = { scheduled: [], stopped: [] };
  return {
    log,
    validate: expr => typeof expr === 'string' && expr.trim().split(/\s+/).length === 5,
    schedule(expr, fn, opts) {
      const entry = { expr, fn, opts };
      log.scheduled.push(entry);
      return { stop: () => log.stopped.push(expr), _entry: entry };
    },
  };
}

const noopRunners = {
  github_digest: async () => {},
  mentor_rollup: async () => {},
  calendar_poll: async () => {},
  community_digest: async () => {},
};

function baseConfig() {
  return {
    configured: true,
    global: { dry_run: false, llm_enabled: true },
    github_watchers: [{
      id: 'w1', name: 'Watcher 1', enabled: true,
      source: { mode: 'repos', repos: ['o/r'], channels: ['dev'] },
      digest: { enabled: true, cron: '0 16 * * *' },
      rollup: { enabled: true, cron: '0 14 * * 1', channel: 'mentors' },
    }],
    calendar_reminders: [{
      id: 'c1', name: 'Cal 1', enabled: true, poll_cron: '*/5 * * * *',
    }],
    community: null,
  };
}

test('desiredJobsFromConfig maps enabled features to job keys', () => {
  const jobs = scheduler.desiredJobsFromConfig(baseConfig());
  assert.deepStrictEqual(jobs.map(j => j.key).sort(),
    ['cal:c1:poll', 'gh:w1:digest', 'gh:w1:rollup']);
});

test('disabled watchers/reminders produce no jobs', () => {
  const cfg = baseConfig();
  cfg.github_watchers[0].enabled = false;
  cfg.calendar_reminders[0].enabled = false;
  assert.deepStrictEqual(scheduler.desiredJobsFromConfig(cfg), []);
});

test('community digest job appears when enabled', () => {
  const cfg = baseConfig();
  cfg.community = { enabled: true, digest: { enabled: true, cron: '0 17 * * 1', channel: 'general' } };
  const keys = scheduler.desiredJobsFromConfig(cfg).map(j => j.key);
  assert.ok(keys.includes('community:digest'));
});

test('applyConfig starts jobs, keeps unchanged, reschedules changed', () => {
  const cronLib = makeFakeCron();
  const deps = { cronLib, runners: noopRunners, getConfig: baseConfig };

  const first = scheduler.applyConfig({}, baseConfig(), deps);
  assert.strictEqual(first.started.length, 3);
  assert.strictEqual(cronLib.log.scheduled.length, 3);

  // Same config → nothing changes
  const second = scheduler.applyConfig({}, baseConfig(), deps);
  assert.strictEqual(second.started.length, 0);
  assert.strictEqual(second.stopped.length, 0);
  assert.strictEqual(second.kept.length, 3);

  // Change one cron → only that job is stopped + restarted
  const changed = baseConfig();
  changed.github_watchers[0].digest.cron = '0 9 * * *';
  const third = scheduler.applyConfig({}, changed, deps);
  assert.deepStrictEqual(third.stopped, ['gh:w1:digest']);
  assert.strictEqual(third.started.length, 1);
  assert.ok(third.started[0].startsWith('gh:w1:digest'));
  assert.strictEqual(third.kept.length, 2);

  // Remove the watcher → its jobs stop, calendar stays
  const removed = baseConfig();
  removed.github_watchers = [];
  const fourth = scheduler.applyConfig({}, removed, deps);
  assert.deepStrictEqual(fourth.stopped.sort(), ['gh:w1:digest', 'gh:w1:rollup']);
  assert.deepStrictEqual(fourth.kept, ['cal:c1:poll']);
});

test('invalid cron is skipped without throwing', () => {
  const cronLib = makeFakeCron();
  const cfg = baseConfig();
  cfg.github_watchers[0].digest.cron = 'every day at nine';
  const changes = scheduler.applyConfig({}, cfg, { cronLib, runners: noopRunners, getConfig: () => cfg });
  const keys = changes.started.map(s => s.split(' ')[0]);
  assert.ok(!keys.includes('gh:w1:digest'));
  assert.strictEqual(changes.started.length, 2); // rollup + calendar still run
});

test('job runner reads current config at fire time and skips overlap', async () => {
  const cronLib = makeFakeCron();
  const seenConfigs = [];
  let resolveRun;
  const runners = {
    ...noopRunners,
    github_digest: (client, cfg) => {
      seenConfigs.push(cfg);
      return new Promise(res => { resolveRun = res; });
    },
  };
  let currentCfg = baseConfig();
  const deps = { cronLib, runners, getConfig: () => currentCfg };
  scheduler.applyConfig({}, baseConfig(), deps);

  const digestJob = cronLib.log.scheduled.find(s => s.expr === '0 16 * * *');
  // Simulate a config edit between registration and fire
  currentCfg = baseConfig();
  currentCfg.global.dry_run = true;

  const firstFire = digestJob.fn();
  const overlappingFire = digestJob.fn(); // still running → skipped
  resolveRun();
  await firstFire;
  await overlappingFire;

  assert.strictEqual(seenConfigs.length, 1); // overlap was skipped
  assert.strictEqual(seenConfigs[0].global.dry_run, true); // fresh config used
});
