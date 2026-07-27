import * as core from '@actions/core';
import * as github from '@actions/github';

import {
  parseBranchColors,
  parseEventColors,
  parseHexColor,
  resolveAccentColor,
} from './color.js';
import { sendDiscordWebhook } from './discord.js';
import {
  buildIssueMessage,
  DEFAULT_ISSUE_ACTIONS,
  DEFAULT_ISSUE_DETAILS,
  shouldSkipIssue,
  SUPPORTED_ISSUE_ACTIONS,
  SUPPORTED_ISSUE_DETAILS,
} from './issue.js';
import {
  parseActionList,
  parseBranchList,
  parseUsernameList,
} from './inputs.js';
import {
  buildDiscordMessage,
  filterSilentCommits,
  parseBranch,
  shouldSkipPush,
} from './message.js';
import {
  buildPullRequestMessage,
  DEFAULT_PULL_REQUEST_DETAILS,
  DEFAULT_PULL_REQUEST_SIZE_THRESHOLDS,
  DEFAULT_PULL_REQUEST_ACTIONS,
  shouldSkipPullRequest,
  SUPPORTED_PULL_REQUEST_ACTIONS,
  SUPPORTED_PULL_REQUEST_DETAILS,
} from './pull-request.js';
import { isIssuesPayload, isPullRequestPayload, isPushPayload } from './payload.js';
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

function parseDetails(
  input: string,
  defaults: readonly string[],
  supportedValues: readonly string[],
  inputName: string,
): string[] {
  if (!input.trim()) {
    return [...defaults];
  }

  const configured = parseActionList(input);
  const supported = new Set(supportedValues);
  const valid = configured.filter((detail) => supported.has(detail));

  for (const detail of configured) {
    if (!supported.has(detail)) {
      core.warning(`Unknown ${inputName} value "${detail}"; ignoring.`);
    }
  }

  return valid;
}

function parseBodyMaxLength(input: string): number {
  const value = input.trim();
  if (!value) {
    return 320;
  }

  if (!/^-?\d+$/.test(value)) {
    core.warning(
      `Invalid body-max-length value "${input}"; defaulting to 320.`,
    );
    return 320;
  }

  const parsed = Number(value);
  const clamped = Math.min(Math.max(parsed, 0), 1000);
  if (clamped !== parsed) {
    core.warning(
      `body-max-length value "${input}" is outside 0 to 1000; clamping to ${clamped}.`,
    );
  }
  return clamped;
}

