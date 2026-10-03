'use strict';

// Reactions on digest thread lines feed back into the next run:
//   ✋ raised_hand   → someone claimed the issue(s) on that message
//   ✅ / 👀          → acknowledged; stop nudging those items for ACK_WINDOW
// Every digest parent posted within the window is scanned — hourly hackathon
// digests would otherwise forget a claim after a single run. Slack returns each
// message's reactions inline with history/replies, so no per-message
// reactions.get calls are needed.

const ACK_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_PARENTS = 30; // bounds conversations.replies calls when digests run hourly
const HISTORY_PAGES = 3;

let _botUserId = null;

async function getBotUserId(client) {
  if (_botUserId) return _botUserId;
  const res = await client.auth.test();
  _botUserId = res.user_id;
  return _botUserId;
}

// Everything a reader sees: fallback text plus every Block Kit text element.
// Digest replies carry their content in blocks, so `text` alone never has #N.
function visibleText(msg) {
  const parts = [msg.text || ''];
  for (const block of msg.blocks || []) {
    if (block.text?.text) parts.push(block.text.text);
    for (const el of block.elements || []) {
      const t = typeof el.text === 'string' ? el.text : el.text?.text;
      if (t) parts.push(t);
    }
  }
  return parts.join('\n');
}

function isDigestParent(m, botUserId) {
  return m.user === botUserId && typeof m.text === 'string' && m.text.startsWith('📊');
}

async function findDigestParents(client, channelId, botUserId, sinceMs) {
  const parents = [];
  let cursor;
  for (let page = 0; page < HISTORY_PAGES && parents.length < MAX_PARENTS; page++) {
    const res = await client.conversations.history({
      channel: channelId, limit: 100, cursor, oldest: String(sinceMs / 1000),
    });
    for (const m of res.messages || []) {
      if (parseFloat(m.ts) * 1000 < sinceMs) continue;
      if (isDigestParent(m, botUserId)) parents.push(m.ts);
      if (parents.length >= MAX_PARENTS) break;
    }
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return parents; // newest first
}

// Returns { claimed: { "issueNum": slackUserId }, suppressed: Set<"issueNum"> }
async function getClaimedAndAcked(client, channelId, botUserId) {
  const claimed = {};
  const suppressed = new Set();
  const sinceMs = Date.now() - ACK_WINDOW_MS;
  const parents = await findDigestParents(client, channelId, botUserId, sinceMs);

  for (const parentTs of parents) {
    let replies;
    try {
      replies = (await client.conversations.replies({ channel: channelId, ts: parentTs })).messages || [];
    } catch (_) {
      continue;
    }

    for (const msg of replies) {
      // The parent lists what shipped (#N of merged PRs); reactions there aren't claims.
      if (msg.user !== botUserId || msg.ts === parentTs) continue;
      const nums = [...visibleText(msg).matchAll(/#(\d+)/g)].map(m => m[1]);
      if (nums.length === 0) continue;

      for (const rx of msg.reactions || []) {
        if (rx.name === 'raised_hand') {
          const claimer = (rx.users || []).find(u => u !== botUserId);
          // Parents come newest first, so the first claimer seen is the latest.
          if (claimer) nums.forEach(n => { if (!(n in claimed)) claimed[n] = claimer; });
        }
        if (rx.name === 'white_check_mark' || rx.name === 'eyes') {
          nums.forEach(n => suppressed.add(n));
        }
      }
    }
  }

  return { claimed, suppressed };
}

module.exports = { getBotUserId, getClaimedAndAcked, visibleText };
