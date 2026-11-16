import { randomUUIDv7 } from "node:crypto";

/** The only source of new ids for `domain` and `application` code. */
export interface IdGenerator {
  next(): string;
}

/** Time-ordered UUIDv7 ids, so primary keys index well. */
export const uuidV7Generator: IdGenerator = {
  next: () => randomUUIDv7(),
};
