function parseCommaSeparatedList(
  input: string,
  lowercase: boolean,
): string[] {
  const entries = input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return lowercase
    ? entries.map((entry) => entry.toLowerCase())
    : entries;
}

export function parseBranchList(input: string): string[] {
  return parseCommaSeparatedList(input, false);
}

export function parseUsernameList(input: string): string[] {
  return parseCommaSeparatedList(input, true);
}

export function parseActionList(input: string): string[] {
  return parseCommaSeparatedList(input, true);
}
