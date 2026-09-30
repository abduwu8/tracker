import type { Client } from "discord.js";
import type { APIMessageComponentEmoji } from "discord.js";

const byName = new Map<string, APIMessageComponentEmoji>();

export async function loadEmojis(client: Client): Promise<void> {
  byName.clear();
  for (const guild of client.guilds.cache.values()) {
    const emojis = await guild.emojis.fetch();
    for (const emoji of emojis.values()) {
      if (emoji.name) {
        byName.set(emoji.name, {
          id: emoji.id,
          name: emoji.name,
          animated: emoji.animated ?? false,
        });
      }
    }
  }
  console.log(`Loaded ${byName.size} server emoji(s).`);
}

export function emojiText(name: string, fallback = ""): string {
  const emoji = byName.get(name);
  if (!emoji?.id || !emoji.name) {
    return fallback;
  }
  return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
}

export function emojiComponent(name: string): APIMessageComponentEmoji | undefined {
  return byName.get(name);
}
