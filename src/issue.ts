import {
  accountIsListed,
  formatAccount,
  formatAccountList,
  formatBody,
  isFirstTimeContributor,
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
import { IS_COMPONENTS_V2 } from './types.js';
import type {
  BuildIssueMessageOptions,
  DiscordComponentsMessage,
  IssuesPayload,
} from './types.js';

export const DEFAULT_ISSUE_ACTIONS = [
  'opened',
  'reopened',
  'closed',
] as const;

export const SUPPORTED_ISSUE_ACTIONS = [...DEFAULT_ISSUE_ACTIONS] as const;

const DEFAULT_BODY_MAX_LENGTH = 320;
const DEFAULT_DETAILS = ['body', 'type', 'labels', 'assignees', 'milestone'];
const ISSUE_COLORS = {
  open: 0x1f883d,
  closed: 0x8250df,
} as const;

export function shouldSkipIssue(
  payload: IssuesPayload,
  skipBots: boolean,
  actions: readonly string[] = DEFAULT_ISSUE_ACTIONS,
): string | undefined {
  if (skipBots && payload.sender.type === 'Bot') {
    return 'Issue sender is a bot; skipping.';
  }

  if (!actions.includes(payload.action)) {
    return `Issue action "${payload.action}" is not enabled; skipping.`;
  }

  return undefined;
}

export function getIssueColor(payload: IssuesPayload): number {
  return payload.action === 'closed' || payload.issue.state === 'closed'
    ? ISSUE_COLORS.closed
    : ISSUE_COLORS.open;
}

function buildMetadata(
  payload: IssuesPayload,
  details: Set<string>,
  nameAnonUsers: string[],
  fullAnonUsers: string[],
  hideLinks: boolean,
  highlightFirstTimeContributors: boolean,
): string {
  const issue = payload.issue;
  const rows: string[] = [];
  const author = formatAccount(
    issue.user,
    nameAnonUsers,
    fullAnonUsers,
    hideLinks,
  );
  const firstTime =
    highlightFirstTimeContributors &&
    isFirstTimeContributor(issue.author_association)
      ? ' · **First-time contributor**'
      : '';
  rows.push(`**Author:** ${author}${firstTime}`);

  if (details.has('type') && issue.type?.name) {
    rows.push(`**Type:** ${formatInlineCode(issue.type.name)}`);
  }

  if (details.has('labels') && issue.labels.length > 0) {
    rows.push(
      `**Labels:** ${issue.labels
        .slice(0, 8)
        .map((label) => formatInlineCode(label.name))
        .join(' ')}`,
    );
  }

  if (details.has('assignees') && issue.assignees.length > 0) {
    rows.push(
      `**Assignees:** ${formatAccountList(
        issue.assignees,
        nameAnonUsers,
        fullAnonUsers,
        hideLinks,
      )}`,
    );
  }

  if (details.has('milestone') && issue.milestone) {
    const milestone = escapeDiscordMarkdown(issue.milestone.title);
    rows.push(
      `**Milestone:** ${
        issue.milestone.html_url
          ? formatMarkdownLink(milestone, issue.milestone.html_url, hideLinks)
          : milestone
      }`,
    );
  }

  if ((issue.comments ?? 0) > 0) {
    rows.push(
      `**Discussion:** ${issue.comments} ${issue.comments === 1 ? 'comment' : 'comments'}`,
    );
  }

  if (payload.action === 'closed' && issue.state_reason) {
    rows.push(
      `**Resolution:** ${escapeDiscordMarkdown(issue.state_reason.replaceAll('_', ' '))}`,
    );
  }

  return rows.join('\n');
}

export function buildIssueMessage(
  payload: IssuesPayload,
  options: BuildIssueMessageOptions = {},
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
  const issue = payload.issue;
  const isRedacted = accountIsListed(issue.user, fullAnonUsers);
  const actor = formatAccount(
    payload.sender,
    nameAnonUsers,
    fullAnonUsers,
    hideLinks || isRedacted,
  );
  const action = escapeDiscordMarkdown(payload.action.replaceAll('_', ' '));
  const components: DiscordComponentsMessage['components'][0]['components'] = [];

  if (isRedacted) {
    components.push({
      type: 10,
      content: `**${actor}** ${action} a redacted issue`,
    });
  } else {
    const linkedNumber = formatMarkdownLink(
      `#${issue.number}`,
      issue.html_url,
      hideLinks,
    );
    components.push({
      type: 10,
      content: `**${actor}** ${action} issue ${linkedNumber}`,
    });
    components.push({ type: 14, divider: true, spacing: 1 });
    components.push({
      type: 10,
      content: `### ${escapeDiscordMarkdown(truncate(issue.title, 256))}`,
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
        const body = sanitizeBody(issue.body, bodyMaxLength);
        if (body) {
          components.push({ type: 10, content: formatBody(body) });
        }
      }
    }

    if (!hideLinks) {
      components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'View issue',
            url: issue.html_url,
          },
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
        accent_color: options.accentColor ?? getIssueColor(payload),
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
