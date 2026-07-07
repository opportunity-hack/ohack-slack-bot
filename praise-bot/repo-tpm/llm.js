'use strict';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4.1-mini';
const TIMEOUT_MS = 10_000;

function buildPrompt(repoName, classified) {
  const facts = {
    repo: repoName,
    openIssues: classified.openIssues?.length ?? 0,
    unownedIssues: classified.unownedIssues.length,
    openPRs: classified.openPRs?.length ?? 0,
    stalledPRs: classified.stalledPRs.map(pr => ({ title: pr.title, ageTier: pr.tier })),
    mergedYesterday: classified.mergedPRs.map(pr => pr.title),
    recentActivity: classified.touchedItems.map(i => ({ title: i.title, isPR: i.isPR })),
  };

  return `You are a hackathon TPM assistant. Given this compact repo status JSON, return a JSON object with exactly these keys:
- "narrative": string, 1-2 sentences summarizing team momentum (positive/constructive tone, ≤200 chars)
- "risks": array of strings, up to 3 specific risks (e.g. two PRs touching same area, vague issue title, PR unrelated to issue). Empty array if none.
- "kudos": array of strings, up to 2 specific callouts of good work. Empty array if none.

Repo status:
${JSON.stringify(facts, null, 2)}

Respond ONLY with valid JSON. No markdown fences, no extra fields.`;
}

async function getLLMInsights(repoName, classified, apiKey) {
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
        messages: [{ role: 'user', content: buildPrompt(repoName, classified) }],
        response_format: { type: 'json_object' },
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[repo-tpm] LLM HTTP ${res.status} for ${repoName}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (typeof parsed.narrative !== 'string') return null;

    return {
      narrative: String(parsed.narrative).slice(0, 300),
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3).map(String) : [],
      kudos: Array.isArray(parsed.kudos) ? parsed.kudos.slice(0, 2).map(String) : [],
    };
  } catch (err) {
    console.warn(`[repo-tpm] LLM failed for ${repoName}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getLLMInsights };
