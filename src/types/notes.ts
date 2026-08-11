export interface FolderEntry {
  id: number;
  name: string;
  parentId: number;
  sortOrder: number;
  isSystem: boolean;
  isProtected: boolean;
  locked: boolean;
  noteCount: number;
}

export interface NoteSummary {
  id: number;
  folderId: number;
  title: string;
  preview: string;
  isFavorite: boolean;
  isPrivate: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface NoteDetail {
  id: number;
  folderId: number;
  title: string;
  content: string;
  isFavorite: boolean;
  isPrivate: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface TagEntry {
  id: number;
  name: string;
  noteCount: number;
}
