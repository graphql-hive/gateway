import { GraphQLError } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import {
  addRawErrorTransform,
  cloneRawExecutionResult,
  createRawExecutionResult,
  getRawResponseBytes,
  requestRawResponse,
  wantsRawResponse,
} from '../src/rawExecutionResult.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function create(json: string) {
  const bytes = encoder.encode(json);
  const parse = vi.fn((bytes: Uint8Array) => {
    const result = JSON.parse(decoder.decode(bytes));
    if (result.errors) {
      result.errors = result.errors.map(
        ({ message, ...rest }: { message: string }) =>
          new GraphQLError(message, rest),
      );
    }
    return result;
  });
  return { bytes, parse, result: createRawExecutionResult(bytes, parse) };
}

describe('raw execution results', () => {
  it('is asked for on the request', () => {
    const request = { document: {} as any };
    expect(wantsRawResponse(request)).toBe(false);
    expect(wantsRawResponse(requestRawResponse(request))).toBe(true);
    // a request made from it keeps asking
    expect(wantsRawResponse({ ...request })).toBe(true);
  });

  it('parses only when something reads it, and keeps the bytes until data is read', () => {
    const { bytes, parse, result } = create('{"data":{"a":1}}');
    expect(getRawResponseBytes(result)).toBe(bytes);
    expect(parse).not.toHaveBeenCalled();

    // the errors don't change the data, the bytes still say the same
    expect(result.errors).toBeUndefined();
    expect(parse).toHaveBeenCalledTimes(1);
    expect(getRawResponseBytes(result)).toBe(bytes);

    expect(result.data).toEqual({ a: 1 });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(getRawResponseBytes(result)).toBeUndefined();
  });

  it('lets go of the bytes when data is set', () => {
    const { result } = create('{"data":{"a":1}}');
    result.data = { a: 2 };
    expect(getRawResponseBytes(result)).toBeUndefined();
    expect(result.data).toEqual({ a: 2 });
  });

  it('looks like a parsed result', () => {
    const { result } = create('{"data":{"a":1},"extensions":{"b":2}}');
    expect(result).toEqual({ data: { a: 1 }, extensions: { b: 2 } });
    expect(JSON.stringify(result)).toBe(
      '{"data":{"a":1},"extensions":{"b":2}}',
    );
  });

  it('changes the errors when they are parsed, also when they were parsed before', () => {
    const { result } = create('{"data":null,"errors":[{"message":"boom"}]}');
    expect(addRawErrorTransform(result, (e) => ((e as any).first = true))).toBe(
      true,
    );
    expect(result.errors![0]).toMatchObject({ message: 'boom', first: true });
    expect(
      addRawErrorTransform(result, (e) => ((e as any).second = true)),
    ).toBe(true);
    expect(result.errors![0]).toMatchObject({ first: true, second: true });
  });

  it('does not take other results', () => {
    const result = { data: { a: 1 } };
    expect(getRawResponseBytes(result)).toBeUndefined();
    expect(addRawErrorTransform(result, () => {})).toBe(false);
    expect(cloneRawExecutionResult(result)).toBeUndefined();
  });

  it('gives every consumer its own parsed copy of the same bytes', () => {
    const { bytes, result } = create(
      '{"data":{"a":{"b":1}},"errors":[{"message":"boom"}]}',
    );
    addRawErrorTransform(result, (e) => ((e as any).seen = true));
    const clone = cloneRawExecutionResult(result)!;
    expect(getRawResponseBytes(clone)).toBe(bytes);
    expect(clone.data).not.toBe(result.data);
    expect(clone.data).toEqual(result.data);
    expect(clone.errors![0]).toMatchObject({ seen: true });
    // and once the data was read, there's nothing to share anymore
    expect(cloneRawExecutionResult(result)).toBeUndefined();
  });
});
