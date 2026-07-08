import type {
  BuildMessageOptions,
  DiscordComponentsMessage,
  GitHubUser,
  PushCommit,
  PushPayload,
} from './types.js';
import { colorFromRepoName } from './color.js';
import {
  IS_COMPONENTS_V2,
} from './types.js';

const DEFAULT_ANON_KEYWORD = '!anon';
const DEFAULT_MAX_COMMITS = 10;
const DEFAULT_MAX_TEXT_LENGTH = 4000;
const DEFAULT_MAX_TITLE_LENGTH = 72;
const DEFAULT_MAX_DESCRIPTION_LENGTH = 320;
const DISCORD_WEBHOOK_USERNAME_MAX_LENGTH = 80;
const GITHUB_AVATAR_SIZE = 256;
const CO_AUTHOR_REGEX = /^Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim;
const NOREPLY_EMAIL_REGEX = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i;
const PR_REF_REGEX = /\(#(\d+)\)/g;
const COMMIT_BLOCK_SEPARATOR = '\n\n';

export function parseBranch(ref: string): string {
  const prefix = 'refs/heads/';
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

export function buildBranchUrl(repoHtmlUrl: string, branch: string): string {
  const repoUrl = repoHtmlUrl.replace(/\/$/, '');
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/');
  return `${repoUrl}/tree/${encodedBranch}`;
}

export function resolveUsername(user: GitHubUser): string | undefined {
  if (user.username) {
    return user.username;
  }

  const match = user.email.match(NOREPLY_EMAIL_REGEX);
  return match?.[1];
}

export function formatGitHubUser(user: GitHubUser): string {
  const username = resolveUsername(user);
  if (username) {
    return `[${user.name}](https://github.com/${username})`;
  }

  return user.name;
}

export function isMeaningfullyDifferent(
  author: GitHubUser,
  committer: GitHubUser,
): boolean {
  const authorUsername = resolveUsername(author);
  const committerUsername = resolveUsername(committer);

  if (authorUsername && committerUsername) {
    return authorUsername !== committerUsername;
  }

  return (
    author.name.trim().toLowerCase() !== committer.name.trim().toLowerCase() ||
    author.email.trim().toLowerCase() !== committer.email.trim().toLowerCase()
  );
}

export interface ParsedCoAuthor {
  name: string;
  email: string;
}

export function parseCoAuthors(message: string): ParsedCoAuthor[] {
  const coAuthors: ParsedCoAuthor[] = [];

  for (const match of message.matchAll(CO_AUTHOR_REGEX)) {
    coAuthors.push({
      name: match[1].trim(),
      email: match[2].trim(),
    });
  }

  return coAuthors;
}

export function getCommitTitle(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return firstLine;
}

export function getCommitDescription(message: string): string {
  const body = message.split(/\r?\n/).slice(1).join('\n').trim();
  if (!body) {
    return '';
  }

  return body
    .replace(CO_AUTHOR_REGEX, '')
    .replace(/^-{5,}\s*$/gim, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export function linkPrReferences(title: string, repoHtmlUrl: string): string {
  const repoUrl = repoHtmlUrl.replace(/\/$/, '');
  return title.replace(
    PR_REF_REGEX,
    (_, num) => `([#${num}](${repoUrl}/pull/${num}))`,
  );
}

export function formatCommitTitle(
  message: string,
  maxTitleLength: number,
  repoHtmlUrl: string,
): string {
  const rawTitle = getCommitTitle(message);
  const trailingPrMatch = rawTitle.match(/\s*\(#\d+\)\s*$/);

  if (!trailingPrMatch) {
    return linkPrReferences(truncate(rawTitle, maxTitleLength), repoHtmlUrl);
  }

  const prSuffix = trailingPrMatch[0];
  const baseTitle = rawTitle.slice(0, -prSuffix.length).trimEnd();
  const maxBaseLength = maxTitleLength - prSuffix.length;

  if (maxBaseLength <= 0) {
    return linkPrReferences(truncate(rawTitle, maxTitleLength), repoHtmlUrl);
  }

  return linkPrReferences(truncate(baseTitle, maxBaseLength) + prSuffix, repoHtmlUrl);
}

export function isAnonymousCommit(message: string, anonKeyword: string): boolean {
  const lines = message.split(/\r?\n/);

  for (let index = 1; index < lines.length; index++) {
    const trimmedLine = lines[index].trim();
    if (trimmedLine === '') {
      continue;
    }

    return trimmedLine === anonKeyword;
  }

  return false;
}

export function formatCommitAttribution(
  author: GitHubUser,
  coAuthors: ParsedCoAuthor[],
): string {
  const authorText = formatGitHubUser(author);
  const peopleText =
    coAuthors.length === 0
      ? authorText
      : `${authorText} & ${coAuthors
          .map((coAuthor) =>
            formatGitHubUser({
              name: coAuthor.name,
              email: coAuthor.email,
            }),
          )
          .join(', ')}`;

  return `*by* ${peopleText}`;
}

function formatCommitDescription(message: string, maxDescriptionLength: number): string {
  const description = truncate(getCommitDescription(message), maxDescriptionLength);
  if (!description) {
    return '';
  }

  const quoted = description
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');

  return `\n${quoted}`;
}

function formatCommitLine(
  commit: PushCommit,
  anonKeyword: string,
  maxTitleLength: number,
  maxDescriptionLength: number,
  repoHtmlUrl: string,
): string {
  if (isAnonymousCommit(commit.message, anonKeyword)) {
    return '`Anonymous commit`';
  }

  const shortSha = commit.id.slice(0, 7);
  const title = formatCommitTitle(commit.message, maxTitleLength, repoHtmlUrl);
  const attributionText = formatCommitAttribution(
    commit.author,
    parseCoAuthors(commit.message),
  );
  const descriptionText = formatCommitDescription(
    commit.message,
    maxDescriptionLength,
  );

  return `[\`${shortSha}\`](${commit.url}) ${title}\n${attributionText}${descriptionText}`;
}

function buildHeader(
  payload: PushPayload,
  branch: string,
  commitCount: number,
  hasMixedAnonymous: boolean,
): string {
  const repo = payload.repository.full_name;
  const branchUrl = buildBranchUrl(payload.repository.html_url, branch);
  const branchLabel = hasMixedAnonymous
    ? `\`${repo}/${branch}\``
    : `[\`${repo}/${branch}\`](${branchUrl})`;
  const commitLabel = commitCount === 1 ? 'commit' : 'commits';
  const actor = payload.sender.login;

  return `**[${actor}](https://github.com/${actor})** is pushing ${commitCount} ${commitLabel} to ${branchLabel}`;
}

function withGitHubAvatarSize(avatarUrl: string): string {
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

function buildGitHubAvatarUrl(login: string): string {
  return `https://github.com/${login}.png?size=${GITHUB_AVATAR_SIZE}`;
}

function getRepositoryName(payload: PushPayload): string {
  const repoName =
    payload.repository.name ??
    payload.repository.full_name.split('/').at(-1) ??
    payload.repository.full_name;

  return truncate(repoName, DISCORD_WEBHOOK_USERNAME_MAX_LENGTH);
}

function buildWebhookAvatarUrl(payload: PushPayload): string {
  const avatarUrl = payload.sender.avatar_url ?? buildGitHubAvatarUrl(payload.sender.login);

  return withGitHubAvatarSize(avatarUrl);
}

function buildCommitLines(
  commits: PushCommit[],
  anonKeyword: string,
  maxCommits: number,
  maxTitleLength: number,
  maxDescriptionLength: number,
  repoHtmlUrl: string,
): string[] {
  const lines: string[] = [];

  for (const [index, commit] of commits.entries()) {
    if (index >= maxCommits) {
      lines.push(`+ ${commits.length - maxCommits} more...`);
      break;
    }

    lines.push(
      formatCommitLine(
        commit,
        anonKeyword,
        maxTitleLength,
        maxDescriptionLength,
        repoHtmlUrl,
      ),
    );
  }

  return lines;
}

function trimLinesToMaxLength(lines: string[], maxTextLength: number): string[] {
  const result: string[] = [];
  let totalLength = 0;

  for (const line of lines) {
    const separatorLength = result.length > 0 ? COMMIT_BLOCK_SEPARATOR.length : 0;
    if (totalLength + separatorLength + line.length > maxTextLength) {
      const remaining = lines.length - result.length;
      if (remaining > 0) {
        result.push(`+ ${remaining} more...`);
      }
      break;
    }

    totalLength += separatorLength + line.length;
    result.push(line);
  }

  return result;
}

export function buildDiscordMessage(
  payload: PushPayload,
  options: BuildMessageOptions = {},
): DiscordComponentsMessage {
  const anonKeyword = options.anonKeyword ?? DEFAULT_ANON_KEYWORD;
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
  const maxTitleLength = options.maxTitleLength ?? DEFAULT_MAX_TITLE_LENGTH;
  const maxDescriptionLength =
    options.maxDescriptionLength ?? DEFAULT_MAX_DESCRIPTION_LENGTH;

  const branch = parseBranch(payload.ref);
  const commits = payload.commits;
  const hasAnonymous = commits.some((commit) =>
    isAnonymousCommit(commit.message, anonKeyword),
  );
  const hasMixedAnonymous =
    hasAnonymous &&
    !commits.every((commit) => isAnonymousCommit(commit.message, anonKeyword));

  const header = buildHeader(payload, branch, commits.length, hasMixedAnonymous);
  const lines = buildCommitLines(
    commits,
    anonKeyword,
    maxCommits,
    maxTitleLength,
    maxDescriptionLength,
    payload.repository.html_url,
  );
  const commitContent = trimLinesToMaxLength(lines, maxTextLength).join(
    COMMIT_BLOCK_SEPARATOR,
  );

  const containerComponents: DiscordComponentsMessage['components'][0]['components'] =
    [
      {
        type: 10,
        content: header,
      },
      {
        type: 14,
        divider: true,
        spacing: 1,
      },
      {
        type: 10,
        content: commitContent,
      },
    ];

  if (!hasAnonymous) {
    containerComponents.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: 'View changes',
          url: payload.compare,
        },
      ],
    });
  }

  return {
    username: getRepositoryName(payload),
    avatar_url: buildWebhookAvatarUrl(payload),
    flags: IS_COMPONENTS_V2,
    allowed_mentions: {
      parse: [],
    },
    components: [
      {
        type: 17,
        accent_color: colorFromRepoName(payload.repository.full_name),
        components: containerComponents,
      },
    ],
  };
}

export function shouldSkipPush(
  payload: PushPayload,
  skipBots: boolean,
): string | undefined {
  if (!payload.commits || payload.commits.length === 0) {
    return 'No commits in push payload; skipping.';
  }

  if (skipBots && payload.sender.type === 'Bot') {
    return 'Push sender is a bot; skipping.';
  }

  return undefined;
}
