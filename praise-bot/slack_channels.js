'use strict';

// Shared Slack channel resolution for all praise-bot modules.
// Accepts a channel ID (C…/G…) directly or resolves a public-channel name,
// paginating conversations.list up to 5×200 channels with an in-memory cache.
const _channelCache = new Map(); // name → id

async function resolveChannelId(client, nameOrId) {
  if (!nameOrId) return null;
  if (/^[CG][A-Z0-9]+$/.test(nameOrId)) return nameOrId;
  if (_channelCache.has(nameOrId)) return _channelCache.get(nameOrId);

  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await client.conversations.list({ limit: 200, cursor, types: 'public_channel' });
    const found = (res.channels || []).find(c => c.name === nameOrId);
    if (found) {
      _channelCache.set(nameOrId, found.id);
      return found.id;
    }
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return null;
}

module.exports = { resolveChannelId };
