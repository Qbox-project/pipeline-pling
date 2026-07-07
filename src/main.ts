import * as core from '@actions/core';
import * as github from '@actions/github';

import { sendDiscordWebhook } from './discord.js';
import { buildDiscordMessage, shouldSkipPush } from './message.js';
import type { PushPayload } from './types.js';

export async function run(): Promise<void> {
  if (github.context.eventName !== 'push') {
    core.info(`Event ${github.context.eventName} is not supported; skipping.`);
    return;
  }

  const payload = github.context.payload as unknown as PushPayload;
  const skipBots = core.getBooleanInput('skip-bots');
  const anonKeyword = core.getInput('anon-keyword') || '!anon';
  const webhookUrl = core.getInput('webhook-url', { required: true });
  const threadId = core.getInput('thread-id');

  const skipReason = shouldSkipPush(payload, skipBots);
  if (skipReason) {
    core.info(skipReason);
    return;
  }

  const message = buildDiscordMessage(payload, { anonKeyword });

  core.info(
    `Sending Discord notification for ${payload.commits.length} commit(s) to ${payload.repository.full_name}.`,
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
