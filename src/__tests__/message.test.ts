import { describe, expect, it } from 'vitest';

import {
  buildDiscordMessage,
  formatGitHubUser,
  getCommitTitle,
  isAnonymousCommit,
  isMeaningfullyDifferent,
  parseBranch,
  parseCoAuthors,
  resolveUsername,
  shouldSkipPush,
  truncate,
} from '../message.js';
import type { PushCommit, PushPayload } from '../types.js';

function makeCommit(overrides: Partial<PushCommit> = {}): PushCommit {
  return {
    id: 'abc1234567890abcdef1234567890abcdef1234',
    message: 'Initial commit',
    url: 'https://github.com/org/repo/commit/abc1234567890abcdef1234567890abcdef1234',
    timestamp: '2026-07-07T12:00:00Z',
    author: {
      name: 'Trevor',
      email: 'trevor@example.com',
      username: 'trevor',
    },
    committer: {
      name: 'Trevor',
      email: 'trevor@example.com',
      username: 'trevor',
    },
    ...overrides,
  };
}

function makePayload(overrides: Partial<PushPayload> = {}): PushPayload {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/org/repo/compare/before...after',
    commits: [makeCommit()],
    repository: {
      full_name: 'org/repo',
      html_url: 'https://github.com/org/repo',
    },
    sender: {
      login: 'merger',
      type: 'User',
      avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
    },
    pusher: {
      name: 'trevor',
      email: 'trevor@example.com',
    },
    ...overrides,
  };
}

function getContainer(message: ReturnType<typeof buildDiscordMessage>) {
  return message.components[0];
}

function getHeaderContent(message: ReturnType<typeof buildDiscordMessage>): string {
  const container = getContainer(message);
  const section = container.components.find((component) => component.type === 9);
  if (!section || section.type !== 9) {
    throw new Error('Expected section component');
  }

  return section.components[0]?.content ?? '';
}

function getCommitContent(message: ReturnType<typeof buildDiscordMessage>): string {
  const container = getContainer(message);
  const textDisplay = container.components.find((component) => component.type === 10);
  if (!textDisplay || textDisplay.type !== 10) {
    throw new Error('Expected commit text display');
  }

  return textDisplay.content;
}

function hasViewChangesButton(message: ReturnType<typeof buildDiscordMessage>): boolean {
  const container = getContainer(message);
  return container.components.some(
    (component) =>
      component.type === 1 &&
      component.components.some((button) => button.label === 'View changes'),
  );
}

describe('parseBranch', () => {
  it('strips refs/heads prefix', () => {
    expect(parseBranch('refs/heads/feature/foo')).toBe('feature/foo');
  });
});

describe('resolveUsername', () => {
  it('uses explicit username when present', () => {
    expect(resolveUsername({ name: 'Trevor', email: 'x@y.com', username: 'trevor' })).toBe(
      'trevor',
    );
  });

  it('parses GitHub noreply email usernames', () => {
    expect(
      resolveUsername({
        name: 'Jane Doe',
        email: '123456+janedoe@users.noreply.github.com',
      }),
    ).toBe('janedoe');
  });
});

describe('parseCoAuthors', () => {
  it('extracts co-authored-by trailers', () => {
    const message = `feat: thing

Co-authored-by: Jane Doe <123456+janedoe@users.noreply.github.com>
Co-authored-by: Pat Example <pat@example.com>`;

    expect(parseCoAuthors(message)).toEqual([
      { name: 'Jane Doe', email: '123456+janedoe@users.noreply.github.com' },
      { name: 'Pat Example', email: 'pat@example.com' },
    ]);
  });
});

describe('formatGitHubUser', () => {
  it('renders profile links when username resolves', () => {
    expect(
      formatGitHubUser({
        name: 'Jane Doe',
        email: '123456+janedoe@users.noreply.github.com',
      }),
    ).toBe('[Jane Doe](https://github.com/janedoe)');
  });
});

describe('isMeaningfullyDifferent', () => {
  it('detects different committer identities', () => {
    expect(
      isMeaningfullyDifferent(
        { name: 'Author', email: 'author@example.com' },
        { name: 'Committer', email: 'committer@example.com' },
      ),
    ).toBe(true);
  });
});

