import { describe, expect, it } from 'vitest';

import { colorFromRepoName } from '../color.js';
import {
  buildDiscordMessage,
  buildBranchUrl,
  escapeDiscordMarkdown,
  filterSilentCommits,
  formatCommitAttribution,
  formatCommitTitle,
  formatGitHubUser,
  getCommitDescription,
  getCommitTitle,
  isAnonymousCommit,
  isBranchNotificationAllowed,
  isCommitFullyAnonymous,
  isMeaningfullyDifferent,
  isSilentCommit,
  linkPrReferences,
  parseBranch,
  parseBranchList,
  parseCoAuthors,
  parseUsernameList,
  resolveUsername,
  shouldSkipPush,
  truncate,
} from '../message.js';
import { ANONYMOUS_AVATAR_URL } from '../types.js';
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

  it('rejects invalid usernames that could break generated profile links', () => {
    expect(
      resolveUsername({
        name: 'Contributor',
        email: 'attacker)@users.noreply.github.com',
      }),
    ).toBeUndefined();
    expect(
      resolveUsername({
        name: 'Contributor',
        email: 'contributor@example.com',
        username: 'bad](https://example.com)',
      }),
    ).toBeUndefined();
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

  it('renders Anonymous without a profile link for name-anon users', () => {
    expect(
      formatGitHubUser(
        {
          name: 'ChatDisabled',
          email: '44729807+ChatDisabled@users.noreply.github.com',
          username: 'ChatDisabled',
        },
        ['chatdisabled'],
      ),
    ).toBe('Anonymous');
  });

  it('escapes Markdown in contributor names while preserving the profile link', () => {
    expect(
      formatGitHubUser({
        name: '[Admin](https://example.com) **important**',
        email: '123456+contributor@users.noreply.github.com',
        username: 'contributor',
      }),
    ).toBe(
      '[\\[Admin\\](https://example.com) \\*\\*important\\*\\*](https://github.com/contributor)',
    );
  });
});

describe('escapeDiscordMarkdown', () => {
  it('neutralizes formatting, masked links, quotes, headings, and lists', () => {
    expect(
      escapeDiscordMarkdown(`**bold** [masked](https://example.com)
_italic_ ||spoiler|| \`code\`
# heading
> quote
1. item`),
    ).toBe(
      [
        '\\*\\*bold\\*\\* \\[masked\\](https://example.com)',
        '\\_italic\\_ \\|\\|spoiler\\|\\| \\`code\\`',
        '\\# heading',
        '\\> quote',
        '1\\. item',
      ].join('\n'),
    );
  });
});

