import type {
  GitHubAccount,
  GitHubRepository,
  IssuesPayload,
  PullRequestPayload,
  PushPayload,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isAccount(value: unknown): value is GitHubAccount {
  return (
    isRecord(value) &&
    isString(value.login) &&
    isString(value.type) &&
    (value.avatar_url === undefined || isString(value.avatar_url)) &&
    (value.html_url === undefined || isString(value.html_url))
  );
}

function isRepository(value: unknown): value is GitHubRepository {
  return (
    isRecord(value) &&
    isString(value.full_name) &&
    isString(value.html_url) &&
    (value.name === undefined || isString(value.name))
  );
}

function isLabels(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (label) =>
        isRecord(label) &&
        isString(label.name) &&
        (label.color === undefined || isString(label.color)),
    )
  );
}

function isAccounts(value: unknown): value is GitHubAccount[] {
  return Array.isArray(value) && value.every(isAccount);
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

function isPushCommit(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.message) &&
    isString(value.url) &&
    isRecord(value.author) &&
    isString(value.author.name) &&
    isString(value.author.email) &&
    (value.author.username === undefined || isString(value.author.username))
  );
}

export function isPushPayload(value: unknown): value is PushPayload {
  return (
    isRecord(value) &&
    isString(value.ref) &&
    isString(value.compare) &&
    isRepository(value.repository) &&
    isAccount(value.sender) &&
    Array.isArray(value.commits) &&
    value.commits.every(isPushCommit)
  );
}

export function isPullRequestPayload(
  value: unknown,
): value is PullRequestPayload {
  if (!isRecord(value) || !isRecord(value.pull_request)) {
    return false;
  }

  const pullRequest = value.pull_request;
  return (
    isString(value.action) &&
    typeof value.number === 'number' &&
    isRepository(value.repository) &&
    isAccount(value.sender) &&
    typeof pullRequest.number === 'number' &&
    isString(pullRequest.html_url) &&
    isString(pullRequest.title) &&
    isNullableString(pullRequest.body) &&
    typeof pullRequest.draft === 'boolean' &&
    typeof pullRequest.merged === 'boolean' &&
    isAccount(pullRequest.user) &&
    isRecord(pullRequest.head) &&
    isString(pullRequest.head.ref) &&
    (pullRequest.head.label === undefined || isString(pullRequest.head.label)) &&
    isRecord(pullRequest.base) &&
    isString(pullRequest.base.ref) &&
    isLabels(pullRequest.labels) &&
    isAccounts(pullRequest.assignees) &&
    isAccounts(pullRequest.requested_reviewers) &&
    (pullRequest.requested_teams === undefined ||
      (Array.isArray(pullRequest.requested_teams) &&
        pullRequest.requested_teams.every(
          (team) => isRecord(team) && isString(team.name),
        ))) &&
    isOptionalNumber(pullRequest.additions) &&
    isOptionalNumber(pullRequest.deletions) &&
    isOptionalNumber(pullRequest.changed_files)
  );
}

export function isIssuesPayload(value: unknown): value is IssuesPayload {
  if (!isRecord(value) || !isRecord(value.issue)) {
    return false;
  }

  const issue = value.issue;
  return (
    isString(value.action) &&
    isRepository(value.repository) &&
    isAccount(value.sender) &&
    typeof issue.number === 'number' &&
    isString(issue.html_url) &&
    isString(issue.title) &&
    isNullableString(issue.body) &&
    (issue.state === 'open' || issue.state === 'closed') &&
    (issue.state_reason === undefined ||
      issue.state_reason === null ||
      isString(issue.state_reason)) &&
    isAccount(issue.user) &&
    isLabels(issue.labels) &&
    isAccounts(issue.assignees) &&
    (issue.milestone === undefined ||
      issue.milestone === null ||
      (isRecord(issue.milestone) &&
        isString(issue.milestone.title) &&
        (issue.milestone.html_url === undefined ||
          isString(issue.milestone.html_url)))) &&
    (issue.type === undefined ||
      issue.type === null ||
      (isRecord(issue.type) &&
        isString(issue.type.name) &&
        (issue.type.color === undefined || isString(issue.type.color)))) &&
    isOptionalNumber(issue.comments)
  );
}
