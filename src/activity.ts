import {
  escapeDiscordMarkdown,
  formatMarkdownLink,
  truncate,
} from './format.js';
import { ANONYMOUS_AVATAR_URL } from './types.js';
import type {
  GitHubAccount,
  GitHubRepository,
} from './types.js';

const REPOSITORY_NAME_MAX_LENGTH = 80;
const GITHUB_AVATAR_SIZE = 256;

export interface ActivityPayloadBase {
  repository: GitHubRepository;
  sender: GitHubAccount;
}

export function normalizeUsernames(users: string[]): string[] {
  return users.map((user) => user.toLowerCase());
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

export function resolveRepositoryName(
  payload: ActivityPayloadBase,
  repoName?: string,
): string {
  const override = repoName?.trim();
  if (override) {
    return truncate(override, REPOSITORY_NAME_MAX_LENGTH);
  }

  const name =
    payload.repository.name ??
    payload.repository.full_name.split('/').at(-1) ??
    payload.repository.full_name;
  return truncate(name, REPOSITORY_NAME_MAX_LENGTH);
}

function withAvatarSize(avatarUrl: string): string {
  try {
    const url = new URL(avatarUrl);
    if (url.hostname === 'avatars.githubusercontent.com') {
      url.searchParams.set('s', String(GITHUB_AVATAR_SIZE));
      return url.toString();
    }

    if (url.hostname === 'github.com' && url.pathname.endsWith('.png')) {
      url.searchParams.set('size', String(GITHUB_AVATAR_SIZE));
      return url.toString();
    }
  } catch {
    return avatarUrl;
  }

  return avatarUrl;
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

  return withAvatarSize(
    payload.sender.avatar_url ??
      `https://github.com/${payload.sender.login}.png?size=${GITHUB_AVATAR_SIZE}`,
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
