import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: {
    eventName: 'push',
    payload: {} as unknown,
  },
  getBooleanInput: vi.fn<(name: string) => boolean>(),
  getInput: vi.fn<(name: string, options?: { required?: boolean }) => string>(),
  info: vi.fn<(message: string) => void>(),
  warning: vi.fn<(message: string) => void>(),
  setFailed: vi.fn<(message: string) => void>(),
  buildDiscordMessage: vi.fn(),
  sendDiscordWebhook: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  getBooleanInput: mocks.getBooleanInput,
  getInput: mocks.getInput,
  info: mocks.info,
  warning: mocks.warning,
  setFailed: mocks.setFailed,
}));

vi.mock('@actions/github', () => ({
  context: mocks.context,
}));

vi.mock('../message.js', async () => {
  const actual = await vi.importActual<typeof import('../message.js')>(
    '../message.js',
  );

  return {
    ...actual,
    buildDiscordMessage: mocks.buildDiscordMessage,
  };
});

vi.mock('../discord.js', () => ({
  sendDiscordWebhook: mocks.sendDiscordWebhook,
}));

import { run } from '../main.js';
import type {
  DiscordComponentsMessage,
  PushCommit,
  PushPayload,
} from '../types.js';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/token';

const discordMessage: DiscordComponentsMessage = {
  flags: 1 << 15,
  allowed_mentions: { parse: [] },
  components: [
    {
      type: 17,
      components: [{ type: 10, content: 'test message' }],
    },
  ],
};

function makeCommit(overrides: Partial<PushCommit> = {}): PushCommit {
  return {
    id: '04ea116975c20db99cd710337d0bc7ce90e13a65',
    message: 'feat: visible change',
    url: 'https://github.com/Qbox-project/pipeline-pling/commit/04ea116975c20db99cd710337d0bc7ce90e13a65',
    timestamp: '2026-07-20T00:00:00Z',
    author: {
      name: 'Contributor',
      email: '12345+contributor@users.noreply.github.com',
      username: 'contributor',
    },
    committer: {
      name: 'Contributor',
      email: '12345+contributor@users.noreply.github.com',
      username: 'contributor',
    },
    ...overrides,
  };
}

function makePayload(overrides: Partial<PushPayload> = {}): PushPayload {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/Qbox-project/pipeline-pling/compare/before...after',
    commits: [makeCommit()],
    repository: {
      name: 'pipeline-pling',
      full_name: 'Qbox-project/pipeline-pling',
      html_url: 'https://github.com/Qbox-project/pipeline-pling',
    },
    sender: {
      login: 'contributor',
      type: 'User',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
    },
    pusher: {
      name: 'contributor',
    },
    ...overrides,
  };
}

function setInputs(
  stringInputs: Record<string, string> = {},
  booleanInputs: Record<string, boolean> = {},
): void {
  const strings: Record<string, string> = {
    'webhook-url': WEBHOOK_URL,
    ...stringInputs,
  };
  const booleans: Record<string, boolean> = {
    'skip-bots': true,
    'use-sender-avatar': true,
    'use-repo-username': true,
    'hide-links': false,
    'compact-mode': false,
    ...booleanInputs,
  };

  mocks.getInput.mockImplementation((name) => strings[name] ?? '');
  mocks.getBooleanInput.mockImplementation((name) => booleans[name] ?? false);
}

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.eventName = 'push';
    mocks.context.payload = makePayload();
    mocks.buildDiscordMessage.mockReturnValue(discordMessage);
    mocks.sendDiscordWebhook.mockResolvedValue(undefined);
    setInputs();
  });

  it('skips unsupported GitHub events before reading inputs', async () => {
    mocks.context.eventName = 'pull_request';

    await run();

    expect(mocks.info).toHaveBeenCalledWith(
      'Event pull_request is not supported; skipping.',
    );
    expect(mocks.getInput).not.toHaveBeenCalled();
    expect(mocks.buildDiscordMessage).not.toHaveBeenCalled();
    expect(mocks.sendDiscordWebhook).not.toHaveBeenCalled();
  });

  it('parses action inputs and passes them through to rendering and delivery', async () => {
    const payload = makePayload();
    mocks.context.payload = payload;
    setInputs(
      {
        'thread-id': 'thread-123',
        'anon-keyword': '!private',
        'silent-keyword': '!quiet',
        'branch-allowlist': 'main, develop',
        'branch-denylist': 'release',
        'accent-color': '#123456',
        'branch-colors': 'main=#abcdef',
        'repo-name': 'Pipeline Pling',
        'name-anon-users': 'Alice, bob',
        'full-anon-users': 'Carol',
      },
      {
        'skip-bots': false,
        'use-sender-avatar': false,
        'use-repo-username': false,
        'hide-links': true,
        'compact-mode': true,
      },
    );

    await run();

    expect(mocks.buildDiscordMessage).toHaveBeenCalledWith(payload, {
      anonKeyword: '!private',
      accentColor: 0xabcdef,
      useSenderAvatar: false,
      useRepoUsername: false,
      repoName: 'Pipeline Pling',
      hideLinks: true,
      compactMode: true,
      nameAnonUsers: ['alice', 'bob'],
      fullAnonUsers: ['carol'],
    });
    expect(mocks.sendDiscordWebhook).toHaveBeenCalledWith({
      webhookUrl: WEBHOOK_URL,
      message: discordMessage,
      threadId: 'thread-123',
    });
  });

  it('removes silent commits before rendering the notification', async () => {
    const visibleCommit = makeCommit({
      id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      message: 'fix: visible',
    });
    mocks.context.payload = makePayload({
      commits: [
        makeCommit({ message: 'chore: hidden\n\n!quiet' }),
        visibleCommit,
      ],
    });
    setInputs({ 'silent-keyword': '!quiet' });

    await run();

    const [renderedPayload] = mocks.buildDiscordMessage.mock.calls[0];
    expect(renderedPayload.commits).toEqual([visibleCommit]);
    expect(mocks.sendDiscordWebhook).toHaveBeenCalledOnce();
  });

  it('does not render or send when every commit is silent', async () => {
    mocks.context.payload = makePayload({
      commits: [makeCommit({ message: 'chore: hidden\n\n!quiet' })],
    });
    setInputs({ 'silent-keyword': '!quiet' });

    await run();

    expect(mocks.info).toHaveBeenCalledWith(
      'All commits in push are silent; skipping.',
    );
    expect(mocks.buildDiscordMessage).not.toHaveBeenCalled();
    expect(mocks.sendDiscordWebhook).not.toHaveBeenCalled();
  });

  it('warns about an invalid accent color and uses the repository fallback', async () => {
    setInputs({ 'accent-color': 'not-a-color' });

    await run();

    expect(mocks.warning).toHaveBeenCalledWith(
      'Invalid accent-color "not-a-color"; falling back to repository hash color.',
    );
    const [, options] = mocks.buildDiscordMessage.mock.calls[0];
    expect(options.accentColor).toEqual(expect.any(Number));
  });
});
