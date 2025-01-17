import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Additional Type Definitions with Naming Convention', () => {
  const tenv = createTenv(__dirname);
  it('composes the schema correctly', async () => {
    const composeResult = await tenv.composeWithMesh({
      services: [await tenv.service('authors'), await tenv.service('books')],
      maskServicePorts: true,
    });
    expect(composeResult.result).toMatchSnapshot();
  });
  it('executes the additional field correctly', async () => {
    const composeResult = await tenv.composeWithMesh({
      services: [await tenv.service('authors'), await tenv.service('books')],
      output: 'graphql',
    });
    const gw = await tenv.gateway({
      supergraph: composeResult.output,
    });
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          getBooks {
            id
            title
            authorId
            author {
              id
              name
            }
          }
        }
      `,
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getBooks: [
        {
          author: {
            id: '1',
            name: 'F. Scott Fitzgerald',
          },
          authorId: '1',
          id: '1',
          title: 'The Great Gatsby',
        },
        {
          author: {
            id: '2',
            name: 'Harper Lee',
          },
          authorId: '2',
          id: '2',
          title: 'To Kill a Mockingbird',
        },
        {
          author: {
            id: '3',
            name: 'George Orwell',
          },
          authorId: '3',
          id: '3',
          title: '1984',
        },
      ],
    });
  });
});
