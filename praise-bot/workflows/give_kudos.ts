import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { FindGIFFunction } from "../functions/find_gif.ts";
import { SavePraiseFunction } from "../functions/save_praise.ts";

/**
 * A workflow is a set of steps that are executed in order. Each step in a
 * workflow is a function – either a built-in or custom function.
 * Learn more: https://api.slack.com/automation/workflows
 */
const GiveKudosWorkflow = DefineWorkflow({
  callback_id: "give_kudos_workflow",
  title: "Give kudos",
  description: "Acknowledge the impact someone had on you",
  input_parameters: {
    properties: {
      /**
       * This workflow users interactivity to collect input from the user.
       * Learn more: https://api.slack.com/automation/forms#add-interactivity
       */
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
      // sender_user_id:{
      //   type: Schema.slack.types.user_id
      // }
    },
    required: ["interactivity"],
  },
});

/**
 * Collecting input from users can be done with the built-in OpenForm function
 * as the first step.
 * Learn more: https://api.slack.com/automation/functions#open-a-form
 */
const kudo = GiveKudosWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Give someone kudos",
    interactivity: GiveKudosWorkflow.inputs.interactivity,
    submit_label: "Share",
    description: "Continue the positive energy through your written word",
    fields: {
      elements: [{
        name: "doer_of_good_deeds",
        title: "Whose deeds are deemed worthy of a kudo?",
        description: "Recognizing such deeds is dazzlingly desirable of you!",
        type: Schema.slack.types.user_id,
      }, {
        name: "kudo_channel",
        title: "Where should this message be shared?",
        type: Schema.slack.types.channel_id,
      }, {
        name: "kudo_message",
        title: "What would you like to say?",
        type: Schema.types.string,
        long: true,
      }, {
        name: "kudo_vibe",
        title: 'What is this kudo\'s "vibe"?',
        description: "What sorts of energy is given off?",
        type: Schema.types.string,
        enum: [
          "Appreciation for someone 🫂",
          "Celebrating a victory 🏆",
          "Thankful for great teamwork ⚽️",
          "Amazed at awesome work ☄️",
          "Excited for the future 🎉",
          "No vibes, just plants 🪴",
        ],
      }],
      required: ["doer_of_good_deeds", "kudo_channel", "kudo_message"],
    },
  },
);

/**
 * A custom function can be added as a workflow step to modify input data,
 * collect additional data for the response, and return information for use in
 * later steps.
 * Learn more: https://api.slack.com/automation/functions/custom
 */
const gif = GiveKudosWorkflow.addStep(FindGIFFunction, {
  vibe: kudo.outputs.fields.kudo_vibe,
});

/*
 * Extracts data from kudo step and calls SavePraiseFunction to call API saving to Firestore database
 * @param {string} doer - The ID of the user who made the praise
 * @param {string} channel - The ID of the channel the praise is written in
 * @param {string} message - The message content of the praise
 * @param {string} vibe - The ID of the user who made the praise
 * @returns response to the API call
 */
GiveKudosWorkflow.addStep(SavePraiseFunction, {
  sender: GiveKudosWorkflow.inputs.sender_user_id,
  doer: kudo.outputs.fields.doer_of_good_deeds,
  channel: kudo.outputs.fields.kudo_channel,
  message: kudo.outputs.fields.kudo_message,
  gif: gif.outputs.URL,
});

/**
 * Messages can be sent into a channel with the built-in SendMessage function.
 * Learn more: https://api.slack.com/automation/functions#catalog
 */
GiveKudosWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: kudo.outputs.fields.kudo_channel,
  message:
    `*Hey <@${kudo.outputs.fields.doer_of_good_deeds}>!* Someone wanted to share some kind words with you :otter:\n` +
    `> ${kudo.outputs.fields.kudo_message}\n` +
    `<${gif.outputs.URL}>`,
});

//Helper methods
function getSenderUserID(translationResult: any): string {
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
  
  return ""
}

export { GiveKudosWorkflow };