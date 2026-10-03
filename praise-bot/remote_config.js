'use strict';
const tpmConfig = require('./repo-tpm/config');
const calendarConfig = require('./calendar-reminders/config');

// Remote config: the bot's behavior (channels, repos, crons, toggles) lives in
// the ohack.dev backend (managed from /admin/praise-bot) so changes don't
// require touching Fly.io env vars. Secrets stay in env. If the backend is
// unreachable or has no config docs yet, we fall back to the last-good remote
// config, then to env-var defaults — deploys stay safe during migration.

const CONFIG_URL = process.env.BACKEND_CONFIG_URL
  || `${process.env.OHACK_API_BASE || 'https://api.ohack.dev'}/api/praise-bot/config`;
const CONFIG_TOKEN = process.env.BACKEND_CONFIG_TOKEN || process.env.BACKEND_PRAISE_TOKEN || '';
const POLL_SECONDS = parseInt(process.env.CONFIG_POLL_SECONDS || '60', 10);

let _lastGood = null; // last successfully fetched remote config with configured: true
let _lastSource = null; // 'remote' | 'env' (for change-of-source logging)

// Mirrors today's env-var setup as a config object so behavior is identical
// until config docs are created in /admin.
function envDefaultConfig() {
  return {
    configured: false,
    global: {
      dry_run: tpmConfig.dryRun,
      llm_enabled: Boolean(tpmConfig.openaiApiKey),
      portfolio_coaching: true,
    },
    github_watchers: [{
      id: 'env-github',
      name: `Hackathon ${tpmConfig.eventId} (env)`,
      enabled: true,
      source: { mode: 'hackathon', event_id: tpmConfig.eventId },
      digest: { enabled: true, cron: tpmConfig.digestCron, window_hours: tpmConfig.digestWindowHours },
      rollup: {
        enabled: Boolean(tpmConfig.mentorChannel),
        cron: tpmConfig.mentorCron,
        channel: tpmConfig.mentorChannel,
      },
    }],
    calendar_reminders: [{
      id: 'env-calendar',
      name: 'Calendar reminders (env)',
      enabled: true,
      calendar_id: calendarConfig.calendarId,
      channels: calendarConfig.channels,
      lead_minutes: calendarConfig.leadMinutes,
      events_page_url: calendarConfig.eventsPageUrl,
      poll_cron: calendarConfig.pollCron,
    }],
    community: null,
  };
}

async function fetchRemoteConfig(fetchImpl = fetch) {
  if (!CONFIG_TOKEN) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetchImpl(CONFIG_URL, {
      headers: { 'X-Api-Key': CONFIG_TOKEN },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[config] Fetch failed: HTTP ${res.status} ${CONFIG_URL}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[config] Fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch and remember the latest remote config. Safe to call on a timer.
async function refreshRemoteConfig(fetchImpl = fetch) {
  const remote = await fetchRemoteConfig(fetchImpl);
  if (remote && remote.configured) _lastGood = remote;
  return getEffectiveConfig();
}

function getEffectiveConfig() {
  const source = _lastGood ? 'remote' : 'env';
  if (source !== _lastSource) {
    console.log(`[config] Using ${source} config${source === 'env' ? ' (backend unconfigured or unreachable)' : ''}`);
    _lastSource = source;
  }
  return _lastGood || envDefaultConfig();
}

// Test hook: reset module state between test cases.
function _resetForTests() {
  _lastGood = null;
  _lastSource = null;
}

module.exports = {
  envDefaultConfig,
  fetchRemoteConfig,
  refreshRemoteConfig,
  getEffectiveConfig,
  POLL_SECONDS,
  _resetForTests,
};
