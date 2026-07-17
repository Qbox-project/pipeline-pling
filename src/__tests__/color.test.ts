import { describe, expect, it, vi } from 'vitest';

import {
  colorFromRepoName,
  matchBranchPattern,
  parseBranchColors,
  parseHexColor,
  resolveAccentColor,
} from '../color.js';
import { ACCENT_COLOR } from '../types.js';

describe('parseHexColor', () => {
  it('parses hex colors with a leading hash', () => {
    expect(parseHexColor('#F1E542')).toBe(0xf1e542);
  });

  it('parses hex colors without a leading hash', () => {
    expect(parseHexColor('F1E542')).toBe(0xf1e542);
  });

  it('trims surrounding whitespace', () => {
    expect(parseHexColor('  #AABBCC  ')).toBe(0xaabbcc);
  });

  it('returns undefined for invalid hex values', () => {
    expect(parseHexColor('')).toBeUndefined();
    expect(parseHexColor('   ')).toBeUndefined();
    expect(parseHexColor('#GGG')).toBeUndefined();
    expect(parseHexColor('12345')).toBeUndefined();
    expect(parseHexColor('#1234567')).toBeUndefined();
  });
});

describe('parseBranchColors', () => {
  it('parses comma-separated pattern=color entries', () => {
    expect(parseBranchColors('main=#22c55e, fix/*=#f97316')).toEqual([
      { pattern: 'main', color: 0x22c55e },
      { pattern: 'fix/*', color: 0xf97316 },
    ]);
  });

  it('parses newline-separated entries', () => {
    expect(
      parseBranchColors(`main=#22c55e
develop=#ef4444`),
    ).toEqual([
      { pattern: 'main', color: 0x22c55e },
      { pattern: 'develop', color: 0xef4444 },
    ]);
  });

  it('trims whitespace around patterns, colors, and entries', () => {
    expect(parseBranchColors(' main = #22c55e , develop = ef4444 ')).toEqual([
      { pattern: 'main', color: 0x22c55e },
      { pattern: 'develop', color: 0xef4444 },
    ]);
  });

  it('accepts hex colors without a leading hash', () => {
    expect(parseBranchColors('main=22c55e')).toEqual([
      { pattern: 'main', color: 0x22c55e },
    ]);
  });

  it('skips invalid entries and warns', () => {
    const onWarning = vi.fn();

    expect(parseBranchColors('main=not-a-color, develop=#ef4444', onWarning)).toEqual([
      { pattern: 'develop', color: 0xef4444 },
    ]);
    expect(onWarning).toHaveBeenCalledWith(
      'Invalid hex color "not-a-color" in branch-colors entry "main=not-a-color"; skipping.',
    );
  });

  it('returns an empty list for blank input', () => {
    expect(parseBranchColors('')).toEqual([]);
    expect(parseBranchColors('  \n ,  ')).toEqual([]);
  });
});

describe('matchBranchPattern', () => {
  it('matches exact branch names case-sensitively', () => {
    expect(matchBranchPattern('main', 'main')).toBe(true);
    expect(matchBranchPattern('Main', 'main')).toBe(false);
    expect(matchBranchPattern('main', 'develop')).toBe(false);
  });

  it('matches single-segment wildcards', () => {
    expect(matchBranchPattern('fix/foo', 'fix/*')).toBe(true);
    expect(matchBranchPattern('fix/foo/bar', 'fix/*')).toBe(false);
    expect(matchBranchPattern('feature/foo', 'feature/*')).toBe(true);
  });

  it('matches multi-segment wildcards', () => {
    expect(matchBranchPattern('feature/foo/bar', 'feature/**')).toBe(true);
    expect(matchBranchPattern('release/1.0/hotfix', 'release/**/hotfix')).toBe(true);
  });

  it('treats regex metacharacters literally', () => {
    expect(matchBranchPattern('release-1.0', 'release-1.0')).toBe(true);
    expect(matchBranchPattern('releaseX1X0', 'release.1.0')).toBe(false);
  });
});

describe('resolveAccentColor', () => {
  const branchColors = parseBranchColors('main=#22c55e, fix/*=#f97316, develop=#ef4444');

  it('uses the first matching branch-colors rule in declaration order', () => {
    expect(resolveAccentColor('main', branchColors)).toBe(0x22c55e);
    expect(resolveAccentColor('fix/foo', branchColors)).toBe(0xf97316);
    expect(resolveAccentColor('develop', branchColors)).toBe(0xef4444);
  });

  it('falls back to accent-color when no branch pattern matches', () => {
    expect(resolveAccentColor('feature/foo', branchColors, 0xaabbcc)).toBe(0xaabbcc);
  });

  it('falls back to the repository hash color when no rule or accent color is set', () => {
    expect(resolveAccentColor('feature/foo', [], undefined, 'Qbox-project/txAdminRecipe')).toBe(
      colorFromRepoName('Qbox-project/txAdminRecipe'),
    );
  });

  it('prefers branch-colors over accent-color', () => {
    expect(resolveAccentColor('main', branchColors, 0xaabbcc)).toBe(0x22c55e);
  });
});

describe('colorFromRepoName', () => {
  it('returns the same accent color for the same repo name', () => {
    expect(colorFromRepoName('Qbox-project/txAdminRecipe')).toBe(
      colorFromRepoName('Qbox-project/txAdminRecipe'),
    );
  });

  it('returns different accent colors for different repo names', () => {
    expect(colorFromRepoName('Qbox-project/qbx_core')).not.toBe(
      colorFromRepoName('Qbox-project/txAdminRecipe'),
    );
  });

  it('falls back to the default accent color when repo name is empty', () => {
    expect(colorFromRepoName('')).toBe(ACCENT_COLOR);
  });
});
