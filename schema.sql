create extension if not exists "pgcrypto";

create table if not exists users (
  discord_id text primary key,
  last_seen_date date,
  created_at timestamptz not null default now()
);

create table if not exists user_settings (
  discord_id text primary key references users (discord_id) on delete cascade,
  water_goal_ml integer not null default 2000 check (water_goal_ml > 0),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null references users (discord_id) on delete cascade,
  task_date date not null,
  text text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_date_idx on tasks (discord_id, task_date);

create table if not exists water_entries (
  discord_id text not null references users (discord_id) on delete cascade,
  entry_date date not null,
  amount_ml integer not null check (amount_ml >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (discord_id, entry_date)
);

alter table users disable row level security;
alter table user_settings disable row level security;
alter table tasks disable row level security;
alter table water_entries disable row level security;

grant all on table users to anon, authenticated, service_role;
grant all on table user_settings to anon, authenticated, service_role;
grant all on table tasks to anon, authenticated, service_role;
grant all on table water_entries to anon, authenticated, service_role;
