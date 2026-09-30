import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN?.trim() ?? "",
  discordClientId: required("DISCORD_CLIENT_ID"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseKey: required("SUPABASE_KEY"),
  databaseUrl: required("DATABASE_URL"),
};

export function requireDiscordToken(): string {
  if (!config.discordToken) {
    throw new Error(
      "Missing DISCORD_TOKEN. Add your bot token to .env, then run npm start."
    );
  }
  return config.discordToken;
}
