import { supabase } from "./supabase.js";
import { todayUtc, yesterdayUtc } from "../util/dates.js";

export type Task = {
  id: string;
  discord_id: string;
  task_date: string;
  text: string;
  completed: boolean;
  position: number;
  created_at: string;
};

export type DayState = {
  date: string;
  tasks: Task[];
  waterMl: number | null;
  waterGoalMl: number;
  lastSeenDate: string | null;
};

export type HistoryTask = {
  text: string;
  completed: boolean;
};

export type HistoryDay = {
  date: string;
  waterMl: number | null;
  tasks: HistoryTask[];
};

const HISTORY_DAYS = 21;

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

export async function ensureUser(discordId: string): Promise<void> {
  const { error } = await supabase.from("users").upsert(
    { discord_id: discordId },
    { onConflict: "discord_id", ignoreDuplicates: true }
  );
  throwIfError(error, "Could not create user");

  const { error: settingsError } = await supabase.from("user_settings").upsert(
    { discord_id: discordId, water_goal_ml: 2000 },
    { onConflict: "discord_id", ignoreDuplicates: true }
  );
  throwIfError(settingsError, "Could not create settings");
}

export async function loadDay(discordId: string, date = todayUtc()): Promise<DayState> {
  await ensureUser(discordId);

  const [{ data: user, error: userError }, { data: settings, error: settingsError }, { data: tasks, error: tasksError }, { data: water, error: waterError }] =
    await Promise.all([
      supabase.from("users").select("last_seen_date").eq("discord_id", discordId).single(),
      supabase.from("user_settings").select("water_goal_ml").eq("discord_id", discordId).single(),
      supabase
        .from("tasks")
        .select("*")
        .eq("discord_id", discordId)
        .eq("task_date", date)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("water_entries")
        .select("amount_ml")
        .eq("discord_id", discordId)
        .eq("entry_date", date)
        .maybeSingle(),
    ]);

  throwIfError(userError, "Could not load user");
  throwIfError(settingsError, "Could not load settings");
  throwIfError(tasksError, "Could not load tasks");
  throwIfError(waterError, "Could not load water");

  return {
    date,
    tasks: (tasks ?? []) as Task[],
    waterMl: water?.amount_ml ?? null,
    waterGoalMl: settings?.water_goal_ml ?? 2000,
    lastSeenDate: user?.last_seen_date ?? null,
  };
}

export async function countUnfinished(discordId: string, date: string): Promise<number> {
  const { count, error } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("discord_id", discordId)
    .eq("task_date", date)
    .eq("completed", false);
  throwIfError(error, "Could not count unfinished tasks");
  return count ?? 0;
}

export async function shouldOfferRollover(discordId: string, date = todayUtc()): Promise<number> {
  const day = await loadDay(discordId, date);
  if (day.lastSeenDate === date) {
    return 0;
  }
  const yesterday = yesterdayUtc(date);
  return countUnfinished(discordId, yesterday);
}

export async function markSeen(discordId: string, date = todayUtc()): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ last_seen_date: date })
    .eq("discord_id", discordId);
  throwIfError(error, "Could not update last seen date");
}

