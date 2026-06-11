import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { SlackAPIClient } from "deno-slack-sdk/types.ts";
import { isDebugMode } from "./internals/debug_mode.ts";

interface OpenAIChoice {
  message: { content: string };
}

interface OpenAIResponse {
  id: string;
  choices: OpenAIChoice[];
}

export const def = DefineFunction({
  callback_id: "translate",
  title: "Post the news article of given message as a reply in its thread",
  source_file: "functions/gen_news.ts",
  input_parameters: {
    properties: {
      channelId: { type: Schema.types.string },
      messageTs: { type: Schema.types.string },
      result: { type: Schema.types.string },
    },
    required: ["channelId", "messageTs"],
  },
  output_parameters: {
    properties: { ts: { type: Schema.types.string } },
    required: [],
  },
});

// Create a helper method to check translationResult
function checkTranslationResult(translationResult: OpenAIResponse): string {
  if (
    !translationResult ||
    !translationResult.id ||
    translationResult.choices.length === 0
  ) {
    const printableResponse = JSON.stringify(translationResult);
    const error =
      `Translating a message failed! Contact the app maintainers with the following information - (OpenAI API response: ${printableResponse})`;
    console.log(error);
    return error;
  }

  return getTranslatedText(translationResult);
}

// Create a helper method to get translatedText
function getTranslatedText(translationResult: OpenAIResponse): string {
  const translatedTextRaw = translationResult.choices[0].message;
  const translatedText = translatedTextRaw.content;
  return translatedText;
}

