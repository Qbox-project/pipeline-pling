import { describe, expect, it } from 'vitest';

import { isIssuesPayload, isPullRequestPayload } from '../payload.js';

describe('activity payload validation', () => {
  it('rejects missing, null, and malformed pull request fields', () => {
    expect(isPullRequestPayload(null)).toBe(false);
    expect(isPullRequestPayload({ action: 'opened' })).toBe(false);
    expect(
      isPullRequestPayload({
        action: 'opened',
        number: 1,
        pull_request: { labels: 'not-an-array' },
      }),
    ).toBe(false);
  });

  it('rejects missing, null, and malformed issue fields', () => {
    expect(isIssuesPayload(null)).toBe(false);
    expect(isIssuesPayload({ action: 'opened' })).toBe(false);
    expect(
      isIssuesPayload({
        action: 'opened',
        issue: { assignees: 'not-an-array' },
      }),
    ).toBe(false);
  });
});
