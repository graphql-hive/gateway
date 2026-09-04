import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  detectEmptyAfterFilter,
  type EmptyReason,
} from '../src/detect-empty-after-filter.js';

const FIXTURE_SDL = /* GraphQL */ `
  type Query {
    ok: String
    staleRef: Stale
    legacy: String @deprecated(reason: "removed")
  }

  type Stale {
    old1: String @deprecated(reason: "gone")
    old2: Int @deprecated(reason: "gone")
  }

  type Healthy {
    name: String!
  }

  input AllDeadInput {
    a: String @deprecated(reason: "gone")
    b: Int @deprecated(reason: "gone")
  }

  input MixedInput {
    alive: String
    dead: String @deprecated(reason: "gone")
  }

  enum DeadEnum {
    A @deprecated(reason: "gone")
    B @deprecated(reason: "gone")
  }

  enum LiveEnum {
    ONE
    TWO @deprecated(reason: "gone")
  }

  interface IDead {
    old: String @deprecated(reason: "gone")
  }

  interface IAlive {
    name: String!
  }

  union UDeadOnly = Stale
  union UMixed = Stale | Healthy
`;

describe('detectEmptyAfterFilter', () => {
  it('returns a fresh result on each call (no shared mutable state)', () => {
    const schema = buildSchema('type Query { _: Boolean }');
    const r1 = detectEmptyAfterFilter(schema);
    // Mutate the returned collections via type-asserted casts (the
    // public return type is Readonly* but the runtime values are not).
    (r1.emptyTypes as Set<string>).add('Poisoned');
    (r1.reasons as Map<string, EmptyReason>).set(
      'Poisoned',
      'all-fields-deprecated',
    );
    const r2 = detectEmptyAfterFilter(schema);
    expect(r2.emptyTypes.has('Poisoned')).toBe(false);
    expect(r2.reasons.has('Poisoned')).toBe(false);
  });

  it('returns an empty set when excludeDeprecated is false (or unset)', () => {
    const schema = buildSchema(FIXTURE_SDL);
    const r1 = detectEmptyAfterFilter(schema);
    expect(r1.emptyTypes.size).toBe(0);
    expect(r1.reasons.size).toBe(0);

    const r2 = detectEmptyAfterFilter(schema, { excludeDeprecated: false });
    expect(r2.emptyTypes.size).toBe(0);
  });

  describe('with excludeDeprecated: true', () => {
    const result = detectEmptyAfterFilter(buildSchema(FIXTURE_SDL), {
      excludeDeprecated: true,
    });

    it('flags Object types whose fields are all @deprecated', () => {
      expect(result.emptyTypes.has('Stale')).toBe(true);
      expect(result.reasons.get('Stale')).toBe('all-fields-deprecated');
    });

    it('does NOT flag Object types with at least one surviving field', () => {
      expect(result.emptyTypes.has('Healthy')).toBe(false);
      // Query has both deprecated and non-deprecated fields, so it survives.
      expect(result.emptyTypes.has('Query')).toBe(false);
    });

    it('flags Input objects whose fields are all @deprecated', () => {
      expect(result.emptyTypes.has('AllDeadInput')).toBe(true);
      expect(result.reasons.get('AllDeadInput')).toBe(
        'all-input-fields-deprecated',
      );
      expect(result.emptyTypes.has('MixedInput')).toBe(false);
    });

    it('flags Enums whose values are all @deprecated', () => {
      expect(result.emptyTypes.has('DeadEnum')).toBe(true);
      expect(result.reasons.get('DeadEnum')).toBe('all-enum-values-deprecated');
      expect(result.emptyTypes.has('LiveEnum')).toBe(false);
    });

    it('flags Interfaces whose fields are all @deprecated', () => {
      expect(result.emptyTypes.has('IDead')).toBe(true);
      expect(result.reasons.get('IDead')).toBe(
        'all-interface-fields-deprecated',
      );
      expect(result.emptyTypes.has('IAlive')).toBe(false);
    });

    it('flags Unions whose members are all empty (transitive)', () => {
      // UDeadOnly = Stale; Stale is empty → UDeadOnly is empty.
      expect(result.emptyTypes.has('UDeadOnly')).toBe(true);
      expect(result.reasons.get('UDeadOnly')).toBe('all-union-members-empty');
    });

    it('does NOT flag Unions with at least one non-empty member', () => {
      // UMixed = Stale | Healthy; Healthy survives → UMixed survives.
      expect(result.emptyTypes.has('UMixed')).toBe(false);
    });

    it('never flags Scalars (no member rule applies)', () => {
      expect(result.emptyTypes.has('String')).toBe(false);
      expect(result.emptyTypes.has('Int')).toBe(false);
      expect(result.emptyTypes.has('ID')).toBe(false);
    });

    it('never flags __-prefixed introspection types', () => {
      for (const name of result.emptyTypes) {
        expect(name.startsWith('__')).toBe(false);
      }
    });

    it('treats @deprecated(reason: "") as deprecated across all Kinds', () => {
      const r = detectEmptyAfterFilter(
        buildSchema(/* GraphQL */ `
          type Query {
            _: Boolean
          }
          type SilentObj {
            f: String @deprecated(reason: "")
          }
          interface SilentIface {
            f: String @deprecated(reason: "")
          }
          input SilentInput {
            f: String @deprecated(reason: "")
          }
          enum SilentEnum {
            ONE @deprecated(reason: "")
          }
        `),
        { excludeDeprecated: true },
      );
      expect(r.emptyTypes.has('SilentObj')).toBe(true);
      expect(r.emptyTypes.has('SilentIface')).toBe(true);
      expect(r.emptyTypes.has('SilentInput')).toBe(true);
      expect(r.emptyTypes.has('SilentEnum')).toBe(true);
    });
  });

  it('reaches the fixed point even with chained union dependencies', () => {
    // Two unions: U2 = U1Member; U1Member is empty.
    // Engineered to require >1 iteration: when U1Member gets marked
    // empty, the union pass must re-evaluate.
    const schema = buildSchema(/* GraphQL */ `
      type Query {
        _: Boolean
      }

      type U1Member {
        deadOnly: String @deprecated(reason: "gone")
      }

      union U1 = U1Member

      type U2MemberContainingU1 {
        forces_u2_membership: U1 # field references U1 (not used by emptiness)
      }
    `);

    const r = detectEmptyAfterFilter(schema, { excludeDeprecated: true });
    expect(r.emptyTypes.has('U1Member')).toBe(true);
    expect(r.emptyTypes.has('U1')).toBe(true);
    // U2MemberContainingU1 has a non-deprecated field; non-cascade rule
    // means it stays even though its referenced type is empty.
    expect(r.emptyTypes.has('U2MemberContainingU1')).toBe(false);
  });
});
