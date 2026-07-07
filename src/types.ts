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
    full_name: string;
    html_url: string;
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

export interface UnfurledMediaItem {
  url: string;
}

export interface TextDisplayComponent {
  type: 10;
  content: string;
}

export interface ThumbnailComponent {
  type: 11;
  media: UnfurledMediaItem;
  description?: string;
}

export interface SectionComponent {
  type: 9;
  components: TextDisplayComponent[];
  accessory: ThumbnailComponent;
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
  components: Array<
    SectionComponent | SeparatorComponent | TextDisplayComponent | ActionRowComponent
  >;
}

export interface DiscordComponentsMessage {
  flags: number;
  allowed_mentions: {
    parse: [];
  };
  components: ContainerComponent[];
}

export interface BuildMessageOptions {
  anonKeyword?: string;
  maxCommits?: number;
  maxTextLength?: number;
  maxTitleLength?: number;
}

export const IS_COMPONENTS_V2 = 1 << 15;
export const ACCENT_COLOR = 0xf1e542;
export const ANONYMOUS_AVATAR_URL =
  'https://avatars.githubusercontent.com/u/0?s=64&v=4';
