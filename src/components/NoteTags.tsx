import { useState } from "react";
import { useNoteStore } from "../stores/noteStore";
import { XIcon } from "./icons";

export default function NoteTags({
  noteId,
  tags,
  readOnly = false,
}: {
  noteId: number;
  tags: string[];
  readOnly?: boolean;
}) {
  const setNoteTags = useNoteStore((s) => s.setNoteTags);
  const allTags = useNoteStore((s) => s.tags);
  const selectView = useNoteStore((s) => s.selectView);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const datalistId = `tag-suggestions-${noteId}`;
  const suggestions = allTags
    .map((t) => t.name)
    .filter((name) => !tags.some((t) => t.toLowerCase() === name.toLowerCase()));

  const commit = async (next: string[]) => {
    setBusy(true);
    try {
      await setNoteTags(noteId, next);
    } catch {
      // store records the error
    } finally {
      setBusy(false);
    }
  };

  const addTag = () => {
    const tag = input.trim();
    setInput("");
    if (!tag) return;
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    void commit([...tags, tag]);
  };

  const removeTag = (tag: string) => {
    void commit(tags.filter((t) => t !== tag));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 py-0.5 pl-2 pr-1 text-xs text-accent"
        >
          <button
            type="button"
            onClick={() => selectView({ kind: "tag", tag })}
            title={`Show notes tagged "${tag}"`}
            className="hover:underline"
          >
            {tag}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={busy}
              title={`Remove tag "${tag}"`}
              aria-label={`Remove tag ${tag}`}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-accent/70 transition-colors hover:bg-accent/20 hover:text-accent disabled:opacity-60"
            >
              <XIcon width={9} height={9} />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              } else if (
                e.key === "Backspace" &&
                input === "" &&
                tags.length > 0
              ) {
                removeTag(tags[tags.length - 1]);
              }
            }}
            onBlur={() => {
              if (input.trim()) addTag();
            }}
            placeholder={tags.length === 0 ? "Add tag…" : "+"}
            list={datalistId}
            disabled={busy}
            className="w-20 select-text rounded-full border border-transparent bg-transparent px-2 py-0.5 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-accent/40 focus:bg-surface disabled:opacity-60 dark:text-slate-200"
          />
          <datalist id={datalistId}>
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
