import { describe, expect, it } from 'vitest';

import {
  buildIssueMessage,
  getIssueColor,
  shouldSkipIssue,
} from '../issue.js';
import { ANONYMOUS_AVATAR_URL } from '../types.js';
import type { IssuesPayload } from '../types.js';

function makePayload(overrides: Partial<IssuesPayload> = {}): IssuesPayload {
  return {
    action: 'opened',
    issue: {
      number: 51,
      html_url: 'https://github.com/Qbox-project/pipeline-pling/issues/51',
      title: 'Support issue notifications',
      body: '<!-- issue template -->\nThe webhook shows **nothing**.\n\n@everyone',
      state: 'open',
      user: {
        login: 'reporter',
        type: 'User',
        avatar_url: 'https://avatars.githubusercontent.com/u/54321?v=4',
        html_url: 'https://github.com/reporter',
      },
      author_association: 'FIRST_TIMER',
      labels: [
        { name: 'bug', color: 'd73a4a' },
        { name: 'discord', color: '5865f2' },
      ],
      assignees: [
        {
          login: 'maintainer',
          type: 'User',
          html_url: 'https://github.com/maintainer',
        },
      ],
      milestone: {
        title: 'v1.5.0',
        html_url: 'https://github.com/Qbox-project/pipeline-pling/milestone/2',
      },
      type: { name: 'Bug', color: 'red' },
      comments: 3,
    },
    repository: {
      name: 'pipeline-pling',
      full_name: 'Qbox-project/pipeline-pling',
      html_url: 'https://github.com/Qbox-project/pipeline-pling',
    },
    sender: {
      login: 'reporter',
      type: 'User',
      avatar_url: 'https://avatars.githubusercontent.com/u/54321?v=4',
      html_url: 'https://github.com/reporter',
    },
    ...overrides,
  };
}

function textContents(message: ReturnType<typeof buildIssueMessage>): string[] {
  return message.components[0].components
    .filter((component) => component.type === 10)
    .map((component) => component.content);
}

function buttons(message: ReturnType<typeof buildIssueMessage>) {
  return message.components[0].components
    .filter((component) => component.type === 1)
    .flatMap((component) => component.components);
}

describe('issue filtering', () => {
  it('allows lifecycle actions by default', () => {
    expect(shouldSkipIssue(makePayload(), true)).toBeUndefined();
    expect(
      shouldSkipIssue(makePayload({ action: 'reopened' }), true),
    ).toBeUndefined();
    expect(shouldSkipIssue(makePayload({ action: 'labeled' }), true)).toContain(
      'not enabled',
    );
  });

  it('skips bot senders when enabled', () => {
    expect(
      shouldSkipIssue(
        makePayload({ sender: { login: 'triage[bot]', type: 'Bot' } }),
        true,
      ),
    ).toContain('bot');
  });

  it('applies case-insensitive label allowlists and denylists', () => {
    const payload = makePayload();

    expect(
      shouldSkipIssue(payload, true, undefined, {
        labelAllowlist: ['BUG'],
      }),
    ).toBeUndefined();
    expect(
      shouldSkipIssue(payload, true, undefined, {
        labelAllowlist: ['security'],
      }),
    ).toContain('allowlisted label');
    expect(
      shouldSkipIssue(payload, true, undefined, {
        labelDenylist: ['Discord'],
      }),
    ).toContain('denylisted label');
  });
});

