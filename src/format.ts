export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export function escapeDiscordMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([`*_~|\[\]<>])/g, '\\$1')
    .replace(/^([#>-])/gm, '\\$1')
    .replace(/^(\d+)\./gm, '$1\\.');
}

export function formatInlineCode(text: string): string {
  const normalized = text.replace(/\r?\n/g, ' ');
  const backtickRuns = normalized.match(/`+/g) ?? [];
  const fenceLength = Math.max(
    1,
    ...backtickRuns.map((run) => run.length + 1),
  );
  const fence = '`'.repeat(fenceLength);
  const needsPadding = normalized.startsWith('`') || normalized.endsWith('`');
  const content = needsPadding ? ` ${normalized} ` : normalized;

  return `${fence}${content}${fence}`;
}

export function formatMarkdownLink(
  label: string,
  url: string,
  hideLinks: boolean,
): string {
  return hideLinks ? label : `[${label}](${url})`;
}
