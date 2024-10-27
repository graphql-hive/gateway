import { createTenv, type Container } from '@internal/e2e';
import { beforeAll, expect, it } from 'vitest';

const { container, gateway, spawn } = createTenv(__dirname);

let neo4j: Container;
beforeAll(async () => {
  neo4j = await container({
    name: 'neo4j',
    image: 'neo4j:5.22.0',
    containerPort: 7687,
    env: {
      NEO4J_AUTH: 'neo4j/password',
    },
    volumes: [
      {
        host: 'movies.cypher',
        container: '/backups/movies.cypher',
      },
    ],
    healthcheck: ['CMD-SHELL', 'wget --spider http://localhost:7474'],
  });

  const [, waitForLoad] = await spawn([
    'docker',
    'exec',
    neo4j.containerName,
    'bash',
    '-c',
    'cypher-shell -u neo4j -p password -f /backups/movies.cypher',
  ]);
  await waitForLoad;
});

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [neo4j],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        query MovieWithActedIn {
          movies(options: { limit: 2 }) {
            title
            released
            tagline
            peopleActedIn(options: { limit: 2 }) {
              name
            }
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "movies": [
          {
            "peopleActedIn": [
              {
                "name": "Emil Eifrem",
              },
              {
                "name": "Hugo Weaving",
              },
            ],
            "released": 1999,
            "tagline": "Welcome to the Real World",
            "title": "The Matrix",
          },
          {
            "peopleActedIn": [
              {
                "name": "Hugo Weaving",
              },
              {
                "name": "Laurence Fishburne",
              },
            ],
            "released": 2003,
            "tagline": "Free your mind",
            "title": "The Matrix Reloaded",
          },
        ],
      },
    }
  `);
});
