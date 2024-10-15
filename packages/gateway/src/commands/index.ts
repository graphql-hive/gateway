import type { AddCommand } from '../cli';
import { addCommand as addProxyCommand } from './proxy';
import { addCommand as addSubgraphCommand } from './subgraph';
import { addCommand as addSupergraphCommand } from './supergraph';

export const addCommands: AddCommand = (ctx, cli) => {
  addSupergraphCommand(ctx, cli);
  addSubgraphCommand(ctx, cli);
  addProxyCommand(ctx, cli);
};
