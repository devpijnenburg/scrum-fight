// Build-time cache busting (scripts/stamp-assets.mjs).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { stampAssets } from '../scripts/stamp-assets.mjs';

function site(files) {
  const root = mkdtempSync(join(tmpdir(), 'stamp-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return { root, read: (p) => readFileSync(join(root, p), 'utf8') };
}

const BASE = {
  'index.html': `<link rel="stylesheet" href="/css/styles.css?v=old" />
<script src="/socket.io/socket.io.js"></script>
<script src="/js/api.js"></script>
<script type="module" src="/js/room/index.js"></script>`,
  'css/styles.css': `@import url('base.css');\n@import url("components/x.css");`,
  'css/base.css': 'body{}',
  'css/components/x.css': '.x{}',
  'js/api.js': 'function apiFetch(){}',
  'js/room/index.js': `import './side.js';\nimport { a } from './a.js';\nconst m = await import('./b.js');`,
  'js/room/side.js': `import { b } from './b.js';\nexport { b as again } from './b.js';`,
  'js/room/a.js': `import { b } from './b.js';\nexport const a = b;`,
  'js/room/b.js': 'export const b = 1;',
};

test('stamps HTML, CSS imports and module imports with content hashes', () => {
  const { root, read } = site(BASE);
  const result = stampAssets(root);
  expect(result).toEqual({ html: 1, assets: 8 });

  const html = read('index.html');
  expect(html).toMatch(/href="\/css\/styles\.css\?v=[0-9a-f]{10}"/);
  expect(html).not.toContain('?v=old');
  expect(html).toMatch(/src="\/js\/api\.js\?v=[0-9a-f]{10}"/);
  expect(html).toContain('src="/socket.io/socket.io.js"'); // served by the backend, untouched

  expect(read('css/styles.css')).toMatch(/@import url\('base\.css\?v=[0-9a-f]{10}'\);/);
  expect(read('css/styles.css')).toMatch(/@import url\("components\/x\.css\?v=[0-9a-f]{10}"\);/);

  // b.js gets the same URL from every importer, so the browser loads it once
  const bFromIndex = read('js/room/index.js').match(/'\.\/b\.js\?v=([0-9a-f]+)'/)[1];
  const bFromA = read('js/room/a.js').match(/'\.\/b\.js\?v=([0-9a-f]+)'/)[1];
  expect(bFromIndex).toBe(bFromA);

  // side-effect imports and re-exports are stamped too
  expect(read('js/room/index.js')).toMatch(/import '\.\/side\.js\?v=[0-9a-f]{10}';/);
  expect(read('js/room/side.js')).toMatch(/export \{ b as again \} from '\.\/b\.js\?v=[0-9a-f]{10}';/);
});

test('a change in a dependency changes the hash of its importers', () => {
  const v1 = site(BASE);
  stampAssets(v1.root);
  const v2 = site({ ...BASE, 'js/room/b.js': 'export const b = 2;' });
  stampAssets(v2.root);

  const entryHash = (s) => s.read('index.html').match(/room\/index\.js\?v=([0-9a-f]+)/)[1];
  const apiHash = (s) => s.read('index.html').match(/api\.js\?v=([0-9a-f]+)/)[1];
  expect(entryHash(v2)).not.toBe(entryHash(v1));
  expect(apiHash(v2)).toBe(apiHash(v1));
});

test('is stable when run twice', () => {
  const { root, read } = site(BASE);
  stampAssets(root);
  const first = read('index.html');
  stampAssets(root);
  expect(read('index.html')).toBe(first);
});

test('fails on a missing asset or an import cycle', () => {
  expect(() => stampAssets(site({ 'index.html': '<script src="/js/missing.js"></script>' }).root))
    .toThrow(/missing asset \/js\/missing\.js/);
  expect(() => stampAssets(site({
    'index.html': '<script type="module" src="/js/a.js"></script>',
    'js/a.js': "import './b.js';\nexport {};\nimport { x } from './b.js';",
    'js/b.js': "import { y } from './a.js';",
  }).root)).toThrow(/Import cycle/);
});

test('every relative import in the real frontend gets the same single URL per module', () => {
  const copy = mkdtempSync(join(tmpdir(), 'stamp-urls-'));
  cpSync(join(process.cwd(), 'public'), copy, { recursive: true });
  stampAssets(copy);
  const urls = new Map(); // absolute module path → set of ?v values
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) { walk(full); continue; }
      if (!name.name.endsWith('.js')) continue;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const [path, v] = m[1].split('?v=');
        expect(v).toBeDefined(); // no unstamped relative import
        const abs = join(dirname(full), path);
        if (!urls.has(abs)) urls.set(abs, new Set());
        urls.get(abs).add(v);
      }
    }
  };
  walk(join(copy, 'js'));
  for (const versions of urls.values()) expect(versions.size).toBe(1);
});

test('the real frontend stamps without errors', () => {
  // Stamping rewrites files in place, so run it on a copy of public/.
  const real = join(process.cwd(), 'public');
  const copy = mkdtempSync(join(tmpdir(), 'stamp-real-'));
  cpSync(real, copy, { recursive: true });
  const { html, assets } = stampAssets(copy);
  expect(html).toBeGreaterThan(5);
  expect(assets).toBeGreaterThan(20);
});
