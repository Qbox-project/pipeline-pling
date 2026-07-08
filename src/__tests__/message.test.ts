import { describe, expect, it } from 'vitest';

import { colorFromRepoName } from '../color.js';
import {
  buildDiscordMessage,
  buildBranchUrl,
  formatCommitAttribution,
  formatCommitTitle,
  formatGitHubUser,
  getCommitDescription,
  getCommitTitle,
  isAnonymousCommit,
  isMeaningfullyDifferent,
  linkPrReferences,
  parseBranch,
  parseCoAuthors,
  resolveUsername,
  shouldSkipPush,
  truncate,
} from '../message.js';
import type { PushCommit, PushPayload } from '../types.js';

function makeCommit(overrides: Partial<PushCommit> = {}): PushCommit {
  return {
    id: '04ea116975c20db99cd710337d0bc7ce90e13a65',
    message: 'fix(items.lua): typo but also no',
    url: 'https://github.com/Qbox-project/txAdminRecipe/commit/04ea116975c20db99cd710337d0bc7ce90e13a65',
    timestamp: '2025-09-06T22:06:29Z',
    author: {
      name: 'ChatDisabled',
      email: '44729807+ChatDisabled@users.noreply.github.com',
      username: 'ChatDisabled',
    },
    committer: {
      name: 'ChatDisabled',
      email: '44729807+ChatDisabled@users.noreply.github.com',
      username: 'ChatDisabled',
    },
    ...overrides,
  };
}

function makePayload(overrides: Partial<PushPayload> = {}): PushPayload {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/Qbox-project/txAdminRecipe/compare/50f87dc...9d369b1',
    commits: [makeCommit()],
    repository: {
      name: 'txAdminRecipe',
      full_name: 'Qbox-project/txAdminRecipe',
      html_url: 'https://github.com/Qbox-project/txAdminRecipe',
    },
    sender: {
      login: 'ChatDisabled',
      type: 'User',
      avatar_url: 'https://avatars.githubusercontent.com/u/44729807?v=4',
    },
    pusher: {
      name: 'ChatDisabled',
      email: '44729807+ChatDisabled@users.noreply.github.com',
    },
    ...overrides,
  };
}

function getContainer(message: ReturnType<typeof buildDiscordMessage>) {
  return message.components[0];
}

function getHeaderContent(message: ReturnType<typeof buildDiscordMessage>): string {
  const container = getContainer(message);
  const textDisplays = container.components.filter((component) => component.type === 10);
  const header = textDisplays[0];
  if (!header || header.type !== 10) {
    throw new Error('Expected header text display');
  }

  return header.content;
}

