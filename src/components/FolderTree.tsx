import { useMemo, useState, type DragEvent } from "react";
import type { FolderEntry } from "../types/notes";
import { useNoteStore } from "../stores/noteStore";
import {
  ChevronRightIcon,
  EditIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";

export const NOTE_DRAG_TYPE = "application/x-lifexp-note";
export const FOLDER_DRAG_TYPE = "application/x-lifexp-folder";

const MAX_DEPTH = 5;

type TreeNode = {
  folder: FolderEntry;
  depth: number;
  children: TreeNode[];
};

function buildTree(folders: FolderEntry[]): TreeNode[] {
  const byParent = new Map<number, FolderEntry[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder);
    byParent.set(folder.parentId, list);
  }
  const build = (parentId: number, depth: number): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((folder) => ({
        folder,
        depth,
        children: build(folder.id, depth + 1),
      }));
  return build(0, 1);
}

function readDragId(e: DragEvent, type: string): number | null {
  const raw = e.dataTransfer.getData(type);
  const id = Number(raw);
  return raw && Number.isInteger(id) ? id : null;
}

function hasDragType(e: DragEvent): boolean {
  return (
    e.dataTransfer.types.includes(NOTE_DRAG_TYPE) ||
    e.dataTransfer.types.includes(FOLDER_DRAG_TYPE)
  );
}

function FolderRow({
  node,
  activeFolderId,
  expanded,
  onToggleExpand,
  onSelect,
  draggingId,
  setDraggingId,
}: {
  node: TreeNode;
  activeFolderId: number | null;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onSelect: (id: number) => void;
  draggingId: number | null;
  setDraggingId: (id: number | null) => void;
}) {
  const openFolderDialog = useNoteStore((s) => s.openFolderDialog);
  const requestDeleteFolder = useNoteStore((s) => s.requestDeleteFolder);
  const moveFolder = useNoteStore((s) => s.moveFolder);
  const moveNote = useNoteStore((s) => s.moveNote);
  const folders = useNoteStore((s) => s.folders);
  const [dropHint, setDropHint] = useState<"before" | "after" | "into" | null>(null);

  const { folder, depth, children } = node;
  const isExpanded = expanded.has(folder.id);
  const active = activeFolderId === folder.id;

  const subtreeNoteCount = useMemo(() => {
    const ids = new Set<number>([folder.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (!ids.has(f.id) && ids.has(f.parentId)) {
          ids.add(f.id);
          grew = true;
        }
      }
    }
    return folders.filter((f) => ids.has(f.id)).reduce((sum, f) => sum + f.noteCount, 0);
  }, [folders, folder.id]);

  const subfolderCount = useMemo(
    () => folders.filter((f) => f.parentId === folder.id).length,
    [folders, folder.id],
  );

  const dropZone = (e: DragEvent<HTMLDivElement>): "before" | "after" | "into" => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    if (e.dataTransfer.types.includes(NOTE_DRAG_TYPE)) return "into";
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "into";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const zone = dropZone(e);
    setDropHint(null);

    const noteId = readDragId(e, NOTE_DRAG_TYPE);
    if (noteId !== null) {
      void moveNote(noteId, folder.id);
      return;
    }
    const dragFolderId = readDragId(e, FOLDER_DRAG_TYPE);
    if (dragFolderId === null || dragFolderId === folder.id) return;

    if (zone === "into") {
      void moveFolder(dragFolderId, folder.id);
      return;
    }
    const siblings = folders
      .filter((f) => f.parentId === folder.parentId && f.id !== dragFolderId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const targetIndex = siblings.findIndex((f) => f.id === folder.id);
    const index = targetIndex < 0 ? siblings.length : targetIndex + (zone === "after" ? 1 : 0);
    void moveFolder(dragFolderId, folder.parentId, index);
  };

  return (
    <div>
      {dropHint === "before" && <div className="mx-1 h-0.5 rounded bg-accent" />}
      <div
        role="treeitem"
        aria-expanded={children.length > 0 ? isExpanded : undefined}
        aria-selected={active}
        draggable={!folder.isSystem}
        onDragStart={(e) => {
          e.dataTransfer.setData(FOLDER_DRAG_TYPE, String(folder.id));
          e.dataTransfer.effectAllowed = "move";
          setDraggingId(folder.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDropHint(null);
        }}
        onDragOver={(e) => {
          if (!hasDragType(e)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          setDropHint(dropZone(e));
        }}
        onDragLeave={() => setDropHint(null)}
        onDrop={handleDrop}
        className={`group flex w-full items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
          active
            ? "border-accent/50 bg-accent/15 text-accent"
            : "text-muted hover:bg-surface-hover hover:text-text"
        } ${dropHint === "into" ? "border-accent/50 bg-accent/10" : ""} ${
          draggingId === folder.id ? "opacity-40" : ""
        }`}
        style={{ paddingLeft: `${8 + (depth - 1) * 14}px` }}
      >
        <button
          type="button"
          aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(folder.id);
          }}
          className={`shrink-0 rounded p-0.5 text-muted transition-transform duration-150 ${
            children.length === 0 ? "invisible" : ""
          } ${isExpanded ? "rotate-90" : ""}`}
        >
          <ChevronRightIcon width={12} height={12} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5"
        >
          <FolderIcon width={15} height={15} className="shrink-0" />
          <span className="truncate">{folder.name}</span>
          {folder.noteCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              {folder.noteCount}
            </span>
          )}
        </button>
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          {depth < MAX_DEPTH && (
            <button
              type="button"
              title={`New subfolder in ${folder.name}`}
              aria-label={`New subfolder in ${folder.name}`}
              onClick={(e) => {
                e.stopPropagation();
                openFolderDialog(folder.id);
              }}
              className="rounded p-0.5 text-muted hover:text-accent"
            >
              <PlusIcon width={12} height={12} />
            </button>
          )}
          {!folder.isSystem && (
            <>
              <button
                type="button"
                title={`Rename ${folder.name}`}
                aria-label={`Rename ${folder.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openFolderDialog(null, folder);
                }}
                className="rounded p-0.5 text-muted hover:text-accent"
              >
                <EditIcon width={12} height={12} />
              </button>
              <button
                type="button"
                title={`Delete ${folder.name}`}
                aria-label={`Delete ${folder.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  requestDeleteFolder({
                    folder,
                    directNoteCount: folder.noteCount,
                    subfolderCount,
                    subtreeNoteCount,
                  });
                }}
                className="rounded p-0.5 text-muted hover:text-danger"
              >
                <TrashIcon width={12} height={12} />
              </button>
            </>
          )}
        </span>
      </div>
      {dropHint === "after" && <div className="mx-1 h-0.5 rounded bg-accent" />}
      {isExpanded &&
        children.map((child) => (
          <FolderRow
            key={child.folder.id}
            node={child}
            activeFolderId={activeFolderId}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
          />
        ))}
    </div>
  );
}

