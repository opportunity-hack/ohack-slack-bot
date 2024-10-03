import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { SlackAPIClient } from "deno-slack-sdk/types.ts";
import { isDebugMode } from "./internals/debug_mode.ts";

/**
 * Defines the SavePraiseFunction input and output parameters
 */
export const SavePraiseFunction = DefineFunction({
    callback_id: "save_praise",
    title: "Save a Praise",
    description: "Saves data about a praise based on user input choices",
    source_file: "functions/save_praise.ts", // The file with the exported function handler
    input_parameters: {
      properties: {
        praise_sender: {
          type: Schema.slack.types.user_id,
          description: "The user id of the person sending the praise",
        },
        praise_receiver: {
          type: Schema.slack.types.user_id,
          description: "The user id of the person receiving the praise",
        },
        praise_channel: {
            type: Schema.slack.types.channel_id,
            description: "The channel where the praise is to be sent",
        },
        praise_message: {
            type: Schema.types.string,
            description: "The message content of the praise",
        },
        praise_gif: {
            type: Schema.types.string,
            description: "The energy of the praise",
        },                
      },
      required: ["praise_sender", "praise_receiver", "praise_channel", "praise_message"],
    },
  });

  export default SlackFunction(SavePraiseFunction, async ({ inputs, client, env }) => {
    const debugMode = isDebugMode(env);
    if (debugMode) {
      console.log(`translate inputs: ${JSON.stringify(inputs)}`);
    }

      // Call backend api to post the news article
      const backendUrl = env.BACKEND_PRAISE_URL;
      const token = env.BACKEND_PRAISE_TOKEN;
  
      console.log(`Saving at backendUrl: ${backendUrl}`)
  
      if (!backendUrl) {
        const error =
          "BACKEND_URL needs to be set. You can place .env file for local dev. For production apps, please run `slack env add BACKEND_URL (your key here)` to set the value.";
        return { error };
      }
      //In the request, keep removing parts to see if has any effect on error.
      const backendResponse = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": token,
        },
        body: JSON.stringify(inputs)
      });
      console.log("What is the status of the backendResponse" + backendResponse.status);
      if (backendResponse.status != 200) {
        const error =
          `Saving the praise failed! Contact the app maintainers with the following information - (status: ${backendResponse.status})`;
        console.log(error);
        return { error };
      }
      const backendResult = await backendResponse.json();
      if (debugMode) {
        console.log(`backend result: ${JSON.stringify(backendResult)}`);
      }
  
  
    return { outputs: { ts: backendResult.ts } };
  });

 