'use strict';
const config = require('./config');
const { getTargets } = require('./targets');
const { getRepoData } = require('./github');
const { classifyRepoData } = require('./rules');
const { repoScoreboardText, buildParentBlocks, buildThreadBlocks, isQuiet } = require('./render');
const { getBotUserId, getClaimedAndAcked } = require('./reactions');
const { getLLMInsights } = require('./llm');
const { resolveChannelId } = require('../slack_channels');

async function resolveSlackIds(githubLogins, identityApiBase) {
  const map = {};
  await Promise.allSettled(
    githubLogins.map(async login => {
      try {
        const res = await fetch(`${identityApiBase}/api/users/github/${encodeURIComponent(login)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.slack_user_id) map[login] = data.slack_user_id;
        }
      } catch (_) {}
    })
  );
  return map;
}

function digestOptions(watcher, globalCfg) {
  return {
    dryRun: watcher?.dry_run ?? globalCfg?.dry_run ?? config.dryRun,
    llmEnabled: (globalCfg?.llm_enabled !== false) && Boolean(config.openaiApiKey),
    portfolioEnabled: globalCfg?.portfolio_coaching !== false,
    // Lookback for merges, commits and activity. Daily digests use 25h (an
    // hour of slack past the cron); hourly hackathon digests set window_hours: 1.
    windowHours: Number(watcher?.digest?.window_hours) > 0
      ? Number(watcher.digest.window_hours)
      : config.digestWindowHours,
  };
}

// Run the digest for every target of one github_watcher config doc.
async function runDigest(client, watcher, globalCfg) {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const opts = digestOptions(watcher, globalCfg);

  let targets;
  try {
    targets = await getTargets(watcher);
  } catch (err) {
    console.error('[repo-tpm] Failed to resolve digest targets:', err.message);
    return;
  }

  for (const target of targets) {
    try {
      await processTarget(client, target, dayOfYear, now, opts);
    } catch (err) {
      console.error(`[repo-tpm] Error processing target ${target.name}:`, err.message);
    }
  }
}

async function processTarget(client, target, dayOfYear, now, opts = {}) {
  // Team targets go quiet a few days after their hackathon ends — but an
  // explicit /repo-status request (channelOverride) always runs.
  if (target.hackathonEndDate && !opts.channelOverride) {
    const cutoff = new Date(new Date(target.hackathonEndDate).getTime() + 3 * 24 * 60 * 60 * 1000);
    if (now > cutoff) {
      console.log(`[repo-tpm] Hackathon ended >3 days ago, skipping ${target.name}.`);
      return;
    }
  }

  const channels = opts.channelOverride ? [opts.channelOverride] : (target.channels || []);
  if (channels.length === 0) { console.warn(`[repo-tpm] Target ${target.name} has no channels`); return; }

  const repos = target.repos || [];
  if (repos.length === 0) { console.warn(`[repo-tpm] No parseable repos for target ${target.name}`); return; }

  const allLogins = new Set();
  const repoResults = [];

  for (const { owner, repo } of repos) {
    try {
      const data = await getRepoData(owner, repo, opts.windowHours);
      if (!data) { console.warn(`[repo-tpm] Repo not found: ${owner}/${repo}`); continue; }
      const classified = classifyRepoData(data, now.getTime(), dayOfYear);
      classified.openIssues = data.openIssues;
      classified.openPRs = data.openPRs;
      if (opts.portfolioEnabled === false) {
        classified.portfolioNudges = [];
        classified.mergedPRs.forEach(pr => { pr.greatWriteup = false; });
      }
      // Nothing to narrate for a quiet repo — skip the LLM call.
      const llm = opts.llmEnabled !== false && !isQuiet(classified)
        ? await getLLMInsights(`${owner}/${repo}`, classified, config.openaiApiKey, { windowHours: opts.windowHours })
        : null;
      repoResults.push({ owner, repo, classified, llm });

      [...classified.mergedPRs.map(p => p.author),
       ...classified.directCommits.map(c => c.author),
       ...classified.stalledPRs.flatMap(p => [p.author, ...p.assignees]),
       ...classified.portfolioNudges.map(p => p.author),
       ...classified.touchedItems.map(t => t.actor)].forEach(l => allLogins.add(l));
    } catch (err) {
      console.error(`[repo-tpm] Error fetching ${owner}/${repo}:`, err.message);
    }
  }

  if (repoResults.length === 0) return;

  const slackIdMap = await resolveSlackIds([...allLogins], config.identityApiBase);

  const summaries = repoResults.map(({ owner, repo, classified, llm }) => ({
    text: repoScoreboardText(`${owner}/${repo}`, classified, { windowHours: opts.windowHours }),
    owner, repo, classified, llm,
  }));

  const parentBlocks = buildParentBlocks(summaries, slackIdMap);
  // Fallback text stays scoreboard-only: reactions.js finds the parent by its leading 📊.
  const parentText = summaries.map(s => s.text).join('\n');

  for (const channel of channels) {
    const channelId = await resolveChannelId(client, channel);
    if (!channelId) { console.warn(`[repo-tpm] Channel not found: ${channel}`); continue; }

    try { await client.conversations.join({ channel: channelId }); } catch (_) {}

    const botUserId = await getBotUserId(client).catch(() => null);
    const { claimed, suppressed } = botUserId
      ? await getClaimedAndAcked(client, channelId, botUserId).catch(() => ({ claimed: {}, suppressed: new Set() }))
      : { claimed: {}, suppressed: new Set() };

    if (opts.dryRun) {
      console.log(`[repo-tpm DRY RUN] Parent blocks for #${channel}:\n`, JSON.stringify(parentBlocks, null, 2));
      repoResults.forEach(({ owner, repo, classified, llm }) => {
        const threadBlocks = buildThreadBlocks(owner, repo, classified, slackIdMap, llm, { claimed, suppressed, windowHours: opts.windowHours });
        console.log(`[repo-tpm DRY RUN] Thread for ${owner}/${repo}:\n`, JSON.stringify(threadBlocks, null, 2));
      });
      continue;
    }

    const parentMsg = await client.chat.postMessage({
      channel: channelId,
      text: parentText,
      blocks: parentBlocks,
    });

    const hasWins = repoResults.some(r =>
      r.classified.mergedPRs.length > 0 || r.classified.closedIssues.length > 0 || r.classified.directCommits.length > 0);
    if (hasWins) {
      try { await client.reactions.add({ channel: channelId, timestamp: parentMsg.ts, name: 'tada' }); } catch (_) {}
    }

    for (const { owner, repo, classified, llm } of repoResults) {
      const threadBlocks = buildThreadBlocks(owner, repo, classified, slackIdMap, llm, { claimed, suppressed, windowHours: opts.windowHours });
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: parentMsg.ts,
        text: `Digest for ${owner}/${repo}`,
        blocks: threadBlocks,
      });
    }
  }
}

// Find the watcher target for the invoking channel and run its digest
// (for the /repo-status slash command). Posts only to the invoking channel.
async function runDigestForChannel(client, channelId, cfg) {
  const watchers = (cfg?.github_watchers || []).filter(w => w.enabled);
  for (const watcher of watchers) {
    let targets;
    try {
      targets = await getTargets(watcher);
    } catch (err) {
      console.error(`[repo-tpm] /repo-status: failed targets for ${watcher.name}:`, err.message);
      continue;
    }
    for (const target of targets) {
      for (const channel of target.channels || []) {
        const targetChannelId = await resolveChannelId(client, channel).catch(() => null);
        if (targetChannelId === channelId) {
          const now = new Date();
          const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
          const opts = { ...digestOptions(watcher, cfg?.global), channelOverride: channelId };
          await processTarget(client, target, dayOfYear, now, opts);
          return true;
        }
      }
    }
  }
  return false; // no matching target
}

module.exports = { runDigest, runDigestForChannel };
