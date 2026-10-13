import { describe, expect, it } from 'vitest';
import { tokenize } from '../../src/provider/bm25/tokenizer.js';

describe('bm25 tokenizer', () => {
  it('returns an empty array for empty / whitespace-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('\t\n  \r')).toEqual([]);
  });

  it('lowercases a single word and keeps it as one token', () => {
    expect(tokenize('hello')).toEqual(['hello']);
    expect(tokenize('HELLO')).toEqual(['hello']);
  });

  it('splits camelCase identifiers', () => {
    expect(tokenize('userId')).toEqual(['user', 'id']);
    expect(tokenize('getUserById')).toEqual(['get', 'user', 'by', 'id']);
  });

  it('splits acronym + word (PascalCase) boundaries', () => {
    expect(tokenize('XMLParser')).toEqual(['xml', 'parser']);
    expect(tokenize('XMLAndJSON')).toEqual(['xml', 'and', 'json']);
  });

  it('treats a pure acronym as one lowercase token', () => {
    expect(tokenize('API')).toEqual(['api']);
    expect(tokenize('JSON')).toEqual(['json']);
  });

  it('splits on non-alphanumeric boundaries (space, hyphen, underscore, etc.)', () => {
    expect(tokenize('foo bar')).toEqual(['foo', 'bar']);
    expect(tokenize('foo-bar')).toEqual(['foo', 'bar']);
    expect(tokenize('foo_bar')).toEqual(['foo', 'bar']);
    expect(tokenize('foo.bar/baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('drops single-character tokens', () => {
    expect(tokenize('a')).toEqual([]);
    expect(tokenize('I')).toEqual([]);
    expect(tokenize('a b c')).toEqual([]);
    expect(tokenize('a hello b')).toEqual(['hello']);
  });

  it('does not split on digit-letter transitions (matches reference behavior)', () => {
    // .NET's BM25Tokenizer only splits on letter case transitions and on
    // non-alphanumerics; digits adjacent to letters never trigger a split
    // because IsUpper/IsLower of a digit are both false.
    expect(tokenize('foo123bar')).toEqual(['foo123bar']);
    expect(tokenize('v2Api')).toEqual(['v2api']);
  });

  it('handles a realistic schema-text mixture', () => {
    // Type/field text typically arrives as `name + " " + description`.
    expect(tokenize('userByEmail Find a user by their email address.')).toEqual(
      [
        'user',
        'by',
        'email',
        'find',
        'user',
        'by',
        'their',
        'email',
        'address',
      ],
    );
  });
});
