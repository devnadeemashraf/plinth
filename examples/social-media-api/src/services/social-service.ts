import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  generateUuidV7,
  NotFoundError,
} from "@plinth/core";
import {
  canCreateComment,
  canCreatePost,
  canDeletePost,
  DEFAULT_USER_PERMISSIONS,
  MODERATOR_PERMISSIONS,
} from "../domain/permissions.js";
import type { SocialRepositoryPort } from "../domain/repository.js";
import type { SocialComment, SocialPost, SocialUser } from "../domain/types.js";

export interface RegisterUserInput {
  readonly handle: string;
  readonly displayName: string;
  readonly bio?: string | undefined;
  readonly isModerator?: boolean | undefined;
}

export interface CreatePostInput {
  readonly authorId: string;
  readonly content: string;
  readonly mediaUrl?: string | undefined;
  readonly tags?: readonly string[] | undefined;
}

export class SocialService {
  readonly #repo: SocialRepositoryPort;

  constructor(repo: SocialRepositoryPort) {
    this.#repo = repo;
  }

  async registerUser(input: RegisterUserInput): Promise<SocialUser> {
    const cleanHandle = input.handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(cleanHandle)) {
      throw new BadRequestError(
        "Handle must be 3-30 characters containing only lowercase letters, numbers, and underscores.",
        { code: "INVALID_HANDLE" },
      );
    }

    const existing = await this.#repo.findUserByHandle(cleanHandle);
    if (existing) {
      throw new ConflictError(`Handle '@${cleanHandle}' is already taken.`, {
        code: "HANDLE_TAKEN",
      });
    }

    const permissions = input.isModerator ? MODERATOR_PERMISSIONS : DEFAULT_USER_PERMISSIONS;
    const user: SocialUser = {
      id: generateUuidV7(),
      handle: cleanHandle,
      displayName: input.displayName.trim(),
      bio: input.bio?.trim(),
      permissions,
      followersCount: 0,
      followingCount: 0,
      createdAt: new Date().toISOString(),
    };

