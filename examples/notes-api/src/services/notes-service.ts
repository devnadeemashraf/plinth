import { BadRequestError, NotFoundError } from "@plinth/core";
import type { NotesRepositoryPort } from "../domain/repository.js";
import type {
  CreateNoteInput,
  ListNotesQuery,
  ListNotesResult,
  Note,
  UpdateNoteInput,
} from "../domain/types.js";

export class NotesService {
  readonly #repo: NotesRepositoryPort;

  constructor(repo: NotesRepositoryPort) {
    this.#repo = repo;
  }

  async createNote(input: CreateNoteInput): Promise<Note> {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      throw new BadRequestError("Note title cannot be blank");
    }
    return this.#repo.create({
      ...input,
      title: trimmedTitle,
    });
  }

  async getNote(id: string): Promise<Note> {
    const note = await this.#repo.findById(id);
    if (!note) {
      throw new NotFoundError(`Note with id '${id}' not found`);
    }
    return note;
  }

  async listNotes(query: ListNotesQuery): Promise<ListNotesResult> {
    return this.#repo.findMany(query);
  }

  async updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
    if (input.title !== undefined && !input.title.trim()) {
      throw new BadRequestError("Note title cannot be blank");
    }
    const updated = await this.#repo.update(id, input);
    if (!updated) {
      throw new NotFoundError(`Note with id '${id}' not found`);
    }
    return updated;
  }

  async deleteNote(id: string): Promise<void> {
    const deleted = await this.#repo.delete(id);
    if (!deleted) {
      throw new NotFoundError(`Note with id '${id}' not found`);
    }
  }
}
