import { Manifest } from "deno-slack-sdk/mod.ts";
import { FindGIFFunction } from "./functions/find_gif.ts";
import { SavePraiseFunction } from "./functions/save_praise.ts";
import { GiveKudosWorkflow } from "./workflows/give_kudos.ts";

/**
 * The app manifest contains the app's configuration. This file defines
 * attributes like app name, description, available workflows, and more.
 * Learn more: https://api.slack.com/automation/manifest
 */
export default Manifest({
  name: "give-kudos-app",
  description: "Brighten someone's day with a heartfelt thank you",
  icon: "assets/icon.png",
  functions: [FindGIFFunction,SavePraiseFunction],
  workflows: [GiveKudosWorkflow],
  outgoingDomains: ["api.test.ohack.dev", "api.ohack.dev"],
  botScopes: ["commands", "chat:write", "chat:write.public"],
});
