import { defineRoute } from "@plinth/core";
import { z } from "zod";

export const registerUserContract = defineRoute({
  method: "POST",
  path: "/api/v1/users",
  summary: "Register new social user",
  tags: ["Users"],
  isPublic: true,
  bodySchema: z
    .object({
      handle: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-z0-9_]+$/i, { message: "Only letters, numbers, and underscores allowed" }),
      displayName: z.string().min(1).max(50),
      bio: z.string().max(200).optional(),
      isModerator: z.boolean().optional(),
    })
    .strict(),
  responseSchemas: {
    201: z.object({
      id: z.string(),
      handle: z.string(),
      displayName: z.string(),
      bio: z.string().optional(),
      followersCount: z.number(),
      followingCount: z.number(),
      createdAt: z.string(),
    }),
  },
});

export const getUserContract = defineRoute({
  method: "GET",
  path: "/api/v1/users/:handle",
  summary: "Get user profile by handle or ID",
  tags: ["Users"],
  isPublic: true,
  paramsSchema: z.object({
    handle: z.string().min(1),
  }),
  responseSchemas: {
    200: z.object({
      id: z.string(),
      handle: z.string(),
      displayName: z.string(),
      bio: z.string().optional(),
      followersCount: z.number(),
      followingCount: z.number(),
      createdAt: z.string(),
    }),
  },
});

export const followUserContract = defineRoute({
  method: "POST",
  path: "/api/v1/users/:id/follow",
  summary: "Follow or unfollow user (toggle)",
  tags: ["Users"],
  headersSchema: z.object({
    "x-user-id": z.string().min(1),
  }),
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  responseSchemas: {
    200: z.object({
      following: z.boolean(),
    }),
  },
});

export const createPostContract = defineRoute({
  method: "POST",
  path: "/api/v1/posts",
  summary: "Create a new post",
  tags: ["Posts"],
  headersSchema: z.object({
    "x-user-id": z.string().min(1),
  }),
  bodySchema: z
    .object({
      content: z.string().min(1).max(500),
      mediaUrl: z.string().url().optional(),
      tags: z.array(z.string().min(1).max(30)).max(10).optional(),
    })
    .strict(),
  responseSchemas: {
    201: z.object({
      id: z.string(),
      authorId: z.string(),
      authorHandle: z.string(),
      content: z.string(),
      mediaUrl: z.string().optional(),
      tags: z.array(z.string()),
      likeCount: z.number(),
      commentCount: z.number(),
      createdAt: z.string(),
    }),
  },
});

export const getPostContract = defineRoute({
  method: "GET",
  path: "/api/v1/posts/:id",
  summary: "Get single post by ID",
  tags: ["Posts"],
  isPublic: true,
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  responseSchemas: {
    200: z.object({
      id: z.string(),
      authorId: z.string(),
      authorHandle: z.string(),
      content: z.string(),
      mediaUrl: z.string().optional(),
      tags: z.array(z.string()),
      likeCount: z.number(),
      commentCount: z.number(),
      createdAt: z.string(),
    }),
  },
});

export const deletePostContract = defineRoute({
  method: "DELETE",
  path: "/api/v1/posts/:id",
  summary: "Delete a post",
  tags: ["Posts"],
  headersSchema: z.object({
    "x-user-id": z.string().min(1),
  }),
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  responseSchemas: {
    200: z.object({
      deleted: z.literal(true),
    }),
  },
});

export const likePostContract = defineRoute({
  method: "POST",
  path: "/api/v1/posts/:id/like",
  summary: "Like or unlike a post (toggle)",
  tags: ["Posts"],
  headersSchema: z.object({
    "x-user-id": z.string().min(1),
  }),
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  responseSchemas: {
    200: z.object({
      liked: z.boolean(),
      likeCount: z.number(),
    }),
  },
});

export const addCommentContract = defineRoute({
  method: "POST",
  path: "/api/v1/posts/:id/comments",
  summary: "Add a comment to a post",
  tags: ["Comments"],
  headersSchema: z.object({
    "x-user-id": z.string().min(1),
  }),
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  bodySchema: z
    .object({
      content: z.string().min(1).max(280),
    })
    .strict(),
  responseSchemas: {
    201: z.object({
      id: z.string(),
      postId: z.string(),
      authorId: z.string(),
      authorHandle: z.string(),
      content: z.string(),
      createdAt: z.string(),
    }),
  },
});

export const listCommentsContract = defineRoute({
  method: "GET",
  path: "/api/v1/posts/:id/comments",
  summary: "List comments for a post",
  tags: ["Comments"],
  isPublic: true,
  paramsSchema: z.object({
    id: z.string().min(1),
  }),
  responseSchemas: {
    200: z.array(
      z.object({
        id: z.string(),
        postId: z.string(),
        authorId: z.string(),
        authorHandle: z.string(),
        content: z.string(),
        createdAt: z.string(),
      }),
    ),
  },
});

export const getFeedContract = defineRoute({
  method: "GET",
  path: "/api/v1/feed",
  summary: "Get timeline feed for user",
  tags: ["Feed"],
  headersSchema: z.object({
    "x-user-id": z.string().min(1),
  }),
  querySchema: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  }),
  responseSchemas: {
    200: z.object({
      posts: z.array(
        z.object({
          id: z.string(),
          authorId: z.string(),
          authorHandle: z.string(),
          content: z.string(),
          mediaUrl: z.string().optional(),
          tags: z.array(z.string()),
          likeCount: z.number(),
          commentCount: z.number(),
          createdAt: z.string(),
        }),
      ),
      nextCursor: z.string().nullable(),
    }),
  },
});
