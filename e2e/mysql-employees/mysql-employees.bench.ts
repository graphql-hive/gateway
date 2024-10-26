import { createTenv, Gateway } from '@internal/e2e';
import { beforeAll, bench, expect } from 'vitest';

const { gateway, container } = createTenv(__dirname);

let gw: Gateway;
beforeAll(async () => {
  const mysql = await container({
    name: 'employees',
    image: 'genschsa/mysql-employees',
    containerPort: 3306,
    healthcheck: [
      'CMD',
      'mysqladmin',
      'ping',
      '--host=127.0.0.1', // use the network connection (and not the socket file). making sure we dont check the temporary/setup database
    ],
    env: {
      MYSQL_ROOT_PASSWORD: 'passwd', // used in mesh.config.ts
    },
  });
  gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [mysql],
    },
  });
});

bench('GetSomeEmployees', async () => {
  await expect(
    gw.execute({
      query: /* GraphQL */ `
        query GetSomeEmployees {
          employees(limit: 5, orderBy: { emp_no: asc }) {
            __typename
            emp_no
            # TODO: dates are different in GH actions
            # birth_date
            first_name
            last_name
            gender
            # TODO: dates are different in GH actions
            # hire_date
            dept_emp {
              emp_no
              dept_no
              # TODO: dates are different in GH actions
              # from_date
              # to_date
              departments {
                dept_no
                dept_name
              }
            }
          }
        }
      `,
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      data: {
        employees: expect.arrayContaining([
          expect.objectContaining({
            __typename: expect.stringContaining(''),
          }),
        ]),
      },
    }),
  );
});
