import { parse } from '@babel/parser';

export const parser = {
  parse: (code: string) =>
    parse(code, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      startLine: 1,
      tokens: true,
      plugins: [
        'decoratorAutoAccessors',
        'decorators-legacy',
        'doExpressions',
        'exportDefaultFrom',
        'functionBind',
        'functionSent',
        'throwExpressions',
        'typescript',
      ],
    }),
};
