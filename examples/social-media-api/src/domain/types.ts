export interface SocialUser {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly bio?: string | undefined;
  readonly permissions: bigint;
  readonly followersCount: number;
  readonly followingCount: number;
  readonly createdAt: string;
}

export interface SocialPost {
  readonly id: string;
  readonly authorId: string;
  readonly authorHandle: string;
  readonly content: string;
  readonly mediaUrl?: string | undefined;
  readonly tags: readonly string[];
  readonly likeCount: number;
  readonly commentCount: number;
  readonly createdAt: string;
}

export interface SocialComment {
  readonly id: string;
  readonly postId: string;
  readonly authorId: string;
  readonly authorHandle: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface TimelineQuery {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}
