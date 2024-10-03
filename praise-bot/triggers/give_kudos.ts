import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import { GiveKudosWorkflow } from "../workflows/give_kudos.ts";

/**
 * Triggers determine when workflows are executed. A trigger file describes a
 * scenario in which a workflow should be run, such as a user clicking a link.
 * Learn more: https://api.slack.com/automation/triggers/link
 */
const trigger: Trigger<typeof GiveKudosWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "praise",
  description: "Give someone a praise",
  workflow: `#/workflows/${GiveKudosWorkflow.definition.callback_id}`,  //May need to change this
  inputs: {
    interactivity: {
      value: TriggerContextData.Shortcut.interactivity,
    },
    sender_user_id: {
      value: TriggerContextData.Shortcut.user_id,
    },
    
  },
};

export default trigger;
