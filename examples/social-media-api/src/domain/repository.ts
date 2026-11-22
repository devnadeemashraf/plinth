import type { SocialComment, SocialPost, SocialUser } from "./types.js";

export interface SocialRepositoryPort {
  initSchema(): Promise<void>;
  createUser(user: SocialUser): Promise<void>;
  findUserById(id: string): Promise<SocialUser | null>;
  findUserByHandle(handle: string): Promise<SocialUser | null>;
  createPost(post: SocialPost): Promise<void>;
  findPostById(id: string): Promise<SocialPost | null>;
  deletePost(id: string): Promise<void>;
  createComment(comment: SocialComment): Promise<void>;
  listCommentsByPostId(postId: string): Promise<readonly SocialComment[]>;
  followUser(followerId: string, followingId: string): Promise<void>;
  unfollowUser(followerId: string, followingId: string): Promise<void>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }>;
  getTimelineFeed(userId: string, limit: number, cursor?: string): Promise<readonly SocialPost[]>;
}
