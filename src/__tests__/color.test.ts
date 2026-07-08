import { describe, expect, it } from 'vitest';

import { colorFromRepoName } from '../color.js';
import { ACCENT_COLOR } from '../types.js';

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