export async function moveUnfinishedToToday(discordId: string, date = todayUtc()): Promise<void> {
  const yesterday = yesterdayUtc(date);
  const { data: unfinished, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("discord_id", discordId)
    .eq("task_date", yesterday)
    .eq("completed", false)
    .order("position", { ascending: true });
  throwIfError(error, "Could not load yesterday's tasks");

  const existing = await loadDay(discordId, date);
  const nextPosition = existing.tasks.length;
  const rows = (unfinished ?? []).map((task, index) => ({
    discord_id: discordId,
    task_date: date,
    text: task.text,
    completed: false,
    position: nextPosition + index,
  }));

  if (rows.length) {
    const { error: insertError } = await supabase.from("tasks").insert(rows);
    throwIfError(insertError, "Could not move tasks");
  }

  await markSeen(discordId, date);
}

export async function addTasks(discordId: string, texts: string[], date = todayUtc()): Promise<void> {
  if (!texts.length) {
    return;
  }
  const day = await loadDay(discordId, date);
  const existing = new Set(day.tasks.map((task) => task.text.toLowerCase()));
  const fresh = texts.filter((text) => !existing.has(text.toLowerCase()));
  if (!fresh.length) {
    return;
  }
  const rows = fresh.map((text, index) => ({
    discord_id: discordId,
    task_date: date,
    text,
    completed: false,
    position: day.tasks.length + index,
  }));
  const { error } = await supabase.from("tasks").insert(rows);
  throwIfError(error, "Could not add tasks");
}

export async function deleteTask(discordId: string, taskId: string): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("discord_id", discordId);
  throwIfError(error, "Could not delete task");
}

export async function toggleTask(discordId: string, taskId: string): Promise<void> {
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, completed, discord_id")
    .eq("id", taskId)
    .eq("discord_id", discordId)
    .maybeSingle();
  throwIfError(error, "Could not find task");
  if (!task) {
    throw new Error("That task is no longer on today's list.");
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update({ completed: !task.completed })
    .eq("id", taskId)
    .eq("discord_id", discordId);
  throwIfError(updateError, "Could not update task");
}

export async function setWater(discordId: string, amountMl: number, date = todayUtc()): Promise<void> {
  await ensureUser(discordId);
  const { error } = await supabase.from("water_entries").upsert(
    {
      discord_id: discordId,
      entry_date: date,
      amount_ml: amountMl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "discord_id,entry_date" }
  );
  throwIfError(error, "Could not save water");
}

export async function setWaterGoal(discordId: string, goalMl: number): Promise<void> {
  await ensureUser(discordId);
  const { error } = await supabase
    .from("user_settings")
    .update({ water_goal_ml: goalMl, updated_at: new Date().toISOString() })
    .eq("discord_id", discordId);
  throwIfError(error, "Could not save water goal");
}

export async function loadHistory(discordId: string, today = todayUtc()): Promise<HistoryDay[]> {
  await ensureUser(discordId);

  const [{ data: tasks, error: tasksError }, { data: water, error: waterError }] = await Promise.all([
    supabase
      .from("tasks")
      .select("task_date, text, completed, position, created_at")
      .eq("discord_id", discordId)
      .lt("task_date", today)
      .order("task_date", { ascending: false })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("water_entries")
      .select("entry_date, amount_ml")
      .eq("discord_id", discordId)
      .lt("entry_date", today)
      .order("entry_date", { ascending: false }),
  ]);

  throwIfError(tasksError, "Could not load task history");
  throwIfError(waterError, "Could not load water history");

  const byDate = new Map<string, HistoryDay>();

  for (const entry of water ?? []) {
    byDate.set(entry.entry_date, {
      date: entry.entry_date,
      waterMl: entry.amount_ml,
      tasks: [],
    });
  }

  for (const task of tasks ?? []) {
    const existing = byDate.get(task.task_date);
    if (existing) {
      existing.tasks.push({ text: task.text, completed: task.completed });
      continue;
    }
    byDate.set(task.task_date, {
      date: task.task_date,
      waterMl: null,
      tasks: [{ text: task.text, completed: task.completed }],
    });
  }

  return [...byDate.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HISTORY_DAYS);
}

export async function resetToday(discordId: string, date = todayUtc()): Promise<void> {
  const [{ error: taskError }, { error: waterError }] = await Promise.all([
    supabase.from("tasks").delete().eq("discord_id", discordId).eq("task_date", date),
    supabase.from("water_entries").delete().eq("discord_id", discordId).eq("entry_date", date),
  ]);
  throwIfError(taskError, "Could not reset tasks");
  throwIfError(waterError, "Could not reset water");
}
