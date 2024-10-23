import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const minified = await minify(
  fs.readFileSync(
    path.join(__dirname, '..', 'src', 'landing-page.html'),
    'utf-8',
  ),
  {
    minifyJS: true,
    useShortDoctype: false,
    removeAttributeQuotes: true,
    collapseWhitespace: true,
    minifyCSS: true,
  },
);

await fs.promises.writeFile(
  path.join(__dirname, '../src/landing-page-html.ts'),
  `export default ${JSON.stringify(minified)}`,
);
