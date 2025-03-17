import { defineConfig, SecurityPluginOptions } from '@graphql-hive/gateway';

let security: boolean | SecurityPluginOptions;
const securityOpt = process.env['SECURITY_OPT'];
switch (securityOpt) {
  case 'true':
    security = true;
    break;
  case 'false':
    security = false;
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
    };
    break;
  case 'max-tokens-10':
    security = {
      maxTokens: 10,
    };
    break;
  case 'only-max-depth':
    security = {
      maxDepth: true,
    };
    break;
  case 'max-depth-4':
    security = {
      maxDepth: 4,
    };
    break;
  case 'only-block-field-suggestions':
    security = {
      maxDepth: true,
    };
    break;
  default:
    throw new Error(`Unexpected SECURITY_OPT value ${securityOpt}`);
}

export const gatewayConfig = defineConfig({ security });
