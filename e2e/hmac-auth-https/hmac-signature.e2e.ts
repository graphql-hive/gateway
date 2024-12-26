import { join } from 'path';
import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);
describe('HMAC Signature', () => {
  // It never reaches to `Users` subgraph because `User.name` is not authorized for this user.
  it('User 1 Flow (with ReadComments role)', async () => {
    const { execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [
          await service('users', { protocol: 'https' }),
          await service('comments'),
        ],
      },
      env: {
        NODE_EXTRA_CA_CERTS: join(__dirname, 'services', 'users', 'cert.pem'),
      },
    });
    const result = await execute({
      query: /* GraphQL */ `
        query {
          comments {
            id
            author {
              id
              name
            }
          }
        }
      `,
      headers: {
        Authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZXMiOlsiUmVhZENvbW1lbnRzIl0sImlhdCI6MTcyNDE0MTQwNiwiZXhwIjoxNzU1Njk5MDA2fQ.yNmp7hrCWorrdHfJ1IOFyA33UeU2ak72GgjxJ-wuWdE',
      },
    });
    expect(result).toEqual({
      data: {
        comments: [
          {
            author: {
              id: '1',
              name: 'Alice',
            },
            id: '1',
          },
          {
            author: {
              id: '2',
              name: 'Bob',
            },
            id: '2',
          },
        ],
      },
    });
  });
  it('User 2 Flow (read:comments and read:users_names)', async () => {
    const { execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [
          await service('users', { protocol: 'https' }),
          await service('comments'),
        ],
      },
      env: {
        NODE_EXTRA_CA_CERTS: join(__dirname, 'services', 'users', 'cert.pem'),
      },
    });
    const result = await execute({
      query: /* GraphQL */ `
        query {
          comments {
            id
            author {
              id
              name
            }
          }
        }
      `,
      headers: {
        Authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwicm9sZXMiOlsiUmVhZENvbW1lbnRzIiwiUmVhZFVzZXJzTmFtZSJdLCJpYXQiOjE3MjQxNDE0MTgsImV4cCI6MTc1NTY5OTAxOH0.wnR3TDJDljtZ9cwP_XYAm1c-prvkDTzkD-cqbDbBui0',
      },
    });
    expect(result).toEqual({
      data: {
        comments: [
          {
            author: {
              id: '1',
              name: 'Alice',
            },
            id: '1',
          },
          {
            author: {
              id: '2',
              name: 'Bob',
            },
            id: '2',
          },
        ],
      },
    });
  });
});