async function makeOpenAIRequest(
  url: string,
  body: string,
  authKey: string,
  targetText: string,
  debugMode: boolean,
) {
  const openAIResponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authKey}`,
    },
    body,
  });
  if (openAIResponse.status != 200) {
    if (openAIResponse.status == 401 || openAIResponse.status == 403) {
      const error =
        `OpenAI request failed! Please make sure the OPENAI_API_KEY is correct. - (status: ${openAIResponse.status}, target text: ${
          targetText.substring(0, 30)
        }...)`;
      console.log(error);
      return { error };
    }
    const responseBody = await openAIResponse.text();
    const error =
      `OpenAI request failed! Contact the app maintainers with the following information - (status: ${openAIResponse.status}, body: ${responseBody}, target text: ${
        targetText.substring(0, 30)
      }...)`;
    console.log(error);
    return { error };
  }
  const translationResult = await openAIResponse.json();
  if (debugMode) {
    console.log(`OpenAI result: ${JSON.stringify(translationResult)}`);
  }

  return checkTranslationResult(translationResult);
}

export default SlackFunction(def, async ({ inputs, client, env }) => {
  const debugMode = isDebugMode(env);
  if (debugMode) {
    console.log(`translate inputs: ${JSON.stringify(inputs)}`);
  }
  const emptyOutputs = { outputs: {} };

  // Log
  console.log(`inputs: ${JSON.stringify(inputs)} looking for newspaper`);
  if (inputs.result !== "newspaper") {
    console.log("Skipped as no newspaper detected");
    return emptyOutputs; // this is not an error
  }

  // getPermalink
  const permalinkResponse = await client.chat.getPermalink({
    channel: inputs.channelId,
    message_ts: inputs.messageTs,
  });
  if (debugMode) {
    console.log(
      `Find the permalink: ${JSON.stringify(permalinkResponse)}`,
    );
  }
  if (permalinkResponse.error) {
    const error =
      `Failed to fetch the permalink due to ${permalinkResponse.error}. Perhaps, you need to invite this app's bot user to the channel.`;
    console.log(error);
    return { error };
  }
  const permalink = permalinkResponse.permalink;
  if (!permalink) {
    const error =
      `Failed to fetch the permalink. Perhaps, you need to invite this app's bot user to the channel.`;
    console.log(error);
    return { error };
  }
  console.log(`permalink: ${permalink}`);

  // Fetch the target message to translate
  const translationTargetResponse = await client.conversations.replies({
    channel: inputs.channelId,
    ts: inputs.messageTs,
    limit: 1,
    inclusive: true,
  });
  if (debugMode) {
    console.log(
      `Find the target: ${JSON.stringify(translationTargetResponse)}`,
    );
  }

  if (translationTargetResponse.error) {
    // If you see this log message, perhaps you need to invite this app to the channel
    const error =
      `Failed to fetch the message due to ${translationTargetResponse.error}. Perhaps, you need to invite this app's bot user to the channel.`;
    console.log(error);
    return { error };
  }

  if (translationTargetResponse.messages.length == 0) {
    console.log("No message found");
    return emptyOutputs; // this is not an error
  }
  const translationTarget = translationTargetResponse.messages[0];
  const translationTargetThreadTs = translationTarget.thread_ts;

  const authKey = env.OPENAI_API_KEY;
  if (!authKey) {
    const error =
      "OPENAI_API_KEY needs to be set. You can place .env file for local dev. For production apps, please run `slack env add OPENAI_API_KEY (your key here)` to set the value.";
    return { error };
  }

  const url = `https://api.openai.com/v1/chat/completions`;

  const targetText = translationTarget.text;

  // Single API call using JSON structured output — cheaper and faster than 3 separate calls
  const bodyForAll = JSON.stringify({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You are a blog writer and editor for Opportunity Hack, a nonprofit hackathon organization. Your writing style is occasionally inspired by nerdy engineering terms, computer science puns, Taylor Swift, Green Day, and 1990s R&B music.

Given a Slack message, respond with a JSON object containing exactly these four fields:
- "title": A single blog article title, fewer than 10 words, no surrounding quotes or backslashes.
- "summary": A summary of the message in four sentences or less, no surrounding quotes or backslashes.
- "links": All URLs found in the text formatted as Slack markdown <url|name>. Use "link" as the name when none is provided only if you can't figure out a good name. Return an empty string if no URLs are found.
- "content_markdown": A full blog article in markdown format. Use headings (##), bullet points, and bold text where appropriate. Should be at least three paragraphs and expand meaningfully on the summary.`,
      },
      {
        role: "user",
        content: translationTarget.text,
      },
    ],
  });

  const rawResponse = await makeOpenAIRequest(
    url,
    bodyForAll,
    authKey,
    targetText,
    debugMode,
  );
  if (typeof rawResponse === "object" && "error" in rawResponse) {
    return rawResponse;
  }

  let parsed: { title: string; summary: string; links: string; content_markdown: string };
  try {
    parsed = JSON.parse(rawResponse as string);
  } catch (_e) {
    const error = `Failed to parse OpenAI JSON response: ${rawResponse}`;
    console.log(error);
    return { error };
  }

  const titleResponse = parsed.title ?? "";
  const summaryReponse = parsed.summary ?? "";
  const linksResponse = parsed.links ?? "";
  const contentMarkdown = parsed.content_markdown ?? "";

  const summarizedText =
    `Title: ${titleResponse}\nSummary: ${summaryReponse}\nLinks: ${linksResponse}`;

  const replies = await client.conversations.replies({
    channel: inputs.channelId,
    ts: translationTargetThreadTs ?? inputs.messageTs,
  });
  if (isAlreadyPosted(replies.messages, summarizedText)) {
    // Skip posting the same one
    console.log(
      `Skipped this translation as it's already posted: ${
        JSON.stringify(
          summarizedText,
        )
      }`,
    );
    return emptyOutputs; // this is not an error
  }

  const result = await sayInThread(
    client,
    inputs.channelId,
    translationTargetThreadTs ?? inputs.messageTs,
    summarizedText,
  );

  // Fetch author info from Slack
  let authorName = "Opportunity Hack";
  let authorEmail = "";
  if (translationTarget.user) {
    const userInfoResponse = await client.users.info({ user: translationTarget.user });
    if (userInfoResponse.user) {
      authorName = userInfoResponse.user.real_name ||
        userInfoResponse.user.profile?.display_name ||
        userInfoResponse.user.name ||
        authorName;
      authorEmail = userInfoResponse.user.profile?.email ?? "";
    }
  }

  // Call backend api to post the news article
  const backendUrl = env.BACKEND_NEWS_URL;
  const token = env.BACKEND_NEWS_TOKEN;

  console.log(`Saving at backendUrl: ${backendUrl}`);

  if (!backendUrl) {
    const error =
      "BACKEND_URL needs to be set. You can place .env file for local dev. For production apps, please run `slack env add BACKEND_URL (your key here)` to set the value.";
    return { error };
  }
  const backendPayload = {
    title: titleResponse,
    description: summaryReponse,
    links: linksResponse,
    slack_ts: inputs.messageTs,
    slack_permalink: permalink,
    slack_channel: inputs.channelId,
    content_format: "markdown",
    content_markdown: contentMarkdown,
    slug: generateSlug(titleResponse),
    status: "published",
    author: {
      name: authorName,
      email: authorEmail,
    },
  };
  console.log(`backend payload: ${JSON.stringify(backendPayload)}`);
  const backendResponse = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": token,
    },
    body: JSON.stringify(backendPayload),
  });
  if (backendResponse.status != 200) {
    const responseBody = await backendResponse.text();
    const error =
      `Posting the news article failed! Contact the app maintainers with the following information - (status: ${backendResponse.status}, body: ${responseBody}, target text: ${
        targetText.substring(0, 30)
      }...)`;
    console.log(error);
    return { error };
  }
  const backendResult = await backendResponse.json();
  if (debugMode) {
    console.log(`backend result: ${JSON.stringify(backendResult)}`);
  }

  if (backendResult.id) {
    const frontendUrl = env.FRONTEND_URL ?? "https://ohack.dev";
    const blogUrl = `${frontendUrl}/blog/${backendResult.id}`;
    await sayInThread(
      client,
      inputs.channelId,
      translationTargetThreadTs ?? inputs.messageTs,
      `Read the full article: ${blogUrl}`,
    );
  }

  return { outputs: { ts: result.ts } };
});

// ---------------------------
// Internal functions
// ---------------------------

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function isAlreadyPosted(
  // deno-lint-ignore no-explicit-any
  replies: Record<string, any>[],
  translatedText: string,
): boolean {
  if (!replies) {
    return false;
  }
  for (const messageInThread of replies) {
    if (messageInThread.text && messageInThread.text === translatedText) {
      return true;
    }
  }
  return false;
}

async function sayInThread(
  client: SlackAPIClient,
  channelId: string,
  threadTs: string,
  text: string,
) {
  return await client.chat.postMessage({
    channel: channelId,
    text,
    thread_ts: threadTs,
  });
}
