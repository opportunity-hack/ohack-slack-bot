'use strict';
const config = require('./config');
const { getTargets } = require('./targets');
const { getRepoData } = require('./github');
const { classifyRepoData } = require('./rules');
const { resolveChannelId } = require('../slack_channels');

const WINDOW_HOURS = 7 * 24; // 7-day lookback for weekly rollup
const ZERO_ACTIVITY_THRESHOLD_H = 72;

function ageHours(repoData, now) {
  const allItems = [...(repoData.openIssues || []), ...(repoData.openPRs || []), ...(repoData.recentAll || [])];
  const timestamps = allItems.map(i => new Date(i.updated_at).getTime());
  // pushed_at catches teams that commit directly without touching issues/PRs.
  if (repoData.pushedAt) timestamps.push(new Date(repoData.pushedAt).getTime());
  if (timestamps.length === 0) return Infinity;
  return (now - Math.max(...timestamps)) / (1000 * 60 * 60);
}

function formatAge(hours) {
  if (hours === Infinity) return 'unknown';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function buildTargetRow(target, now, dayOfYear) {
  const repos = target.repos || [];

  let mergedPRs7d = 0, openIssues = 0, unownedIssues = 0, openPRs = 0, stalledPRs = 0;
  let minAgeH = Infinity;
  let okRepos = 0;
  const since7d = new Date(now - WINDOW_HOURS * 60 * 60 * 1000);

  for (const { owner, repo } of repos) {
    try {
      const data = await getRepoData(owner, repo, WINDOW_HOURS);
      if (!data) {
        console.warn(`[repo-tpm] Mentor rollup: repo not found (404): ${owner}/${repo}`);
        continue;
      }
      okRepos++;
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

  // If every repo fetch failed (rate limit, bad token, 404), we know nothing —
  // don't report the team as inactive, that's a data problem, not a team problem.
  const noData = okRepos === 0;

  return {
    teamName: target.name,
    slackChannel: (target.channels || [])[0] || '',
    mergedPRs7d,
    openIssues,
    unownedIssues,
    openPRs,
    stalledPRs,
    minAgeH,
    noData,
    lastActivityLabel: noData ? 'no data' : formatAge(minAgeH),
    zeroActivity72h: !noData && minAgeH > ZERO_ACTIVITY_THRESHOLD_H,
    repos: repos.length,
  };
}

// Build a Slack label for a team. Slack mrkdwn does NOT support a custom label
// on channel mentions (`<#ID|label>` renders literally), so we show the friendly
// team name in bold plus a bare `<#ID>` mention, which Slack linkifies to the
// live channel name and makes tappable.
async function teamLabel(client, row) {
  if (row.slackChannel) {
    const id = await resolveChannelId(client, row.slackChannel).catch(() => null);
    if (id) return `*${row.teamName}* (<#${id}>)`;
  }
  return `*${row.teamName}*`;
}

// One-line reason a team is flagged, so mentors know where to jump in.
function concernLine(r) {
  if (r.noData) return '↳ ⚠️ Couldn\'t read GitHub data (rate limit, token, or repo link?) — not necessarily inactive';
  if (r.zeroActivity72h) return `↳ ⛔ No activity in 3+ days (last: ${r.lastActivityLabel}) — check in with the team`;
  const parts = [];
  if (r.unownedIssues > 0) parts.push(`${r.unownedIssues} unowned issue${r.unownedIssues !== 1 ? 's' : ''} need an owner`);
  if (r.stalledPRs > 0) parts.push(`${r.stalledPRs} stalled PR${r.stalledPRs !== 1 ? 's' : ''} need review`);
  if (r.mergedPRs7d === 0) parts.push('nothing merged this week');
  return parts.length ? `↳ ${parts.join(' · ')}` : null;
}

async function runMentorRollup(client, watcher, globalCfg) {
  const rollupChannel = watcher?.rollup?.channel;
  if (!rollupChannel) {
    console.warn('[repo-tpm] No rollup channel configured, skipping rollup.');
    return;
  }
  const dryRun = watcher?.dry_run ?? globalCfg?.dry_run ?? config.dryRun;

  let targets;
  try {
    targets = await getTargets(watcher);
  } catch (err) {
    console.error('[repo-tpm] Mentor rollup: failed to resolve targets:', err.message);
    return;
  }

  const now = Date.now();
  const dayOfYear = Math.floor((now - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const rows = [];

  for (const target of targets) {
    try {
      rows.push(await buildTargetRow(target, now, dayOfYear));
    } catch (err) {
      console.error(`[repo-tpm] Mentor rollup: error for target ${target.name}:`, err.message);
    }
  }

  if (rows.length === 0) return;

  // Surface teams that need a mentor's attention first: inactive teams, then
  // stalest activity, so the top of the message is the priority list.
  rows.sort((a, b) => {
    if (a.zeroActivity72h !== b.zeroActivity72h) return a.zeroActivity72h ? -1 : 1;
    return b.minAgeH - a.minAgeH;
  });

  const flagged = rows.filter(r => r.zeroActivity72h).length;
  const header = `*Weekly Repo Health — all active teams* (${rows.length} teams${flagged > 0 ? `, ${flagged} 🚩 inactive 72h+` : ''})`;

  const tableLines = [];
  for (const r of rows) {
    const flag = r.noData ? '⚠️ ' : r.zeroActivity72h ? '🚩 ' : '';
    const label = await teamLabel(client, r);
    const stats = r.noData
      ? 'GitHub data unavailable'
      : `${r.mergedPRs7d} merged (7d) · ${r.openIssues} issues (${r.unownedIssues} unowned) · ${r.openPRs} PRs (${r.stalledPRs} stalled) · last activity: ${r.lastActivityLabel}`;
    tableLines.push(`${flag}${label} · ${stats}`);
    const concern = concernLine(r);
    if (concern) tableLines.push(`    ${concern}`);
  }

  const footer = '\n_Tap a channel link to jump into a team._';
  const text = `${header}\n\n${tableLines.join('\n')}${footer}`;

  if (dryRun) {
    console.log('[repo-tpm DRY RUN] Mentor rollup:\n', text);
    return;
  }

  const channelId = await resolveChannelId(client, rollupChannel);
  if (!channelId) {
    console.error(`[repo-tpm] Mentor rollup: channel not found: ${rollupChannel}`);
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
