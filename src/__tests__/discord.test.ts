import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendDiscordWebhook } from '../discord.js';
import type { DiscordComponentsMessage } from '../types.js';
import { IS_COMPONENTS_V2 } from '../types.js';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/token';

function makeMessage(): DiscordComponentsMessage {
  return {
    flags: IS_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: 'test',
          },
        ],
      },
    ],
  };
}

function makeResponse(
  status: number,
  options: {
    body?: string;
    headers?: Record<string, string>;
    statusText?: string;
  } = {},
): Response {
  const headers = new Headers(options.headers);
  return new Response(options.body ?? '', {
    status,
    statusText: options.statusText ?? 'OK',
    headers,
  });
}

describe('sendDiscordWebhook', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('succeeds on the first try', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200));

    await sendDiscordWebhook({
      webhookUrl: WEBHOOK_URL,
      message: makeMessage(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url.toString()).toContain('with_components=true');
    expect(url.toString()).toContain('wait=true');
  });

  it('retries once after 429 and waits per body retry_after', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(429, {
          body: JSON.stringify({ retry_after: 2.5 }),
          statusText: 'Too Many Requests',
        }),
      )
      .mockResolvedValueOnce(makeResponse(200));

    const promise = sendDiscordWebhook({
      webhookUrl: WEBHOOK_URL,
      message: makeMessage(),
    });

    await vi.advanceTimersByTimeAsync(2499);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when retry after 429 also fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(429, {
          body: JSON.stringify({ retry_after: 0.1 }),
          statusText: 'Too Many Requests',
        }),
      )
      .mockResolvedValueOnce(
        makeResponse(429, {
          body: JSON.stringify({ retry_after: 1 }),
          statusText: 'Too Many Requests',
        }),
      );

    const promise = sendDiscordWebhook({
      webhookUrl: WEBHOOK_URL,
      message: makeMessage(),
    });

    const assertion = expect(promise).rejects.toThrow(
      'Discord webhook request failed with 429 Too Many Requests',
    );

    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-429 errors without retrying', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(400, {
        body: 'bad request',
        statusText: 'Bad Request',
      }),
    );

    await expect(
      sendDiscordWebhook({
        webhookUrl: WEBHOOK_URL,
        message: makeMessage(),
      }),
    ).rejects.toThrow('Discord webhook request failed with 400 Bad Request: bad request');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps retry_after wait at 30 seconds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(429, {
          body: JSON.stringify({ retry_after: 120 }),
          statusText: 'Too Many Requests',
        }),
      )
      .mockResolvedValueOnce(makeResponse(200));

    const promise = sendDiscordWebhook({
      webhookUrl: WEBHOOK_URL,
      message: makeMessage(),
    });

    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('includes thread_id and required query params', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200));

    await sendDiscordWebhook({
      webhookUrl: WEBHOOK_URL,
      message: makeMessage(),
      threadId: 'thread-abc',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toContain('with_components=true');
    expect(url.toString()).toContain('wait=true');
    expect(url.toString()).toContain('thread_id=thread-abc');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });
});