function parsePullRequestSizeThresholds(
  input: string,
): [number, number, number] {
  if (!input.trim()) {
    return [...DEFAULT_PULL_REQUEST_SIZE_THRESHOLDS];
  }

  const values = input.split(',').map((entry) => Number(entry.trim()));
  if (
    values.length !== 3 ||
    values.some((value) => !Number.isInteger(value) || value < 0) ||
    !(values[0] < values[1] && values[1] < values[2])
  ) {
    core.warning(
      `Invalid pull-request-size-thresholds value "${input}"; expected three ascending non-negative integers. Defaulting to 100,500,1000.`,
    );
    return [...DEFAULT_PULL_REQUEST_SIZE_THRESHOLDS];
  }

  return [values[0], values[1], values[2]];
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

function getBooleanInputOrDefault(name: string, defaultValue: boolean): boolean {
  try {
    return core.getBooleanInput(name);
  } catch {
    const received = core.getInput(name);
    core.warning(
      `Invalid ${name} value "${received}"; defaulting to ${defaultValue}.`,
    );
    return defaultValue;
  }
}

function readSharedInputs(eventName: string): SharedInputs {
  return {
    skipBots: getBooleanInputOrDefault('skip-bots', true),
    webhookUrl: core.getInput('webhook-url', { required: true }),
    threadId: core.getInput('thread-id') || undefined,
    useSenderAvatar: getBooleanInputOrDefault('use-sender-avatar', true),
    useRepoUsername: getBooleanInputOrDefault('use-repo-username', true),
    repoName: core.getInput('repo-name') || undefined,
    hideLinks: getBooleanInputOrDefault('hide-links', false),
    compactMode: getBooleanInputOrDefault('compact-mode', false),
    nameAnonUsers: parseUsernameList(core.getInput('name-anon-users')),
    fullAnonUsers: parseUsernameList(core.getInput('full-anon-users')),
    accentColor: parseAccentColor(eventName),
  };
}

async function runPullRequest(
  payload: PullRequestPayload,
  inputs: SharedInputs,
): Promise<void> {
  const webhookUrl =
    core.getInput('pull-request-webhook-url') || inputs.webhookUrl;
  const threadId =
    core.getInput('pull-request-thread-id') || inputs.threadId;
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
    bodyMaxLength: parseBodyMaxLength(core.getInput('body-max-length')),
    details: parseDetails(
      core.getInput('pull-request-details'),
      DEFAULT_PULL_REQUEST_DETAILS,
      SUPPORTED_PULL_REQUEST_DETAILS,
      'pull-request-details',
    ),
    highlightFirstTimeContributors: getBooleanInputOrDefault(
      'highlight-first-time-contributors',
      true,
    ),
    sizeThresholds: parsePullRequestSizeThresholds(
      core.getInput('pull-request-size-thresholds'),
    ),
    eventColors: parseEventColors(core.getInput('event-colors'), (message) =>
      core.warning(message),
    ),
    labelColorPriority: parseActionList(
      core.getInput('label-color-priority'),
    ),
    redactLabels: parseActionList(core.getInput('redact-labels')),
  });

  core.info(
    `Sending Discord notification for pull request #${payload.pull_request.number} (${payload.action}) to ${payload.repository.full_name}.`,
  );

  await sendDiscordWebhook({
    webhookUrl,
    message,
    threadId,
  });

  core.info('Discord notification sent successfully.');
}

async function runIssue(
  payload: IssuesPayload,
  inputs: SharedInputs,
): Promise<void> {
  const webhookUrl = core.getInput('issue-webhook-url') || inputs.webhookUrl;
  const threadId = core.getInput('issue-thread-id') || inputs.threadId;
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
    bodyMaxLength: parseBodyMaxLength(core.getInput('body-max-length')),
    details: parseDetails(
      core.getInput('issue-details'),
      DEFAULT_ISSUE_DETAILS,
      SUPPORTED_ISSUE_DETAILS,
      'issue-details',
    ),
    highlightFirstTimeContributors: getBooleanInputOrDefault(
      'highlight-first-time-contributors',
      true,
    ),
    eventColors: parseEventColors(core.getInput('event-colors'), (message) =>
      core.warning(message),
    ),
    labelColorPriority: parseActionList(
      core.getInput('label-color-priority'),
    ),
    redactLabels: parseActionList(core.getInput('redact-labels')),
  });

  core.info(
    `Sending Discord notification for issue #${payload.issue.number} (${payload.action}) to ${payload.repository.full_name}.`,
  );

  await sendDiscordWebhook({
    webhookUrl,
    message,
    threadId,
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
    const payload: unknown = github.context.payload;
    if (!isPullRequestPayload(payload)) {
      core.warning(
        'Pull request event payload is missing required fields; skipping.',
      );
      return;
    }

    await runPullRequest(payload, inputs);
    return;
  }

  if (eventName === 'issues') {
    const payload: unknown = github.context.payload;
    if (!isIssuesPayload(payload)) {
      core.warning('Issue event payload is missing required fields; skipping.');
      return;
    }

    await runIssue(payload, inputs);
    return;
  }

  const payload: unknown = github.context.payload;
  if (!isPushPayload(payload)) {
    core.warning('Push event payload is missing required fields; skipping.');
    return;
  }

  await runPush(payload, inputs);
}

if (require.main === module) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  });
}
