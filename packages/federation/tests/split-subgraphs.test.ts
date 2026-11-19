import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { printWithComments } from '@graphql-tools/utils';
import { DocumentNode } from 'graphql';
import { expect, it } from 'vitest';

it('split subgraphs correctly', () => {
  const supergraphSdl = readFileSync(
    join(__dirname, 'fixtures/connectors/supergraph.graphql'),
    'utf-8',
  );
  const subgraphAstMap: Record<string, DocumentNode> = {};
  getStitchedSchemaFromSupergraphSdl({
    supergraphSdl,
    onSubgraphAST(name, subgraphAST) {
      subgraphAstMap[name] = subgraphAST;
      return subgraphAST;
    },
  });
  for (const subgraphName of Object.keys(subgraphAstMap).sort()) {
    const subgraphAst = subgraphAstMap[subgraphName]!;
    // the graphql-tools printer prints the same with graphql 16 and 17
    expect(printWithComments(subgraphAst)).toMatchSnapshot(subgraphName);
  }
});
