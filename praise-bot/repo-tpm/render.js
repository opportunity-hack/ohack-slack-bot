'use strict';

const MAX_UNOWNED_LINES = 8;
const MAX_TLDR_LINES = 5;
const MAX_DIRECT_COMMIT_LINES = 10;

const DIVIDER = { type: 'divider' };
const section = text => ({ type: 'section', text: { type: 'mrkdwn', text } });
const plural = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`;

// Copy adapts to the lookback: "since yesterday" for the daily digest,
// "in the last hour" for hourly hackathon runs.
function sinceLabel(hours = 25) {
  if (hours <= 1) return 'in the last hour';
  if (hours >= 24 && hours <= 26) return 'since yesterday';
  if (hours % 24 === 0) return `in the last ${hours / 24} days`;
  return `in the last ${hours}h`;
}

const quietLine = hours =>
  `😴 Quiet ${sinceLabel(hours)} — no commits, merges or issue updates. Blocked on anything? Ask here or grab a mentor.`;

function repoScoreboardText(repo, classified, { windowHours = 25 } = {}) {
  const { unownedIssues, stalledPRs, mergedPRs, directCommits = [], openIssues, openPRs } = classified;
  const openIssueCount = openIssues?.length ?? 0;
  const openPRCount = openPRs?.length ?? 0;
  const p0Count = unownedIssues.filter(i => i.priority === 0).length;
  const p0Note = p0Count > 0 ? `, ${p0Count} 🚨 P0` : '';
  const directNote = directCommits.length > 0 ? ` · ${plural(directCommits.length, 'direct commit')}` : '';
  const shipped = mergedPRs.length + directCommits.length;
  return `📊 *${repo}* — ${plural(openIssueCount, 'open issue')} (${unownedIssues.length} 🔴 unowned${p0Note}) · ${plural(openPRCount, 'open PR')} (${stalledPRs.length} ⚠️ stalled) · ${mergedPRs.length} merged${directNote} ${sinceLabel(windowHours)}${shipped > 0 ? ' 🎉' : ''}`;
}

function mention(login, slackIdMap) {
  const id = slackIdMap?.[login];
  return id ? `<@${id}>` : `\`${login}\``;
}

function commitLine(c, slackIdMap) {
  const branch = c.onDefault ? '' : ` → \`${c.branch}\``;
  return `• <${c.url}|${c.shortSha} ${c.subject}> — ${mention(c.author, slackIdMap)}${branch}`;
}

// What shipped, for the channel-level message: merged PRs first, then direct
// commits. Capped so the parent stays scannable — the thread has the rest.
function tldrLines(classified, slackIdMap) {
  const { mergedPRs = [], directCommits = [] } = classified;
  const all = [
    ...mergedPRs.map(pr => `• <${pr.url}|#${pr.number} ${pr.title}> — ${mention(pr.author, slackIdMap)}`),
    ...directCommits.map(c => commitLine(c, slackIdMap)),
  ];
  const shown = all.slice(0, MAX_TLDR_LINES);
  const overflow = all.length - shown.length;
  if (overflow > 0) shown.push(`_…plus ${overflow} more in the thread_`);
  return shown;
}

// One section per repo (scoreboard + TL;DR bullets), dividers between repos.
// The narrative lives in the thread; keeping it out of here keeps the parent short.
function buildParentBlocks(repoSummaries, slackIdMap = {}) {
  return repoSummaries.flatMap((s, i) => {
    const block = section([s.text, ...tldrLines(s.classified || {}, slackIdMap)].join('\n'));
    return i > 0 ? [DIVIDER, block] : [block];
  });
}

function buildLLMBlock(insights) {
  const lines = [];
  if (insights.risks?.length > 0) {
    lines.push('🔍 *Potential risks*');
    insights.risks.forEach(r => lines.push(`• ${r}`));
  }
  if (insights.kudos?.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('🌟 *Kudos*');
    insights.kudos.forEach(k => lines.push(`• ${k}`));
  }
  if (lines.length === 0) return null;
  return section(lines.join('\n'));
}

function isQuiet(classified) {
  const {
    mergedPRs = [], directCommits = [], unownedIssues = [], stalledPRs = [],
    touchedItems = [], closedIssues = [], portfolioNudges = [],
  } = classified;
  return [mergedPRs, directCommits, unownedIssues, stalledPRs, touchedItems, closedIssues, portfolioNudges]
    .every(list => list.length === 0);
}

