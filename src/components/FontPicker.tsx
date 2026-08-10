import { useFontStore } from "../stores/fontStore";
import { FONTS, fontStack, type FontDefinition } from "../styles/fonts";

const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog.";

function FontOption({
  font,
  selected,
  previewSize,
  onSelect,
}: {
  font: FontDefinition;
  selected: boolean;
  previewSize: string;
  onSelect: () => void;
}) {
  const stack = fontStack(font.id);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Use ${font.name}`}
      className={`flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
        selected
          ? "border-accent ring-2 ring-accent/50"
          : "border-border hover:border-border-hover"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{font.name}</span>
        {selected && <span className="text-[10px] font-medium text-accent">Active</span>}
      </span>
      <span className="truncate text-text" style={{ fontFamily: stack, fontSize: previewSize }}>
        {SAMPLE_TEXT}
      </span>
    </button>
  );
}

function FontGrid({
  value,
  allowInherit,
  previewSize,
  onSelect,
}: {
  value: string;
  allowInherit?: boolean;
  previewSize: string;
  onSelect: (fontId: string) => void;
}) {
  return (
    <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
      {allowInherit && (
        <button
          type="button"
          onClick={() => onSelect("")}
          aria-pressed={value === ""}
          className={`flex w-full flex-col justify-center gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
            value === ""
              ? "border-accent ring-2 ring-accent/50"
              : "border-border hover:border-border-hover"
          }`}
        >
          <span className="text-xs text-muted">Default</span>
          <span className="text-text" style={{ fontSize: previewSize }}>
            Same as application font
          </span>
        </button>
      )}
      {FONTS.map((font) => (
        <FontOption
          key={font.id}
          font={font}
          selected={value === font.id}
          previewSize={previewSize}
          onSelect={() => onSelect(font.id)}
        />
      ))}
    </div>
  );
}

export default function FontPicker() {
  const appFont = useFontStore((s) => s.appFont);
  const editorFont = useFontStore((s) => s.editorFont);
  const setAppFont = useFontStore((s) => s.setAppFont);
  const setEditorFont = useFontStore((s) => s.setEditorFont);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Application Font
        </h4>
        <FontGrid
          value={appFont}
          previewSize="14px"
          onSelect={(id) => void setAppFont(id)}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Note / Editor Font
        </h4>
        <FontGrid
          value={editorFont}
          allowInherit
          previewSize="13px"
          onSelect={(id) => void setEditorFont(id)}
        />
      </section>
    </div>
  );
}
