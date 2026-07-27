import { truncate } from './format.js';
import type { GitHubRepository } from './types.js';

export const GITHUB_AVATAR_SIZE = 256;
const REPOSITORY_NAME_MAX_LENGTH = 80;

export function withGitHubAvatarSize(avatarUrl: string): string {
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

export function buildGitHubAvatarUrl(login: string): string {
  return `https://github.com/${login}.png?size=${GITHUB_AVATAR_SIZE}`;
}

export function resolveRepositoryDisplayName(
  repository: GitHubRepository,
  repoNameOverride?: string,
): string {
  const override = repoNameOverride?.trim();
  if (override) {
    return truncate(override, REPOSITORY_NAME_MAX_LENGTH);
  }

  const name =
    repository.name ??
    repository.full_name.split('/').at(-1) ??
    repository.full_name;

  return truncate(name, REPOSITORY_NAME_MAX_LENGTH);
}
