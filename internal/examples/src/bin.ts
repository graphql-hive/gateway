#!/usr/bin/env node --import tsx
import { convertE2EToExample } from './convert';

await convertE2EToExample({
  e2e: process.argv[2] || '',
  clean: ['1', 't', 'true', 'y', 'yes'].includes(String(process.argv[3])),
});