function getCommitContent(message: ReturnType<typeof buildDiscordMessage>): string {
  const container = getContainer(message);
  const textDisplays = container.components.filter((component) => component.type === 10);
  const textDisplay = textDisplays[1];
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

describe('buildBranchUrl', () => {
  it('links to the repository branch tree view', () => {
    expect(buildBranchUrl('https://github.com/Qbox-project/txAdminRecipe', 'main')).toBe(
      'https://github.com/Qbox-project/txAdminRecipe/tree/main',
    );
    expect(
      buildBranchUrl('https://github.com/Qbox-project/qbx_core/', 'feature/foo'),
    ).toBe('https://github.com/Qbox-project/qbx_core/tree/feature/foo');
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

describe('formatCommitAttribution', () => {
  it('renders the author as a profile link when there are no co-authors', () => {
    expect(
      formatCommitAttribution(
        {
          name: 'ChatDisabled',
          email: '44729807+ChatDisabled@users.noreply.github.com',
          username: 'ChatDisabled',
        },
        [],
      ),
    ).toBe('*by* [ChatDisabled](https://github.com/ChatDisabled)');
  });

  it('joins author and a single co-author with ampersand', () => {
    expect(
      formatCommitAttribution(
        {
          name: 'Whereiam',
          email: '84282589+WhereiamL@users.noreply.github.com',
          username: 'WhereiamL',
        },
        [
          {
            name: 'ChatDisabled',
            email: '44729807+ChatDisabled@users.noreply.github.com',
          },
        ],
      ),
    ).toBe(
      '*by* [Whereiam](https://github.com/WhereiamL) & [ChatDisabled](https://github.com/ChatDisabled)',
    );
  });

  it('comma-separates multiple co-authors after the ampersand', () => {
    expect(
      formatCommitAttribution(
        {
          name: 'Whereiam',
          email: '84282589+WhereiamL@users.noreply.github.com',
          username: 'WhereiamL',
        },
        [
          {
            name: 'ChatDisabled',
            email: '44729807+ChatDisabled@users.noreply.github.com',
          },
          {
            name: 'Jane Doe',
            email: '123456+janedoe@users.noreply.github.com',
          },
        ],
      ),
    ).toBe(
      '*by* [Whereiam](https://github.com/WhereiamL) & [ChatDisabled](https://github.com/ChatDisabled), [Jane Doe](https://github.com/janedoe)',
    );
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

    expect(message.username).toBe('txAdminRecipe');
    expect(message.avatar_url).toBe('https://avatars.githubusercontent.com/u/44729807?v=4&s=256');
    expect(message.flags).toBe(32768);
    expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.components).toHaveLength(1);
    expect(message.components[0].type).toBe(17);
    expect(message.components[0].accent_color).toBe(
      colorFromRepoName('Qbox-project/txAdminRecipe'),
    );
    expect(message.components[0].components[0].type).toBe(10);
  });

  it('uses sender avatar for the webhook avatar when repository owner avatar is present', () => {
    const message = buildDiscordMessage(
      makePayload({
        repository: {
          name: 'pipeline-pling',
          full_name: 'qbox-project/pipeline-pling',
          html_url: 'https://github.com/qbox-project/pipeline-pling',
          owner: {
            login: 'qbox-project',
            avatar_url: 'https://avatars.githubusercontent.com/u/123?v=4',
          },
        },
      }),
    );

    expect(message.username).toBe('pipeline-pling');
    expect(message.avatar_url).toBe('https://avatars.githubusercontent.com/u/44729807?v=4&s=256');
  });

  it('caps the webhook username to Discord limits', () => {
    const message = buildDiscordMessage(
      makePayload({
        repository: {
          name: 'x'.repeat(100),
          full_name: `org/${'x'.repeat(100)}`,
          html_url: 'https://github.com/org/repo',
        },
      }),
    );

    expect(message.username).toHaveLength(80);
    expect(message.username).toMatch(/\.\.\.$/);
  });

  it('falls back to the sender avatar when repository owner identity is unavailable', () => {
    const message = buildDiscordMessage(
      makePayload({
        repository: {
          full_name: 'repo',
          html_url: 'https://github.com/repo',
        },
      }),
    );

    expect(message.username).toBe('repo');
    expect(message.avatar_url).toBe('https://avatars.githubusercontent.com/u/44729807?v=4&s=256');
  });

  it('uses sender.login as the actor in the header', () => {
    const header = getHeaderContent(buildDiscordMessage(makePayload()));

    expect(header).toContain('[ChatDisabled](https://github.com/ChatDisabled)');
    expect(header).not.toContain('[@ChatDisabled]');
    expect(header).toContain(
      '[`Qbox-project/txAdminRecipe/main`](https://github.com/Qbox-project/txAdminRecipe/tree/main)',
    );
    expect(header).not.toContain('44729807+ChatDisabled@users.noreply.github.com');
  });

  it('renders linked SHAs, titles, authors, and co-authors without committer info', () => {
    const payload = makePayload({
      compare: 'https://github.com/Qbox-project/qbx_core/compare/d3b3fa7...45d8485',
      repository: {
        name: 'qbx_core',
        full_name: 'Qbox-project/qbx_core',
        html_url: 'https://github.com/Qbox-project/qbx_core',
      },
      commits: [
        makeCommit({
          id: '45d84858f282f736f64123f396474b37cfb3f2c4',
          message: `fix(bridge/qb): correct vehicle prop/colour mapping, 12h clock and Ki… (#758)

* fix(bridge/qb): correct vehicle prop/colour mapping, 12h clock and Kick loop

- modSubwoofer fell back to modKit17 (nitrous) instead of modKit19, so
 qb props carried the wrong subwoofer mod.
- the secondary-colour path passed props.color1 straight to
 SetVehicleColours; when color1 is a custom RGB table that is not a valid
 colour index. Fall back to colorPrimary unless color1 is a number.
- GetCurrentTime reported noon (hour 12) as AM and never set
 formattedHour for hours 0-12, so midnight/noon and AM hours formatted
 wrong. Use standard 12-hour conversion.
- Kick ran an unguarded \`while true\` with no Wait: a nil source spun the
 thread forever, and a disconnected player (ping < 0) spawned DropPlayer
 threads every 100ms indefinitely. The retry loop is pointless since
 DropPlayer already ran once; remove it.

* fix(modules/utils): apply GetCurrentTime 12h conversion fix

---------

Co-authored-by: ChatDisabled <44729807+ChatDisabled@users.noreply.github.com>`,
          url: 'https://github.com/Qbox-project/qbx_core/commit/45d84858f282f736f64123f396474b37cfb3f2c4',
          timestamp: '2026-07-06T21:13:20Z',
          author: {
            name: 'Whereiam',
            email: '84282589+WhereiamL@users.noreply.github.com',
            username: 'WhereiamL',
          },
          committer: {
            name: 'GitHub',
            email: 'noreply@github.com',
            username: 'web-flow',
          },
        }),
      ],
    });

    const commitContent = getCommitContent(buildDiscordMessage(payload));

    expect(commitContent).toContain(
      '[`45d8485`](https://github.com/Qbox-project/qbx_core/commit/45d84858f282f736f64123f396474b37cfb3f2c4)',
    );
    expect(commitContent).toContain(
      '([#758](https://github.com/Qbox-project/qbx_core/pull/758))',
    );
    expect(commitContent).toContain(
      'fix(bridge/qb): correct vehicle prop/colour mapping, 12h clock...',
    );
    expect(commitContent).toMatch(
      /\n\*by\* \[Whereiam\]\(https:\/\/github\.com\/WhereiamL\) & \[ChatDisabled\]\(https:\/\/github\.com\/ChatDisabled\)/,
    );
    expect(commitContent).not.toContain(' — [Whereiam]');
    expect(commitContent).toContain(
      '> * fix(bridge/qb): correct vehicle prop/colour mapping, 12h clock and Kick loop',
    );
    expect(commitContent).toContain(
      '> - modSubwoofer fell back to modKit17 (nitrous) instead of modKit19',
    );
    expect(commitContent).not.toContain('Co-authored-by:');
    expect(commitContent).not.toContain('co-authored with');
    expect(commitContent).not.toContain('committed by');
    expect(commitContent).not.toContain('[GitHub](https://github.com/web-flow)');
    expect(hasViewChangesButton(buildDiscordMessage(payload))).toBe(true);
  });

  it('redacts anonymous commits and omits sensitive details', () => {
    const payload = makePayload({
      commits: [
        makeCommit({
          message: 'fix(items.lua): typo but also no\n\n!anon',
        }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message:
            'tweak(voice.cfg): unset voice_useSendingRangeOnly\n\n!anon\n\nFollowing: https://github.com/AvarianKnight/pma-voice/commit/9bf911f2c8dfd7a63a0e3d9259035ca0db1368ab',
          url: 'https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c',
          timestamp: '2025-11-27T15:48:53Z',
        }),
      ],
    });

    const message = buildDiscordMessage(payload);
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);
    const serialized = JSON.stringify(message);

    expect(header).toContain('[ChatDisabled](https://github.com/ChatDisabled)');
    expect(header).toContain(
      '[`Qbox-project/txAdminRecipe/main`](https://github.com/Qbox-project/txAdminRecipe/tree/main)',
    );
    expect(message.avatar_url).toBe('https://avatars.githubusercontent.com/u/44729807?v=4&s=256');
    expect(commitContent).toContain('`Anonymous commit`');
    expect(commitContent).not.toContain('Anonymous commit #');
    expect(hasViewChangesButton(message)).toBe(false);
    expect(serialized).not.toContain('!anon');
    expect(serialized).not.toContain('fix(items.lua)');
    expect(serialized).not.toContain('voice_useSendingRangeOnly');
    expect(serialized).not.toContain('Following:');
    expect(serialized).not.toContain('44729807+ChatDisabled@users.noreply.github.com');
    expect(serialized).not.toContain('04ea116');
    expect(serialized).not.toContain('9d369b1');
    expect(serialized).not.toContain('/commit/');
    expect(serialized).not.toContain(payload.compare);
  });

  it('redacts mixed anonymous pushes without compare or anonymous commit leaks', () => {
    const anonymousSha = '04ea116975c20db99cd710337d0bc7ce90e13a65';
    const anonymousUrl = `https://github.com/Qbox-project/txAdminRecipe/commit/${anonymousSha}`;
    const compareUrl = 'https://github.com/Qbox-project/txAdminRecipe/compare/before...after';
    const payload = makePayload({
      compare: compareUrl,
      commits: [
        makeCommit({
          id: anonymousSha,
          url: anonymousUrl,
          message: 'fix(items.lua): typo but also no\n\n!anon',
        }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message:
            'tweak(voice.cfg): unset voice_useSendingRangeOnly\n\nFollowing: https://github.com/AvarianKnight/pma-voice/commit/9bf911f2c8dfd7a63a0e3d9259035ca0db1368ab',
          url: 'https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c',
          timestamp: '2025-11-27T15:48:53Z',
        }),
      ],
    });

    const message = buildDiscordMessage(payload);
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);
    const serialized = JSON.stringify(message);

    expect(header).toContain('[ChatDisabled](https://github.com/ChatDisabled)');
    expect(header).toContain('`Qbox-project/txAdminRecipe/main`');
    expect(header).not.toContain(compareUrl);
    expect(commitContent).toContain('`Anonymous commit`');
    expect(commitContent).toContain('tweak(voice.cfg): unset voice_useSendingRangeOnly');
    expect(commitContent).toContain(
      '> Following: https://github.com/AvarianKnight/pma-voice/commit/9bf911f2c8dfd7a63a0e3d9259035ca0db1368ab',
    );
    expect(commitContent).toContain(
      '[`9d369b1`](https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c)',
    );
    expect(hasViewChangesButton(message)).toBe(false);
    expect(serialized).not.toContain('!anon');
    expect(serialized).not.toContain('fix(items.lua)');
    expect(serialized).not.toContain(anonymousSha.slice(0, 7));
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

    expect((commitContent.match(/\*by\*/g) ?? []).length).toBe(10);
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
  it('detects anonymous keyword on the first commit body line', () => {
    expect(isAnonymousCommit('feat: hide\n\n!anon', '!anon')).toBe(true);
    expect(isAnonymousCommit('feat: hide\n!anon', '!anon')).toBe(true);
    expect(isAnonymousCommit('feat: hide !anon please', '!anon')).toBe(false);
    expect(isAnonymousCommit('feat: hide\n\nnotes\n\n!anon', '!anon')).toBe(false);
  });

  it('extracts and truncates commit titles', () => {
    expect(getCommitTitle('title\n\nbody')).toBe('title');
    expect(truncate('x'.repeat(80), 72)).toHaveLength(72);
  });

  it('extracts commit descriptions without co-author trailers', () => {
    const description = getCommitDescription(`title

Body line

Co-authored-by: Jane Doe <123456+janedoe@users.noreply.github.com>`);

    expect(description).toBe('Body line');
  });
});

describe('linkPrReferences', () => {
  const repoUrl = 'https://github.com/Qbox-project/qbx_core';

  it('replaces (#N) with Discord markdown PR links', () => {
    expect(linkPrReferences('fix: something (#758)', repoUrl)).toBe(
      'fix: something ([#758](https://github.com/Qbox-project/qbx_core/pull/758))',
    );
  });

  it('replaces multiple PR references', () => {
    expect(linkPrReferences('merge: a (#1) and (#2)', repoUrl)).toBe(
      'merge: a ([#1](https://github.com/Qbox-project/qbx_core/pull/1)) and ([#2](https://github.com/Qbox-project/qbx_core/pull/2))',
    );
  });

  it('strips trailing slash from repo URL', () => {
    expect(linkPrReferences('fix (#99)', `${repoUrl}/`)).toBe(
      'fix ([#99](https://github.com/Qbox-project/qbx_core/pull/99))',
    );
  });
});

describe('formatCommitTitle', () => {
  const repoUrl = 'https://github.com/Qbox-project/qbx_core';

  it('truncates base title while preserving linked PR ref at end', () => {
    const message = `fix(bridge/qb): correct vehicle prop/colour mapping, 12h clock and Ki… (#758)

body`;

    const title = formatCommitTitle(message, 72, repoUrl);

    expect(title).toContain('([#758](https://github.com/Qbox-project/qbx_core/pull/758))');
    expect(title).toContain(
      'fix(bridge/qb): correct vehicle prop/colour mapping, 12h clock...',
    );
    expect(title.replace(/\[[^\]]+\]\([^)]+\)/g, (match) => {
      const labelMatch = match.match(/^\[([^\]]+)\]/);
      return labelMatch?.[1] ?? match;
    }).length).toBeLessThanOrEqual(72);
  });

  it('truncates plain titles without PR refs as before', () => {
    expect(formatCommitTitle('short title', 72, repoUrl)).toBe('short title');
    expect(formatCommitTitle('x'.repeat(80), 72, repoUrl)).toHaveLength(72);
  });
});
