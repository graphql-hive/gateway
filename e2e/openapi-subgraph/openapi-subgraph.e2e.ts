import { createTenv, Service } from '@internal/e2e';
import { beforeAll, describe, expect, it } from 'vitest';

describe('openapi-subgraph', () => {
  let OASService: Service;
  let GQLService: Service;
  const { service, composeWithMesh, gateway } = createTenv(__dirname);
  beforeAll(async () => {
    OASService = await service('OAS');
    GQLService = await service('GQL');
  });
  function replaceDockerHostNamesBack(sdl?: string) {
    return sdl?.replaceAll('172.17.0.1', 'localhost');
  }
  it('exposes the SDL correctly', async () => {
    const { result, output } = await composeWithMesh({
      services: [OASService, GQLService],
      maskServicePorts: true,
      args: ['--subgraph', 'OAS'],
      output: 'graphql',
    });
    const { execute } = await gateway({
      subgraph: output,
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
    expect(replaceDockerHostNamesBack(queryResult?.data?._service?.sdl)).toBe(
      replaceDockerHostNamesBack(result),
    );
  });
  it('resolves entitites correctly', async () => {
    const { execute } = await gateway({
      subgraph: {
        with: 'mesh',
        services: [OASService, GQLService],
        subgraphName: 'OAS',
      },
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
    const { execute } = await gateway({
      subgraph: {
        with: 'mesh',
        services: [OASService, GQLService],
        subgraphName: 'GQL',
      },
    });
    const encapsulatedQuery = /* GraphQL */ `
      {
        gql {
          books {
            id
            title
          }
        }
      }
    `;
    const queryResult = await execute({
      query: encapsulatedQuery,
    });
    expect(queryResult?.errors).toBeFalsy();
    expect(queryResult?.data).toEqual({
      gql: {
        books: [
          {
            id: '1',
            title: 'Book 1',
          },
          {
            id: '2',
            title: 'Book 2',
          },
          {
            id: '3',
            title: 'Book 3',
          },
        ],
      },
    });
  });
});
