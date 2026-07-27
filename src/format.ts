export function sliceUtf16Safe(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  const sliced = text.slice(0, maxLength);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    return sliced.slice(0, -1);
  }

  return sliced;
}

export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return sliceUtf16Safe(text, maxLength);
  }

  return `${sliceUtf16Safe(text, maxLength - 3)}...`;
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
