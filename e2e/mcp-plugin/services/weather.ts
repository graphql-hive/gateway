import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

const weatherData: Record<
  string,
  { temperature: number; conditions: string; humidity: number }
> = {
  'new york': { temperature: 72, conditions: 'Partly Cloudy', humidity: 65 },
  london: { temperature: 58, conditions: 'Rainy', humidity: 85 },
  tokyo: { temperature: 68, conditions: 'Sunny', humidity: 55 },
};

createServer(
  createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          "Get current weather data for a location"
          weather("City name or postal code" location: String!): Weather!

          "Get weather forecast for upcoming days"
          forecast(
            "City name or postal code"
            location: String!
            "Number of days to forecast (default 3)"
            days: Int = 3
          ): [ForecastDay!]!

          "Search for cities by name"
          cities(query: String!): [City!]!
        }

        type Weather {
          "Temperature in Fahrenheit"
          temperature: Float!
          "Current weather conditions"
          conditions: String!
          "Humidity percentage"
          humidity: Int!
          "Location name"
          location: String!
        }

        type ForecastDay {
          "Date in YYYY-MM-DD format"
          date: String!
          "High temperature in Fahrenheit"
          high: Float!
          "Low temperature in Fahrenheit"
          low: Float!
          "Expected weather conditions"
          conditions: String!
        }

        type Mutation {
          "Cancel an order by ID"
          cancelOrder(orderId: String!, confirmationId: String): CancelResult!
        }

        type City {
          name: String
          country: String
          population: Int
        }

        type CancelResult {
          success: Boolean!
          message: String!
        }
      `,
      resolvers: {
        Query: {
          weather: (_, { location }: { location: string }) => {
            const data = weatherData[location.toLowerCase()] || {
              temperature: 70,
              conditions: 'Unknown',
              humidity: 50,
            };
            return { ...data, location };
          },
          forecast: (
            _,
            { location, days = 3 }: { location: string; days?: number },
          ) => {
            const loc = location.toLowerCase();
            return Array.from({ length: days }, (_, i) => ({
              date: `2026-01-${String(i + 1).padStart(2, '0')}`,
              high: loc === 'london' ? 10 + i : 25 + i,
              low: loc === 'london' ? 5 + i : 18 + i,
              conditions: i % 2 === 0 ? 'Sunny' : 'Cloudy',
            }));
          },
          cities: (_, { query }: { query: string }) => [
            {
              name: `${query} City`,
              country: 'US',
              population: 100000,
            },
          ],
        },
        Mutation: {
          cancelOrder: (
            _,
            {
              orderId,
              confirmationId,
            }: { orderId: string; confirmationId?: string },
          ) => {
            if (!confirmationId) {
              return { success: false, message: 'Confirmation required' };
            }
            return { success: true, message: `Order ${orderId} cancelled` };
          },
        },
      },
    }),
    maskedErrors: false,
  }),
).listen(opts.getServicePort('weather'));