describe('buildIssueMessage', () => {
  it('renders a useful issue summary', () => {
    const message = buildIssueMessage(makePayload());
    const text = textContents(message).join('\n');

    expect(text).toContain('opened issue');
    expect(text).toContain('[#51](https://github.com/Qbox-project/pipeline-pling/issues/51)');
    expect(text).toContain('Support issue notifications');
    expect(text).toContain('First-time contributor');
    expect(text).toContain('**Type:** `Bug`');
    expect(text).toContain('bug');
    expect(text).toContain('maintainer');
    expect(text).toContain('[v1.5.0]');
    expect(text).toContain('3 comments');
    expect(text).toContain('The webhook shows \\*\\*nothing\\*\\*.');
    expect(text).not.toContain('issue template');
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.components[0].accent_color).toBe(0x1f883d);
    expect(buttons(message)).toEqual([
      {
        type: 2,
        style: 5,
        label: 'View issue',
        url: 'https://github.com/Qbox-project/pipeline-pling/issues/51',
      },
    ]);
  });

  it('renders closed resolution and semantic color', () => {
    const payload = makePayload({
      action: 'closed',
      issue: {
        ...makePayload().issue,
        state: 'closed',
        state_reason: 'not_planned',
      },
    });
    const message = buildIssueMessage(payload);
    const text = textContents(message).join('\n');

    expect(getIssueColor(payload)).toBe(0x8250df);
    expect(text).toContain('closed issue');
    expect(text).toContain('**Resolution:** not planned');
  });

  it('resolves label and event color overrides before accent color', () => {
    const labelMessage = buildIssueMessage(makePayload(), {
      labelColorPriority: ['bug'],
      eventColors: { 'issue.opened': 0x111111 },
      accentColor: 0x222222,
    });
    expect(labelMessage.components[0].accent_color).toBe(0xd73a4a);

    const eventMessage = buildIssueMessage(makePayload(), {
      labelColorPriority: ['missing'],
      eventColors: { issue: 0x111111 },
      accentColor: 0x222222,
    });
    expect(eventMessage.components[0].accent_color).toBe(0x111111);
  });

  it('supports compact, link-free cards', () => {
    const message = buildIssueMessage(makePayload(), {
      compactMode: true,
      hideLinks: true,
    });
    const text = textContents(message).join('\n');

    expect(text).toContain('#51');
    expect(text).not.toContain('**Author:**');
    expect(text).not.toContain('The webhook');
    expect(text).not.toContain('](');
    expect(buttons(message)).toHaveLength(0);
  });

  it('supports selected details, null fields, and custom body limits', () => {
    const payload = makePayload({
      issue: {
        ...makePayload().issue,
        milestone: null,
        type: null,
        assignees: [],
      },
    });
    const message = buildIssueMessage(payload, {
      details: ['body'],
      bodyMaxLength: 24,
      highlightFirstTimeContributors: false,
      accentColor: 0x123456,
    });
    const text = textContents(message).join('\n');

    expect(text).not.toContain('**Type:**');
    expect(text).not.toContain('**Labels:**');
    expect(text).not.toContain('**Milestone:**');
    expect(text).not.toContain('First-time contributor');
    expect(text).toContain('...');
    expect(message.components[0].accent_color).toBe(0x123456);
  });

  it('anonymizes listed issue participants', () => {
    const message = buildIssueMessage(makePayload(), {
      nameAnonUsers: ['reporter'],
    });
    const serialized = JSON.stringify(message);

    expect(serialized).toContain('Anonymous');
    expect(serialized).not.toContain('github.com/reporter');
    expect(message.avatar_url).toBe(ANONYMOUS_AVATAR_URL);
  });

  it('fully redacts issues created by full-anon users', () => {
    const message = buildIssueMessage(makePayload(), {
      fullAnonUsers: ['reporter'],
    });
    const serialized = JSON.stringify(message);

    expect(serialized).toContain('redacted issue');
    expect(serialized).not.toContain('#51');
    expect(serialized).not.toContain('Support issue notifications');
    expect(serialized).not.toContain('/issues/51');
    expect(buttons(message)).toHaveLength(0);
  });

  it('fully redacts issues with configured privacy labels', () => {
    const message = buildIssueMessage(makePayload(), {
      redactLabels: ['BUG'],
      labelColorPriority: ['bug'],
    });
    const serialized = JSON.stringify(message);

    expect(serialized).toContain('redacted issue');
    expect(serialized).toContain('reporter');
    expect(serialized).not.toContain('#51');
    expect(serialized).not.toContain('discord');
    expect(serialized).not.toContain('/issues/51');
    expect(message.components[0].accent_color).toBe(0x1f883d);
  });

  it('enforces the aggregate Components V2 text budget', () => {
    const longName = 'x'.repeat(500);
    const payload = makePayload({
      issue: {
        ...makePayload().issue,
        body: 'body '.repeat(1000),
        milestone: { title: longName, html_url: `https://github.com/${longName}` },
        type: { name: longName },
      },
    });
    const message = buildIssueMessage(payload, { bodyMaxLength: 1000 });
    const totalLength = textContents(message).reduce(
      (total, content) => total + content.length,
      0,
    );

    expect(totalLength).toBeLessThanOrEqual(4000);
  });
});
