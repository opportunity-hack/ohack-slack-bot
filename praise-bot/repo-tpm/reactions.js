'use strict';

let _botUserId = null;

async function getBotUserId(client) {
  if (_botUserId) return _botUserId;
  const res = await client.auth.test();
  _botUserId = res.user_id;
  return _botUserId;
}

// Returns { claimed: { "issueNum": slackUserId }, suppressed: Set<"issueNum"> }
// claimed  = ✋ reaction on a nudge line → someone took ownership
// suppressed = ✅/👀 reaction → skip nudge for 3 days (encoded in message ts)
async function getClaimedAndAcked(client, channelId, botUserId) {
  const claimed = {};
  const suppressed = new Set();
  const threeAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  // Find bot's most recent parent (starts with 📊)
  let parentTs = null;
  let cursor;
  for (let page = 0; page < 3; page++) {
    const res = await client.conversations.history({ channel: channelId, limit: 100, cursor });
    const found = (res.messages || []).find(
      m => m.user === botUserId && m.text && m.text.startsWith('📊')
    );
    if (found) { parentTs = found.ts; break; }
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  if (!parentTs) return { claimed, suppressed };

  let replies;
  try {
    const thread = await client.conversations.replies({ channel: channelId, ts: parentTs });
    replies = thread.messages || [];
  } catch (_) {
    return { claimed, suppressed };
  }

  for (const msg of replies) {
    if (msg.user !== botUserId) continue;
    const issueMatches = [...(msg.text || '').matchAll(/#(\d+)/g)];
    if (issueMatches.length === 0) continue;

    // ts is seconds since epoch — check if within 3 days
    const msgAge = (Date.now() - parseFloat(msg.ts) * 1000);
    const withinWindow = msgAge < 3 * 24 * 60 * 60 * 1000;

    try {
      const rxRes = await client.reactions.get({ channel: channelId, timestamp: msg.ts });
      const reactions = rxRes.message?.reactions || [];
      for (const rx of reactions) {
        if (rx.name === 'raised_hand') {
          const claimer = (rx.users || []).find(u => u !== botUserId);
          if (claimer) issueMatches.forEach(m => { claimed[m[1]] = claimer; });
        }
        if (withinWindow && (rx.name === 'white_check_mark' || rx.name === 'eyes')) {
          issueMatches.forEach(m => suppressed.add(m[1]));
        }
      }
    } catch (_) {}
  }

  return { claimed, suppressed };
}

module.exports = { getBotUserId, getClaimedAndAcked };
