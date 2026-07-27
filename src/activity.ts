import {
  escapeDiscordMarkdown,
  formatMarkdownLink,
  sliceUtf16Safe,
  truncate,
} from './format.js';
import {
  buildGitHubAvatarUrl,
  withGitHubAvatarSize,
} from './github.js';
import { ANONYMOUS_AVATAR_URL } from './types.js';
import type {
  ContainerComponent,
  GitHubAccount,
  GitHubRepository,
} from './types.js';

export const DEFAULT_ACTIVITY_BODY_MAX_LENGTH = 320;
export const DEFAULT_MAX_TEXT_LENGTH = 4000;
const FIRST_TIME_ASSOCIATIONS = new Set([
  'FIRST_TIMER',
  'FIRST_TIME_CONTRIBUTOR',
]);

export interface ActivityPayloadBase {
  repository: GitHubRepository;
  sender: GitHubAccount;
}

export function normalizeUsernames(users: string[]): string[] {
  return users.map((user) => user.toLowerCase());
}

export function isFirstTimeContributor(
  authorAssociation?: string,
): boolean {
  return (
    authorAssociation !== undefined &&
    FIRST_TIME_ASSOCIATIONS.has(authorAssociation)
  );
}

export function getLabelFilterReason(
  labels: string[],
  allowlist: string[],
  denylist: string[],
  subject: string,
): string | undefined {
  const normalizedLabels = new Set(labels.map((label) => label.toLowerCase()));
  const normalizedAllowlist = allowlist.map((label) => label.toLowerCase());
  const normalizedDenylist = denylist.map((label) => label.toLowerCase());

  if (
    normalizedAllowlist.length > 0 &&
    !normalizedAllowlist.some((label) => normalizedLabels.has(label))
  ) {
    return `${subject} does not have an allowlisted label; skipping.`;
  }

  const denied = normalizedDenylist.find((label) => normalizedLabels.has(label));
  if (denied) {
    return `${subject} has denylisted label "${denied}"; skipping.`;
  }

  return undefined;
}

export function hasListedLabel(
  labels: Array<{ name: string }>,
  listedLabels: string[],
): boolean {
  const normalized = new Set(labels.map((label) => label.name.toLowerCase()));
  return listedLabels.some((label) => normalized.has(label.toLowerCase()));
}

export function accountIsListed(
  account: GitHubAccount,
  users: string[],
): boolean {
  return users.includes(account.login.toLowerCase());
}

export function formatAccount(
  account: GitHubAccount,
  nameAnonUsers: string[],
  fullAnonUsers: string[],
  hideLinks: boolean,
): string {
  if (
    accountIsListed(account, nameAnonUsers) ||
    accountIsListed(account, fullAnonUsers)
  ) {
    return 'Anonymous';
  }

  const login = escapeDiscordMarkdown(account.login);
  return formatMarkdownLink(
    login,
    account.html_url ?? `https://github.com/${account.login}`,
    hideLinks,
  );
}

// Discord rejects webhook usernames containing "clyde". Docs also list
// "discord", but that is not enforced for webhooks — do not reject it.
export function sanitizeWebhookUsername(
  name: string,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed || /clyde/i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function resolveActivityAvatar(
  payload: ActivityPayloadBase,
  nameAnonUsers: string[],
  fullAnonUsers: string[],
): string {
  if (
    accountIsListed(payload.sender, nameAnonUsers) ||
    accountIsListed(payload.sender, fullAnonUsers)
  ) {
    return ANONYMOUS_AVATAR_URL;
  }

  return withGitHubAvatarSize(
    payload.sender.avatar_url ?? buildGitHubAvatarUrl(payload.sender.login),
  );
}

export function sanitizeBody(body: string | null, maxLength: number): string {
  if (!body || maxLength <= 0) {
    return '';
  }

  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return truncate(cleaned, maxLength);
}

export function formatBody(body: string): string {
  return body
    .split('\n')
    .map((line) => `> ${escapeDiscordMarkdown(line)}`)
    .join('\n');
}

export function formatAccountList(
  users: GitHubAccount[],
  nameAnonUsers: string[],
  fullAnonUsers: string[],
  hideLinks: boolean,
): string {
  return users
    .slice(0, 5)
    .map((user) =>
      formatAccount(user, nameAnonUsers, fullAnonUsers, hideLinks),
    )
    .join(', ');
}

export function enforceActivityTextBudget(
  components: ContainerComponent['components'],
  maxTextLength: number = DEFAULT_MAX_TEXT_LENGTH,
): void {
  let totalLength = components.reduce(
    (total, component) =>
      component.type === 10 ? total + component.content.length : total,
    0,
  );

  for (let index = components.length - 1; index >= 0; index -= 1) {
    if (totalLength <= maxTextLength) {
      return;
    }

    const component = components[index];
    if (component.type !== 10) {
      continue;
    }

    const overage = totalLength - maxTextLength;
    const targetLength = component.content.length - overage;
    if (targetLength <= 0) {
      totalLength -= component.content.length;
      components.splice(index, 1);
      continue;
    }

    const suffix = targetLength >= 3 ? '...' : '.'.repeat(targetLength);
    const prefixLength = Math.max(0, targetLength - suffix.length);
    component.content = `${sliceUtf16Safe(component.content, prefixLength)}${suffix}`;
    totalLength = maxTextLength;
  }
}
