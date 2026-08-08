import { describe, expect, test } from "bun:test";
import { countWords } from "./text";

describe("countWords", () => {
  test("empty and whitespace-only strings are 0", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
  });

  test("single word", () => {
    expect(countWords("hello")).toBe(1);
  });

  test("multiple words with varied whitespace", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("one  two\nthree\tfour")).toBe(4);
    expect(countWords("  padded words  ")).toBe(2);
  });

  test("markdown syntax tokens count as words", () => {
    expect(countWords("# Title\n\n- a\n- b")).toBe(6);
  });
});
