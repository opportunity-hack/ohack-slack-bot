'use strict';

// Shared OpenAI model selection. Override with OPENAI_MODEL / OPENAI_REASONING_EFFORT
// (e.g. `fly secrets set OPENAI_MODEL=gpt-4.1-mini`) without a code change.
const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_REASONING_EFFORT = 'low';
// Reasoning tokens count against max_completion_tokens; leave room so the
// visible JSON answer isn't truncated to an empty string.
const REASONING_HEADROOM = 2000;

function isReasoningModel(model) {
  return /^(gpt-5|o\d)/.test(model);
}

// Returns the model-specific chat/completions params. Reasoning models reject
// `max_tokens` and `temperature`, so those are swapped/omitted.
function modelParams({ maxTokens, temperature }, env = process.env) {
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  if (!isReasoningModel(model)) {
    return { model, max_tokens: maxTokens, temperature };
  }
  return {
    model,
    max_completion_tokens: maxTokens + REASONING_HEADROOM,
    reasoning_effort: env.OPENAI_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
  };
}

module.exports = { modelParams, isReasoningModel, DEFAULT_MODEL };
