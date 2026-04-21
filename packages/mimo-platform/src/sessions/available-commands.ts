export interface AvailableCommand {
  name: string;
  description?: string;
  template?: string;
}

export function normalizeAvailableCommands(
  input: unknown,
): AvailableCommand[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((command: any): AvailableCommand | null => {
      const name =
        typeof command === "string"
          ? command
          : command?.name || command?.command || command?.id || "";

      if (!name || typeof name !== "string") {
        return null;
      }

      const description =
        typeof command === "object" && typeof command?.description === "string"
          ? command.description
          : undefined;

      const template =
        typeof command === "object"
          ? typeof command?.template === "string"
            ? command.template
            : typeof command?.usage === "string"
              ? command.usage
              : undefined
          : undefined;

      return { name, description, template };
    })
    .filter((command): command is AvailableCommand => command !== null);
}

export function filterAvailableCommands(
  commands: AvailableCommand[],
  query: string,
): AvailableCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return commands;
  }

  return commands.filter((command) => {
    const haystack = `${command.name} ${command.description || ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
