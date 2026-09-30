import {
  addTasks,
  deleteTask,
  loadDay,
  loadHistory,
  markSeen,
  moveUnfinishedToToday,
  resetToday,
  setWater,
  setWaterGoal,
  shouldOfferRollover,
  toggleTask,
} from "./db/queries.js";
import { supabase } from "./db/supabase.js";
import { formatHistoryDate, yesterdayUtc } from "./util/dates.js";
import { splitTasks } from "./util/tasks.js";
import { formatLiters, parseWaterAmount, progressBar } from "./util/water.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testParsers(): void {
  assert(JSON.stringify(splitTasks("study dsa\nclean room\nfinish assignment")) === JSON.stringify(["study dsa", "clean room", "finish assignment"]), "split tasks");
  assert(parseWaterAmount("1L") === 1000, "1L");
  assert(parseWaterAmount("1.5L") === 1500, "1.5L");
  assert(parseWaterAmount("1.8L") === 1800, "1.8L");
  assert(parseWaterAmount("1800ml") === 1800, "1800ml");
  assert(parseWaterAmount("2L") === 2000, "2L");
  assert(formatLiters(1800) === "1.8L", "format 1.8L");
  assert(formatLiters(2000) === "2L", "format 2L");
  assert(progressBar(1800, 2000) === "█████████░", "progress bar");
  assert(formatHistoryDate("2026-09-24").includes("Thursday"), "history weekday");
  console.log("Parser tests passed.");
}

async function testPersistence(): Promise<void> {
  const discordId = "test-kyomi-user";
  await supabase.from("tasks").delete().eq("discord_id", discordId);
  await supabase.from("water_entries").delete().eq("discord_id", discordId);
  await supabase.from("user_settings").delete().eq("discord_id", discordId);
  await supabase.from("users").delete().eq("discord_id", discordId);

  await addTasks(discordId, ["Study DSA", "Finish assignment", "Go for a walk"]);
  let day = await loadDay(discordId);
  assert(day.tasks.length === 3, "added 3 tasks");
  assert(day.waterGoalMl === 2000, "default water goal");

  const walk = day.tasks.find((task) => task.text === "Go for a walk");
  assert(walk, "walk task exists");
  await deleteTask(discordId, walk!.id);
  day = await loadDay(discordId);
  assert(day.tasks.length === 2, "deleted a task");
  await addTasks(discordId, ["Go for a walk"]);
  day = await loadDay(discordId);
  const walkAgain = day.tasks.find((task) => task.text === "Go for a walk");
  assert(walkAgain, "walk re-added");
  await toggleTask(discordId, walkAgain!.id);
  day = await loadDay(discordId);
  assert(day.tasks.find((task) => task.text === "Go for a walk")?.completed === true, "completed walk");
  await toggleTask(discordId, walkAgain!.id);
  day = await loadDay(discordId);
  assert(day.tasks.find((task) => task.text === "Go for a walk")?.completed === false, "uncompleted walk");

  await setWater(discordId, parseWaterAmount("1.8L"));
  day = await loadDay(discordId);
  assert(day.waterMl === 1800, "saved water");

  await setWaterGoal(discordId, parseWaterAmount("2.5L"));
  day = await loadDay(discordId);
  assert(day.waterGoalMl === 2500, "updated water goal");

  const yesterday = yesterdayUtc(day.date);
  await supabase.from("tasks").insert({
    discord_id: discordId,
    task_date: yesterday,
    text: "Old unfinished",
    completed: false,
    position: 0,
  });
  await supabase.from("users").update({ last_seen_date: yesterday }).eq("discord_id", discordId);
  const unfinished = await shouldOfferRollover(discordId);
  assert(unfinished === 1, "detects unfinished from yesterday");
  await moveUnfinishedToToday(discordId);
  day = await loadDay(discordId);
  assert(day.tasks.some((task) => task.text === "Old unfinished"), "moved unfinished task");

  await resetToday(discordId);
  day = await loadDay(discordId);
  assert(day.tasks.length === 0, "reset today tasks");
  assert(day.waterMl === null, "reset today water");

  const { data: history } = await supabase
    .from("tasks")
    .select("text")
    .eq("discord_id", discordId)
    .eq("task_date", yesterday);
  assert(history?.length === 1, "kept yesterday history");

  await markSeen(discordId);
  const again = await shouldOfferRollover(discordId);
  assert(again === 0, "does not prompt twice");

  await supabase.from("tasks").delete().eq("discord_id", discordId);
  await supabase.from("water_entries").delete().eq("discord_id", discordId);
  await supabase.from("user_settings").delete().eq("discord_id", discordId);
  await supabase.from("users").delete().eq("discord_id", discordId);

  const userA = "test-kyomi-user-a";
  const userB = "test-kyomi-user-b";
  for (const id of [userA, userB]) {
    await supabase.from("tasks").delete().eq("discord_id", id);
    await supabase.from("water_entries").delete().eq("discord_id", id);
    await supabase.from("user_settings").delete().eq("discord_id", id);
    await supabase.from("users").delete().eq("discord_id", id);
  }

  const past = yesterdayUtc();
  await addTasks(userA, ["A's homework"], past);
  await setWater(userA, 1800, past);
  await addTasks(userB, ["B's workout"], past);
  await setWater(userB, 2500, past);
  await addTasks(userA, ["A today only"]);
  await setWater(userA, 1000);

  const historyA = await loadHistory(userA);
  const historyB = await loadHistory(userB);
  assert(historyA.length === 1, "user A has one past day");
  assert(historyA[0]?.date === past, "user A history is yesterday");
  assert(historyA[0]?.waterMl === 1800, "user A water history");
  assert(historyA[0]?.tasks.some((task) => task.text === "A's homework"), "user A task history");
  assert(!historyA[0]?.tasks.some((task) => task.text === "B's workout"), "user A does not see B tasks");
  assert(!historyA.some((day) => day.tasks.some((task) => task.text === "A today only")), "today is not history");
  assert(historyB[0]?.waterMl === 2500, "user B water history");
  assert(historyB[0]?.tasks.some((task) => task.text === "B's workout"), "user B task history");
  assert(!historyB[0]?.tasks.some((task) => task.text === "A's homework"), "user B does not see A tasks");

  for (const id of [userA, userB]) {
    await supabase.from("tasks").delete().eq("discord_id", id);
    await supabase.from("water_entries").delete().eq("discord_id", id);
    await supabase.from("user_settings").delete().eq("discord_id", id);
    await supabase.from("users").delete().eq("discord_id", id);
  }

  console.log("Database flow tests passed.");
}

testParsers();
await testPersistence();
console.log("All tests passed.");