describe('parseUsernameList', () => {
  it('parses comma-separated usernames case-insensitively', () => {
    expect(parseUsernameList(' Alice, bob , ,Charlie ')).toEqual([
      'alice',
      'bob',
      'charlie',
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseUsernameList('')).toEqual([]);
    expect(parseUsernameList('  ,  ')).toEqual([]);
  });
});

describe('parseBranchList', () => {
  it('parses comma-separated branch names preserving case', () => {
    expect(parseBranchList(' main, feature/foo , ,Release ')).toEqual([
      'main',
      'feature/foo',
      'Release',
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseBranchList('')).toEqual([]);
    expect(parseBranchList('  ,  ')).toEqual([]);
  });
});

describe('isSilentCommit', () => {
  it('detects silent keyword on the first commit body line', () => {
    expect(isSilentCommit('feat: hide\n\n!silent', '!silent')).toBe(true);
    expect(isSilentCommit('feat: hide\n!silent', '!silent')).toBe(true);
    expect(isSilentCommit('feat: hide !silent please', '!silent')).toBe(false);
    expect(isSilentCommit('feat: hide\n\nnotes\n\n!silent', '!silent')).toBe(false);
  });
});

describe('filterSilentCommits', () => {
  it('removes commits marked with the silent keyword', () => {
    const commits = [
      makeCommit({ message: 'feat: visible' }),
      makeCommit({
        id: '9d369b178074f21542ce55bf447e574aae89778c',
        message: 'chore: hidden\n\n!silent',
      }),
      makeCommit({
        id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        message: 'fix: also visible',
      }),
    ];

    const filtered = filterSilentCommits(commits, '!silent');

    expect(filtered).toHaveLength(2);
    expect(filtered[0].message).toBe('feat: visible');
    expect(filtered[1].message).toBe('fix: also visible');
  });

  it('returns an empty array when all commits are silent', () => {
    const commits = [
      makeCommit({ message: 'feat: hidden\n\n!silent' }),
      makeCommit({
        id: '9d369b178074f21542ce55bf447e574aae89778c',
        message: 'chore: also hidden\n\n!silent',
      }),
    ];

    expect(filterSilentCommits(commits, '!silent')).toEqual([]);
  });
});

describe('isBranchNotificationAllowed', () => {
  it('allows any branch when both lists are empty', () => {
    expect(isBranchNotificationAllowed('main', [], [])).toBe(true);
  });

  it('requires an allowlist match when allowlist is set', () => {
    expect(isBranchNotificationAllowed('main', ['main', 'develop'], [])).toBe(true);
    expect(isBranchNotificationAllowed('feature/foo', ['main'], [])).toBe(false);
  });

  it('rejects denylisted branches', () => {
    expect(isBranchNotificationAllowed('main', [], ['dependabot'])).toBe(true);
    expect(isBranchNotificationAllowed('dependabot', [], ['dependabot'])).toBe(false);
  });

  it('uses case-sensitive branch matching', () => {
    expect(isBranchNotificationAllowed('Main', ['main'], [])).toBe(false);
    expect(isBranchNotificationAllowed('main', ['Main'], [])).toBe(false);
  });

  it('requires allowlist match and not denylist when both are set', () => {
    expect(
      isBranchNotificationAllowed('main', ['main', 'develop'], ['main']),
    ).toBe(false);
    expect(
      isBranchNotificationAllowed('develop', ['main', 'develop'], ['main']),
    ).toBe(true);
  });
});

describe('isCommitFullyAnonymous', () => {
  it('treats keyword commits as fully anonymous', () => {
    expect(
      isCommitFullyAnonymous(
        makeCommit({ message: 'feat: hide\n\n!anon' }),
        '!anon',
        [],
      ),
    ).toBe(true);
  });

  it('treats full-anon authors and co-authors as fully anonymous', () => {
    expect(
      isCommitFullyAnonymous(makeCommit(), '!anon', ['chatdisabled']),
    ).toBe(true);
    expect(
      isCommitFullyAnonymous(
        makeCommit({
          author: {
            name: 'Whereiam',
            email: '84282589+WhereiamL@users.noreply.github.com',
            username: 'WhereiamL',
          },
          message: `feat: thing

Co-authored-by: ChatDisabled <44729807+ChatDisabled@users.noreply.github.com>`,
        }),
        '!anon',
        ['chatdisabled'],
      ),
    ).toBe(true);
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
      '> \\* fix(bridge/qb): correct vehicle prop/colour mapping, 12h clock and Kick loop',
    );
    expect(commitContent).toContain(
      '> \\- modSubwoofer fell back to modKit17 (nitrous) instead of modKit19',
    );
    expect(commitContent).not.toContain('Co-authored-by:');
    expect(commitContent).not.toContain('co-authored with');
    expect(commitContent).not.toContain('committed by');
    expect(commitContent).not.toContain('[GitHub](https://github.com/web-flow)');
    expect(hasViewChangesButton(buildDiscordMessage(payload))).toBe(true);
  });

  it('renders compact commits on consecutive lines without descriptions or authors', () => {
    const secondCommitUrl =
      'https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c';
    const payload = makePayload({
      commits: [
        makeCommit({
          message: 'fix(items.lua): typo but also no\n\nFirst commit body',
        }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message: `feat: add another thing

Second commit body

Co-authored-by: Jane Doe <123456+janedoe@users.noreply.github.com>`,
          url: secondCommitUrl,
        }),
      ],
    });

    const commitContent = getCommitContent(
      buildDiscordMessage(payload, { compactMode: true }),
    );

    expect(commitContent).toBe(
      '[`04ea116`](https://github.com/Qbox-project/txAdminRecipe/commit/04ea116975c20db99cd710337d0bc7ce90e13a65) fix(items.lua): typo but also no' +
        `\n[\`9d369b1\`](${secondCommitUrl}) feat: add another thing`,
    );
    expect(commitContent.split('\n')).toHaveLength(2);
    expect(commitContent).not.toContain('*by*');
    expect(commitContent).not.toContain('commit body');
    expect(commitContent).not.toContain('Jane Doe');
  });

  it('shows every commit by default in compact mode', () => {
    const commits = Array.from({ length: 12 }, (_, index) =>
      makeCommit({
        id: `${index.toString(16).padStart(7, '0')}${'a'.repeat(33)}`,
        message: `commit ${index}`,
      }),
    );

    const commitContent = getCommitContent(
      buildDiscordMessage(makePayload({ commits }), { compactMode: true }),
    );

    expect(commitContent.match(/commit \d+/g)).toHaveLength(12);
    expect(commitContent).toContain('commit 11');
    expect(commitContent).not.toContain('more...');
  });

  it('keeps compact commit lists within the Discord text budget', () => {
    const commits = Array.from({ length: 20 }, (_, index) =>
      makeCommit({
        id: `${index.toString(16).padStart(7, '0')}${'b'.repeat(33)}`,
        message: `compact commit ${index}`,
      }),
    );
    const maxTextLength = 400;

    const message = buildDiscordMessage(makePayload({ commits }), {
      compactMode: true,
      maxTextLength,
    });
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);

    expect(header.length + commitContent.length).toBeLessThanOrEqual(maxTextLength);
    expect(commitContent).toMatch(/\n\+ \d+ more\.\.\.$/);
  });

  it('preserves anonymous commit redaction in compact mode', () => {
    const anonymousSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const payload = makePayload({
      commits: [
        makeCommit({
          id: anonymousSha,
          message: 'secret change\n\n!anon',
          url: `https://github.com/Qbox-project/txAdminRecipe/commit/${anonymousSha}`,
        }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message: 'visible change',
          url: 'https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c',
        }),
      ],
    });

    const message = buildDiscordMessage(payload, { compactMode: true });
    const commitContent = getCommitContent(message);

    expect(commitContent).toContain('`Anonymous commit`\n');
    expect(commitContent).toContain('visible change');
    expect(commitContent).not.toContain('secret change');
    expect(commitContent).not.toContain(anonymousSha.slice(0, 7));
    expect(hasViewChangesButton(message)).toBe(false);
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
    expect(header).toContain('`Qbox-project/txAdminRecipe/main`');
    expect(header).not.toContain('/tree/main');
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
    expect(commitContent).toContain(
      'tweak(voice.cfg): unset voice\\_useSendingRangeOnly',
    );
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

  it('counts all omitted commits when both the list cap and text budget apply', () => {
    const commits = Array.from({ length: 12 }, (_, index) =>
      makeCommit({
        id: `${index.toString().padStart(40, '0')}`,
        message: `budgeted commit ${index}`,
      }),
    );

    const commitContent = getCommitContent(
      buildDiscordMessage(makePayload({ commits }), {
        maxCommits: 10,
        maxTextLength: 538,
      }),
    );
    const commitBlocks = commitContent.split('\n\n');
    const displayedCommits = commitBlocks.filter((block) => !block.startsWith('+ '));
    const omittedMatch = commitContent.match(/\+ (\d+) more\.\.\.$/);

    expect(displayedCommits.length).toBeLessThan(10);
    expect(omittedMatch).not.toBeNull();
    expect(Number(omittedMatch?.[1])).toBe(commits.length - displayedCommits.length);
  });

  it('uses a custom accent color when provided', () => {
    const message = buildDiscordMessage(makePayload(), { accentColor: 0xff00aa });

    expect(message.components[0].accent_color).toBe(0xff00aa);
  });

  it('falls back to the repository hash color when accent color is omitted', () => {
    const message = buildDiscordMessage(makePayload());

    expect(message.components[0].accent_color).toBe(
      colorFromRepoName('Qbox-project/txAdminRecipe'),
    );
  });

  it('omits avatar_url when useSenderAvatar is false', () => {
    const message = buildDiscordMessage(makePayload(), { useSenderAvatar: false });

    expect(message.avatar_url).toBeUndefined();
  });

  it('omits username when useRepoUsername is false', () => {
    const message = buildDiscordMessage(makePayload(), { useRepoUsername: false });

    expect(message.username).toBeUndefined();
  });

  it('uses repo-name override for webhook username and header repository label', () => {
    const message = buildDiscordMessage(makePayload(), {
      repoName: 'My Project',
    });
    const header = getHeaderContent(message);

    expect(message.username).toBe('My Project');
    expect(header).toContain(
      '[`My Project/main`](https://github.com/Qbox-project/txAdminRecipe/tree/main)',
    );
    expect(header).not.toContain('Qbox-project/txAdminRecipe/main');
  });

  it('truncates repo-name override to Discord username limit for username and header', () => {
    const longName = 'x'.repeat(100);
    const message = buildDiscordMessage(makePayload(), {
      repoName: longName,
    });
    const header = getHeaderContent(message);
    const expectedName = `${'x'.repeat(77)}...`;

    expect(message.username).toBe(expectedName);
    expect(message.username).toHaveLength(80);
    expect(header).toContain(`\`${expectedName}/main\``);
  });

  it('does not set username when repo-name override is set but useRepoUsername is false', () => {
    const message = buildDiscordMessage(makePayload(), {
      repoName: 'My Project',
      useRepoUsername: false,
    });
    const header = getHeaderContent(message);

    expect(message.username).toBeUndefined();
    expect(header).toContain(
      '[`My Project/main`](https://github.com/Qbox-project/txAdminRecipe/tree/main)',
    );
  });

  it('keeps Markdown-like repository labels inside an inline code span', () => {
    const message = buildDiscordMessage(makePayload(), {
      repoName: 'Project` **admin**',
    });
    const header = getHeaderContent(message);

    expect(header).toContain('``Project` **admin**/main``');
  });

  it('omits hyperlinks when hideLinks is true', () => {
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
          message: `fix(bridge/qb): correct vehicle prop/colour mapping (#758)

Co-authored-by: ChatDisabled <44729807+ChatDisabled@users.noreply.github.com>`,
          url: 'https://github.com/Qbox-project/qbx_core/commit/45d84858f282f736f64123f396474b37cfb3f2c4',
          author: {
            name: 'Whereiam',
            email: '84282589+WhereiamL@users.noreply.github.com',
            username: 'WhereiamL',
          },
        }),
      ],
    });

    const message = buildDiscordMessage(payload, { hideLinks: true });
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);
    const serialized = JSON.stringify(message);

    expect(header).toContain('**ChatDisabled** is pushing');
    expect(header).not.toMatch(/\[[^\]]+\]\([^)]+\)/);
    expect(header).toContain('`Qbox-project/qbx_core/main`');
    expect(commitContent).toContain('`45d8485`');
    expect(commitContent).not.toMatch(/\[`45d8485`\]\(/);
    expect(commitContent).toContain('(#758)');
    expect(commitContent).not.toContain('[#758](');
    expect(commitContent).toContain('*by* Whereiam & ChatDisabled');
    expect(commitContent).not.toContain('github.com/WhereiamL');
    expect(hasViewChangesButton(message)).toBe(false);
    expect(serialized).not.toContain('View changes');
  });

  it('keeps hyperlinks when hideLinks is false (default)', () => {
    const message = buildDiscordMessage(makePayload());
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);

    expect(header).toContain('[ChatDisabled](https://github.com/ChatDisabled)');
    expect(header).toContain(
      '[`Qbox-project/txAdminRecipe/main`](https://github.com/Qbox-project/txAdminRecipe/tree/main)',
    );
    expect(commitContent).toContain(
      '[`04ea116`](https://github.com/Qbox-project/txAdminRecipe/commit/04ea116975c20db99cd710337d0bc7ce90e13a65)',
    );
    expect(hasViewChangesButton(message)).toBe(true);
  });

  it('anonymizes matched author names while keeping commit details visible', () => {
    const payload = makePayload({
      commits: [
        makeCommit({
          message: 'fix(items.lua): typo but also no',
        }),
      ],
    });

    const message = buildDiscordMessage(payload, {
      nameAnonUsers: ['ChatDisabled'],
    });
    const commitContent = getCommitContent(message);

    expect(commitContent).toContain(
      '[`04ea116`](https://github.com/Qbox-project/txAdminRecipe/commit/04ea116975c20db99cd710337d0bc7ce90e13a65)',
    );
    expect(commitContent).toContain('fix(items.lua): typo but also no');
    expect(commitContent).toContain('*by* Anonymous');
    expect(commitContent).not.toContain('github.com/ChatDisabled');
    expect(hasViewChangesButton(message)).toBe(true);
  });

  it('anonymizes the header actor and avatar for name-anon senders', () => {
    const message = buildDiscordMessage(makePayload(), {
      nameAnonUsers: ['chatdisabled'],
    });
    const header = getHeaderContent(message);

    expect(header).toContain('**Anonymous** is pushing');
    expect(header).not.toContain('github.com/ChatDisabled');
    expect(message.avatar_url).toBe(ANONYMOUS_AVATAR_URL);
  });

  it('fully redacts commits from full-anon users', () => {
    const payload = makePayload({
      commits: [
        makeCommit({
          message: 'fix(items.lua): typo but also no',
        }),
      ],
    });

    const message = buildDiscordMessage(payload, {
      fullAnonUsers: ['ChatDisabled'],
    });
    const commitContent = getCommitContent(message);
    const serialized = JSON.stringify(message);

    expect(commitContent).toBe('`Anonymous commit`');
    expect(serialized).not.toContain('fix(items.lua)');
    expect(serialized).not.toContain('04ea116');
    expect(hasViewChangesButton(message)).toBe(false);
  });

  it('anonymizes the header actor and avatar for full-anon senders', () => {
    const message = buildDiscordMessage(makePayload(), {
      fullAnonUsers: ['chatdisabled'],
    });
    const header = getHeaderContent(message);

    expect(header).toContain('**Anonymous** is pushing');
    expect(header).not.toContain('github.com/ChatDisabled');
    expect(message.avatar_url).toBe(ANONYMOUS_AVATAR_URL);
  });

  it('combines keyword and full-anon redaction in mixed pushes', () => {
    const payload = makePayload({
      compare: 'https://github.com/Qbox-project/txAdminRecipe/compare/before...after',
      commits: [
        makeCommit({
          message: 'fix(items.lua): typo but also no\n\n!anon',
        }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message: 'tweak(voice.cfg): unset voice_useSendingRangeOnly',
          url: 'https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c',
          author: {
            name: 'Other Dev',
            email: '99999999+otherdev@users.noreply.github.com',
            username: 'otherdev',
          },
          committer: {
            name: 'Other Dev',
            email: '99999999+otherdev@users.noreply.github.com',
            username: 'otherdev',
          },
        }),
        makeCommit({
          id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          message: 'secret change from full-anon user',
          url: 'https://github.com/Qbox-project/txAdminRecipe/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          author: {
            name: 'Whereiam',
            email: '84282589+WhereiamL@users.noreply.github.com',
            username: 'WhereiamL',
          },
        }),
      ],
    });

    const message = buildDiscordMessage(payload, {
      fullAnonUsers: ['WhereiamL'],
    });
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);

    expect(header).toContain('`Qbox-project/txAdminRecipe/main`');
    expect(commitContent).toContain('`Anonymous commit`');
    expect(commitContent).toContain(
      'tweak(voice.cfg): unset voice\\_useSendingRangeOnly',
    );
    expect(commitContent).not.toContain('secret change from full-anon user');
    expect(hasViewChangesButton(message)).toBe(false);
  });

  it('does not use anonymous avatar when avatars are disabled for anon senders', () => {
    const message = buildDiscordMessage(makePayload(), {
      nameAnonUsers: ['chatdisabled'],
      useSenderAvatar: false,
    });

    expect(message.avatar_url).toBeUndefined();
  });

  it('budgets header length into the total Components V2 text limit', () => {
    const longTitle = 'x'.repeat(500);
    const commits = Array.from({ length: 20 }, (_, index) =>
      makeCommit({
        id: `${index.toString().padStart(40, '0')}`,
        message: `${longTitle} ${index}`,
      }),
    );

    const message = buildDiscordMessage(makePayload({ commits }), {
      maxTextLength: 4000,
      maxCommits: 20,
    });
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);
    const totalTextLength = header.length + commitContent.length;

    expect(totalTextLength).toBeLessThanOrEqual(4000);
    expect(commitContent).toContain('+ ');
    expect(commitContent).toMatch(/\+ \d+ more\.\.\.$/);
  });

  it('drops trailing commit lines so the truncation notice fits the text budget', () => {
    const title = 'y'.repeat(40);
    const commits = Array.from({ length: 5 }, (_, index) =>
      makeCommit({
        id: `${index.toString().padStart(40, '0')}`,
        message: `${title} ${index}`,
      }),
    );

    const maxTextLength = 538;
    const message = buildDiscordMessage(makePayload({ commits }), {
      maxTextLength,
      maxCommits: 5,
    });
    const header = getHeaderContent(message);
    const commitContent = getCommitContent(message);
    const commitBlocks = commitContent.split('\n\n');
    const displayedCommits = commitBlocks.filter((block) => !block.startsWith('+ '));

    expect(header.length + commitContent.length).toBeLessThanOrEqual(maxTextLength);
    expect(commitContent).toMatch(/\+ \d+ more\.\.\.$/);
    expect(displayedCommits.length).toBeLessThan(commits.length);
    expect(displayedCommits.length).toBeGreaterThan(0);
  });

  it('uses singular commit label when filtered payload has one commit', () => {
    const payload = makePayload({
      commits: [
        makeCommit({ message: 'feat: hidden\n\n!silent' }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message: 'fix: visible change',
          url: 'https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c',
        }),
      ],
    });

    const filteredPayload = {
      ...payload,
      commits: filterSilentCommits(payload.commits, '!silent'),
    };
    const header = getHeaderContent(buildDiscordMessage(filteredPayload));
    const commitContent = getCommitContent(buildDiscordMessage(filteredPayload));

    expect(header).toContain('is pushing 1 commit to');
    expect(header).not.toContain('1 commits');
    expect(commitContent).toContain('fix: visible change');
    expect(commitContent).not.toContain('feat: hidden');
  });

  it('omits silent commits from mixed pushes while keeping non-silent commits', () => {
    const payload = makePayload({
      commits: [
        makeCommit({ message: 'feat: hidden\n\n!silent' }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message: 'fix: visible change',
          url: 'https://github.com/Qbox-project/txAdminRecipe/commit/9d369b178074f21542ce55bf447e574aae89778c',
        }),
        makeCommit({
          id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          message: 'chore: also hidden\n\n!silent',
        }),
      ],
    });

    const filteredPayload = {
      ...payload,
      commits: filterSilentCommits(payload.commits, '!silent'),
    };
    const header = getHeaderContent(buildDiscordMessage(filteredPayload));
    const commitContent = getCommitContent(buildDiscordMessage(filteredPayload));

    expect(header).toContain('is pushing 1 commit to');
    expect(commitContent).toContain('fix: visible change');
    expect(commitContent).not.toContain('feat: hidden');
    expect(commitContent).not.toContain('chore: also hidden');
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

  it('skips pushes to branches not in the allowlist', () => {
    expect(
      shouldSkipPush(makePayload({ ref: 'refs/heads/feature/foo' }), true, {
        branchAllowlist: ['main', 'develop'],
      }),
    ).toMatch(/not in the allowlist/);
  });

  it('allows pushes to branches in the allowlist', () => {
    expect(
      shouldSkipPush(makePayload({ ref: 'refs/heads/main' }), true, {
        branchAllowlist: ['main', 'develop'],
      }),
    ).toBeUndefined();
  });

  it('skips pushes to branches in the denylist', () => {
    expect(
      shouldSkipPush(makePayload({ ref: 'refs/heads/dependabot' }), true, {
        branchDenylist: ['dependabot'],
      }),
    ).toMatch(/in the denylist/);
  });

  it('applies allowlist and denylist together', () => {
    expect(
      shouldSkipPush(makePayload({ ref: 'refs/heads/main' }), true, {
        branchAllowlist: ['main', 'develop'],
        branchDenylist: ['main'],
      }),
    ).toMatch(/in the denylist/);
    expect(
      shouldSkipPush(makePayload({ ref: 'refs/heads/develop' }), true, {
        branchAllowlist: ['main', 'develop'],
        branchDenylist: ['main'],
      }),
    ).toBeUndefined();
  });
});