    await this.#repo.createUser(user);
    return user;
  }

  async getUser(handleOrId: string): Promise<SocialUser> {
    const clean = handleOrId.trim();
    let user = await this.#repo.findUserById(clean);
    if (!user) {
      user = await this.#repo.findUserByHandle(clean.replace(/^@/, ""));
    }
    if (!user) {
      throw new NotFoundError(`User '${handleOrId}' not found.`, { code: "USER_NOT_FOUND" });
    }
    return user;
  }

  async createPost(input: CreatePostInput): Promise<SocialPost> {
    const author = await this.#repo.findUserById(input.authorId);
    if (!author) {
      throw new NotFoundError("Author user not found.", { code: "USER_NOT_FOUND" });
    }

    if (!canCreatePost(author.permissions)) {
      throw new ForbiddenError("You do not have permission to create posts.", {
        code: "POST_CREATE_DENIED",
      });
    }

    const trimmedContent = input.content.trim();
    if (trimmedContent.length === 0 || trimmedContent.length > 500) {
      throw new BadRequestError("Post content must be between 1 and 500 characters.", {
        code: "INVALID_POST_CONTENT",
      });
    }

    // Auto-extract hashtags from text if not provided
    const extractedTags =
      input.tags ??
      Array.from(trimmedContent.matchAll(/#([a-zA-Z0-9_]+)/g)).map((m) =>
        (m[1] ?? "").toLowerCase(),
      );

    const post: SocialPost = {
      id: generateUuidV7(),
      authorId: author.id,
      authorHandle: author.handle,
      content: trimmedContent,
      mediaUrl: input.mediaUrl,
      tags: extractedTags,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    };

    await this.#repo.createPost(post);
    return post;
  }

  async getPost(id: string): Promise<SocialPost> {
    const post = await this.#repo.findPostById(id);
    if (!post) {
      throw new NotFoundError(`Post '${id}' not found.`, { code: "POST_NOT_FOUND" });
    }
    return post;
  }

  async deletePost(actorId: string, postId: string): Promise<void> {
    const actor = await this.#repo.findUserById(actorId);
    if (!actor) {
      throw new NotFoundError("Actor user not found.", { code: "USER_NOT_FOUND" });
    }

    const post = await this.#repo.findPostById(postId);
    if (!post) {
      throw new NotFoundError(`Post '${postId}' not found.`, { code: "POST_NOT_FOUND" });
    }

    const isAuthor = post.authorId === actor.id;
    if (!canDeletePost(actor.permissions, isAuthor)) {
      throw new ForbiddenError(
        "You do not have permission to delete this post. Must be author or moderator.",
        { code: "POST_DELETE_DENIED" },
      );
    }

    await this.#repo.deletePost(postId);
  }

  async addComment(authorId: string, postId: string, content: string): Promise<SocialComment> {
    const author = await this.#repo.findUserById(authorId);
    if (!author) {
      throw new NotFoundError("Author user not found.", { code: "USER_NOT_FOUND" });
    }

    if (!canCreateComment(author.permissions)) {
      throw new ForbiddenError("You do not have permission to add comments.", {
        code: "COMMENT_CREATE_DENIED",
      });
    }

    const post = await this.#repo.findPostById(postId);
    if (!post) {
      throw new NotFoundError(`Post '${postId}' not found.`, { code: "POST_NOT_FOUND" });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0 || trimmedContent.length > 280) {
      throw new BadRequestError("Comment content must be between 1 and 280 characters.", {
        code: "INVALID_COMMENT_CONTENT",
      });
    }

    const comment: SocialComment = {
      id: generateUuidV7(),
      postId: post.id,
      authorId: author.id,
      authorHandle: author.handle,
      content: trimmedContent,
      createdAt: new Date().toISOString(),
    };

    await this.#repo.createComment(comment);
    return comment;
  }

  async listComments(postId: string): Promise<readonly SocialComment[]> {
    const post = await this.#repo.findPostById(postId);
    if (!post) {
      throw new NotFoundError(`Post '${postId}' not found.`, { code: "POST_NOT_FOUND" });
    }
    return this.#repo.listCommentsByPostId(postId);
  }

  async toggleLike(
    userId: string,
    postId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const user = await this.#repo.findUserById(userId);
    if (!user) {
      throw new NotFoundError("User not found.", { code: "USER_NOT_FOUND" });
    }

    const post = await this.#repo.findPostById(postId);
    if (!post) {
      throw new NotFoundError(`Post '${postId}' not found.`, { code: "POST_NOT_FOUND" });
    }

    return this.#repo.toggleLike(postId, userId);
  }

  async toggleFollow(
    followerId: string,
    targetUserId: string,
  ): Promise<{ following: boolean }> {
    if (followerId === targetUserId) {
      throw new BadRequestError("You cannot follow yourself.", { code: "SELF_FOLLOW_FORBIDDEN" });
    }

    const follower = await this.#repo.findUserById(followerId);
    if (!follower) {
      throw new NotFoundError("Follower user not found.", { code: "USER_NOT_FOUND" });
    }

    const target = await this.#repo.findUserById(targetUserId);
    if (!target) {
      throw new NotFoundError("Target user to follow not found.", { code: "USER_NOT_FOUND" });
    }

    const alreadyFollowing = await this.#repo.isFollowing(followerId, targetUserId);
    if (alreadyFollowing) {
      await this.#repo.unfollowUser(followerId, targetUserId);
      return { following: false };
    }

    await this.#repo.followUser(followerId, targetUserId);
    return { following: true };
  }

  async getTimelineFeed(
    userId: string,
    limit = 20,
    cursor?: string,
  ): Promise<readonly SocialPost[]> {
    const user = await this.#repo.findUserById(userId);
    if (!user) {
      throw new NotFoundError("User not found.", { code: "USER_NOT_FOUND" });
    }

    return this.#repo.getTimelineFeed(userId, limit, cursor);
  }
}
