/**
 * Text tokenization for the BM25 search index.
 *
 * Handles camelCase / PascalCase splitting and non-alphanumeric boundary
 * splitting; single-character tokens are filtered out; all tokens are
 * lowercased. Direct port of HotChocolate's `BM25Tokenizer`.
 *
 * Character classification uses ASCII checks (A-Z, a-z, 0-9). GraphQL
 * names are ASCII per spec; descriptions may not be, but the boundaries
 * we care about (camelCase, non-alphanumeric) are still detected because
 * non-ASCII letters fall into the non-alphanumeric branch.
 */

/**
 * Tokenize the given text into a list of lowercase tokens.
 * Returns an empty array for empty or whitespace-only input.
 */
export function tokenize(text: string): string[] {
  if (!text || /^\s*$/.test(text)) {
    return [];
  }

  const tokens: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    if (!isLetterOrDigit(code)) {
      // Non-alphanumeric boundary: emit accumulated segment if any.
      if (i > start) {
        emitToken(tokens, text, start, i);
      }
      start = i + 1;
      continue;
    }

    // camelCase boundary: lowercase followed by uppercase.
    if (i > start && isUpper(code) && isLower(text.charCodeAt(i - 1))) {
      emitToken(tokens, text, start, i);
      start = i;
      continue;
    }

    // PascalCase / acronym boundary: uppercase run followed by an
    // upper + lower pair, e.g. "XMLParser" → ["xml", "parser"].
    if (
      i > start + 1 &&
      isUpper(code) &&
      isUpper(text.charCodeAt(i - 1)) &&
      i + 1 < text.length &&
      isLower(text.charCodeAt(i + 1))
    ) {
      if (i - 1 > start) {
        emitToken(tokens, text, start, i);
      }
      start = i;
    }
  }

  if (start < text.length) {
    emitToken(tokens, text, start, text.length);
  }

  return tokens;
}

function emitToken(
  tokens: string[],
  text: string,
  start: number,
  end: number,
): void {
  const length = end - start;
  // Single-character tokens are not meaningful (`a`, `I`, etc.).
  if (length <= 1) {
    return;
  }
  tokens.push(text.slice(start, end).toLowerCase());
}

function isLetterOrDigit(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) //   a-z
  );
}

function isUpper(code: number): boolean {
  return code >= 0x41 && code <= 0x5a;
}

function isLower(code: number): boolean {
  return code >= 0x61 && code <= 0x7a;
}
