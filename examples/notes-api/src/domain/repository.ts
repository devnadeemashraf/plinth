import type {
  CreateNoteInput,
  ListNotesQuery,
  ListNotesResult,
  Note,
  UpdateNoteInput,
} from "./types.js";

/**
 * Secondary driven port for note persistence.
 * Implementations can be an in-memory stub, SQLite, PostgreSQL, etc.
 */
export interface NotesRepositoryPort {
  create(input: CreateNoteInput): Promise<Note>;
  findById(id: string): Promise<Note | null>;
  findMany(query: ListNotesQuery): Promise<ListNotesResult>;
  update(id: string, input: UpdateNoteInput): Promise<Note | null>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}
