'use strict';

// LLM helpers for community features. Same fail-open pattern as
// repo-tpm/llm.js: no API key or any error → null, callers degrade gracefully.
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4.1-mini';
const TIMEOUT_MS = 15_000;

async function chatJson(prompt, apiKey, maxTokens = 500) {
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
        temperature: 0.5,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[community] LLM HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return content ? JSON.parse(content) : null;
  } catch (err) {
    console.warn('[community] LLM failed:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Slack only renders `<@U…>` as a mention; models often emit a bare `@U0BKEV6…`
// user id, which shows up literally in the channel. Normalize any id reference
// to proper mention syntax (idempotent on already-correct `<@U…>`).
function fixSlackMentions(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<?@(U[A-Z0-9]{7,})>?/g, '<@$1>');
}

// Given a new intro + candidate old intros, pick who they should meet.
async function getMatches(newIntro, candidates, maxMatches, apiKey) {
  const prompt = `You help connect members of the Opportunity Hack volunteer Slack community.
A new member just introduced themselves. From the candidate list of earlier introductions, pick up to ${maxMatches} people they should meet, based on shared skills, interests, causes, or location. Only pick genuinely good matches — fewer (or zero) is fine.

New introduction:
${JSON.stringify(newIntro.text.slice(0, 1500))}

Candidates (id = Slack user id):
${JSON.stringify(candidates.map(c => ({ id: c.userId, intro: c.text.slice(0, 500) })), null, 2)}

Return JSON with exactly these keys:
- "matches": array of {"id": "<Slack user id from candidates>", "reason": "<one short sentence, ≤120 chars, about what they share>"}
- "welcome": string, one warm, specific welcome sentence referencing something from their intro (≤200 chars, no emojis needed). To mention the new member, write exactly <@${newIntro.userId}> with angle brackets — never a bare @id.

Respond ONLY with valid JSON.`;

  const parsed = await chatJson(prompt, apiKey, 400);
  if (!parsed) return null;

  const validIds = new Set(candidates.map(c => c.userId));
  const matches = Array.isArray(parsed.matches)
    ? parsed.matches
        .filter(m => m && validIds.has(m.id) && m.id !== newIntro.userId)
        .slice(0, maxMatches)
        .map(m => ({ id: m.id, reason: fixSlackMentions(String(m.reason || '').slice(0, 160)) }))
    : [];

  return {
    matches,
    welcome: typeof parsed.welcome === 'string' ? fixSlackMentions(parsed.welcome.slice(0, 300)) : null,
  };
}

// Summarize a week of intros for the community digest.
async function getDigestSummary(intros, apiKey) {
  const prompt = `You write a short, warm weekly community digest for the Opportunity Hack volunteer Slack.
Here are this week's new-member introductions (id = Slack user id):
${JSON.stringify(intros.map(i => ({ id: i.userId, intro: i.text.slice(0, 400) })), null, 2)}

Return JSON with exactly these keys:
- "members": array of {"id": "<Slack user id>", "line": "<one friendly line ≤120 chars summarizing them — no name needed, we @mention them. If you must reference them, write exactly <@THEIR_ID> with angle brackets, never a bare @id>"}
- "themes": string, one sentence on common themes across this week's joiners (≤200 chars), or null

Respond ONLY with valid JSON.`;

  const parsed = await chatJson(prompt, apiKey, 700);
  if (!parsed || !Array.isArray(parsed.members)) return null;

  const validIds = new Set(intros.map(i => i.userId));
  return {
    members: parsed.members
      .filter(m => m && validIds.has(m.id))
      .map(m => ({ id: m.id, line: fixSlackMentions(String(m.line || '').slice(0, 200)) })),
    themes: typeof parsed.themes === 'string' ? fixSlackMentions(parsed.themes.slice(0, 300)) : null,
  };
}

module.exports = { getMatches, getDigestSummary, chatJson, fixSlackMentions };
