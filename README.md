# Kyomi Companion

A minimalist Discord bot for two things: today's tasks and how much water you drank.

## Command

`/kyomi` — open today's card. Everything else is on that panel.

## Setup

1. Create a Discord application and bot at [Discord Developer Portal](https://discord.com/developers/applications).
2. Copy the **bot token** into `.env` as `DISCORD_TOKEN`.
3. Invite the bot with `bot` and `applications.commands` scopes:

   `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=0&scope=bot%20applications.commands`

4. Create a Supabase project, then put the URL, API key, and **pooler** connection string in `.env`. On IPv4-only networks, use the Session pooler URL from Supabase (`postgres.PROJECT_REF@aws-0-REGION.pooler.supabase.com:5432`) instead of `db.PROJECT_REF.supabase.co`.
5. Install and apply the schema:

```bash
npm install
npm run setup-db
npm start
```

Invite the bot into the server that has your custom emojis so they can show on the panel.

## Deploy on Render

This is a Discord bot. On Render, create a **Web Service** (not a static site) so the process stays running and can bind to `PORT`.

1. Push this repo to GitHub.
2. In Render, **New → Web Service** and connect the repo, or use the `render.yaml` Blueprint.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm start`
   - **Health check path:** `/health`
   - **Node version:** `22` (set `NODE_VERSION=22` in the Render environment)
4. Add environment variables from `.env.example` (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_PUBLIC_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `DATABASE_URL`).
5. Apply the schema once (`npm run setup-db` locally, or a one-off Render shell) before the first live traffic.

The service listens on `0.0.0.0:$PORT` and answers `GET /health` with `ok` so Render does not kill the process. The Discord client logs in in the same process.

## `.env`

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_PUBLIC_KEY=

SUPABASE_URL=
SUPABASE_KEY=
DATABASE_URL=
```

Dates are stored in UTC. Each user is isolated by Discord user ID. Reset Day clears only the current UTC day; past days are kept.

## Usage

- Click a task to complete or uncomplete it. The button next to it deletes that task.
- **Add Task** accepts several items, one per line, and updates the same card.
- Tap **1L / 1.5L / 2L / 2.5L** to set today's water, or **Other** for a custom amount.
- **Water Goal** changes your daily water target (default 2L).
- **History** shows your past water and the tasks you added, with the date and weekday. Only your own days appear.
- On a new day, unfinished tasks from yesterday can be moved over or ignored.
