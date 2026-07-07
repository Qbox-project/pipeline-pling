import type { DiscordComponentsMessage } from './types.js';

export interface SendDiscordWebhookOptions {
  webhookUrl: string;
  message: DiscordComponentsMessage;
  threadId?: string;
}

export async function sendDiscordWebhook(
  options: SendDiscordWebhookOptions,
): Promise<void> {
  const url = new URL(options.webhookUrl);
  url.searchParams.set('with_components', 'true');
  url.searchParams.set('wait', 'true');

  if (options.threadId) {
    url.searchParams.set('thread_id', options.threadId);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.message),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Discord webhook request failed with ${response.status} ${response.statusText}: ${body}`,
    );
  }
}
