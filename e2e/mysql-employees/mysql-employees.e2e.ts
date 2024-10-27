import { createTenv, type Container } from '@internal/e2e';
import { beforeAll, expect, it } from 'vitest';

const { gateway, container } = createTenv(__dirname);

let mysql!: Container;
beforeAll(async () => {
  mysql = await container({
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
});

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [mysql],
    },
  });
  await expect(
    execute({
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
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "employees": [
          {
            "__typename": "employees",
            "dept_emp": [
              {
                "departments": [
                  {
                    "dept_name": "Development",
                    "dept_no": "d005",
                  },
                ],
                "dept_no": "d005",
                "emp_no": 10001,
              },
            ],
            "emp_no": 10001,
            "first_name": "Georgi",
            "gender": "M",
            "last_name": "Facello",
          },
          {
            "__typename": "employees",
            "dept_emp": [
              {
                "departments": [
                  {
                    "dept_name": "Sales",
                    "dept_no": "d007",
                  },
                ],
                "dept_no": "d007",
                "emp_no": 10002,
              },
            ],
            "emp_no": 10002,
            "first_name": "Bezalel",
            "gender": "F",
            "last_name": "Simmel",
          },
          {
            "__typename": "employees",
            "dept_emp": [
              {
                "departments": [
                  {
                    "dept_name": "Production",
                    "dept_no": "d004",
                  },
                ],
                "dept_no": "d004",
                "emp_no": 10003,
              },
            ],
            "emp_no": 10003,
            "first_name": "Parto",
            "gender": "M",
            "last_name": "Bamford",
          },
          {
            "__typename": "employees",
            "dept_emp": [
              {
                "departments": [
                  {
                    "dept_name": "Production",
                    "dept_no": "d004",
                  },
                ],
                "dept_no": "d004",
                "emp_no": 10004,
              },
            ],
            "emp_no": 10004,
            "first_name": "Chirstian",
            "gender": "M",
            "last_name": "Koblick",
          },
          {
            "__typename": "employees",
            "dept_emp": [
              {
                "departments": [
                  {
                    "dept_name": "Human Resources",
                    "dept_no": "d003",
                  },
                ],
                "dept_no": "d003",
                "emp_no": 10005,
              },
            ],
            "emp_no": 10005,
            "first_name": "Kyoichi",
            "gender": "M",
            "last_name": "Maliniak",
          },
        ],
      },
    }
  `);
});
