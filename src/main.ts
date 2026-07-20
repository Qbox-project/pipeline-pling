import * as core from '@actions/core';
import * as github from '@actions/github';

import { parseBranchColors, parseHexColor, resolveAccentColor } from './color.js';
import { sendDiscordWebhook } from './discord.js';
import {
  buildDiscordMessage,
  filterSilentCommits,
  parseBranch,
  parseBranchList,
  parseUsernameList,
  shouldSkipPush,
} from './message.js';
import type { PushPayload } from './types.js';

export async function run(): Promise<void> {
  if (github.context.eventName !== 'push') {
    core.info(`Event ${github.context.eventName} is not supported; skipping.`);
    return;
  }

  const payload = github.context.payload as unknown as PushPayload;
  const skipBots = core.getBooleanInput('skip-bots');
  const anonKeyword = core.getInput('anon-keyword') || '!anon';
  const silentKeyword = core.getInput('silent-keyword') || '!silent';
  const branchAllowlist = parseBranchList(core.getInput('branch-allowlist'));
  const branchDenylist = parseBranchList(core.getInput('branch-denylist'));
  const webhookUrl = core.getInput('webhook-url', { required: true });
  const threadId = core.getInput('thread-id');
  const useSenderAvatar = core.getBooleanInput('use-sender-avatar');
  const useRepoUsername = core.getBooleanInput('use-repo-username');
  const repoName = core.getInput('repo-name');
  const hideLinks = core.getBooleanInput('hide-links');
  const compactMode = core.getBooleanInput('compact-mode');
  const nameAnonUsers = parseUsernameList(core.getInput('name-anon-users'));
  const fullAnonUsers = parseUsernameList(core.getInput('full-anon-users'));

  const accentColorInput = core.getInput('accent-color');
  let accentColor: number | undefined;
  if (accentColorInput) {
    const parsed = parseHexColor(accentColorInput);
    if (parsed !== undefined) {
      accentColor = parsed;
    } else {
      core.warning(
        `Invalid accent-color "${accentColorInput}"; falling back to repository hash color.`,
      );
    }
  }

  const branchColors = parseBranchColors(core.getInput('branch-colors'), (message) =>
    core.warning(message),
  );

  const skipReason = shouldSkipPush(payload, skipBots, {
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
    accentColor,
    payload.repository.full_name,
  );

  const message = buildDiscordMessage(notificationPayload, {
    anonKeyword,
    accentColor: resolvedAccentColor,
    useSenderAvatar,
    useRepoUsername,
    repoName: repoName || undefined,
    hideLinks,
    compactMode,
    nameAnonUsers,
    fullAnonUsers,
  });

  core.info(
    `Sending Discord notification for ${visibleCommits.length} commit(s) to ${payload.repository.full_name}.`,
  );

  await sendDiscordWebhook({
    webhookUrl,
    message,
    threadId: threadId || undefined,
  });

  core.info('Discord notification sent successfully.');
}

if (require.main === module) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  });
}
