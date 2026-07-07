'use strict';
const config = require('./config');
const { getActiveTeams } = require('./ohack_api');
const { parseRepoUrl, getRepoData } = require('./github');
const { classifyRepoData } = require('./rules');

const WINDOW_HOURS = 7 * 24; // 7-day lookback for weekly rollup
const ZERO_ACTIVITY_THRESHOLD_H = 72;

function ageHours(repoData, now) {
  const allItems = [...(repoData.openIssues || []), ...(repoData.openPRs || []), ...(repoData.recentAll || [])];
  if (allItems.length === 0) return Infinity;
  const latest = Math.max(...allItems.map(i => new Date(i.updated_at).getTime()));
  return (now - latest) / (1000 * 60 * 60);
}

function formatAge(hours) {
  if (hours === Infinity) return 'unknown';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function buildTeamRow(team, now, dayOfYear) {
  const repos = (team.github_links || [])
    .map(l => parseRepoUrl(typeof l === 'string' ? l : l.link))
    .filter(Boolean);

  let mergedPRs7d = 0, openIssues = 0, unownedIssues = 0, openPRs = 0, stalledPRs = 0;
  let minAgeH = Infinity;
  const since7d = new Date(now - WINDOW_HOURS * 60 * 60 * 1000);

  for (const { owner, repo } of repos) {
    try {
      const data = await getRepoData(owner, repo, WINDOW_HOURS);
      if (!data) continue;
      const classified = classifyRepoData(data, now, dayOfYear);

      mergedPRs7d += (data.allPullRequests || []).filter(pr => pr.merged_at && new Date(pr.merged_at) >= since7d).length;
      openIssues += (data.openIssues || []).length;
      unownedIssues += classified.unownedIssues.length;
      openPRs += (data.openPRs || []).length;
      stalledPRs += classified.stalledPRs.length;

      const h = ageHours(data, now);
      if (h < minAgeH) minAgeH = h;
    } catch (err) {
      console.error(`[repo-tpm] Mentor rollup: error for ${owner}/${repo}:`, err.message);
    }
  }

  return {
    teamName: team.name,
    mergedPRs7d,
    openIssues,
    unownedIssues,
    openPRs,
    stalledPRs,
    lastActivityLabel: formatAge(minAgeH),
    zeroActivity72h: minAgeH > ZERO_ACTIVITY_THRESHOLD_H,
    repos: repos.length,
  };
}

async function resolveChannelId(client, nameOrId) {
  // If it looks like an ID already (starts with C/G), use it directly
  if (/^[CG][A-Z0-9]+$/.test(nameOrId)) return nameOrId;
  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await client.conversations.list({ limit: 200, cursor, types: 'public_channel' });
    const found = (res.channels || []).find(c => c.name === nameOrId);
    if (found) return found.id;
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return null;
}

async function runMentorRollup(client) {
  if (!config.mentorChannel) {
    console.warn('[repo-tpm] MENTOR_CHANNEL not set, skipping weekly rollup.');
    return;
  }

  let teams;
  try {
    teams = await getActiveTeams();
  } catch (err) {
    console.error('[repo-tpm] Mentor rollup: failed to fetch teams:', err.message);
    return;
  }

  const now = Date.now();
  const dayOfYear = Math.floor((now - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const rows = [];

  for (const team of teams) {
    try {
      rows.push(await buildTeamRow(team, now, dayOfYear));
    } catch (err) {
      console.error(`[repo-tpm] Mentor rollup: error for team ${team.name}:`, err.message);
    }
  }

  if (rows.length === 0) return;

  const flagged = rows.filter(r => r.zeroActivity72h).length;
  const header = `*Weekly Repo Health — all active teams* (${rows.length} teams${flagged > 0 ? `, ${flagged} 🚩 inactive 72h+` : ''})`;

  const tableLines = rows.map(r => {
    const flag = r.zeroActivity72h ? '🚩 ' : '';
    return `${flag}*${r.teamName}* · ${r.mergedPRs7d} merged (7d) · ${r.openIssues} issues (${r.unownedIssues} unowned) · ${r.openPRs} PRs (${r.stalledPRs} stalled) · last activity: ${r.lastActivityLabel}`;
  });

  const text = `${header}\n\n${tableLines.join('\n')}`;

  if (config.dryRun) {
    console.log('[repo-tpm DRY RUN] Mentor rollup:\n', text);
    return;
  }

  const channelId = await resolveChannelId(client, config.mentorChannel);
  if (!channelId) {
    console.error(`[repo-tpm] Mentor rollup: channel not found: ${config.mentorChannel}`);
    return;
  }

  try { await client.conversations.join({ channel: channelId }); } catch (_) {}

  await client.chat.postMessage({
    channel: channelId,
    text,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
  });
}

module.exports = { runMentorRollup };
