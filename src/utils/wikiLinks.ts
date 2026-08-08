export const WIKI_LINK_PROTOCOL = "lifexp-note:";

export type WikiLinkSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; title: string };

const WIKI_LINK_PATTERN = /\[\[([^\[\]]+)\]\]/g;

export function splitWikiLinks(text: string): WikiLinkSegment[] {
  const segments: WikiLinkSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const title = match[1].trim();
    if (title.length === 0) continue;
    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "link", title });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return segments;
}

export function wikiLinkUrl(title: string): string {
  return WIKI_LINK_PROTOCOL + encodeURIComponent(title);
}

export function parseWikiLinkUrl(url: string): string | null {
  if (!url.startsWith(WIKI_LINK_PROTOCOL)) return null;
  try {
    const title = decodeURIComponent(url.slice(WIKI_LINK_PROTOCOL.length));
    return title.length > 0 ? title : null;
  } catch {
    return null;
  }
}
