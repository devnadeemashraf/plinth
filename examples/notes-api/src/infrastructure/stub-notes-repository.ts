import { generateUuidV7 } from "@plinth/core";
import type { NotesRepositoryPort } from "../domain/repository.js";
import type {
  CreateNoteInput,
  ListNotesQuery,
  ListNotesResult,
  Note,
  UpdateNoteInput,
} from "../domain/types.js";

/**
 * Functional in-memory stub repository.
 * Provides deterministic, zero-setup storage for demonstration, testing, and rapid prototyping.
 */
export class StubNotesRepository implements NotesRepositoryPort {
  readonly #notes = new Map<string, Note>();

  async create(input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const note: Note = {
      id: generateUuidV7(),
      title: input.title,
      content: input.content,
      isPinned: input.isPinned ?? false,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.#notes.set(note.id, note);
    return { ...note };
  }

  async findById(id: string): Promise<Note | null> {
    const note = this.#notes.get(id);
    return note ? { ...note } : null;
  }

  async findMany(query: ListNotesQuery): Promise<ListNotesResult> {
    let items = Array.from(this.#notes.values());

    if (query.isPinned !== undefined) {
      items = items.filter((n) => n.isPinned === query.isPinned);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort: pinned first, then newest updated first
    items.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });

    const total = items.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const paged = items.slice(offset, offset + limit);

    return {
      notes: paged.map((n) => ({ ...n })),
      total,
    };
  }

  async update(id: string, input: UpdateNoteInput): Promise<Note | null> {
    const existing = this.#notes.get(id);
    if (!existing) return null;

    const updated: Note = {
      ...existing,
      title: input.title !== undefined ? input.title : existing.title,
      content: input.content !== undefined ? input.content : existing.content,
      isPinned:
        input.isPinned !== undefined ? input.isPinned : existing.isPinned,
      tags: input.tags !== undefined ? input.tags : existing.tags,
      updatedAt: new Date().toISOString(),
    };

    this.#notes.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.#notes.delete(id);
  }

  async count(): Promise<number> {
    return this.#notes.size;
  }

  /**
   * Helper for tests to reset state.
   */
  clear(): void {
    this.#notes.clear();
  }
}
