export interface GitHubUser {
  name: string;
  email: string;
  username?: string;
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
  repository: {
    name?: string;
    full_name: string;
    html_url: string;
    owner?: {
      login?: string;
      avatar_url?: string;
    };
  };
  sender: {
    login: string;
    type: string;
    avatar_url?: string;
  };
  pusher: {
    name: string;
    email?: string;
  };
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
  nameAnonUsers?: string[];
  fullAnonUsers?: string[];
  maxCommits?: number;
  maxTextLength?: number;
  maxTitleLength?: number;
  maxDescriptionLength?: number;
}

export const IS_COMPONENTS_V2 = 1 << 15;
export const ACCENT_COLOR = 0xf1e542;
export const ANONYMOUS_AVATAR_URL =
  'https://avatars.githubusercontent.com/u/0?s=256&v=4';
