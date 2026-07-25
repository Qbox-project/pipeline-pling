import { describe, expect, it } from 'vitest';

import {
  buildPullRequestMessage,
  getPullRequestColor,
  parseActionList,
  shouldSkipPullRequest,
} from '../pull-request.js';
import { ANONYMOUS_AVATAR_URL } from '../types.js';
import type { PullRequestPayload } from '../types.js';

function makePayload(
  overrides: Partial<PullRequestPayload> = {},
): PullRequestPayload {
  return {
    action: 'opened',
    number: 42,
    pull_request: {
      number: 42,
      html_url: 'https://github.com/Qbox-project/pipeline-pling/pull/42',
      title: 'feat: add pull request notifications',
      body: '<!-- template guidance -->\nA useful **summary**.\n\n@everyone',
      draft: false,
      merged: false,
      user: {
        login: 'contributor',
        type: 'User',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
        html_url: 'https://github.com/contributor',
      },
      author_association: 'FIRST_TIME_CONTRIBUTOR',
      head: {
        ref: 'feature/notifications',
        label: 'contributor:feature/notifications',
      },
      base: { ref: 'main', label: 'Qbox-project:main' },
      labels: [
        { name: 'enhancement', color: 'a2eeef' },
        { name: 'discord', color: '5865f2' },
      ],
      assignees: [
        {
          login: 'maintainer',
          type: 'User',
          html_url: 'https://github.com/maintainer',
        },
      ],
      requested_reviewers: [
        {
          login: 'reviewer',
          type: 'User',
          html_url: 'https://github.com/reviewer',
        },
      ],
      requested_teams: [{ name: 'Core team' }],
      additions: 120,
      deletions: 10,
      changed_files: 4,
      comments: 2,
      commits: 3,
    },
    repository: {
      name: 'pipeline-pling',
      full_name: 'Qbox-project/pipeline-pling',
      html_url: 'https://github.com/Qbox-project/pipeline-pling',
    },
    sender: {
      login: 'contributor',
      type: 'User',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
      html_url: 'https://github.com/contributor',
    },
    ...overrides,
  };
}

function textContents(message: ReturnType<typeof buildPullRequestMessage>): string[] {
  return message.components[0].components
    .filter((component) => component.type === 10)
    .map((component) => component.content);
}

function buttons(message: ReturnType<typeof buildPullRequestMessage>) {
  return message.components[0].components
    .filter((component) => component.type === 1)
    .flatMap((component) => component.components);
}

describe('pull request filtering', () => {
  it('parses normalized comma-separated actions', () => {
    expect(parseActionList(' Opened, CLOSED, ,ready_for_review ')).toEqual([
      'opened',
      'closed',
      'ready_for_review',
    ]);
  });

  it('uses lifecycle actions and skips synchronize by default', () => {
    expect(shouldSkipPullRequest(makePayload(), true)).toBeUndefined();
    expect(
      shouldSkipPullRequest(makePayload({ action: 'synchronize' }), true),
    ).toContain('not enabled');
  });

  it('skips bot senders when enabled', () => {
    expect(
      shouldSkipPullRequest(
        makePayload({
          sender: { login: 'dependabot[bot]', type: 'Bot' },
        }),
        true,
      ),
    ).toContain('bot');
  });
});

describe('buildPullRequestMessage', () => {
  it('renders a useful opened pull request summary', () => {
    const message = buildPullRequestMessage(makePayload());
    const text = textContents(message).join('\n');

    expect(text).toContain('opened pull request');
    expect(text).toContain('[#42](https://github.com/Qbox-project/pipeline-pling/pull/42)');
    expect(text).toContain('feat: add pull request notifications');
    expect(text).toContain('First-time contributor');
    expect(text).toContain('contributor:feature/notifications');
    expect(text).toContain('+120 −10 across 4 files');
    expect(text).toContain('enhancement');
    expect(text).toContain('reviewer');
    expect(text).toContain('Core team');
    expect(text).toContain('maintainer');
    expect(text).toContain('A useful \\*\\*summary\\*\\*.');
    expect(text).not.toContain('template guidance');
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.username).toBe('pipeline-pling');
    expect(message.avatar_url).toContain('s=256');
    expect(buttons(message).map((button) => button.label)).toEqual([
      'View pull request',
      'Files changed',
      'Checks',
    ]);
  });

  it('uses semantic colors for draft, merged, and unmerged closed states', () => {
    const draft = makePayload({
      pull_request: { ...makePayload().pull_request, draft: true },
    });
    const merged = makePayload({
      action: 'closed',
      pull_request: { ...makePayload().pull_request, merged: true },
    });
    const closed = makePayload({ action: 'closed' });

    expect(getPullRequestColor(draft)).toBe(0x8c959f);
    expect(getPullRequestColor(merged)).toBe(0x8250df);
    expect(getPullRequestColor(closed)).toBe(0xcf222e);
    expect(textContents(buildPullRequestMessage(merged))[0]).toContain('merged');
    expect(textContents(buildPullRequestMessage(closed))[0]).toContain('closed');
  });

  it('lets an explicit accent color override semantic colors', () => {
    const message = buildPullRequestMessage(makePayload(), {
      accentColor: 0x123456,
    });

    expect(message.components[0].accent_color).toBe(0x123456);
  });

  it('supports compact and link-free cards', () => {
    const message = buildPullRequestMessage(makePayload(), {
      compactMode: true,
      hideLinks: true,
    });
    const text = textContents(message).join('\n');

    expect(text).toContain('#42');
    expect(text).not.toContain('**Author:**');
    expect(text).not.toContain('A useful');
    expect(text).not.toContain('](');
    expect(buttons(message)).toHaveLength(0);
  });

  it('honors detail selection and body length', () => {
    const message = buildPullRequestMessage(makePayload(), {
      details: ['body'],
      bodyMaxLength: 20,
      highlightFirstTimeContributors: false,
    });
    const text = textContents(message).join('\n');

    expect(text).not.toContain('**Labels:**');
    expect(text).not.toContain('**Reviewers:**');
    expect(text).not.toContain('**Changes:**');
    expect(text).not.toContain('First-time contributor');
    expect(text).toContain('...');
  });

  it('anonymizes listed names and sender avatars', () => {
    const message = buildPullRequestMessage(makePayload(), {
      nameAnonUsers: ['contributor'],
    });
    const serialized = JSON.stringify(message);

    expect(serialized).toContain('Anonymous');
    expect(serialized).not.toContain('github.com/contributor');
    expect(message.avatar_url).toBe(ANONYMOUS_AVATAR_URL);
  });

  it('fully redacts pull requests created by full-anon users', () => {
    const message = buildPullRequestMessage(makePayload(), {
      fullAnonUsers: ['contributor'],
    });
    const serialized = JSON.stringify(message);

    expect(serialized).toContain('redacted pull request');
    expect(serialized).not.toContain('#42');
    expect(serialized).not.toContain('add pull request notifications');
    expect(serialized).not.toContain('/pull/42');
    expect(buttons(message)).toHaveLength(0);
  });
});
