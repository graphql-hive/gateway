import { createTenv, type Container } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';
import { beforeAll } from 'vitest';

const cwd = __dirname;
const { service, gateway, container } = createTenv(cwd);

let petstore!: Container;
beforeAll(async () => {
  petstore = await container({
    name: 'petstore',
    image: 'swaggerapi/petstore3:1.0.7',
    containerPort: 8080,
    healthcheck: ['CMD-SHELL', 'wget --spider http://localhost:8080'],
  });
});

memtest(
  {
    cwd,
    query: /* GraphQL */ `
      query GetPet {
        getPetById(petId: 1) {
          __typename
          id
          name
          vaccinated
        }
      }
    `,
  },
  async () =>
    gateway({
      supergraph: {
        with: 'mesh',
        services: [petstore, await service('vaccination')],
      },
    }),
);
