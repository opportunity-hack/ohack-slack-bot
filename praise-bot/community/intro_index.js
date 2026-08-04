'use strict';

// In-memory index of #introductions posts: { userId, text, ts }.
// Rebuilt lazily (with a TTL) by paging conversations.history — no database,
// per the praise-bot guardrail. Thousands of intros fit comfortably in memory.
// Note: on Slack's free plan, history older than 90 days is not returned.

const REFRESH_MS = 6 * 60 * 60 * 1000; // re-page history at most every 6h
const MAX_PAGES = 20; // up to 20×200 = 4000 messages

const _index = { channelId: null, intros: [], fetchedAt: 0 };

function isIntroMessage(msg) {
  return (
    (!msg.subtype || msg.subtype === 'thread_broadcast') &&
    msg.user &&
    !msg.bot_id &&
    !msg.thread_ts && // top-level posts only; thread replies aren't intros
    (msg.text || '').trim().length >= 40 // skip "hi!" one-liners
  );
}

async function getIntroIndex(client, channelId, opts = {}) {
  const now = opts.now || Date.now();
  if (
    _index.channelId === channelId &&
    now - _index.fetchedAt < REFRESH_MS &&
    !opts.force
  ) {
    return _index.intros;
  }

  // conversations.history requires membership — join first (public channels)
  try { await client.conversations.join({ channel: channelId }); } catch (_) {}

  const intros = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.conversations.history({
      channel: channelId,
      limit: 200,
      cursor,
    });
    for (const msg of res.messages || []) {
      if (isIntroMessage(msg)) {
        intros.push({ userId: msg.user, text: msg.text.trim(), ts: msg.ts });
      }
    }
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  _index.channelId = channelId;
  _index.intros = intros;
  _index.fetchedAt = now;
  console.log(`[community] Indexed ${intros.length} intros from channel ${channelId}`);
  return intros;
}

// Add a just-posted intro so the digest sees it without a full re-page.
function addIntro(channelId, intro) {
  if (_index.channelId === channelId) _index.intros.unshift(intro);
}

// Cheap keyword-overlap prefilter so the LLM only sees plausible matches.
const STOPWORDS = new Set(('a,an,and,are,as,at,be,been,but,by,for,from,has,have,hey,hi,hello,i,im,in,is,it,my,name,of,on,or,so,that,the,this,to,was,we,with,you,your,everyone,excited,here,join,joined,new,work,working,like,love,about,me,am,its,just,really').split(','));

function keywords(text) {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z+#.-]{2,}/g) || []).filter(w => !STOPWORDS.has(w))
  );
}

function topCandidates(newIntro, intros, limit = 12) {
  const newKeywords = keywords(newIntro.text);
  return intros
    .filter(i => i.userId !== newIntro.userId)
    .map(i => {
      const kw = keywords(i.text);
      let overlap = 0;
      for (const w of newKeywords) if (kw.has(w)) overlap++;
      return { ...i, overlap };
    })
    .filter(i => i.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit);
}

function _resetForTests() {
  _index.channelId = null;
  _index.intros = [];
  _index.fetchedAt = 0;
}

module.exports = { getIntroIndex, addIntro, topCandidates, isIntroMessage, keywords, _resetForTests };