export default function FolderTree({
  activeFolderId,
  onSelect,
}: {
  activeFolderId: number | null;
  onSelect: (folderId: number) => void;
}) {
  const folders = useNoteStore((s) => s.folders);
  const moveFolder = useNoteStore((s) => s.moveFolder);
  const openFolderDialog = useNoteStore((s) => s.openFolderDialog);
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(folders.map((f) => f.id)),
  );
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [rootHover, setRootHover] = useState(false);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      role="tree"
      aria-label="Note folders"
      className="flex flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return;
        e.preventDefault();
        setRootHover(true);
      }}
      onDragLeave={() => setRootHover(false)}
      onDrop={(e) => {
        const id = readDragId(e, FOLDER_DRAG_TYPE);
        setRootHover(false);
        if (id === null) return;
        e.preventDefault();
        void moveFolder(id, 0);
      }}
    >
      <div className={`flex items-center justify-between rounded ${rootHover ? "bg-accent/10" : ""}`}>
        <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Folders
        </span>
        <button
          type="button"
          title="New folder"
          aria-label="New folder"
          onClick={() => openFolderDialog(null)}
          className="rounded p-0.5 text-muted hover:text-accent"
        >
          <PlusIcon width={13} height={13} />
        </button>
      </div>
      {tree.map((node) => (
        <FolderRow
          key={node.folder.id}
          node={node}
          activeFolderId={activeFolderId}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onSelect={onSelect}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
        />
      ))}
    </div>
  );
}
