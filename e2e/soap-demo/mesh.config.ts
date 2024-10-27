import { defineConfig } from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadSOAPSubgraph } from '@omnigraph/soap';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadSOAPSubgraph('soap-demo', {
        source: './SOAP.Demo.cls.wsdl',
        endpoint: `http://localhost:${opts.getServicePort('soap-demo')}/csp/samples/SOAP.Demo.cls`,
      }),
    },
  ],
});
