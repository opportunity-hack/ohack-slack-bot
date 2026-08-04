'use strict';
const { getEffectiveConfig } = require('../remote_config');
const { resolveChannelId } = require('../slack_channels');
const { handleIntroMessage } = require('./matchmaker');

// Register the #introductions message listener. The handler checks the
// *current* effective config at event time, so enabling/disabling the
// matchmaker from /admin/praise-bot takes effect without a restart.
// Requires the `message.channels` event subscription in manifest.json.
function registerCommunityHandlers(app) {
  app.message(async ({ message, client }) => {
    try {
      const cfg = getEffectiveConfig();
      const community = cfg.community;
      if (!community?.enabled) return;

      const introChannelId = await resolveChannelId(
        client, community.intro_channel || 'introductions').catch(() => null);
      if (!introChannelId || message.channel !== introChannelId) return;

      await handleIntroMessage(client, message, community, cfg.global);
    } catch (err) {
      console.error('[community] Intro handler error:', err.message);
    }
  });
}

// Slack only delivers message.channels events for channels the bot is a
// member of — join the intro channel proactively whenever community features
// are enabled (called by the scheduler after each config apply). Best-effort.
async function ensureCommunityChannelJoined(client, cfg) {
  const community = cfg?.community;
  if (!community?.enabled) return;
  try {
    const channelId = await resolveChannelId(client, community.intro_channel || 'introductions');
    if (channelId) await client.conversations.join({ channel: channelId });
  } catch (err) {
    console.warn('[community] Could not join intro channel:', err.message);
  }
}

module.exports = { registerCommunityHandlers, ensureCommunityChannelJoined };
