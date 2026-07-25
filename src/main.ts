import * as core from '@actions/core';
import * as github from '@actions/github';

import { parseBranchColors, parseHexColor, resolveAccentColor } from './color.js';
import { sendDiscordWebhook } from './discord.js';
import {
  buildIssueMessage,
  DEFAULT_ISSUE_ACTIONS,
  shouldSkipIssue,
  SUPPORTED_ISSUE_ACTIONS,
} from './issue.js';
import {
  buildDiscordMessage,
  filterSilentCommits,
  parseBranch,
  parseBranchList,
  parseUsernameList,
  shouldSkipPush,
} from './message.js';
import {
  buildPullRequestMessage,
  DEFAULT_PULL_REQUEST_ACTIONS,
  parseActionList,
  shouldSkipPullRequest,
  SUPPORTED_PULL_REQUEST_ACTIONS,
} from './pull-request.js';
import type {
  IssuesPayload,
  PullRequestPayload,
  PushPayload,
} from './types.js';

const SUPPORTED_EVENTS = new Set([
  'push',
  'pull_request',
  'pull_request_target',
  'issues',
]);

function parseAccentColor(eventName: string): number | undefined {
  const accentColorInput = core.getInput('accent-color');
  if (!accentColorInput) {
    return undefined;
  }

  const parsed = parseHexColor(accentColorInput);
  if (parsed !== undefined) {
    return parsed;
  }

  core.warning(
    eventName === 'push'
      ? `Invalid accent-color "${accentColorInput}"; falling back to repository hash color.`
      : `Invalid accent-color "${accentColorInput}"; falling back to the event default color.`,
  );
  return undefined;
}

function parsePullRequestActions(input: string): string[] {
  if (!input.trim()) {
    return [...DEFAULT_PULL_REQUEST_ACTIONS];
  }

  const configured = parseActionList(input);
  const supported = new Set<string>(SUPPORTED_PULL_REQUEST_ACTIONS);
  const valid = configured.filter((action) => supported.has(action));

  for (const action of configured) {
    if (!supported.has(action)) {
      core.warning(`Unknown pull-request-actions value "${action}"; ignoring.`);
    }
  }

  return valid;
}

function parseIssueActions(input: string): string[] {
  if (!input.trim()) {
    return [...DEFAULT_ISSUE_ACTIONS];
  }

  const configured = parseActionList(input);
  const supported = new Set<string>(SUPPORTED_ISSUE_ACTIONS);
  const valid = configured.filter((action) => supported.has(action));

  for (const action of configured) {
    if (!supported.has(action)) {
      core.warning(`Unknown issue-actions value "${action}"; ignoring.`);
    }
  }

  return valid;
}

function includeDraftPullRequests(input: string): boolean {
  const value = input.trim().toLowerCase();
  if (!value || value === 'include') {
    return true;
  }

  if (value === 'exclude') {
    return false;
  }

  core.warning(
    `Invalid pull-request-drafts value "${input}"; expected include or exclude. Defaulting to include.`,
  );
  return true;
}

interface SharedInputs {
  skipBots: boolean;
  webhookUrl: string;
  threadId?: string;
  useSenderAvatar: boolean;
  useRepoUsername: boolean;
  repoName?: string;
  hideLinks: boolean;
  compactMode: boolean;
  nameAnonUsers: string[];
  fullAnonUsers: string[];
  accentColor?: number;
}

function readSharedInputs(eventName: string): SharedInputs {
  return {
    skipBots: core.getBooleanInput('skip-bots'),
    webhookUrl: core.getInput('webhook-url', { required: true }),
    threadId: core.getInput('thread-id') || undefined,
    useSenderAvatar: core.getBooleanInput('use-sender-avatar'),
    useRepoUsername: core.getBooleanInput('use-repo-username'),
    repoName: core.getInput('repo-name') || undefined,
    hideLinks: core.getBooleanInput('hide-links'),
    compactMode: core.getBooleanInput('compact-mode'),
    nameAnonUsers: parseUsernameList(core.getInput('name-anon-users')),
    fullAnonUsers: parseUsernameList(core.getInput('full-anon-users')),
    accentColor: parseAccentColor(eventName),
  };
}

