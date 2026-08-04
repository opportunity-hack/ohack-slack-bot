'use strict';
const tpmConfig = require('../repo-tpm/config');
const { resolveChannelId } = require('../slack_channels');
const { getIntroIndex } = require('./intro_index');
const { getDigestSummary } = require('./llm');

const DEFAULT_LOOKBACK_DAYS = 7;

// Weekly community digest: who joined recently (with @mentions), plus common
// themes. Posted to the configured channel on the community digest cron.
async function runCommunityDigest(client, communityCfg, globalCfg) {
  const digestCfg = communityCfg.digest || {};
  const channel = digestCfg.channel;
  if (!digestCfg.enabled || !channel) return;

  const dryRun = communityCfg.dry_run ?? globalCfg?.dry_run ?? false;
  const lookbackDays = communityCfg.lookback_days || DEFAULT_LOOKBACK_DAYS;
  const introChannel = communityCfg.intro_channel || 'introductions';

  const introChannelId = await resolveChannelId(client, introChannel);
  if (!introChannelId) {
    console.error(`[community] Intro channel not found: ${introChannel}`);
    return;
  }

  let intros;
  try {
    intros = await getIntroIndex(client, introChannelId, { force: true });
  } catch (err) {
    console.error('[community] Digest: failed to fetch intros:', err.message);
    return;
  }

  const cutoff = (Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000;
  const recent = intros.filter(i => parseFloat(i.ts) >= cutoff);
  if (recent.length === 0) {
    console.log(`[community] No intros in the last ${lookbackDays} days — skipping digest.`);
    return;
  }

  const llmEnabled = (globalCfg?.llm_enabled !== false) && Boolean(tpmConfig.openaiApiKey);
  const summary = llmEnabled ? await getDigestSummary(recent, tpmConfig.openaiApiKey) : null;

  const lines = [`*👋 New faces this week* (${recent.length} joined <#${introChannelId}>)`, ''];
  if (summary?.members?.length) {
    for (const m of summary.members) lines.push(`• <@${m.id}> — ${m.line}`);
  } else {
    for (const i of recent) lines.push(`• <@${i.userId}>`);
  }
  if (summary?.themes) {
    lines.push('');
    lines.push(`_${summary.themes}_`);
  }
  lines.push('');
  lines.push('_Say hi in the thread of their intro, or send them a `/praise`!_');

  const text = lines.join('\n');

  if (dryRun) {
    console.log(`[community] DRY RUN digest for #${channel}:\n${text}`);
    return;
  }

  const channelId = await resolveChannelId(client, channel);
  if (!channelId) {
    console.error(`[community] Digest channel not found: ${channel}`);
    return;
  }
  try { await client.conversations.join({ channel: channelId }); } catch (_) {}
  await client.chat.postMessage({ channel: channelId, text, unfurl_links: false });
  console.log(`[community] Weekly digest posted to #${channel} (${recent.length} new members)`);
}

module.exports = { runCommunityDigest };
