'use strict';
const cron = require('node-cron');
const remoteConfig = require('./remote_config');

// Dynamic cron scheduler: turns the effective config into node-cron jobs and
// re-registers only the jobs whose schedule changed, so /admin edits take
// effect within one poll interval without a restart.
//
// A job's closure only captures its key + kind + config doc id; the runner
// looks the doc up in the *current* effective config at fire time, so field
// edits (channels, repos, toggles) apply at the next fire even without
// re-registration. Only cron/timezone changes require stop + reschedule.

const _jobs = new Map(); // key → { cronExpr, timezone, task, running }

function desiredJobsFromConfig(cfg) {
  const jobs = [];
  const timezone = cfg.global?.timezone || null;

  for (const w of cfg.github_watchers || []) {
    if (!w.enabled) continue;
    if (w.digest?.enabled && w.digest.cron) {
      jobs.push({ key: `gh:${w.id}:digest`, cron: w.digest.cron, timezone, kind: 'github_digest', refId: w.id });
    }
    if (w.rollup?.enabled && w.rollup.cron) {
      jobs.push({ key: `gh:${w.id}:rollup`, cron: w.rollup.cron, timezone, kind: 'mentor_rollup', refId: w.id });
    }
  }

  for (const r of cfg.calendar_reminders || []) {
    if (!r.enabled || !r.poll_cron) continue;
    jobs.push({ key: `cal:${r.id}:poll`, cron: r.poll_cron, timezone, kind: 'calendar_poll', refId: r.id });
  }

  const community = cfg.community;
  if (community?.enabled && community.digest?.enabled && community.digest.cron) {
    jobs.push({ key: 'community:digest', cron: community.digest.cron, timezone, kind: 'community_digest', refId: null });
  }

  return jobs;
}

// Default runners; injectable for tests. Required lazily so the scheduler can
// be unit-tested without pulling in Slack/network modules.
function defaultRunners() {
  return {
    github_digest: async (client, cfg, refId) => {
      const watcher = (cfg.github_watchers || []).find(w => w.id === refId);
      if (!watcher?.enabled) return;
      console.log(`[scheduler] Running digest for watcher "${watcher.name}"...`);
      await require('./repo-tpm/digest').runDigest(client, watcher, cfg.global);
    },
    mentor_rollup: async (client, cfg, refId) => {
      const watcher = (cfg.github_watchers || []).find(w => w.id === refId);
      if (!watcher?.enabled) return;
      console.log(`[scheduler] Running mentor rollup for watcher "${watcher.name}"...`);
      await require('./repo-tpm/mentor_rollup').runMentorRollup(client, watcher, cfg.global);
    },
    calendar_poll: async (client, cfg, refId) => {
      const reminder = (cfg.calendar_reminders || []).find(r => r.id === refId);
      if (!reminder?.enabled) return;
      await require('./calendar-reminders/reminders').runCalendarReminders(client, reminder, cfg.global);
    },
    community_digest: async (client, cfg) => {
      if (!cfg.community?.enabled) return;
      console.log('[scheduler] Running community digest...');
      await require('./community/digest').runCommunityDigest(client, cfg.community, cfg.global);
    },
  };
}

function applyConfig(client, cfg, deps = {}) {
  const cronLib = deps.cronLib || cron;
  const runners = deps.runners || defaultRunners();
  const getConfig = deps.getConfig || remoteConfig.getEffectiveConfig;

  const desired = desiredJobsFromConfig(cfg);
  const desiredByKey = new Map(desired.map(j => [j.key, j]));
  const changes = { started: [], stopped: [], kept: [] };

  // Stop jobs that disappeared or whose schedule changed
  for (const [key, entry] of _jobs) {
    const want = desiredByKey.get(key);
    if (want && want.cron === entry.cronExpr && want.timezone === entry.timezone) {
      changes.kept.push(key);
      continue;
    }
    entry.task.stop();
    _jobs.delete(key);
    changes.stopped.push(key);
  }

  // Register new or rescheduled jobs
  for (const job of desired) {
    if (_jobs.has(job.key)) continue;
    if (!cronLib.validate(job.cron)) {
      console.error(`[scheduler] Invalid cron "${job.cron}" for ${job.key} — skipping`);
      continue;
    }
    const entry = { cronExpr: job.cron, timezone: job.timezone, task: null, running: false };
    const wrappedRun = async () => {
      if (entry.running) {
        console.warn(`[scheduler] ${job.key} still running, skipping this fire`);
        return;
      }
      entry.running = true;
      try {
        await runners[job.kind](client, getConfig(), job.refId);
      } catch (err) {
        console.error(`[scheduler] ${job.key} error:`, err.message);
      } finally {
        entry.running = false;
      }
    };
    try {
      entry.task = cronLib.schedule(job.cron, wrappedRun, job.timezone ? { timezone: job.timezone } : undefined);
    } catch (err) {
      // e.g. invalid timezone — retry without it rather than dying
      console.error(`[scheduler] Failed to schedule ${job.key} (${err.message}), retrying without timezone`);
      try {
        entry.task = cronLib.schedule(job.cron, wrappedRun);
        entry.timezone = null;
      } catch (err2) {
        console.error(`[scheduler] Could not schedule ${job.key}:`, err2.message);
        continue;
      }
    }
    _jobs.set(job.key, entry);
    changes.started.push(`${job.key} @ ${job.cron}`);
  }

  if (changes.started.length || changes.stopped.length) {
    console.log(`[scheduler] Applied config: +[${changes.started.join(', ')}] -[${changes.stopped.join(', ')}] (${changes.kept.length} unchanged)`);
  }
  return changes;
}

async function startScheduler(app, deps = {}) {
  const refresh = deps.refresh || remoteConfig.refreshRemoteConfig;
  const pollSeconds = deps.pollSeconds || remoteConfig.POLL_SECONDS;
  const { ensureCommunityChannelJoined } = require('./community');

  const initialCfg = await refresh();
  applyConfig(app.client, initialCfg, deps);
  ensureCommunityChannelJoined(app.client, initialCfg).catch(() => {});

  let lastApplied = null;
  const interval = setInterval(async () => {
    try {
      const cfg = await refresh();
      const canonical = JSON.stringify(cfg);
      if (canonical !== lastApplied) {
        applyConfig(app.client, cfg, deps);
        // Membership is required to receive intro message events
        ensureCommunityChannelJoined(app.client, cfg).catch(() => {});
        lastApplied = canonical;
      }
    } catch (err) {
      console.error('[scheduler] Config poll error:', err.message);
    }
  }, pollSeconds * 1000);

  console.log(`[scheduler] Started — polling config every ${pollSeconds}s from backend`);
  return interval;
}

// Test hook: stop everything and clear the registry.
function _resetForTests() {
  for (const [, entry] of _jobs) {
    try { entry.task.stop(); } catch (_) {}
  }
  _jobs.clear();
}

module.exports = { startScheduler, applyConfig, desiredJobsFromConfig, _resetForTests };
