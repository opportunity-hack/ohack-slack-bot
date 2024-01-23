import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { def as detectEmoji } from "../functions/detect_lang.ts";
import { def as summarize } from "../functions/gen_news.ts";

/**
 * A workflow that translates channel text messages into a different language.
 * End-users can add a reaction such a :jp: to translate any messages.
 * The translation result will be posted as a reply in the original message's thread.
 */
const workflow = DefineWorkflow({
  callback_id: "reacjilator",
  title: "OpenAI news generator",
  input_parameters: {
    properties: {
      channelId: { type: Schema.slack.types.channel_id },
      messageTs: { type: Schema.types.string },
      reaction: { type: Schema.types.string },
    },
    required: ["channelId", "messageTs", "reaction"],
  },
});

// Make sure the right reaction emoji was set
const emojiDetection = workflow.addStep(detectEmoji, workflow.inputs);

// Call DeepL's text translation API and then post the result in the same thread
workflow.addStep(summarize, {
  ...workflow.inputs,
  result: emojiDetection.outputs.result,
});

export default workflow;
