import { createTenv } from '@internal/e2e';
import jwt from 'jsonwebtoken';
import { it } from 'vitest';
import { JWT_SECRET } from './env';

const { gateway, service } = createTenv(__dirname);

it.concurrent.for([
  '{ i { id } }',
  '{ i { ... on A { id } }',
  '{ i { ... on A { id } ... on B { id } }',
  '{ a { id } }',
  '{ a { a } }',
])(
  'should decide authorization scopes when auth directives are on interface types for query %s',
  async (query, { expect }) => {
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [await service('protected-req-on-int-type')],
      },
    });

    const scopes: {
      allowed: Scope[][];
      denied: Scope[][];
    } = {
      allowed: [],
      denied: [],
    };
    for (const scope of getPossibleScopes()) {
      const res = await gw.execute({
        query,
        headers: {
          Authorization: `Bearer ${jwt.sign({ scope }, JWT_SECRET)}`,
        },
      });
      if (res.data && !res.errors) {
        scopes.allowed.push(scope);
      } else {
        scopes.denied.push(scope);
      }
    }

    expect(scopes).toMatchSnapshot();
  },
);

it.concurrent.for([
  '{ i { id } }',
  '{ i { ... on A { id } }',
  '{ i { ... on A { id } ... on B { id } }',
  '{ a { id } }',
  '{ a { a } }',
])(
  'should decide authorization scopes when auth directives are on interface fields for query %s',
  async (query, { expect }) => {
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [await service('protected-req-on-int-field')],
      },
    });

    const scopes: {
      allowed: Scope[][];
      denied: Scope[][];
    } = {
      allowed: [],
      denied: [],
    };
    for (const scope of getPossibleScopes()) {
      const res = await gw.execute({
        query,
        headers: {
          Authorization: `Bearer ${jwt.sign({ scope }, JWT_SECRET)}`,
        },
      });
      if (res.data && !res.errors) {
        scopes.allowed.push(scope);
      } else {
        scopes.denied.push(scope);
      }
    }

    expect(scopes).toMatchSnapshot();
  },
);

type Scope = 'a' | 'b' | 'i';

function getPossibleScopes(): Scope[][] {
  const scopes: Scope[] = ['a', 'b', 'i'];
  const result: Scope[][] = [];
  const n = scopes.length;
  for (let i = 0; i < 1 << n; i++) {
    const subset: Scope[] = [];
    for (let j = 0; j < n; j++) {
      if (i & (1 << j)) {
        subset.push(scopes[j]!);
      }
    }
    result.push(subset);
  }
  return result;
}
