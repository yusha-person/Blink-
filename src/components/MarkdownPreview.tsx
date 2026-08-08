import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkWikiLinks from "../utils/remarkWikiLinks";
import { parseWikiLinkUrl } from "../utils/wikiLinks";

const baseComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc pl-5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ className, children }) =>
    className?.includes("task-list-item") ? (
      <li className="my-0.5 -ml-5 flex list-none items-center gap-2">
        {children}
      </li>
    ) : (
      <li className="my-0.5">{children}</li>
    ),
  input: (props) => (
    <input
      {...props}
      disabled
      className="h-3.5 w-3.5 shrink-0 accent-accent"
    />
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-accent/50 pl-3 italic text-slate-500 first:mt-0 last:mb-0 dark:text-slate-400">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-slate-900/10 bg-slate-900/5 p-3 font-mono text-xs leading-relaxed first:mt-0 last:mb-0 dark:border-white/10 dark:bg-black/40">
      {children}
    </pre>
  ),
  code: ({ className, children }) =>
    className?.includes("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-slate-900/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
        {children}
      </code>
    ),
  a: ({ children }) => (
    <span className="text-accent underline underline-offset-2">{children}</span>
  ),
  hr: () => (    <hr className="my-4 border-slate-900/10 dark:border-white/10" />
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-slate-900/10 bg-slate-900/5 px-2 py-1 text-left font-semibold dark:border-white/10 dark:bg-white/5">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-900/10 px-2 py-1 dark:border-white/10">
      {children}
    </td>
  ),
};

const MarkdownPreview = memo(function MarkdownPreview({
  content,
  onNoteLink,
}: {
  content: string;
  onNoteLink?: (title: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      ...baseComponents,
      a: ({ href, children }) => {
        const title = href ? parseWikiLinkUrl(href) : null;
        if (title !== null && onNoteLink) {
          return (
            <button
              type="button"
              onClick={() => onNoteLink(title)}
              title={`Open note "${title}"`}
              className="cursor-pointer font-medium text-accent underline decoration-accent/60 underline-offset-2 transition-colors hover:text-accent/80"
            >
              {children}
            </button>
          );
        }
        return (
          <span className="text-accent underline underline-offset-2">
            {children}
          </span>
        );
      },
    }),
    [onNoteLink],
  );

  return (
    <div className="select-text text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        urlTransform={(url) => url}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownPreview;
