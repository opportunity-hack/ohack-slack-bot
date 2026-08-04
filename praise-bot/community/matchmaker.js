'use strict';
const tpmConfig = require('../repo-tpm/config');
const { getIntroIndex, addIntro, topCandidates, isIntroMessage } = require('./intro_index');
const { getMatches } = require('./llm');

// Reply in-thread to a new #introductions post with a warm welcome and up to
// max_matches "you should meet" suggestions drawn from earlier intros.
// Everything is based on what members posted publicly in the intro channel.
async function handleIntroMessage(client, message, communityCfg, globalCfg) {
  const matchmaker = communityCfg.matchmaker || {};
  if (!matchmaker.enabled) return;

  if (!isIntroMessage(message)) return;

  const dryRun = communityCfg.dry_run ?? globalCfg?.dry_run ?? false;
  const maxMatches = matchmaker.max_matches || 3;
  const newIntro = { userId: message.user, text: (message.text || '').trim(), ts: message.ts };

  let intros = [];
  try {
    intros = await getIntroIndex(client, message.channel);
  } catch (err) {
    console.error('[community] Failed to build intro index:', err.message);
  }
  addIntro(message.channel, newIntro);

  const candidates = topCandidates(newIntro, intros);
  const llmEnabled = (globalCfg?.llm_enabled !== false) && Boolean(tpmConfig.openaiApiKey);
  const result = llmEnabled && candidates.length > 0
    ? await getMatches(newIntro, candidates, maxMatches, tpmConfig.openaiApiKey)
    : null;

  const lines = [];
  const welcome = result?.welcome
    || `Welcome to Opportunity Hack, <@${newIntro.userId}>! Great to have you here.`;
  lines.push(result?.welcome ? `${result.welcome} 👋` : welcome);

  if (result?.matches?.length) {
    lines.push('');
    lines.push('*You might want to meet:*');
    for (const m of result.matches) {
      lines.push(`• <@${m.id}> — ${m.reason}`);
    }
  }
  lines.push('');
  lines.push('_Check out <https://www.ohack.dev/nonprofits|open nonprofit projects> to get started — these suggestions come from earlier posts in this channel._');

  const text = lines.join('\n');

  if (dryRun) {
    console.log(`[community] DRY RUN matchmaker reply for <@${newIntro.userId}>:\n${text}`);
    return;
  }

  await client.chat.postMessage({
    channel: message.channel,
    thread_ts: message.ts,
    text,
    unfurl_links: false,
  });
  console.log(`[community] Matchmaker replied to intro from ${newIntro.userId} (${result?.matches?.length || 0} matches)`);
}

module.exports = { handleIntroMessage };