describe('all-silent skip scenario', () => {
  it('leaves no visible commits when every commit is silent', () => {
    const payload = makePayload({
      commits: [
        makeCommit({ message: 'feat: hidden\n\n!silent' }),
        makeCommit({
          id: '9d369b178074f21542ce55bf447e574aae89778c',
          message: 'chore: also hidden\n\n!silent',
        }),
      ],
    });

    const visibleCommits = filterSilentCommits(payload.commits, '!silent');

    expect(visibleCommits).toHaveLength(0);
    expect(shouldSkipPush(payload, true)).toBeUndefined();
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

  it('leaves (#N) plain when hideLinks is true', () => {
    expect(linkPrReferences('fix: something (#758)', repoUrl, true)).toBe(
      'fix: something (#758)',
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

  it('escapes untrusted title Markdown while preserving generated PR links', () => {
    expect(
      linkPrReferences(
        '**urgent** [review this](https://example.com) (#42)',
        repoUrl,
      ),
    ).toBe(
      '\\*\\*urgent\\*\\* \\[review this\\](https://example.com) ([#42](https://github.com/Qbox-project/qbx_core/pull/42))',
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

  it('leaves PR refs plain when hideLinks is true', () => {
    const message = `fix(bridge/qb): correct vehicle prop/colour mapping (#758)

body`;

    expect(formatCommitTitle(message, 72, repoUrl, true)).toContain('(#758)');
    expect(formatCommitTitle(message, 72, repoUrl, true)).not.toContain('[#758](');
  });
});
