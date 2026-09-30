export function splitTasks(input: string): string[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const line of lines) {
    if (!unique.some((existing) => existing.toLowerCase() === line.toLowerCase())) {
      unique.push(line.slice(0, 80));
    }
  }
  return unique.slice(0, 20);
}
