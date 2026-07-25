import {
  accountIsListed,
  formatAccount,
  formatAccountList,
  formatBody,
  normalizeUsernames,
  resolveActivityAvatar,
  resolveRepositoryName,
  sanitizeBody,
} from './activity.js';
import {
  escapeDiscordMarkdown,
  formatInlineCode,
  formatMarkdownLink,
  truncate,
} from './format.js';
import {
  IS_COMPONENTS_V2,
} from './types.js';
import type {
  BuildPullRequestMessageOptions,
  DiscordComponentsMessage,
  PullRequestPayload,
} from './types.js';

export const DEFAULT_PULL_REQUEST_ACTIONS = [
  'opened',
  'reopened',
  'converted_to_draft',
  'ready_for_review',
  'closed',
] as const;

export const SUPPORTED_PULL_REQUEST_ACTIONS = [
  ...DEFAULT_PULL_REQUEST_ACTIONS,
  'synchronize',
] as const;

const DEFAULT_BODY_MAX_LENGTH = 320;
const FIRST_TIME_ASSOCIATIONS = new Set([
  'FIRST_TIMER',
  'FIRST_TIME_CONTRIBUTOR',
]);

const PR_COLORS = {
  active: 0x2f81f7,
  draft: 0x8c959f,
  merged: 0x8250df,
  closed: 0xcf222e,
} as const;

const DEFAULT_DETAILS = [
  'body',
  'labels',
  'reviewers',
  'assignees',
  'stats',
];

