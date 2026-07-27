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

  it('filters drafts while allowing the ready-for-review transition', () => {
    const draft = makePayload({
      pull_request: { ...makePayload().pull_request, draft: true },
    });
    expect(
      shouldSkipPullRequest(draft, true, undefined, { includeDrafts: false }),
    ).toContain('Draft');

    const ready = makePayload({ action: 'ready_for_review' });
    expect(
      shouldSkipPullRequest(ready, true, undefined, { includeDrafts: false }),
    ).toBeUndefined();
  });

  it('filters base and fork-qualified head branches with glob patterns', () => {
    const payload = makePayload();

    expect(
      shouldSkipPullRequest(payload, true, undefined, {
        baseAllowlist: ['release/**'],
      }),
    ).toContain('base branch');
    expect(
      shouldSkipPullRequest(payload, true, undefined, {
        baseAllowlist: ['ma*'],
        headAllowlist: ['contributor:feature/**'],
      }),
    ).toBeUndefined();
    expect(
      shouldSkipPullRequest(payload, true, undefined, {
        headDenylist: ['feature/**'],
      }),
    ).toContain('head branch');
  });

  it('applies case-insensitive label allowlists and denylists', () => {
    const payload = makePayload();

    expect(
      shouldSkipPullRequest(payload, true, undefined, {
        labelAllowlist: ['ENHANCEMENT'],
      }),
    ).toBeUndefined();
    expect(
      shouldSkipPullRequest(payload, true, undefined, {
        labelAllowlist: ['security'],
      }),
    ).toContain('allowlisted label');
    expect(
      shouldSkipPullRequest(payload, true, undefined, {
        labelDenylist: ['Discord'],
      }),
    ).toContain('denylisted label');
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
    expect(text).toContain('**Size:** M');
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

  it('omits webhook usernames Discord rejects', () => {
    const message = buildPullRequestMessage(
      makePayload({
        repository: {
          name: 'Clyde-Tools',
          full_name: 'Qbox-project/Clyde-Tools',
          html_url: 'https://github.com/Qbox-project/Clyde-Tools',
        },
      }),
    );

    expect(message.username).toBeUndefined();
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

  it('resolves label, event, accent, and semantic colors in order', () => {
    const labelMessage = buildPullRequestMessage(makePayload(), {
      labelColorPriority: ['discord', 'enhancement'],
      eventColors: { 'pull-request.opened': 0x111111 },
      accentColor: 0x222222,
    });
    expect(labelMessage.components[0].accent_color).toBe(0x5865f2);

    const eventMessage = buildPullRequestMessage(makePayload(), {
      labelColorPriority: ['missing'],
      eventColors: { 'pull-request.opened': 0x111111 },
      accentColor: 0x222222,
    });
    expect(eventMessage.components[0].accent_color).toBe(0x111111);
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

  it('uses configurable changed-line size thresholds', () => {
    const message = buildPullRequestMessage(makePayload(), {
      sizeThresholds: [10, 50, 100],
    });

    expect(textContents(message).join('\n')).toContain('**Size:** XL');
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

  it('fully redacts pull requests with configured privacy labels', () => {
    const message = buildPullRequestMessage(makePayload(), {
      redactLabels: ['DISCORD'],
      labelColorPriority: ['discord'],
    });
    const serialized = JSON.stringify(message);

    expect(serialized).toContain('redacted pull request');
    expect(serialized).toContain('contributor');
    expect(serialized).not.toContain('#42');
    expect(serialized).not.toContain('enhancement');
    expect(serialized).not.toContain('/pull/42');
    expect(message.components[0].accent_color).toBe(0x2f81f7);
  });

  it('enforces the aggregate Components V2 text budget', () => {
    const longName = 'x'.repeat(500);
    const payload = makePayload({
      pull_request: {
        ...makePayload().pull_request,
        body: 'body '.repeat(1000),
        head: { ref: longName, label: longName },
        base: { ref: longName },
        requested_teams: Array.from({ length: 5 }, (_, index) => ({
          name: `${index}-${longName}`,
        })),
      },
    });
    const message = buildPullRequestMessage(payload, { bodyMaxLength: 1000 });
    const totalLength = textContents(message).reduce(
      (total, content) => total + content.length,
      0,
    );

    expect(totalLength).toBeLessThanOrEqual(4000);
  });
});
