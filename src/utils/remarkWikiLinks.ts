import { splitWikiLinks, wikiLinkUrl } from "./wikiLinks";

type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
};

function transformChildren(parent: MdastNode): void {
  if (!parent.children) return;
  const next: MdastNode[] = [];
  for (const child of parent.children) {
    if (child.type === "text" && typeof child.value === "string") {
      for (const segment of splitWikiLinks(child.value)) {
        next.push(
          segment.kind === "text"
            ? { type: "text", value: segment.text }
            : {
                type: "link",
                url: wikiLinkUrl(segment.title),
                children: [{ type: "text", value: segment.title }],
              },
        );
      }
    } else {
      if (child.type !== "link") {
        transformChildren(child);
      }
      next.push(child);
    }
  }
  parent.children = next;
}

export default function remarkWikiLinks() {
  return (tree: MdastNode): void => {
    transformChildren(tree);
  };
}
