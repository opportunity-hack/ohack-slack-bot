'use strict';
const envConfig = require('./config');
const { getUpcomingEvents } = require('./calendar');
const { reminderKey, buildReminderText } = require('./render');
const { resolveChannelId } = require('../slack_channels');

const _announced = new Map(); // `${reminderId}:${reminderKey}` → announced-at ms

function pruneAnnounced(nowMs) {
  for (const [key, ts] of _announced) {
    if (nowMs - ts > 24 * 60 * 60 * 1000) _announced.delete(key);
  }
}

/*
 * Poll the public calendar and post a reminder to each configured channel
 * for every event starting within the next `lead_minutes`. Each occurrence
 * is announced once per reminder config (in-memory dedupe; a restart inside
 * the lead window could repeat a reminder, which is acceptable).
 */
async function runCalendarReminders(client, reminderCfg, globalCfg, opts = {}) {
  const cfg = {
    id: reminderCfg?.id || 'default',
    calendarId: reminderCfg?.calendar_id || envConfig.calendarId,
    channels: reminderCfg?.channels || envConfig.channels,
    leadMinutes: reminderCfg?.lead_minutes || envConfig.leadMinutes,
    eventsPageUrl: reminderCfg?.events_page_url || envConfig.eventsPageUrl,
    // Either source can force dry-run on (env CALENDAR_DRY_RUN stays honored)
    dryRun: Boolean(globalCfg?.dry_run) || envConfig.dryRun,
  };

  const now = opts.now || new Date();
  const windowEnd = new Date(now.getTime() + cfg.leadMinutes * 60 * 1000);

  let occurrences;
  try {
    occurrences = await getUpcomingEvents(cfg.calendarId, now, windowEnd);
  } catch (err) {
    console.error(`[calendar] Failed to fetch calendar "${cfg.calendarId}" (reminder "${cfg.id}"):`, err.message);
    return;
  }

  pruneAnnounced(now.getTime());

  for (const occ of occurrences) {
    // Key includes the reminder config id so two configs watching the same
    // calendar don't suppress each other's announcements.
    const key = `${cfg.id}:${reminderKey(occ)}`;
    if (_announced.has(key)) continue;
    _announced.set(key, now.getTime());

    const text = buildReminderText(occ, now, cfg.eventsPageUrl, cfg.calendarId);

    for (const channel of cfg.channels) {
      if (cfg.dryRun) {
        console.log(`[calendar] DRY RUN → #${channel}:\n${text}`);
        continue;
      }
      try {
        const channelId = await resolveChannelId(client, channel);
        if (!channelId) {
          console.warn(`[calendar] Channel not found: ${channel}`);
          continue;
        }
        await client.chat.postMessage({ channel: channelId, text, unfurl_links: false });
        console.log(`[calendar] Reminder posted to #${channel}: ${occ.summary}`);
      } catch (err) {
        console.error(`[calendar] Failed to post to #${channel}:`, err.message);
      }
    }
  }
}

module.exports = { runCalendarReminders };
