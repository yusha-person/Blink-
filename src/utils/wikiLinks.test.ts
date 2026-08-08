import { describe, expect, test } from "bun:test";
import { parseWikiLinkUrl, splitWikiLinks, wikiLinkUrl } from "./wikiLinks";

describe("splitWikiLinks", () => {
  test("plain text without links stays untouched", () => {
    expect(splitWikiLinks("hello world")).toEqual([
      { kind: "text", text: "hello world" },
    ]);
  });

  test("single link", () => {
    expect(splitWikiLinks("see [[My Note]] please")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", title: "My Note" },
      { kind: "text", text: " please" },
    ]);
  });

  test("multiple links and adjacent links", () => {
    expect(splitWikiLinks("[[A]][[B]] and [[C]]")).toEqual([
      { kind: "link", title: "A" },
      { kind: "link", title: "B" },
      { kind: "text", text: " and " },
      { kind: "link", title: "C" },
    ]);
  });

  test("trims whitespace inside brackets", () => {
    expect(splitWikiLinks("[[  Spaced Title  ]]")).toEqual([
      { kind: "link", title: "Spaced Title" },
    ]);
  });

  test("empty or whitespace-only titles stay as text", () => {
    expect(splitWikiLinks("a [[ ]] b")).toEqual([
      { kind: "text", text: "a [[ ]] b" },
    ]);
  });

  test("unclosed brackets stay as text", () => {
    expect(splitWikiLinks("a [[Unfinished b")).toEqual([
      { kind: "text", text: "a [[Unfinished b" },
    ]);
  });

  test("link at start and end", () => {
    expect(splitWikiLinks("[[Start]] middle [[End]]")).toEqual([
      { kind: "link", title: "Start" },
      { kind: "text", text: " middle " },
      { kind: "link", title: "End" },
    ]);
  });
});

describe("wikiLinkUrl / parseWikiLinkUrl", () => {
  test("round-trips titles with spaces and special characters", () => {
    const title = "Ideas & Plans (2026) 100%";
    expect(parseWikiLinkUrl(wikiLinkUrl(title))).toBe(title);
  });

  test("rejects non-wiki urls", () => {
    expect(parseWikiLinkUrl("https://example.com")).toBeNull();
    expect(parseWikiLinkUrl("lifexp-note:")).toBeNull();
  });
});
