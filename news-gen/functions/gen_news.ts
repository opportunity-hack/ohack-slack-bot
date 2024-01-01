import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { SlackAPIClient } from "deno-slack-sdk/types.ts";
import { isDebugMode } from "./internals/debug_mode.ts";

export const def = DefineFunction({
  callback_id: "translate",
  title: "Post the news article of given message as a reply in its thread",
  source_file: "functions/gen_news.ts",
  input_parameters: {
    properties: {
      channelId: { type: Schema.types.string },
      messageTs: { type: Schema.types.string },
      lang: { type: Schema.types.string },
    },
    required: ["channelId", "messageTs"],
  },
  output_parameters: {
    properties: { ts: { type: Schema.types.string } },
    required: [],
  },
});

export default SlackFunction(def, async ({ inputs, client, env }) => {
  const debugMode = isDebugMode(env);
  if (debugMode) {
    console.log(`translate inputs: ${JSON.stringify(inputs)}`);
  }
  const emptyOutputs = { outputs: {} };
  /*
  if (inputs.lang === undefined) {
    // no language specified by the reaction
    console.log("Skipped as no lang detected");
    return emptyOutputs; // this is not an error
  }
  */

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

  const targetText = translationTarget.text
    // Before sending the text to the DeepL API,
    // replace special syntax parts with ignore tags to keep them
    // Thanks to @Janjoch's great contribution:
    // https://github.com/seratch/deepl-for-slack/pull/18
    .replace(/<(.*?)>/g, (_: unknown, match: string) => {
      // match #channels and @mentions
      if (match.match(/^[#@].*$/)) {
        const matched = match.match(/^([#@].*)$/);
        if (matched != null) {
          return "<mrkdwn>" + matched[1] + "</mrkdwn>";
        }
        return "";
      }
      // match subteam
      if (match.match(/^!subteam.*$/)) {
        return "@[subteam mention removed]";
      }
      // match date formatting
      if (match.match(/^!date.*$/)) {
        const matched = match.match(/^(!date.*)$/);
        if (matched != null) {
          return "<mrkdwn>" + matched[1] + "</mrkdwn>";
        }
        return "";
      }
      // match special mention
      if (match.match(/^!.*$/)) {
        const matched = match.match(/^!(.*?)(?:\|.*)?$/);
        if (matched != null) {
          return "<ignore>@" + matched[1] + "</ignore>";
        }
        return "<ignore>@[special mention]</ignore>";
      }
      // match formatted link
      if (match.match(/^.*?\|.*$/)) {
        const matched = match.match(/^(.*?)\|(.*)$/);
        if (matched != null) {
          return '<a href="' + matched[1] + '">' + matched[2] + "</a>";
        }
        return "";
      }
      // fallback (raw link or unforeseen formatting)
      return "<mrkdwn>" + match + "</mrkdwn>";
      // match emoji
    })
    .replace(/:([a-z0-9_-]+):/g, (_: unknown, match: string) => {
      return "<emoji>" + match + "</emoji>";
    });
  
    // Log targetText
  console.log(`targetText: ${targetText}`);
  
  // Create const body that is a json object
  const body = JSON.stringify({
    model: "gpt-3.5-turbo-1106",
    messages: [
      {
        role: "system",
        content: "You are a news writer summarizing a news article as a single title that is less than 10 words",
      },
      {
        role: "user",
        content: translationTarget.text,
      },
      {
        role: "system",
        content: "The title of the article with no quotes and no other characters like backslashes surrounding it is:",
      }
    ]    
  });

  
  const deeplResponse = await fetch(url, {
    method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authKey}`
      },
      body,
    });
  if (deeplResponse.status != 200) {
    if (deeplResponse.status == 403) {
      // If the status code is 403, the given auth key is not valid
      const error =
        `Translating a message failed! Please make sure if the DEEPL_AUTH_KEY is correct. - (status: ${deeplResponse.status}, target text: ${
          targetText.substring(0, 30)
        }...)`;
      console.log(error);
      return { error };
    }
    const body = await deeplResponse.text();
    const error =
      `Translating a message failed! Contact the app maintainers with the following information - (status: ${deeplResponse.status}, body: ${body}, target text: ${
        targetText.substring(0, 30)
      }...)`;
    console.log(error);
    return { error };
  }
  const translationResult = await deeplResponse.json();
  if (debugMode) {
    console.log(`translation result: ${JSON.stringify(translationResult)}`);
  }

  if (
    !translationResult ||
    !translationResult.id ||
    translationResult.choices.length === 0
  ) {
    const printableResponse = JSON.stringify(translationResult);
    const error =
      `Translating a message failed! Contact the app maintainers with the following information - (OpenAI API response: ${printableResponse})`;
    console.log(error);
    return { error };
  }
  const translatedText = translationResult.choices[0].message    

  const replies = await client.conversations.replies({
    channel: inputs.channelId,
    ts: translationTargetThreadTs ?? inputs.messageTs,
  });
  if (isAlreadyPosted(replies.messages, translatedText)) {
    // Skip posting the same one
    console.log(
      `Skipped this translation as it's already posted: ${
        JSON.stringify(
          translatedText,
        )
      }`,
    );
    return emptyOutputs; // this is not an error
  }
  const result = await sayInThread(
    client,
    inputs.channelId,
    translationTargetThreadTs ?? inputs.messageTs,
    translatedText,
  );
  return { outputs: { ts: result.ts } };
});

// ---------------------------
// Internal functions
// ---------------------------

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
