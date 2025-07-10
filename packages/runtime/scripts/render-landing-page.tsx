import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from './LandingPage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function render() {
  const website = renderToStaticMarkup(<LandingPage />);

  const minified = await minify(website, {
    minifyJS: true,
    useShortDoctype: false,
    removeAttributeQuotes: true,
    collapseWhitespace: true,
    minifyCSS: true,
  });

  await fs.promises.writeFile(
    path.join(__dirname, '../src/landing-page-html.ts'),
    `export default ${JSON.stringify(minified)}`,
  );

  return minified;
}

await render();
