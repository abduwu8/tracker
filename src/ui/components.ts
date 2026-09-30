import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { DayState, HistoryDay, Task } from "../db/queries.js";
import { formatHistoryDate, formatLongDate } from "../util/dates.js";
import { formatLiters, progressBar } from "../util/water.js";
import { emojiComponent, emojiText } from "./emojis.js";

const COLOR = 0xc9b8a8;
const WATER_PRESETS = [
  { label: "1L", ml: 1000 },
  { label: "1.5L", ml: 1500 },
  { label: "2L", ml: 2000 },
  { label: "2.5L", ml: 2500 },
] as const;

export const ids = {
  add: "kyomi:add",
  reset: "kyomi:reset",
  move: "kyomi:move",
  ignore: "kyomi:ignore",
  goal: "kyomi:goal",
  history: "kyomi:history",
  back: "kyomi:back",
  waterCustom: "kyomi:water-custom",
  modalAdd: "kyomi:modal-add",
  modalWater: "kyomi:modal-water",
  modalGoal: "kyomi:modal-goal",
  task: (id: string) => `kyomi:task:${id}`,
  waterSet: (ml: number) => `kyomi:w:${ml}`,
};

export const v2Flags = MessageFlags.IsComponentsV2 as const;

export function isTaskButton(customId: string): string | null {
  const prefix = "kyomi:task:";
  return customId.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

export function isWaterSet(customId: string): number | null {
  const prefix = "kyomi:w:";
  if (!customId.startsWith(prefix)) {
    return null;
  }
  const ml = Number(customId.slice(prefix.length));
  return Number.isFinite(ml) ? ml : null;
}

function withEmoji(button: ButtonBuilder, name: string): ButtonBuilder {
  const emoji = emojiComponent(name);
  return emoji ? button.setEmoji(emoji) : button;
}

export function dayMessage(day: DayState) {
  const completed = day.tasks.filter((task) => task.completed).length;
  const waterLogged = day.waterMl !== null;
  const dayComplete = day.tasks.length > 0 && completed === day.tasks.length && waterLogged;
  const love = emojiText("Witch_InLove_VH");
  const thumbs = emojiText("joobithumbsup");
  const sigh = emojiText("Sigh");
  const blep = emojiText("blep");

  const header = dayComplete
    ? `${love} **KYOMI**\n${formatLongDate(day.date)}\n\n**TASKS**  ${completed} / ${day.tasks.length} completed ${thumbs}`
    : `${love} **KYOMI**\n*your daily companion*`;

  const waterLine = waterText(day, thumbs, blep);
  const containers: ContainerBuilder[] = [];
  let current = new ContainerBuilder().setAccentColor(COLOR);
  current.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

  if (!dayComplete) {
    current.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    current.addTextDisplayComponents(new TextDisplayBuilder().setContent("**TODAY**"));

    if (!day.tasks.length) {
      current.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${sigh} No tasks yet.`)
      );
    }
  }

  for (const task of day.tasks.slice(0, 20)) {
    if (current.components.length >= 9) {
      containers.push(current);
      current = new ContainerBuilder().setAccentColor(COLOR);
    }
    current.addActionRowComponents(taskRow(task));
  }

  if (current.components.length >= 8) {
    containers.push(current);
    current = new ContainerBuilder().setAccentColor(COLOR);
  }

  current.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  current.addTextDisplayComponents(new TextDisplayBuilder().setContent(waterLine));
  current.addActionRowComponents(waterRow());
  current.addActionRowComponents(actionRow());
  containers.push(current);

  return {
    flags: v2Flags,
    components: containers,
  };
}

export function rolloverMessage(count: number) {
  const shock = emojiText("Witch_Shock_VH", "");
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${shock} **KYOMI**\nYesterday you had ${count} unfinished task${count === 1 ? "" : "s"}.`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        withEmoji(
          new ButtonBuilder().setCustomId(ids.move).setLabel("Move to today").setStyle(ButtonStyle.Primary),
          "joobithumbsup"
        ),
        withEmoji(
          new ButtonBuilder().setCustomId(ids.ignore).setLabel("Ignore").setStyle(ButtonStyle.Secondary),
          "02_Pfft"
        )
      )
    );

  return {
    flags: v2Flags,
    components: [container],
  };
}

export function historyMessage(days: HistoryDay[]) {
  const love = emojiText("Witch_InLove_VH");
  const sigh = emojiText("Sigh");
  const header = `${love} **KYOMI**\n**HISTORY**\nYour past water and tasks. Only you can see this.`;
  const body = days.length
    ? days.map(formatHistoryDay).join("\n\n")
    : `${sigh} No past days yet. After a few days, your water and tasks will show up here.`;

  const containers: ContainerBuilder[] = [];
  let current = new ContainerBuilder().setAccentColor(COLOR);
  current.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
  current.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  for (const chunk of chunkText(body)) {
    if (current.components.length >= 9) {
      containers.push(current);
      current = new ContainerBuilder().setAccentColor(COLOR);
    }
    current.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
  }

  if (current.components.length >= 9) {
    containers.push(current);
    current = new ContainerBuilder().setAccentColor(COLOR);
  }

  current.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      withEmoji(
        new ButtonBuilder().setCustomId(ids.back).setLabel("Back to today").setStyle(ButtonStyle.Primary),
        "joobithumbsup"
      )
    )
  );
  containers.push(current);

  return {
    flags: v2Flags,
    components: containers,
  };
}

