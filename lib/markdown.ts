/**
 * Tiny Markdown toolkit for the storefront long-description editor.
 *
 * Two halves:
 * - caret transforms used by the editor toolbar (pure: string in, string out);
 * - a deliberately small block parser used by the live preview.
 *
 * Only the subset the toolbar can produce is understood, so what the merchant
 * previews is exactly what the storefront renders. No HTML is ever generated,
 * which keeps the stored copy XSS-free by construction.
 */

export interface MdEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps or unwraps the selection in `marker` (e.g. `**` for bold). */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  marker: string,
): MdEdit {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(marker.length, -marker.length);
    return { text: before + inner + after, selectionStart: start, selectionEnd: start + inner.length };
  }

  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      text: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length,
    };
  }

  const text = before + marker + selected + marker + after;
  return {
    text,
    selectionStart: start + marker.length,
    selectionEnd: end + marker.length,
  };
}

interface PrefixSpec {
  test: (line: string) => boolean;
  strip: (line: string) => string;
  prefix: (index: number) => string;
}

/** Adds or removes a per-line prefix across every line the selection touches. */
export function toggleLinePrefix(
  value: string,
  start: number,
  end: number,
  spec: PrefixSpec,
): MdEdit {
  const lineStart = value.lastIndexOf("\n", Math.max(start - 1, 0)) + 1;
  const newline = value.indexOf("\n", end);
  const lineEnd = newline === -1 ? value.length : newline;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const allApplied = lines.every((line) => spec.test(line));
  const nextBlock = lines
    .map((line, i) => {
      const bare = spec.strip(line);
      return allApplied ? bare : spec.prefix(i) + bare;
    })
    .join("\n");

  return {
    text: value.slice(0, lineStart) + nextBlock + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineEnd + (nextBlock.length - block.length),
  };
}

export function toggleBold(value: string, start: number, end: number): MdEdit {
  return wrapSelection(value, start, end, "**");
}

export function toggleItalic(value: string, start: number, end: number): MdEdit {
  return wrapSelection(value, start, end, "*");
}

export function toggleHeading(value: string, start: number, end: number): MdEdit {
  return toggleLinePrefix(value, start, end, {
    test: (line) => /^#{1,6}\s+/.test(line),
    strip: (line) => line.replace(/^#{1,6}\s+/, ""),
    prefix: () => "## ",
  });
}

export function toggleBulletList(value: string, start: number, end: number): MdEdit {
  return toggleLinePrefix(value, start, end, {
    test: (line) => /^\s*[-*]\s+/.test(line),
    strip: (line) => line.replace(/^\s*[-*]\s+/, ""),
    prefix: () => "- ",
  });
}

export function toggleOrderedList(value: string, start: number, end: number): MdEdit {
  return toggleLinePrefix(value, start, end, {
    test: (line) => /^\s*\d+\.\s+/.test(line),
    strip: (line) => line.replace(/^\s*\d+\.\s+/, ""),
    prefix: (i) => `${i + 1}. `,
  });
}

export function toggleQuote(value: string, start: number, end: number): MdEdit {
  return toggleLinePrefix(value, start, end, {
    test: (line) => /^\s*>\s?/.test(line),
    strip: (line) => line.replace(/^\s*>\s?/, ""),
    prefix: () => "> ",
  });
}

/** Turns the selection into `[text](https://)` and selects the placeholder URL. */
export function insertLink(value: string, start: number, end: number): MdEdit {
  const label = value.slice(start, end) || "text";
  const url = "https://";
  const snippet = `[${label}](${url})`;
  return {
    text: value.slice(0, start) + snippet + value.slice(end),
    selectionStart: start + label.length + 3,
    selectionEnd: start + label.length + 3 + url.length,
  };
}

export type MdBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "paragraph"; text: string };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+\.\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

export function parseMarkdown(text: string): MdBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: "quote", text: quote.join("\n") });
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushAll();
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(Math.max(heading[1].length, 2), 3) as 2 | 3;
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const ordered = bullet ? null : ORDERED_RE.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      flushQuote();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((bullet?.[1] ?? ordered?.[1] ?? "").trim());
      continue;
    }

    const quoteLine = QUOTE_RE.exec(line);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1].trim());
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}
