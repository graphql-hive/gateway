import { readFileSync } from 'fs';
import { join } from 'path';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { SOAPLoader } from '@omnigraph/soap';
import { fetch, Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { createExecutorFromSchemaAST } from '../src/executor';

export const logger = {
  log: () => void 0,
  debug: () => void 0,
  info: () => void 0,
  warn: () => void 0,
  error: () => void 0,
  child: (() => logger) as any,
};

describe('SOAP Headers', () => {
  it('should pass headers to the executor', async () => {
    const soapLoader = new SOAPLoader({
      subgraphName: 'Test',
      fetch,
      logger,
      bodyAlias: 'guild',
      soapHeaders: {
        alias: 'guild',
        namespace: 'https://the-guild.dev',
        headers: {
          MyHeader: {
            UserName: '{context.USER_NAME}',
            Password: '{context.PASSWORD}',
          },
        },
      },
    });
    await soapLoader.loadWSDL(
      readFileSync(join(__dirname, './fixtures/globalweather.wsdl'), 'utf-8'),
    );
    const schema = soapLoader.buildSchema();
    expect(printSchemaWithDirectives(schema)).toMatchSnapshot(
      'soap-with-headers',
    );
    const fetchSpy = vi.fn((_url: string, _init: RequestInit | undefined) =>
      Response.error(),
    );
    const executor = createExecutorFromSchemaAST(schema, fetchSpy);
    await executor({
      document: parse(/* GraphQL */ `
        {
          tns_GlobalWeather_GlobalWeatherSoap_GetWeather(
            GetWeather: { CityName: "Rome", CountryName: "Italy" }
          ) {
            GetWeatherResult
          }
        }
      `),
      context: {
        USER_NAME: 'user',
        PASSWORD: 'password',
      },
    });
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe(
      `
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:guild="https://the-guild.dev">${`
 <soap:Header>
    <guild:MyHeader>
      <guild:UserName>
        user
      </guild:UserName>
      <guild:Password>
        password
      </guild:Password>
    </guild:MyHeader>
  </soap:Header>
  <soap:Body>
    <guild:GetWeather>
      <guild:CityName>
        Rome
      </guild:CityName>
      <guild:CountryName>
        Italy
      </guild:CountryName>
    </guild:GetWeather>
  </soap:Body>`
        .trim()
        .replace(/\n\s+/g, '')}</soap:Envelope>
    `.trim(),
    );
  });
});
