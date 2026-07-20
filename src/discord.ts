import type { DiscordComponentsMessage } from './types.js';

export interface SendDiscordWebhookOptions {
  webhookUrl: string;
  message: DiscordComponentsMessage;
  threadId?: string;
}

const MAX_RETRY_WAIT_SECONDS = 30;
const DEFAULT_RETRY_WAIT_SECONDS = 1;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveRateLimitWaitMs(response: Response): Promise<number> {
  const bodyText = await response.text();
  let waitSeconds: number | undefined;

  try {
    const parsed = JSON.parse(bodyText) as { retry_after?: unknown };
    if (typeof parsed.retry_after === 'number') {
      waitSeconds = parsed.retry_after;
    }
  } catch {
    // Response body is not JSON; fall back to headers.
  }

  if (waitSeconds === undefined) {
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter !== null) {
      const parsedHeader = Number(retryAfter);
      if (!Number.isNaN(parsedHeader)) {
        waitSeconds = parsedHeader;
      }
    }
  }

  const seconds = Math.min(waitSeconds ?? DEFAULT_RETRY_WAIT_SECONDS, MAX_RETRY_WAIT_SECONDS);
  return seconds * 1000;
}

async function postWebhook(
  url: URL,
  message: DiscordComponentsMessage,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function isTransientStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

function formatRequestError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await postWebhook(url, options.message);
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(DEFAULT_RETRY_WAIT_SECONDS * 1000);
        continue;
      }

      throw new Error(
        `Discord webhook request failed after ${MAX_ATTEMPTS} attempts: ${formatRequestError(error)}`,
        { cause: error },
      );
    }

    if (response.ok) {
      return;
    }

    if (
      attempt < MAX_ATTEMPTS &&
      (response.status === 429 || isTransientStatus(response.status))
    ) {
      const waitMs =
        response.status === 429
          ? await resolveRateLimitWaitMs(response)
          : DEFAULT_RETRY_WAIT_SECONDS * 1000;
      await sleep(waitMs);
      continue;
    }

    const body = await response.text();
    throw new Error(
      `Discord webhook request failed with ${response.status} ${response.statusText}: ${body}`,
    );
  }
}
