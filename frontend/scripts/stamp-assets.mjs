#!/usr/bin/env node
// Cache busting at build time.
//
// Rewrites every local asset reference under the given public directory to
// carry a content hash, so browsers can cache assets for a long time and
// still pick up every change immediately:
//   *.html  <script src="/js/…">, <link href="/css/…">  (files served from public/ only)
//   *.css   @import url('…')
//   *.js    ES module imports: from './x.js', import('./x.js')
// A file's hash covers its own stamped content, so a change in an imported
// module or stylesheet also changes the hash of everything importing it.
//
// Usage: node scripts/stamp-assets.mjs <publicDir>   (rewrites in place)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';

const HASH_LENGTH = 10;

const HTML_REF = /(<(?:script|link)\b[^>]*?\s(?:src|href)=")(\/(?:js|css)\/[^"?#]+\.(?:js|css))(?:\?v=[^"]*)?(")/g;
const CSS_IMPORT = /(@import\s+url\(\s*['"]?)([^'")?]+\.css)(?:\?v=[^'")]*)?(['"]?\s*\))/g;
const JS_IMPORT = /((?:\bfrom\s*|\bimport\s*\(\s*)['"])(\.{1,2}\/[^'"?]+\.js)(?:\?v=[^'"]*)?(['"])/g;

export function stampAssets(publicDir) {
  const root = resolve(publicDir);
  const stamped = new Map(); // absolute path → { content, hash }
  const inProgress = new Set();

  const hashOf = (content) => createHash('sha256').update(content).digest('hex').slice(0, HASH_LENGTH);

  function rewrite(content, pattern, baseDir, fromFile) {
    return content.replace(pattern, (match, before, ref, after) => {
      const target = ref.startsWith('/') ? join(root, ref) : resolve(baseDir, ref);
      if (!existsSync(target)) {
        throw new Error(`${relative(root, fromFile)} references missing asset ${ref}`);
      }
      return `${before}${ref}?v=${stampFile(target).hash}${after}`;
    });
  }

  // Stamps a CSS/JS file (after its dependencies) and returns its hash.
  function stampFile(file) {
    if (stamped.has(file)) return stamped.get(file);
    if (inProgress.has(file)) {
      // A cycle would give one module two different URLs, and the browser
      // would then load (and run) it twice with separate state.
      throw new Error(`Import cycle through ${relative(root, file)} — break the cycle before stamping`);
    }
    inProgress.add(file);
    let content = readFileSync(file, 'utf8');
    const ext = extname(file);
    if (ext === '.css') content = rewrite(content, CSS_IMPORT, dirname(file), file);
    if (ext === '.js') content = rewrite(content, JS_IMPORT, dirname(file), file);
    const result = { content, hash: hashOf(content) };
    stamped.set(file, result);
    inProgress.delete(file);
    return result;
  }

  const htmlFiles = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.html')) htmlFiles.push(full);
    }
  })(root);

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    writeFileSync(file, rewrite(html, HTML_REF, dirname(file), file));
  }
  for (const [file, { content }] of stamped) writeFileSync(file, content);
  return { html: htmlFiles.length, assets: stamped.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/stamp-assets.mjs <publicDir>');
    process.exit(1);
  }
  const { html, assets } = stampAssets(dir);
  console.log(`[stamp-assets] ${html} HTML files, ${assets} assets stamped`);
}