export function parseActionList(input: string): string[] {
  return input
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function shouldSkipPullRequest(
  payload: PullRequestPayload,
  skipBots: boolean,
  actions: readonly string[] = DEFAULT_PULL_REQUEST_ACTIONS,
): string | undefined {
  if (skipBots && payload.sender.type === 'Bot') {
    return 'Pull request sender is a bot; skipping.';
  }

  if (!actions.includes(payload.action)) {
    return `Pull request action "${payload.action}" is not enabled; skipping.`;
  }

  return undefined;
}

function getActionLabel(payload: PullRequestPayload): string {
  if (payload.action === 'closed') {
    return payload.pull_request.merged ? 'merged' : 'closed';
  }

  const labels: Record<string, string> = {
    opened: payload.pull_request.draft ? 'opened a draft' : 'opened',
    reopened: 'reopened',
    converted_to_draft: 'converted to draft',
    ready_for_review: 'marked ready for review',
    synchronize: 'updated',
  };

  return labels[payload.action] ?? payload.action.replaceAll('_', ' ');
}

export function getPullRequestColor(payload: PullRequestPayload): number {
  if (payload.action === 'closed') {
    return payload.pull_request.merged ? PR_COLORS.merged : PR_COLORS.closed;
  }

  if (payload.pull_request.draft || payload.action === 'converted_to_draft') {
    return PR_COLORS.draft;
  }

  return PR_COLORS.active;
}

function buildMetadata(
  payload: PullRequestPayload,
  details: Set<string>,
  nameAnonUsers: string[],
  fullAnonUsers: string[],
  hideLinks: boolean,
  highlightFirstTimeContributors: boolean,
): string {
  const pullRequest = payload.pull_request;
  const rows: string[] = [];
  const author = formatAccount(
    pullRequest.user,
    nameAnonUsers,
    fullAnonUsers,
    hideLinks,
  );
  const firstTime =
    highlightFirstTimeContributors &&
    pullRequest.author_association &&
    FIRST_TIME_ASSOCIATIONS.has(pullRequest.author_association)
      ? ' · **First-time contributor**'
      : '';
  rows.push(`**Author:** ${author}${firstTime}`);

  const headLabel = pullRequest.head.label ?? pullRequest.head.ref;
  rows.push(
    `**Branches:** ${formatInlineCode(headLabel)} → ${formatInlineCode(pullRequest.base.ref)}`,
  );

  if (details.has('stats')) {
    const additions = pullRequest.additions ?? 0;
    const deletions = pullRequest.deletions ?? 0;
    const changedFiles = pullRequest.changed_files ?? 0;
    rows.push(
      `**Changes:** +${additions} −${deletions} across ${changedFiles} ${changedFiles === 1 ? 'file' : 'files'}`,
    );
  }

  if (details.has('labels') && pullRequest.labels.length > 0) {
    rows.push(
      `**Labels:** ${pullRequest.labels
        .slice(0, 8)
        .map((label) => formatInlineCode(label.name))
        .join(' ')}`,
    );
  }

  if (details.has('reviewers')) {
    const reviewers = formatAccountList(
      pullRequest.requested_reviewers,
      nameAnonUsers,
      fullAnonUsers,
      hideLinks,
    );
    const teams = (pullRequest.requested_teams ?? [])
      .slice(0, 5)
      .map((team) => escapeDiscordMarkdown(team.name))
      .join(', ');
    const requested = [reviewers, teams].filter(Boolean).join(', ');
    if (requested) {
      rows.push(`**Reviewers:** ${requested}`);
    }
  }

  if (details.has('assignees') && pullRequest.assignees.length > 0) {
    rows.push(
      `**Assignees:** ${formatAccountList(
        pullRequest.assignees,
        nameAnonUsers,
        fullAnonUsers,
        hideLinks,
      )}`,
    );
  }

  return rows.join('\n');
}

export function buildPullRequestMessage(
  payload: PullRequestPayload,
  options: BuildPullRequestMessageOptions = {},
): DiscordComponentsMessage {
  const useSenderAvatar = options.useSenderAvatar ?? true;
  const useRepoUsername = options.useRepoUsername ?? true;
  const hideLinks = options.hideLinks ?? false;
  const compactMode = options.compactMode ?? false;
  const nameAnonUsers = normalizeUsernames(options.nameAnonUsers ?? []);
  const fullAnonUsers = normalizeUsernames(options.fullAnonUsers ?? []);
  const details = new Set(options.details ?? DEFAULT_DETAILS);
  const bodyMaxLength = options.bodyMaxLength ?? DEFAULT_BODY_MAX_LENGTH;
  const highlightFirstTimeContributors =
    options.highlightFirstTimeContributors ?? true;
  const pullRequest = payload.pull_request;
  const isRedacted = accountIsListed(pullRequest.user, fullAnonUsers);
  const actor = formatAccount(
    payload.sender,
    nameAnonUsers,
    fullAnonUsers,
    hideLinks || isRedacted,
  );
  const action = getActionLabel(payload);

  const components: DiscordComponentsMessage['components'][0]['components'] = [];

  if (isRedacted) {
    components.push({
      type: 10,
      content: `**${actor}** ${escapeDiscordMarkdown(action)} a redacted pull request`,
    });
  } else {
    const numberLabel = `#${pullRequest.number}`;
    const linkedNumber = formatMarkdownLink(
      numberLabel,
      pullRequest.html_url,
      hideLinks,
    );
    components.push({
      type: 10,
      content: `**${actor}** ${escapeDiscordMarkdown(action)} pull request ${linkedNumber}`,
    });
    components.push({ type: 14, divider: true, spacing: 1 });
    components.push({
      type: 10,
      content: `### ${escapeDiscordMarkdown(truncate(pullRequest.title, 256))}`,
    });

    if (!compactMode) {
      components.push({
        type: 10,
        content: buildMetadata(
          payload,
          details,
          nameAnonUsers,
          fullAnonUsers,
          hideLinks,
          highlightFirstTimeContributors,
        ),
      });

      if (details.has('body')) {
        const body = sanitizeBody(pullRequest.body, bodyMaxLength);
        if (body) {
          components.push({ type: 10, content: formatBody(body) });
        }
      }
    }

    if (!hideLinks) {
      const baseUrl = pullRequest.html_url.replace(/\/$/, '');
      components.push({
        type: 1,
        components: [
          { type: 2, style: 5, label: 'View pull request', url: baseUrl },
          { type: 2, style: 5, label: 'Files changed', url: `${baseUrl}/files` },
          { type: 2, style: 5, label: 'Checks', url: `${baseUrl}/checks` },
        ],
      });
    }
  }

  const message: DiscordComponentsMessage = {
    flags: IS_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color:
          options.accentColor ?? getPullRequestColor(payload),
        components,
      },
    ],
  };

  if (useRepoUsername) {
    message.username = resolveRepositoryName(payload, options.repoName);
  }

  if (useSenderAvatar) {
    message.avatar_url = resolveActivityAvatar(
      payload,
      nameAnonUsers,
      fullAnonUsers,
    );
  }

  return message;
}