function buildThreadReplies(repo, classified, slackIdMap, { claimed = {}, suppressed = new Set(), windowHours = 25 } = {}) {
  const {
    unownedIssues, stalledPRs, mergedPRs, closedIssues, touchedItems,
    portfolioNudges = [], directCommits = [],
  } = classified;
  const replies = [];

  // Wins
  if (mergedPRs.length > 0 || closedIssues.length > 0) {
    const lines = [`🎉 *Wins ${sinceLabel(windowHours)}*`];
    mergedPRs.forEach(pr => {
      lines.push(`• <${pr.url}|#${pr.number} ${pr.title}> merged by ${mention(pr.author, slackIdMap)}${pr.greatWriteup ? ' — 📝 great write-up!' : ''}`);
      if (pr.summary) lines.push(`    ↳ _${pr.summary}_`);
    });
    closedIssues.forEach(i => lines.push(`• <${i.url}|#${i.number} ${i.title}> closed`));
    replies.push(lines.join('\n'));
  }

  // Direct pushes — commits that landed without a PR
  if (directCommits.length > 0) {
    const shown = directCommits.slice(0, MAX_DIRECT_COMMIT_LINES);
    const lines = ['⬆️ *Direct pushes* — commits that landed without a PR', ...shown.map(c => commitLine(c, slackIdMap))];
    const overflow = directCommits.length - shown.length;
    if (overflow > 0) lines.push(`_…plus ${overflow} more on GitHub_`);
    replies.push(lines.join('\n'));
  }

  // Unowned issues — priority-sorted upstream, with claim/ack filtering.
  // Capped so P0s aren't buried under a long unlabeled tail.
  const visibleUnowned = unownedIssues.filter(i => !suppressed.has(String(i.number)));
  const shownUnowned = visibleUnowned.slice(0, MAX_UNOWNED_LINES);
  const unownedLines = shownUnowned.map(i => {
    const claimer = claimed[String(i.number)];
    if (claimer) return `• <${i.url}|#${i.number} ${i.title}> — ✋ claimed by <@${claimer}>`;
    return `• <${i.url}|#${i.number} ${i.title}>${i.nudge ? ` — ${i.nudge}` : ''}`;
  });
  if (unownedLines.length > 0) {
    const header = visibleUnowned.some(i => i.priority === 0)
      ? '🚨 *Unowned issues — P0 needs an owner first*'
      : '🔴 *Unowned issues — up for grabs*';
    const lines = [header, ...unownedLines];
    const overflow = visibleUnowned.length - shownUnowned.length;
    if (overflow > 0) lines.push(`_…plus ${overflow} more unowned on GitHub_`);
    replies.push(lines.join('\n'));
  }

  // Stalled PRs — with ack filtering
  const stalledToShow = stalledPRs.filter(pr => !suppressed.has(String(pr.number)));
  if (stalledToShow.length > 0) {
    const lines = ['⚠️ *Stalled PRs*'];
    stalledToShow.forEach(pr => {
      const pointPerson = pr.assignees.length > 0
        ? pr.assignees.map(a => mention(a, slackIdMap)).join(', ')
        : mention(pr.author, slackIdMap);
      lines.push(`• <${pr.url}|#${pr.number} ${pr.title}> (${pointPerson}) — ${pr.nudge}`);
    });
    replies.push(lines.join('\n'));
  }

  // Portfolio coaching — a ✅ on any line for the same PR number (e.g. its
  // stalled-PR line) also suppresses these; that cross-section sharing is intended.
  const portfolioToShow = portfolioNudges
    .filter(p => !suppressed.has(String(p.number)))
    .slice(0, 4);
  if (portfolioToShow.length > 0) {
    const lines = ['💼 *Portfolio corner* — these PRs are public proof of your work'];
    portfolioToShow.forEach(p => {
      lines.push(`• <${p.url}|#${p.number} ${p.title}> (${mention(p.author, slackIdMap)}) — ${p.nudge}`);
    });
    replies.push(lines.join('\n'));
  }

  // Touched yesterday
  if (touchedItems.length > 0) {
    const lines = [`👀 *Activity ${sinceLabel(windowHours)}*`];
    touchedItems.slice(0, 10).forEach(i => {
      const icon = i.isPR ? '⤴️' : '•';
      lines.push(`${icon} <${i.url}|#${i.number} ${i.title}> — ${mention(i.actor, slackIdMap)}`);
    });
    replies.push(lines.join('\n'));
  }

  // Zero activity
  if (mergedPRs.length === 0 && closedIssues.length === 0 && touchedItems.length === 0 && directCommits.length === 0) {
    replies.push(quietLine(windowHours));
  }

  return replies.map(section);
}

// One thread reply per repo. The header block is what lets a reader tell
// repos apart when several share one thread.
function buildThreadBlocks(owner, repo, classified, slackIdMap, llm, opts = {}) {
  const full = `${owner}/${repo}`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: full, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `<https://github.com/${full}|github.com/${full}>` }] },
  ];
  if (isQuiet(classified)) {
    blocks.push(section(quietLine(opts.windowHours)));
    return blocks;
  }
  if (llm?.narrative) blocks.push(section(`_${llm.narrative}_`));
  blocks.push(...buildThreadReplies(full, classified, slackIdMap, opts));
  const llmBlock = llm ? buildLLMBlock(llm) : null;
  if (llmBlock) blocks.push(DIVIDER, llmBlock);
  return blocks;
}

module.exports = {
  repoScoreboardText, buildParentBlocks, buildLLMBlock, buildThreadReplies, buildThreadBlocks,
  isQuiet, sinceLabel, mention,
};