export function addTaskModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ids.modalAdd)
    .setTitle("Add tasks")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("tasks")
          .setLabel("What do you wanna get done?")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("study dsa\nclean room\nfinish assignment")
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
}

export function waterModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ids.modalWater)
    .setTitle("Water")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("How much water did you drink today?")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("1.8L")
          .setRequired(true)
          .setMaxLength(20)
      )
    );
}

export function goalModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ids.modalGoal)
    .setTitle("Water goal")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("goal")
          .setLabel("Daily water goal")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("2L")
          .setRequired(true)
          .setMaxLength(20)
      )
    );
}

function taskRow(task: Task): ActionRowBuilder<ButtonBuilder> {
  const toggle = new ButtonBuilder()
    .setCustomId(ids.task(task.id))
    .setLabel(truncate(task.text, 70))
    .setStyle(task.completed ? ButtonStyle.Success : ButtonStyle.Secondary);

  if (task.completed) {
    toggle.setEmoji("✅");
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(toggle);
}

function waterRow(): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const preset of WATER_PRESETS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(ids.waterSet(preset.ml))
        .setLabel(preset.label)
        .setStyle(ButtonStyle.Secondary)
    );
  }
  row.addComponents(
    withEmoji(
      new ButtonBuilder().setCustomId(ids.waterCustom).setLabel("Other").setStyle(ButtonStyle.Secondary),
      "den_ehe"
    )
  );
  return row;
}

function actionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    withEmoji(
      new ButtonBuilder().setCustomId(ids.add).setLabel("Add Task").setStyle(ButtonStyle.Primary),
      "Witch_InLove_VH"
    ),
    withEmoji(
      new ButtonBuilder().setCustomId(ids.goal).setLabel("Water Goal").setStyle(ButtonStyle.Secondary),
      "side_eyeing"
    ),
    withEmoji(
      new ButtonBuilder().setCustomId(ids.history).setLabel("History").setStyle(ButtonStyle.Secondary),
      "den_ehe"
    ),
    withEmoji(
      new ButtonBuilder().setCustomId(ids.reset).setLabel("Reset Day").setStyle(ButtonStyle.Secondary),
      "02_Pfft"
    )
  );
}

function waterText(day: DayState, thumbs: string, blep: string): string {
  const goal = formatLiters(day.waterGoalMl);
  if (day.waterMl === null) {
    return `**WATER**  ${blep}  — / ${goal} water goal\nTap how much you drank.`;
  }
  const done = (day.waterMl ?? 0) >= day.waterGoalMl;
  const mark = done ? thumbs : blep;
  return `**WATER**  ${mark}  ${progressBar(day.waterMl, day.waterGoalMl)}  ${formatLiters(day.waterMl)} / ${goal} water goal`;
}

function formatHistoryDay(day: HistoryDay): string {
  const water = day.waterMl === null ? "not logged" : formatLiters(day.waterMl);
  const tasks = day.tasks.length
    ? day.tasks.map((task) => `${task.completed ? "✅" : "•"} ${task.text}`).join("\n")
    : "• none";
  return `**${formatHistoryDate(day.date)}**\nWater  ${water}\nTasks\n${tasks}`;
}

function chunkText(text: string, size = 3800): string[] {
  if (text.length <= size) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length) {
    if (remaining.length <= size) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n\n", size);
    if (cut < size / 2) {
      cut = size;
    }
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
