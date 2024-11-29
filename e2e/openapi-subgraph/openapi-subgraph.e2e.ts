import { createTenv, Service } from '@internal/e2e';
import { beforeAll, describe, expect, it } from 'vitest';

describe('openapi-subgraph', () => {
  let TestService: Service;
  const { service, composeWithMesh, gateway } = createTenv(__dirname);
  beforeAll(async () => {
    TestService = await service('Test');
  });
  it('generates a subgraph SDL from an OpenAPI spec', async () => {
    const { result } = await composeWithMesh({
      services: [TestService],
      maskServicePorts: true,
      args: ['--subgraph', 'Test'],
    });
    expect(result).toMatchSnapshot();
  });
  it('exposes the SDL correctly', async () => {
    const { result, output } = await composeWithMesh({
      services: [TestService],
      args: ['--subgraph', 'Test'],
      output: 'graphql',
    });
    const { execute } = await gateway({
      args: ['subgraph', output],
    });
    const sdlQuery = /* GraphQL */ `
      query {
        _service {
          sdl
        }
      }
    `;
    const queryResult = await execute({
      query: sdlQuery,
    });
    expect(queryResult?.errors).toBeFalsy();
    expect(queryResult?.data?._service?.sdl).toBe(result);
  });
  it('resolves entitites correctly', async () => {
    const { output } = await composeWithMesh({
      services: [TestService],
      args: ['--subgraph', 'Test'],
      output: 'graphql',
    });
    const { execute } = await gateway({
      args: ['subgraph', output],
    });
    const entitiesQuery = /* GraphQL */ `
      query {
        _entities(representations: [{ __typename: "User", id: 1 }]) {
          __typename
          ... on User {
            id
            name
          }
        }
      }
    `;
    const queryResult = await execute({
      query: entitiesQuery,
    });
    expect(queryResult?.errors).toBeFalsy();
    expect(queryResult?.data).toEqual({
      _entities: [
        {
          __typename: 'User',
          id: '1',
          name: 'Alice',
        },
      ],
    });
  });
  it('encapsulates the queries correctly', async () => {
    const { output } = await composeWithMesh({
      services: [TestService],
      args: ['--subgraph', 'TestEncapsulated'],
      output: 'graphql',
    });
    const { execute } = await gateway({
      args: ['subgraph', output],
    });
    const encapsulatedQuery = /* GraphQL */ `
      {
        test {
          users {
            id
            name
          }
        }
      }
    `;
    const queryResult = await execute({
      query: encapsulatedQuery,
    });
    expect(queryResult?.errors).toBeFalsy();
    expect(queryResult?.data).toEqual({
      test: {
        users: [
          {
            id: '1',
            name: 'Alice',
          },
          {
            id: '2',
            name: 'Bob',
          },
          {
            id: '3',
            name: 'Charlie',
          },
        ],
      },
    });
  });
});
