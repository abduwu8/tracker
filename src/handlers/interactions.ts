import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  MessageFlags,
  type ModalSubmitInteraction,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config.js";
import {
  addTasks,
  loadDay,
  loadHistory,
  markSeen,
  moveUnfinishedToToday,
  resetToday,
  setWater,
  setWaterGoal,
  shouldOfferRollover,
  toggleTask,
} from "../db/queries.js";
import {
  addTaskModal,
  dayMessage,
  goalModal,
  historyMessage,
  ids,
  isTaskButton,
  isWaterSet,
  rolloverMessage,
  waterModal,
} from "../ui/components.js";
import { splitTasks } from "../util/tasks.js";
import { parseWaterAmount } from "../util/water.js";

const handled = new Set<string>();

function takeOnce(id: string): boolean {
  if (handled.has(id)) {
    return false;
  }
  handled.add(id);
  setTimeout(() => handled.delete(id), 30_000);
  return true;
}

export const commands = [
  new SlashCommandBuilder().setName("kyomi").setDescription("Open your daily companion").toJSON(),
];

export async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands });
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!takeOnce(interaction.id)) {
    return;
  }

  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "kyomi") {
      await openKyomi(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === ids.add) {
        await interaction.showModal(addTaskModal());
        return;
      }
      if (interaction.customId === ids.waterCustom) {
        await interaction.showModal(waterModal());
        return;
      }
      if (interaction.customId === ids.goal) {
        await interaction.showModal(goalModal());
        return;
      }
      if (interaction.customId === ids.history) {
        await showHistory(interaction);
        return;
      }
      if (interaction.customId === ids.back) {
        await showToday(interaction);
        return;
      }
      if (interaction.customId === ids.reset) {
        await mutate(interaction, () => resetToday(interaction.user.id));
        return;
      }
      if (interaction.customId === ids.move) {
        await mutate(interaction, () => moveUnfinishedToToday(interaction.user.id));
        return;
      }
      if (interaction.customId === ids.ignore) {
        await mutate(interaction, () => markSeen(interaction.user.id));
        return;
      }

      const waterMl = isWaterSet(interaction.customId);
      if (waterMl !== null) {
        await mutate(interaction, () => setWater(interaction.user.id, waterMl));
        return;
      }

      const taskId = isTaskButton(interaction.customId);
      if (taskId) {
        await mutate(interaction, () => toggleTask(interaction.user.id, taskId));
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === ids.modalAdd) {
        const tasks = splitTasks(interaction.fields.getTextInputValue("tasks"));
        await mutate(interaction, async () => {
          if (tasks.length) {
            await addTasks(interaction.user.id, tasks);
          }
        });
        return;
      }
      if (interaction.customId === ids.modalWater) {
        await mutate(interaction, () =>
          setWater(interaction.user.id, parseWaterAmount(interaction.fields.getTextInputValue("amount")))
        );
        return;
      }
      if (interaction.customId === ids.modalGoal) {
        await mutate(interaction, () =>
          setWaterGoal(interaction.user.id, parseWaterAmount(interaction.fields.getTextInputValue("goal")))
        );
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    console.error(error);
    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        }
      } catch {
        // Interaction may already be acknowledged.
      }
    }
  }
}

async function openKyomi(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const unfinished = await shouldOfferRollover(interaction.user.id);
  if (unfinished > 0) {
    await interaction.editReply(rolloverMessage(unfinished));
    return;
  }
  await markSeen(interaction.user.id);
  const day = await loadDay(interaction.user.id);
  await interaction.editReply(dayMessage(day));
}

async function showHistory(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
  const days = await loadHistory(interaction.user.id);
  await interaction.editReply(historyMessage(days));
}

async function showToday(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
  const day = await loadDay(interaction.user.id);
  await interaction.editReply(dayMessage(day));
}

async function mutate(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  work: () => Promise<void>
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
  await work();
  await showToday(interaction);
}
