'use strict';

function repoScoreboardText(repo, classified) {
  const { unownedIssues, stalledPRs, mergedPRs, openIssues, openPRs } = classified;
  const openIssueCount = openIssues?.length ?? 0;
  const openPRCount = openPRs?.length ?? 0;
  return `📊 *${repo}* — ${openIssueCount} open issue${openIssueCount !== 1 ? 's' : ''} (${unownedIssues.length} 🔴 unowned) · ${openPRCount} open PR${openPRCount !== 1 ? 's' : ''} (${stalledPRs.length} ⚠️ stalled) · ${mergedPRs.length} merged since yesterday${mergedPRs.length > 0 ? ' 🎉' : ''}`;
}

function buildParentBlocks(repoSummaries) {
  const lines = repoSummaries.flatMap(s => {
    const parts = [s.text];
    if (s.narrative) parts.push(`_${s.narrative}_`);
    return parts;
  });
  return [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }];
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
  return { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } };
}

function mention(login, slackIdMap) {
  const id = slackIdMap?.[login];
  return id ? `<@${id}>` : `\`${login}\``;
}

function buildThreadReplies(repo, classified, slackIdMap, { claimed = {}, suppressed = new Set() } = {}) {
  const { unownedIssues, stalledPRs, mergedPRs, closedIssues, touchedItems } = classified;
  const replies = [];

  // Wins
  if (mergedPRs.length > 0 || closedIssues.length > 0) {
    const lines = ['🎉 *Wins since yesterday*'];
    mergedPRs.forEach(pr => lines.push(`• <${pr.url}|#${pr.number} ${pr.title}> merged by ${mention(pr.author, slackIdMap)}`));
    closedIssues.forEach(i => lines.push(`• <${i.url}|#${i.number} ${i.title}> closed`));
    replies.push(lines.join('\n'));
  }

  // Unowned issues — with claim/ack filtering
  const unownedLines = unownedIssues
    .filter(i => !suppressed.has(String(i.number)))
    .map(i => {
      const claimer = claimed[String(i.number)];
      if (claimer) return `• <${i.url}|#${i.number} ${i.title}> — ✋ claimed by <@${claimer}>`;
      return `• <${i.url}|#${i.number} ${i.title}> — ${i.nudge}`;
    });
  if (unownedLines.length > 0) {
    replies.push(['🔴 *Unowned issues — up for grabs*', ...unownedLines].join('\n'));
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

  // Touched yesterday
  if (touchedItems.length > 0) {
    const lines = ['👀 *Activity in the last 25h*'];
    touchedItems.slice(0, 10).forEach(i => {
      const icon = i.isPR ? '⤴️' : '•';
      lines.push(`${icon} <${i.url}|#${i.number} ${i.title}> — ${mention(i.actor, slackIdMap)}`);
    });
    replies.push(lines.join('\n'));
  }

  // Zero activity
  if (mergedPRs.length === 0 && closedIssues.length === 0 && touchedItems.length === 0) {
    replies.push('No commits or updates in 24h — blocked on anything? Ask in this channel or grab a mentor.');
  }

  return replies.map(text => ({ type: 'section', text: { type: 'mrkdwn', text } }));
}

module.exports = { repoScoreboardText, buildParentBlocks, buildLLMBlock, buildThreadReplies, mention };
