export interface GitHubUser {
  name: string;
  email: string;
  username?: string;
}

export interface GitHubAccount {
  login: string;
  type: string;
  avatar_url?: string;
  html_url?: string;
}

export interface GitHubLabel {
  name: string;
  color?: string;
}

export interface GitHubRepository {
  name?: string;
  full_name: string;
  html_url: string;
  owner?: {
    login?: string;
    avatar_url?: string;
  };
}

export interface PushCommit {
  id: string;
  message: string;
  url: string;
  timestamp: string;
  author: GitHubUser;
  committer: GitHubUser;
}

export interface PushPayload {
  ref: string;
  compare: string;
  commits: PushCommit[];
  repository: GitHubRepository;
  sender: GitHubAccount;
  pusher: {
    name: string;
    email?: string;
  };
}

export interface PullRequestRef {
  ref: string;
  label?: string;
  sha?: string;
  repo?: {
    full_name?: string;
  } | null;
}

export interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    html_url: string;
    title: string;
    body: string | null;
    draft: boolean;
    merged: boolean;
    user: GitHubAccount;
    author_association?: string;
    head: PullRequestRef;
    base: PullRequestRef;
    labels: GitHubLabel[];
    assignees: GitHubAccount[];
    requested_reviewers: GitHubAccount[];
    requested_teams?: Array<{
      name: string;
      slug?: string;
      html_url?: string;
    }>;
    additions?: number;
    deletions?: number;
    changed_files?: number;
    comments?: number;
    commits?: number;
  };
  repository: GitHubRepository;
  sender: GitHubAccount;
}

export interface IssuesPayload {
  action: string;
  issue: {
    number: number;
    html_url: string;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    state_reason?: string | null;
    user: GitHubAccount;
    author_association?: string;
    labels: GitHubLabel[];
    assignees: GitHubAccount[];
    milestone?: {
      title: string;
      html_url?: string;
    } | null;
    type?: {
      name: string;
      color?: string;
    } | null;
    comments?: number;
  };
  repository: GitHubRepository;
  sender: GitHubAccount;
}

export interface TextDisplayComponent {
  type: 10;
  content: string;
}

export interface SeparatorComponent {
  type: 14;
  divider?: boolean;
  spacing?: 1 | 2;
}

export interface LinkButtonComponent {
  type: 2;
  style: 5;
  label: string;
  url: string;
}

export interface ActionRowComponent {
  type: 1;
  components: LinkButtonComponent[];
}

export interface ContainerComponent {
  type: 17;
  accent_color?: number;
  components: Array<SeparatorComponent | TextDisplayComponent | ActionRowComponent>;
}

export interface DiscordComponentsMessage {
  username?: string;
  avatar_url?: string;
  flags: number;
  allowed_mentions: {
    parse: [];
  };
  components: ContainerComponent[];
}

export interface BuildMessageOptions {
  anonKeyword?: string;
  accentColor?: number;
  useSenderAvatar?: boolean;
  useRepoUsername?: boolean;
  repoName?: string;
  hideLinks?: boolean;
  compactMode?: boolean;
  nameAnonUsers?: string[];
  fullAnonUsers?: string[];
  maxCommits?: number;
  maxTextLength?: number;
  maxTitleLength?: number;
  maxDescriptionLength?: number;
}

export interface BuildPullRequestMessageOptions {
  accentColor?: number;
  useSenderAvatar?: boolean;
  useRepoUsername?: boolean;
  repoName?: string;
  hideLinks?: boolean;
  compactMode?: boolean;
  nameAnonUsers?: string[];
  fullAnonUsers?: string[];
  bodyMaxLength?: number;
  details?: string[];
  highlightFirstTimeContributors?: boolean;
  sizeThresholds?: [number, number, number];
  eventColors?: Record<string, number>;
  labelColorPriority?: string[];
}

export interface BuildIssueMessageOptions {
  accentColor?: number;
  useSenderAvatar?: boolean;
  useRepoUsername?: boolean;
  repoName?: string;
  hideLinks?: boolean;
  compactMode?: boolean;
  nameAnonUsers?: string[];
  fullAnonUsers?: string[];
  bodyMaxLength?: number;
  details?: string[];
  highlightFirstTimeContributors?: boolean;
  eventColors?: Record<string, number>;
  labelColorPriority?: string[];
}

export const IS_COMPONENTS_V2 = 1 << 15;
export const ACCENT_COLOR = 0xf1e542;
export const ANONYMOUS_AVATAR_URL =
  'https://avatars.githubusercontent.com/u/0?s=256&v=4';
