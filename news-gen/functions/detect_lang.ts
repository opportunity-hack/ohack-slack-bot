import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { isDebugMode } from "./internals/debug_mode.ts";

export const def = DefineFunction({
  callback_id: "detect-lang",
  title: "Detects that the correct reaction emoji was set",
  source_file: "functions/detect_lang.ts",
  input_parameters: {
    properties: { reaction: { type: Schema.types.string } },
    required: ["reaction"],
  },
  output_parameters: {
    properties: { result: { type: Schema.types.string } },
    required: [],
  },
});

export default SlackFunction(def, ({
  inputs,
  env,
}) => {
  const debugMode = isDebugMode(env);
  if (debugMode) {
    console.log(`detect-lang inputs: ${JSON.stringify(inputs)}`);
  }
  const reactionName = inputs.reaction;
  // log reaction
  console.log(`reactionName: ${reactionName}`);

  
  
  return { outputs: { result: reactionName } };
});


