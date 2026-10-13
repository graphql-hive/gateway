/** Tokenize text into lowercase BM25 tokens, splitting on non-alphanumeric and camelCase/PascalCase boundaries. */
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
  if (end - start <= 1) return;
  tokens.push(text.slice(start, end).toLowerCase());
}

function isLetterOrDigit(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isUpper(code: number): boolean {
  return code >= 0x41 && code <= 0x5a;
}

function isLower(code: number): boolean {
  return code >= 0x61 && code <= 0x7a;
}
