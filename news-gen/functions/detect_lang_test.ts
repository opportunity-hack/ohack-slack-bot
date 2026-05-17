import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "std/testing/asserts.ts";
import handler from "./detect_lang.ts";

const { createContext } = SlackFunctionTester("my-function");

Deno.test("Return the reaction name for an allowed user", async () => {
  const inputs = { reaction: "jp", userId: "UC31XTRT5" };
  const env = { DEBUG_MODE: "false" };
  const { outputs } = await handler(createContext({ inputs, env }));
  assertEquals(outputs?.result, "jp");
});

Deno.test("Return the reaction name for a flag reaction", async () => {
  const inputs = { reaction: "flag-au", userId: "UC31XTRT5" };
  const env = { DEBUG_MODE: "false" };
  const { outputs } = await handler(createContext({ inputs, env }));
  assertEquals(outputs?.result, "flag-au");
});

Deno.test("Return nothing when the user is not allowed", async () => {
  const inputs = { reaction: "eyes", userId: "NOTALLOWED" };
  const env = { DEBUG_MODE: "false" };
  const { outputs } = await handler(createContext({ inputs, env }));
  assertEquals(outputs?.result, undefined);
});
