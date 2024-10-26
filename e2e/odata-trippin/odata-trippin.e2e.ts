import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it('executes a query', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
    },
  });
  const result = await execute({
    query: /* GraphQL */ `
      query GetMe {
        Me {
          UserName
          FirstName
          LastName
          Gender
          FavoriteFeature
          AddressInfo {
            Address
            City {
              Name
              Region
              CountryRegion
            }
          }
          Trips(queryOptions: { top: 1 }) {
            Description
          }
        }
      }
    `,
  });
  expect(result).toMatchInlineSnapshot(`
    {
      "data": {
        "Me": {
          "AddressInfo": [
            {
              "Address": "P.O. Box 555",
              "City": {
                "CountryRegion": "United States",
                "Name": "Lander",
                "Region": "WY",
              },
            },
          ],
          "FavoriteFeature": "Feature1",
          "FirstName": "April",
          "Gender": "Female",
          "LastName": "Cline",
          "Trips": [
            {
              "Description": "Trip in US",
            },
          ],
          "UserName": "aprilcline",
        },
      },
    }
  `);
});
