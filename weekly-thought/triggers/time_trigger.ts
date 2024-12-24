import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import { PostThoughtWorkflow } from "../workflows/post_a_thought.ts";

/**
 * A trigger that periodically starts the "maintenance-job" workflow.
 */
const trigger: Trigger<typeof PostThoughtWorkflow.definition> = {
  type: TriggerTypes.Scheduled,
  name: "Trigger a scheduled thought job",
  workflow: `#/workflows/${PostThoughtWorkflow.definition.callback_id}`,
  inputs: {
    channel_id: {
      value: "C12345678", // Replace with your channel ID
    },
  },
  schedule: {
    // This is a simple example that sets 60 seconds later
    start_time: new Date(new Date().getTime() + 60000).toISOString(),
    end_time: "2037-12-31T23:59:59Z",
    frequency: { type: "hourly", repeats_every: 1 },
  },
};

export default trigger;
