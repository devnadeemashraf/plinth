import { hasBit } from "@plinth/core";

export const PERM_POST_CREATE = 1n << 0n;
export const PERM_POST_DELETE = 1n << 1n;
export const PERM_COMMENT_CREATE = 1n << 2n;
export const PERM_MODERATE_POSTS = 1n << 3n;
export const PERM_ADMINISTRATOR = 1n << 63n;

export const DEFAULT_USER_PERMISSIONS =
  PERM_POST_CREATE | PERM_POST_DELETE | PERM_COMMENT_CREATE;

export const MODERATOR_PERMISSIONS =
  DEFAULT_USER_PERMISSIONS | PERM_MODERATE_POSTS;

export function canCreatePost(permissions: bigint): boolean {
  return hasBit(permissions, PERM_ADMINISTRATOR) || hasBit(permissions, PERM_POST_CREATE);
}

export function canCreateComment(permissions: bigint): boolean {
  return hasBit(permissions, PERM_ADMINISTRATOR) || hasBit(permissions, PERM_COMMENT_CREATE);
}

export function canDeletePost(permissions: bigint, isAuthor: boolean): boolean {
  if (hasBit(permissions, PERM_ADMINISTRATOR) || hasBit(permissions, PERM_MODERATE_POSTS)) {
    return true;
  }
  return isAuthor && hasBit(permissions, PERM_POST_DELETE);
}
