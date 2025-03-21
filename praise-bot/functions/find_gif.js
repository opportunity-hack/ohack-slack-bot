// import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import gifs from "../assets/gifs.json" with { type: "json" };

const getEnergy = (vibe) => {
  if (vibe === "Appreciation for someone 🫂") return "appreciation";
  if (vibe === "Celebrating a victory 🏆") return "celebration";
  if (vibe === "Thankful for great teamwork ⚽️") return "thankful";
  if (vibe === "Amazed at awesome work ☄️") return "amazed";
  if (vibe === "Excited for the future 🎉") return "excited";
  if (vibe === "No vibes, just plants 🪴") return "plants";
  return "otter"; // 🦦
};


const matchVibe = (vibe) => {
  const energy = getEnergy(vibe);
  const matches = gifs.filter((g) => g.tags.includes(energy));
  const randomGIF = Math.floor(Math.random() * matches.length);
  return matches[randomGIF];
};

/**
 * The default export for a custom function accepts a function definition
 * and a function handler that contains the custom logic for the function.
 */
export function slackGIFSelectionFunction(vibe) {
  const gif = matchVibe(vibe ?? "");
  return gif;
};
