export function parseWaterAmount(input: string): number {
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  const match = raw.match(/^(\d+(?:\.\d+)?)(ml|l)?$/);
  if (!match) {
    throw new Error("Enter an amount like 1.8L, 2L, or 1800ml.");
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Enter a valid water amount.");
  }

  const unit = match[2];
  if (unit === "ml") {
    return Math.round(value);
  }
  if (unit === "l") {
    return Math.round(value * 1000);
  }

  return value > 20 ? Math.round(value) : Math.round(value * 1000);
}

export function formatLiters(ml: number): string {
  const liters = ml / 1000;
  if (Number.isInteger(liters)) {
    return `${liters}L`;
  }
  return `${Number(liters.toFixed(2))}L`;
}

export function progressBar(currentMl: number, goalMl: number, width = 10): string {
  if (goalMl <= 0) {
    return "░".repeat(width);
  }
  const filled = Math.max(0, Math.min(width, Math.round((currentMl / goalMl) * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}
