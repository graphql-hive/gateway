import fs from 'node:fs';

const cjsFile = './dist/index.cjs';
const fileContent = fs.readFileSync(cjsFile, 'utf8');
const newContent = fileContent.replace('import(kind)', 'require(kind)');
fs.writeFileSync(cjsFile, newContent, 'utf8');
