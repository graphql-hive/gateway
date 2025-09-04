import { defineConfig } from '@graphql-hive/gateway';

let security;
const securityOpt = process.env['ARMOR_OPT'];
switch (securityOpt) {
  case 'default':
    security = 'default';
    break;
  case 'true':
    security = {
      maxTokens: true,
      maxDepth: true,
      blockFieldSuggestions: true,
    };
    break;
  case 'false':
    security = {
      maxTokens: false,
      maxDepth: false,
      blockFieldSuggestions: false,
    };
    break;
  case 'each-false':
    security = {
      maxTokens: false,
      maxDepth: false,
      blockFieldSuggestions: false,
    };
    break;
  case 'only-max-tokens':
    security = {
      maxTokens: true,
      maxDepth: false,
    };
    break;
  case 'max-tokens-10':
    security = {
      maxTokens: 10,
      maxDepth: false,
    };
    break;
  case 'only-max-depth':
    security = {
      maxTokens: false,
      maxDepth: true,
    };
    break;
  case 'max-depth-4':
    security = {
      maxTokens: false,
      maxDepth: 4,
    };
    break;
  case 'only-block-field-suggestions':
    security = {
      maxTokens: false,
      maxDepth: false,
      blockFieldSuggestions: true,
    };
    break;
  default:
    throw new Error(`Unexpected ARMOR_OPT value ${securityOpt}`);
}

export const gatewayConfig = defineConfig({ ...security });
