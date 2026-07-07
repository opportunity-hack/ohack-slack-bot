'use strict';
const config = require('./config');
const { getActiveTeams } = require('./ohack_api');
const { parseRepoUrl, getRepoData } = require('./github');
const { classifyRepoData } = require('./rules');
const { repoScoreboardText, buildParentBlocks, buildLLMBlock, buildThreadReplies } = require('./render');
const { getBotUserId, getClaimedAndAcked } = require('./reactions');
const { getLLMInsights } = require('./llm');

const _channelCache = new Map(); // name → id

async function resolveChannelId(client, channelName) {
  if (_channelCache.has(channelName)) return _channelCache.get(channelName);

  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await client.conversations.list({ limit: 200, cursor, types: 'public_channel' });
    const found = (res.channels || []).find(c => c.name === channelName);
    if (found) {
      _channelCache.set(channelName, found.id);
      return found.id;
    }
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return null;
}

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

async function runDigest(client, opts = {}) {
  const now = new Date();
  const hackathonEnd = opts.hackathonEndDate;
  if (hackathonEnd) {
    const cutoff = new Date(new Date(hackathonEnd).getTime() + 3 * 24 * 60 * 60 * 1000);
    if (now > cutoff) {
      console.log('[repo-tpm] Hackathon ended >3 days ago, skipping digest.');
      return;
    }
  }

  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  let teams;
  try {
    teams = await getActiveTeams();
  } catch (err) {
    console.error('[repo-tpm] Failed to fetch teams:', err.message);
    return;
  }

  for (const team of teams) {
    try {
      await processTeam(client, team, dayOfYear, now);
    } catch (err) {
      console.error(`[repo-tpm] Error processing team ${team.name}:`, err.message);
    }
  }
}

async function processTeam(client, team, dayOfYear, now) {
  const channelName = team.slack_channel;
  if (!channelName) { console.warn(`[repo-tpm] Team ${team.name} has no slack_channel`); return; }

  const channelId = await resolveChannelId(client, channelName);
  if (!channelId) { console.warn(`[repo-tpm] Channel not found: ${channelName}`); return; }

  try { await client.conversations.join({ channel: channelId }); } catch (_) {}

  const repos = (team.github_links || [])
    .map(l => parseRepoUrl(typeof l === 'string' ? l : l.link))
    .filter(Boolean);

  if (repos.length === 0) { console.warn(`[repo-tpm] No parseable repos for team ${team.name}`); return; }

  const allLogins = new Set();
  const repoResults = [];

  for (const { owner, repo } of repos) {
    try {
      const data = await getRepoData(owner, repo);
      if (!data) { console.warn(`[repo-tpm] Repo not found: ${owner}/${repo}`); continue; }
      const classified = classifyRepoData(data, now.getTime(), dayOfYear);
      classified.openIssues = data.openIssues;
      classified.openPRs = data.openPRs;
      const llm = await getLLMInsights(`${owner}/${repo}`, classified, config.openaiApiKey);
      repoResults.push({ owner, repo, classified, llm });

      [...classified.mergedPRs.map(p => p.author),
       ...classified.stalledPRs.flatMap(p => [p.author, ...p.assignees]),
       ...classified.touchedItems.map(t => t.actor)].forEach(l => allLogins.add(l));
    } catch (err) {
      console.error(`[repo-tpm] Error fetching ${owner}/${repo}:`, err.message);
    }
  }

  if (repoResults.length === 0) return;

  const slackIdMap = await resolveSlackIds([...allLogins], config.identityApiBase);

  const botUserId = await getBotUserId(client).catch(() => null);
  const { claimed, suppressed } = botUserId
    ? await getClaimedAndAcked(client, channelId, botUserId).catch(() => ({ claimed: {}, suppressed: new Set() }))
    : { claimed: {}, suppressed: new Set() };

  const summaries = repoResults.map(({ owner, repo, classified, llm }) => ({
    text: repoScoreboardText(`${owner}/${repo}`, classified),
    narrative: llm?.narrative || null,
    owner, repo, classified, llm,
  }));

  const parentBlocks = buildParentBlocks(summaries);
  const parentText = summaries.map(s => s.text).join('\n');

  if (config.dryRun) {
    console.log('[repo-tpm DRY RUN] Parent blocks:\n', JSON.stringify(parentBlocks, null, 2));
    repoResults.forEach(({ owner, repo, classified, llm }) => {
      const threadBlocks = buildThreadReplies(`${owner}/${repo}`, classified, slackIdMap, { claimed, suppressed });
      if (llm) { const b = buildLLMBlock(llm); if (b) threadBlocks.push(b); }
      console.log(`[repo-tpm DRY RUN] Thread for ${owner}/${repo}:\n`, JSON.stringify(threadBlocks, null, 2));
    });
    return;
  }

  const parentMsg = await client.chat.postMessage({
    channel: channelId,
    text: parentText,
    blocks: parentBlocks,
  });

  const hasWins = repoResults.some(r => r.classified.mergedPRs.length > 0 || r.classified.closedIssues.length > 0);
  if (hasWins) {
    try { await client.reactions.add({ channel: channelId, timestamp: parentMsg.ts, name: 'tada' }); } catch (_) {}
  }

  for (const { owner, repo, classified, llm } of repoResults) {
    const threadBlocks = buildThreadReplies(`${owner}/${repo}`, classified, slackIdMap, { claimed, suppressed });
    if (llm) {
      const llmBlock = buildLLMBlock(llm);
      if (llmBlock) threadBlocks.push(llmBlock);
    }
    if (threadBlocks.length === 0) continue;
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: parentMsg.ts,
      text: `Digest for ${owner}/${repo}`,
      blocks: threadBlocks,
    });
  }
}

// Find the team for the given channel ID and run its digest (for /repo-status slash command)
async function runDigestForChannel(client, channelId) {
  const teams = await getActiveTeams();
  for (const team of teams) {
    const teamChannelId = await resolveChannelId(client, team.slack_channel).catch(() => null);
    if (teamChannelId === channelId) {
      const now = new Date();
      const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
      await processTeam(client, team, dayOfYear, now);
      return true;
    }
  }
  return false; // no matching team
}

module.exports = { runDigest, runDigestForChannel };
