import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';
import { renderToStaticMarkup } from 'react-dom/server';
import { iconBase64, LandingPage, LandingPageProps } from './LandingPage';

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
  const filePath = path.resolve(
    __dirname,
    '..',
    'src',
    'landing-page.generated.ts',
  );
  console.log(`Rendering landing page with defaults to ${filePath}...`);
  const html = await render({});
  await fs.promises.writeFile(
    filePath,
    `export const iconBase64 = ${JSON.stringify(iconBase64)};
export const logoSvg = ${JSON.stringify(fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo.svg'), 'utf-8').replaceAll('\n', ''))};
export const html = ${JSON.stringify(html)};
`,
  );
}

renderToFile();
