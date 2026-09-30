import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { requireDiscordToken } from "./config.js";
import { handleInteraction, registerCommands } from "./handlers/interactions.js";
import { startHealthServer } from "./health.js";
import { loadEmojis } from "./ui/emojis.js";

startHealthServer();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (readyClient) => {
  await loadEmojis(readyClient);
  await registerCommands();
  console.log(`Kyomi Companion is online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction);
});

client.login(requireDiscordToken()).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
