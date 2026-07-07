import type {
  BuildMessageOptions,
  DiscordComponentsMessage,
  GitHubUser,
  PushCommit,
  PushPayload,
} from './types.js';
import {
  ACCENT_COLOR,
  ANONYMOUS_AVATAR_URL,
  IS_COMPONENTS_V2,
} from './types.js';

const DEFAULT_ANON_KEYWORD = '!anon';
const DEFAULT_MAX_COMMITS = 10;
const DEFAULT_MAX_TEXT_LENGTH = 4000;
const DEFAULT_MAX_TITLE_LENGTH = 72;
const CO_AUTHOR_REGEX = /^Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim;
const NOREPLY_EMAIL_REGEX = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i;

export function parseBranch(ref: string): string {
  const prefix = 'refs/heads/';
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
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

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export function isAnonymousCommit(message: string, anonKeyword: string): boolean {
  return message.includes(anonKeyword);
}

function formatCoAuthors(coAuthors: ParsedCoAuthor[]): string {
  if (coAuthors.length === 0) {
    return '';
  }

  const formatted = coAuthors.map((coAuthor) =>
    formatGitHubUser({
      name: coAuthor.name,
      email: coAuthor.email,
    }),
  );

  if (formatted.length === 1) {
    return `, co-authored with ${formatted[0]}`;
  }

  const last = formatted.at(-1);
  const rest = formatted.slice(0, -1).join(', ');
  return `, co-authored with ${rest}, and ${last}`;
}

function formatCommitter(committer: GitHubUser): string {
  return ` (committed by ${formatGitHubUser(committer)})`;
}

function formatCommitLine(
  commit: PushCommit,
  anonKeyword: string,
  anonymousIndex: number | undefined,
  maxTitleLength: number,
): string {
  if (isAnonymousCommit(commit.message, anonKeyword)) {
    if (anonymousIndex === 1) {
      return '`Anonymous commit`';
    }

    return `\`Anonymous commit #${anonymousIndex}\``;
  }

  const shortSha = commit.id.slice(0, 7);
  const title = truncate(getCommitTitle(commit.message), maxTitleLength);
  const authorText = formatGitHubUser(commit.author);
  const coAuthorText = formatCoAuthors(parseCoAuthors(commit.message));
  const committerText = isMeaningfullyDifferent(commit.author, commit.committer)
    ? formatCommitter(commit.committer)
    : '';

  return `[\`${shortSha}\`](${commit.url}) — ${title} — ${authorText}${coAuthorText}${committerText}`;
}

function buildHeader(
  payload: PushPayload,
  branch: string,
  commitCount: number,
  allAnonymous: boolean,
  hasAnonymous: boolean,
): string {
  const repo = payload.repository.full_name;
  const branchLabel = hasAnonymous
    ? `\`${repo}/${branch}\``
    : `[\`${repo}/${branch}\`](${payload.compare})`;
  const commitLabel = commitCount === 1 ? 'commit' : 'commits';

  if (allAnonymous) {
    return `**Anonymous** is pushing ${commitCount} ${commitLabel} to ${branchLabel}`;
  }

  const actor = payload.sender.login;
  return `**[@${actor}](https://github.com/${actor})** is pushing ${commitCount} ${commitLabel} to ${branchLabel}`;
}

function buildAvatarUrl(payload: PushPayload, allAnonymous: boolean): string {
  if (allAnonymous) {
    return ANONYMOUS_AVATAR_URL;
  }

  return (
    payload.sender.avatar_url ??
    `https://github.com/${payload.sender.login}.png?size=64`
  );
}

function buildCommitLines(
  commits: PushCommit[],
  anonKeyword: string,
  maxCommits: number,
  maxTitleLength: number,
): string[] {
  const lines: string[] = [];
  let anonymousCounter = 0;

  for (const [index, commit] of commits.entries()) {
    if (index >= maxCommits) {
      lines.push(`+ ${commits.length - maxCommits} more...`);
      break;
    }

    const anonymous = isAnonymousCommit(commit.message, anonKeyword);
    if (anonymous) {
      anonymousCounter += 1;
    }

    lines.push(
      formatCommitLine(
        commit,
        anonKeyword,
        anonymous ? anonymousCounter : undefined,
        maxTitleLength,
      ),
    );
  }

  return lines;
}

function trimLinesToMaxLength(lines: string[], maxTextLength: number): string[] {
  const result: string[] = [];
  let totalLength = 0;

  for (const line of lines) {
    const separatorLength = result.length > 0 ? 1 : 0;
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

  const branch = parseBranch(payload.ref);
  const commits = payload.commits;
  const hasAnonymous = commits.some((commit) =>
    isAnonymousCommit(commit.message, anonKeyword),
  );
  const allAnonymous =
    commits.length > 0 &&
    commits.every((commit) => isAnonymousCommit(commit.message, anonKeyword));

  const header = buildHeader(
    payload,
    branch,
    commits.length,
    allAnonymous,
    hasAnonymous,
  );
  const avatarUrl = buildAvatarUrl(payload, allAnonymous);
  const lines = buildCommitLines(
    commits,
    anonKeyword,
    maxCommits,
    maxTitleLength,
  );
  const commitContent = trimLinesToMaxLength(lines, maxTextLength).join('\n');

  const containerComponents: DiscordComponentsMessage['components'][0]['components'] =
    [
      {
        type: 9,
        components: [
          {
            type: 10,
            content: header,
          },
        ],
        accessory: {
          type: 11,
          media: {
            url: avatarUrl,
          },
          description: allAnonymous ? 'Anonymous' : payload.sender.login,
        },
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
    flags: IS_COMPONENTS_V2,
    allowed_mentions: {
      parse: [],
    },
    components: [
      {
        type: 17,
        accent_color: ACCENT_COLOR,
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
