import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage, LandingPageProps } from './LandingPage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function render(props: LandingPageProps) {
  const html = renderToStaticMarkup(<LandingPage {...props} />);
  return minify(html, {
    minifyJS: true,
    useShortDoctype: false,
    removeAttributeQuotes: true,
    collapseWhitespace: true,
    minifyCSS: true,
  });
}

export async function renderToFile() {
  console.log('Rendering landing page with defaults to file...');
  const html = await render({});
  await fs.promises.writeFile(
    path.join(__dirname, '../src/landing-page-html.ts'),
    `export default ${JSON.stringify(html)}`,
  );
}
