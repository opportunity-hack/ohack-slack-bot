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
function checkTranslationResult(translationResult: any): string {
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
  
  return getTranslatedText(translationResult)
}

// Create a helper method to get translatedText
function getTranslatedText(translationResult: any): string {
  const translatedTextRaw = translationResult.choices[0].message
  const translatedText = translatedTextRaw.content 
  return translatedText;
}


async function makeOpenAIRequest(url: string, body: string, authKey: string, targetText: string, debugMode: boolean) {
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
      const responseBody = await deeplResponse.text();
      const error =
        `Translating a message failed! Contact the app maintainers with the following information - (status: ${deeplResponse.status}, body: ${responseBody}, target text: ${
          targetText.substring(0, 30)
        }...)`;
      console.log(error);
      return { error };
    }
    const translationResult = await deeplResponse.json();
    if (debugMode) {
      console.log(`translation result: ${JSON.stringify(translationResult)}`);
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
      
  // Create const body that is a json object
  const bodyForTitle = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a blog writer for Opportunity Hack, provide a single title for a blog article that is less than 10 words. Your unique writing is sometimes inspired by nerdy engineering and science, Taylor Swift, Green Day, and 1990's R&B music.",
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

  const bodyForSummary = JSON.stringify({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a blog writer for Opportunity Hack. Summarize this news article as four sentences or less. Your unique writing is sometimes inspired by nerdy engineering terms, computer science puns, and science, Taylor Swift, Green Day, and 1990's R&B music.",
      },
      {
        role: "user",
        content: translationTarget.text,
      },
      {
        role: "system",
        content: "The summary of the article with no quotes and no other characters like backslashes surrounding it is:",
      }
    ]    
  });

  const bodyForLinks = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a Slack url link detector. Output should always be in Slack markdown <link|name>. You are given a text and you need to find all the urls and names of the urls in the text. If you are only given a link without a name, just provide the name as: link. For example if you see only https://opportunity-hack.slack.com/archives/C07RZGUS0DP/p1728971255221889 respond with <https://opportunity-hack.slack.com/archives/C07RZGUS0DP/p1728971255221889|link>",
      },
      {
        role: "user",
        content: translationTarget.text,
      },
      {
        role: "system",
        content: "The Slack formatted name and urls using Slack markdown like <link|name> are:",
      }
    ]    
  });

  const titleResponse = await makeOpenAIRequest(url, bodyForTitle, authKey, targetText, debugMode);
  const summaryReponse = await makeOpenAIRequest(url, bodyForSummary, authKey, targetText, debugMode);
  const linksResponse = await makeOpenAIRequest(url, bodyForLinks, authKey, targetText, debugMode);

  const summarizedText = `Title: ${titleResponse}\nSummary: ${summaryReponse}\nLinks: ${linksResponse}`
  
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

    // Call backend api to post the news article
    const backendUrl = env.BACKEND_NEWS_URL;
    const token = env.BACKEND_NEWS_TOKEN;

    console.log(`Saving at backendUrl: ${backendUrl}`)

    if (!backendUrl) {
      const error =
        "BACKEND_URL needs to be set. You can place .env file for local dev. For production apps, please run `slack env add BACKEND_URL (your key here)` to set the value.";
      return { error };
    }
    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": token,
      },
        body: JSON.stringify({
        title: titleResponse,
        description: summaryReponse,
        links: linksResponse,
        slack_ts: inputs.messageTs,
        slack_permalink: permalink,
        slack_channel: inputs.channelId,
      }),
    });
    if (backendResponse.status != 200) {
      const error =
        `Posting the news article failed! Contact the app maintainers with the following information - (status: ${backendResponse.status}, target text: ${
          targetText.substring(0, 30)
        }...)`;
      console.log(error);
      return { error };
    }
    const backendResult = await backendResponse.json();
    if (debugMode) {
      console.log(`backend result: ${JSON.stringify(backendResult)}`);
    }


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
