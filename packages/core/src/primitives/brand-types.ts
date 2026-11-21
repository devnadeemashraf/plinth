/**
 * Nominal type branding primitives for compile-time domain safety.
 * Compatible with TypeScript erasableSyntaxOnly (no runtime footprint).
 */

declare const brandSymbol: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brandSymbol]: B };

export type UuidV7 = Brand<string, "UuidV7">;
export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type RequestId = Brand<string, "RequestId">;
export type IsoUtcTimestamp = Brand<string, "IsoUtcTimestamp">;
