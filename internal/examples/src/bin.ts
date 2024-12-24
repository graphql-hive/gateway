#!/usr/bin/env node --import tsx
import {
  convertE2EToExample,
  convertE2EToExampleConfigSchema,
} from './convert';

const arg0 = process.argv[2] || '';
if (!arg0) {
  throw new Error('Config not provided in first argument');
}

await convertE2EToExample(
  await convertE2EToExampleConfigSchema.parseAsync(JSON.parse(arg0)),
);
