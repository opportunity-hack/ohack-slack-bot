import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const GetThoughtFunction = DefineFunction({
  callback_id: "get_thought_function",
  title: "Get a Thought",
  description: "Fetches a random thought to post",
  output_parameters: {
    properties: {
      thought: {
        type: Schema.types.string,
      },
    },
    required: ["thought"],
  },
});

export default SlackFunction(GetThoughtFunction, async ({ inputs, env }) => {
  const thoughts = [
    "Thought 1",
    "Thought 2",
    "Thought 3",
    // Add more thoughts here
  ];
  const randomThought = thoughts[Math.floor(Math.random() * thoughts.length)];
  return { outputs: { thought: randomThought } };
});
