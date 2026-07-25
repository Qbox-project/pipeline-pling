import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { isIssuesPayload, isPullRequestPayload } from '../payload.js';

describe('activity payload validation', () => {
  it.each([
    ['pull-request-opened.json', isPullRequestPayload],
    ['pull-request-merged.json', isPullRequestPayload],
    ['issue-opened.json', isIssuesPayload],
    ['issue-closed.json', isIssuesPayload],
  ])('accepts the representative %s fixture', (filename, validator) => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures', filename), 'utf8'),
    ) as unknown;

    expect(validator(fixture)).toBe(true);
  });

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
