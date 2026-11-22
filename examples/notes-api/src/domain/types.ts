export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  isPinned?: boolean | undefined;
  tags?: string[] | undefined;
}

export interface UpdateNoteInput {
  title?: string | undefined;
  content?: string | undefined;
  isPinned?: boolean | undefined;
  tags?: string[] | undefined;
}

export interface ListNotesQuery {
  search?: string | undefined;
  isPinned?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListNotesResult {
  notes: Note[];
  total: number;
}
