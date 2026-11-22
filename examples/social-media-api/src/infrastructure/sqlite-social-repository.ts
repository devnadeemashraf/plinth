import type { DatabasePort } from "@plinth/core";
import { fromCanonicalHex, toCanonicalHex } from "@plinth/core";
import type { SocialRepositoryPort } from "../domain/repository.js";
import type { SocialComment, SocialPost, SocialUser } from "../domain/types.js";

interface UserRow {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  permissions_hex: string;
  followers_count: number;
  following_count: number;
  created_at: string;
}

interface PostRow {
  id: string;
  author_id: string;
  author_handle: string;
  content: string;
  media_url: string | null;
  tags_json: string;
  like_count: number;
  comment_count: number;
  created_at: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  author_handle: string;
  content: string;
  created_at: string;
}

export class SqliteSocialRepository implements SocialRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initSchema(): Promise<void> {
    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS social_users (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        bio TEXT,
        permissions_hex TEXT NOT NULL,
        followers_count INTEGER NOT NULL DEFAULT 0,
        following_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        author_handle TEXT NOT NULL,
        content TEXT NOT NULL,
        media_url TEXT,
        tags_json TEXT NOT NULL,
        like_count INTEGER NOT NULL DEFAULT 0,
        comment_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS social_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_handle TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS social_follows (
        follower_id TEXT NOT NULL,
        following_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (follower_id, following_id)
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS social_likes (
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (post_id, user_id)
      );
    `);

    await this.#db.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_author ON social_posts(author_id, created_at DESC);
    `);

    await this.#db.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_post ON social_comments(post_id, created_at ASC);
    `);
  }

  async createUser(user: SocialUser): Promise<void> {
    await this.#db.query(
      `INSERT INTO social_users (id, handle, display_name, bio, permissions_hex, followers_count, following_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.handle,
        user.displayName,
        user.bio ?? null,
        toCanonicalHex(user.permissions),
        user.followersCount,
        user.followingCount,
        user.createdAt,
      ],
    );
  }

  async findUserById(id: string): Promise<SocialUser | null> {
    const rows = await this.#db.query<UserRow>(
      "SELECT * FROM social_users WHERE id = ? LIMIT 1",
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return this.#mapUserRow(row);
  }

  async findUserByHandle(handle: string): Promise<SocialUser | null> {
    const rows = await this.#db.query<UserRow>(
      "SELECT * FROM social_users WHERE lower(handle) = lower(?) LIMIT 1",
      [handle],
    );
    const row = rows[0];
    if (!row) return null;
    return this.#mapUserRow(row);
  }

  async createPost(post: SocialPost): Promise<void> {
    await this.#db.query(
      `INSERT INTO social_posts (id, author_id, author_handle, content, media_url, tags_json, like_count, comment_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        post.id,
        post.authorId,
        post.authorHandle,
        post.content,
        post.mediaUrl ?? null,
        JSON.stringify(post.tags),
        post.likeCount,
        post.commentCount,
        post.createdAt,
      ],
    );
  }

  async findPostById(id: string): Promise<SocialPost | null> {
    const rows = await this.#db.query<PostRow>(
      "SELECT * FROM social_posts WHERE id = ? LIMIT 1",
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return this.#mapPostRow(row);
  }

  async deletePost(id: string): Promise<void> {
    await this.#db.transaction(async (trx) => {
      await trx.query("DELETE FROM social_comments WHERE post_id = ?", [id]);
      await trx.query("DELETE FROM social_likes WHERE post_id = ?", [id]);
      await trx.query("DELETE FROM social_posts WHERE id = ?", [id]);
    });
  }

  async createComment(comment: SocialComment): Promise<void> {
    await this.#db.transaction(async (trx) => {
      await trx.query(
        `INSERT INTO social_comments (id, post_id, author_id, author_handle, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          comment.id,
          comment.postId,
          comment.authorId,
          comment.authorHandle,
          comment.content,
          comment.createdAt,
        ],
      );
      await trx.query(
        "UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = ?",
        [comment.postId],
      );
    });
  }

  async listCommentsByPostId(postId: string): Promise<readonly SocialComment[]> {
    const rows = await this.#db.query<CommentRow>(
      "SELECT * FROM social_comments WHERE post_id = ? ORDER BY created_at ASC",
      [postId],
    );
    return rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      authorId: r.author_id,
      authorHandle: r.author_handle,
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  async followUser(followerId: string, followingId: string): Promise<void> {
    await this.#db.transaction(async (trx) => {
      await trx.query(
        `INSERT OR IGNORE INTO social_follows (follower_id, following_id, created_at)
         VALUES (?, ?, ?)`,
        [followerId, followingId, new Date().toISOString()],
      );
      await trx.query(
        "UPDATE social_users SET following_count = (SELECT count(*) FROM social_follows WHERE follower_id = ?) WHERE id = ?",
        [followerId, followerId],
      );
      await trx.query(
        "UPDATE social_users SET followers_count = (SELECT count(*) FROM social_follows WHERE following_id = ?) WHERE id = ?",
        [followingId, followingId],
      );
    });
  }

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    await this.#db.transaction(async (trx) => {
      await trx.query(
        "DELETE FROM social_follows WHERE follower_id = ? AND following_id = ?",
        [followerId, followingId],
      );
      await trx.query(
        "UPDATE social_users SET following_count = (SELECT count(*) FROM social_follows WHERE follower_id = ?) WHERE id = ?",
        [followerId, followerId],
      );
      await trx.query(
        "UPDATE social_users SET followers_count = (SELECT count(*) FROM social_follows WHERE following_id = ?) WHERE id = ?",
        [followingId, followingId],
      );
    });
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const rows = await this.#db.query<{ count: number }>(
      "SELECT count(*) as count FROM social_follows WHERE follower_id = ? AND following_id = ?",
      [followerId, followingId],
    );
    return (rows[0]?.count ?? 0) > 0;
  }

  async toggleLike(
    postId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.#db.transaction(async (trx) => {
      const existing = await trx.query<{ count: number }>(
        "SELECT count(*) as count FROM social_likes WHERE post_id = ? AND user_id = ?",
        [postId, userId],
      );

      const alreadyLiked = (existing[0]?.count ?? 0) > 0;

      if (alreadyLiked) {
        await trx.query(
          "DELETE FROM social_likes WHERE post_id = ? AND user_id = ?",
          [postId, userId],
        );
        await trx.query(
          "UPDATE social_posts SET like_count = MAX(0, like_count - 1) WHERE id = ?",
          [postId],
        );
      } else {
        await trx.query(
          "INSERT INTO social_likes (post_id, user_id, created_at) VALUES (?, ?, ?)",
          [postId, userId, new Date().toISOString()],
        );
        await trx.query(
          "UPDATE social_posts SET like_count = like_count + 1 WHERE id = ?",
          [postId],
        );
      }

      const postRows = await trx.query<{ like_count: number }>(
        "SELECT like_count FROM social_posts WHERE id = ?",
        [postId],
      );

      return {
        liked: !alreadyLiked,
        likeCount: postRows[0]?.like_count ?? 0,
      };
    });
  }

  async getTimelineFeed(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<readonly SocialPost[]> {
    const effectiveLimit = Math.min(Math.max(1, limit), 100);

    let sql = `
      SELECT p.* FROM social_posts p
      WHERE (
        p.author_id = ?
        OR p.author_id IN (SELECT following_id FROM social_follows WHERE follower_id = ?)
      )
    `;
    const params: unknown[] = [userId, userId];

    if (cursor) {
      sql += " AND p.created_at < ?";
      params.push(cursor);
    }

    sql += " ORDER BY p.created_at DESC LIMIT ?";
    params.push(effectiveLimit);

    const rows = await this.#db.query<PostRow>(sql, params);
    return rows.map((r) => this.#mapPostRow(r));
  }

  #mapUserRow(row: UserRow): SocialUser {
    const parsedPerm = fromCanonicalHex(row.permissions_hex);
    const permissions = parsedPerm.ok ? parsedPerm.value : 0n;
    return {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      bio: row.bio ?? undefined,
      permissions,
      followersCount: row.followers_count,
      followingCount: row.following_count,
      createdAt: row.created_at,
    };
  }

  #mapPostRow(row: PostRow): SocialPost {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags_json) as string[];
    } catch {
      tags = [];
    }
    return {
      id: row.id,
      authorId: row.author_id,
      authorHandle: row.author_handle,
      content: row.content,
      mediaUrl: row.media_url ?? undefined,
      tags,
      likeCount: row.like_count,
      commentCount: row.comment_count,
      createdAt: row.created_at,
    };
  }
}