async function runPullRequest(
  payload: PullRequestPayload,
  inputs: SharedInputs,
): Promise<void> {
  const actions = parsePullRequestActions(core.getInput('pull-request-actions'));
  const skipReason = shouldSkipPullRequest(payload, inputs.skipBots, actions, {
    includeDrafts: includeDraftPullRequests(core.getInput('pull-request-drafts')),
    baseAllowlist: parseBranchList(
      core.getInput('pull-request-base-allowlist'),
    ),
    baseDenylist: parseBranchList(
      core.getInput('pull-request-base-denylist'),
    ),
    headAllowlist: parseBranchList(
      core.getInput('pull-request-head-allowlist'),
    ),
    headDenylist: parseBranchList(
      core.getInput('pull-request-head-denylist'),
    ),
    labelAllowlist: parseActionList(
      core.getInput('pull-request-label-allowlist'),
    ),
    labelDenylist: parseActionList(
      core.getInput('pull-request-label-denylist'),
    ),
  });
  if (skipReason) {
    core.info(skipReason);
    return;
  }

  const message = buildPullRequestMessage(payload, {
    accentColor: inputs.accentColor,
    useSenderAvatar: inputs.useSenderAvatar,
    useRepoUsername: inputs.useRepoUsername,
    repoName: inputs.repoName,
    hideLinks: inputs.hideLinks,
    compactMode: inputs.compactMode,
    nameAnonUsers: inputs.nameAnonUsers,
    fullAnonUsers: inputs.fullAnonUsers,
  });

  core.info(
    `Sending Discord notification for pull request #${payload.pull_request.number} (${payload.action}) to ${payload.repository.full_name}.`,
  );

  await sendDiscordWebhook({
    webhookUrl: inputs.webhookUrl,
    message,
    threadId: inputs.threadId,
  });

  core.info('Discord notification sent successfully.');
}

async function runIssue(
  payload: IssuesPayload,
  inputs: SharedInputs,
): Promise<void> {
  const actions = parseIssueActions(core.getInput('issue-actions'));
  const skipReason = shouldSkipIssue(payload, inputs.skipBots, actions, {
    labelAllowlist: parseActionList(core.getInput('issue-label-allowlist')),
    labelDenylist: parseActionList(core.getInput('issue-label-denylist')),
  });
  if (skipReason) {
    core.info(skipReason);
    return;
  }

  const message = buildIssueMessage(payload, {
    accentColor: inputs.accentColor,
    useSenderAvatar: inputs.useSenderAvatar,
    useRepoUsername: inputs.useRepoUsername,
    repoName: inputs.repoName,
    hideLinks: inputs.hideLinks,
    compactMode: inputs.compactMode,
    nameAnonUsers: inputs.nameAnonUsers,
    fullAnonUsers: inputs.fullAnonUsers,
  });

  core.info(
    `Sending Discord notification for issue #${payload.issue.number} (${payload.action}) to ${payload.repository.full_name}.`,
  );

  await sendDiscordWebhook({
    webhookUrl: inputs.webhookUrl,
    message,
    threadId: inputs.threadId,
  });

  core.info('Discord notification sent successfully.');
}

async function runPush(
  payload: PushPayload,
  inputs: SharedInputs,
): Promise<void> {
  const anonKeyword = core.getInput('anon-keyword') || '!anon';
  const silentKeyword = core.getInput('silent-keyword') || '!silent';
  const branchAllowlist = parseBranchList(core.getInput('branch-allowlist'));
  const branchDenylist = parseBranchList(core.getInput('branch-denylist'));
  const branchColors = parseBranchColors(core.getInput('branch-colors'), (message) =>
    core.warning(message),
  );

  const skipReason = shouldSkipPush(payload, inputs.skipBots, {
    branchAllowlist,
    branchDenylist,
  });
  if (skipReason) {
    core.info(skipReason);
    return;
  }

  const visibleCommits = filterSilentCommits(payload.commits, silentKeyword);
  if (visibleCommits.length === 0) {
    core.info('All commits in push are silent; skipping.');
    return;
  }

  const notificationPayload: PushPayload = {
    ...payload,
    commits: visibleCommits,
  };

  const branch = parseBranch(payload.ref);
  const resolvedAccentColor = resolveAccentColor(
    branch,
    branchColors,
    inputs.accentColor,
    payload.repository.full_name,
  );

  const message = buildDiscordMessage(notificationPayload, {
    anonKeyword,
    accentColor: resolvedAccentColor,
    useSenderAvatar: inputs.useSenderAvatar,
    useRepoUsername: inputs.useRepoUsername,
    repoName: inputs.repoName,
    hideLinks: inputs.hideLinks,
    compactMode: inputs.compactMode,
    nameAnonUsers: inputs.nameAnonUsers,
    fullAnonUsers: inputs.fullAnonUsers,
  });

  core.info(
    `Sending Discord notification for ${visibleCommits.length} commit(s) to ${payload.repository.full_name}.`,
  );

  await sendDiscordWebhook({
    webhookUrl: inputs.webhookUrl,
    message,
    threadId: inputs.threadId,
  });

  core.info('Discord notification sent successfully.');
}

export async function run(): Promise<void> {
  const eventName = github.context.eventName;
  if (!SUPPORTED_EVENTS.has(eventName)) {
    core.info(`Event ${eventName} is not supported; skipping.`);
    return;
  }

  const inputs = readSharedInputs(eventName);

  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    await runPullRequest(
      github.context.payload as unknown as PullRequestPayload,
      inputs,
    );
    return;
  }

  if (eventName === 'issues') {
    await runIssue(github.context.payload as unknown as IssuesPayload, inputs);
    return;
  }

  await runPush(github.context.payload as unknown as PushPayload, inputs);
}

if (require.main === module) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  });
}