describe('buildDiscordMessage', () => {
  it('builds a Components V2 payload with container layout', () => {
    const message = buildDiscordMessage(makePayload());

    expect(message.flags).toBe(32768);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.components).toHaveLength(1);
    expect(message.components[0].type).toBe(17);
    expect(message.components[0].accent_color).toBe(0xf1e542);
  });

  it('uses sender.login as the actor in the header', () => {
    const header = getHeaderContent(buildDiscordMessage(makePayload()));

    expect(header).toContain('[@merger](https://github.com/merger)');
    expect(header).toContain('[`org/repo/main`](https://github.com/org/repo/compare/before...after)');
    expect(header).not.toContain('trevor@example.com');
  });

  it('renders linked SHAs, titles, authors, co-authors, and committer when different', () => {
    const payload = makePayload({
      commits: [
        makeCommit({
          message: `feat: add widget

Co-authored-by: Jane Doe <123456+janedoe@users.noreply.github.com>`,
          committer: {
            name: 'GitHub',
            email: 'noreply@github.com',
            username: 'web-flow',
          },
        }),
      ],
    });

    const commitContent = getCommitContent(buildDiscordMessage(payload));

    expect(commitContent).toContain('[`abc1234`](https://github.com/org/repo/commit/abc1234567890abcdef1234567890abcdef1234)');
    expect(commitContent).toContain('feat: add widget');
    expect(commitContent).toContain('[Trevor](https://github.com/trevor)');
    expect(commitContent).toContain('co-authored with [Jane Doe](https://github.com/janedoe)');
    expect(commitContent).toContain('committed by [GitHub](https://github.com/web-flow)');
    expect(hasViewChangesButton(buildDiscordMessage(payload))).toBe(true);
  });

  it('redacts anonymous commits and omits sensitive details', () => {
    const secretSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const payload = makePayload({
      commits: [
        makeCommit({
          id: secretSha,
          message: 'feat: secret !anon title\n\nSecret body and Co-authored-by: Hidden <hidden@example.com>',
          author: {
            name: 'Secret Author',
            email: 'secret@example.com',
            username: 'secret-author',
          },
        }),
        makeCommit({
          id: 'feedfacefeedfacefeedfacefeedfacefeedface',
          message: 'chore: also secret !anon',
          author: {
            name: 'Another Author',
            email: 'another@example.com',
          },
        }),
      ],
    });

    const message = buildDiscordMessage(payload);
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);
    const serialized = JSON.stringify(message);

    expect(header).toContain('**Anonymous** is pushing 2 commits');
    expect(commitContent).toContain('`Anonymous commit`');
    expect(commitContent).toContain('`Anonymous commit #2`');
    expect(hasViewChangesButton(message)).toBe(false);
    expect(serialized).not.toContain('!anon');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('Secret');
    expect(serialized).not.toContain('Hidden');
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('another@example.com');
    expect(serialized).not.toContain(secretSha.slice(0, 7));
    expect(serialized).not.toContain('deadbeef');
    expect(serialized).not.toContain('feedface');
    expect(serialized).not.toContain('/commit/');
    expect(serialized).not.toContain(payload.compare);
  });

  it('redacts mixed anonymous pushes without compare or anonymous commit leaks', () => {
    const anonymousSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const anonymousUrl = `https://github.com/org/repo/commit/${anonymousSha}`;
    const compareUrl = 'https://github.com/org/repo/compare/before...after';
    const payload = makePayload({
      compare: compareUrl,
      commits: [
        makeCommit({
          id: anonymousSha,
          url: anonymousUrl,
          message: 'feat: secret !anon title\n\nSecret body and Co-authored-by: Hidden <hidden@example.com>',
          author: {
            name: 'Secret Author',
            email: 'secret@example.com',
            username: 'secret-author',
          },
        }),
        makeCommit({
          message: 'feat: visible change',
        }),
      ],
    });

    const message = buildDiscordMessage(payload);
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);
    const serialized = JSON.stringify(message);

    expect(header).toContain('[@merger](https://github.com/merger)');
    expect(header).toContain('`org/repo/main`');
    expect(header).not.toContain(compareUrl);
    expect(commitContent).toContain('`Anonymous commit`');
    expect(commitContent).toContain('visible change');
    expect(commitContent).toContain('[`abc1234`](https://github.com/org/repo/commit/abc1234567890abcdef1234567890abcdef1234)');
    expect(hasViewChangesButton(message)).toBe(false);
    expect(serialized).not.toContain('!anon');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('Secret');
    expect(serialized).not.toContain('Hidden');
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain(anonymousSha.slice(0, 7));
    expect(serialized).not.toContain('deadbeef');
    expect(serialized).not.toContain(anonymousUrl);
    expect(serialized).not.toContain(compareUrl);
  });

  it('caps listed commits and adds a more indicator', () => {
    const commits = Array.from({ length: 12 }, (_, index) =>
      makeCommit({
        id: `${index.toString().padStart(40, '0')}`,
        message: `commit ${index}`,
      }),
    );

    const commitContent = getCommitContent(
      buildDiscordMessage(makePayload({ commits }), { maxCommits: 10 }),
    );

    expect(commitContent.split('\n')).toHaveLength(11);
    expect(commitContent).toContain('+ 2 more...');
  });
});

describe('shouldSkipPush', () => {
  it('skips empty pushes', () => {
    expect(shouldSkipPush(makePayload({ commits: [] }), true)).toMatch(/No commits/);
  });

  it('skips bot pushes by default', () => {
    expect(
      shouldSkipPush(
        makePayload({ sender: { login: 'dependabot[bot]', type: 'Bot' } }),
        true,
      ),
    ).toMatch(/bot/);
  });
});

describe('helpers', () => {
  it('detects anonymous keyword presence', () => {
    expect(isAnonymousCommit('feat: hide !anon please', '!anon')).toBe(true);
  });

  it('extracts and truncates commit titles', () => {
    expect(getCommitTitle('title\n\nbody')).toBe('title');
    expect(truncate('x'.repeat(80), 72)).toHaveLength(72);
  });
});
