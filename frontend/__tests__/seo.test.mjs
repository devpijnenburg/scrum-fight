// SEO: the English and Dutch public pages (home, features, FAQ), their
// metadata and the crawler files (robots.txt, sitemap.xml, llms.txt).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TRANSLATIONS } from '../public/js/core/i18n.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const BASE = 'https://scrumfight.com';
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

// [file, url path, language] per public page; each pair is one page in two languages.
const PAGES = {
  home: [['index.html', '/', 'en'], ['nl/index.html', '/nl/', 'nl']],
  features: [['features.html', '/features', 'en'], ['nl/functies.html', '/nl/functies', 'nl']],
  faq: [['faq.html', '/faq', 'en'], ['nl/faq.html', '/nl/faq', 'nl']],
};
const ALL = Object.values(PAGES).flat();

const structure = (html) => html.match(/\bid="[^"]*"|data-i18n[a-z-]*="[^"]*"/g);
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

test('both home pages have the same ids and translation keys (the app script runs on both)', () => {
  expect(structure(read('nl/index.html'))).toEqual(structure(read('index.html')));
});

test('every data-i18n key on the home page exists in both languages', () => {
  const keys = [...read('index.html').matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)].map((m) => m[1]);
  for (const key of keys) {
    expect(TRANSLATIONS.nl[key]).toBeDefined();
    expect(TRANSLATIONS.en[key]).toBeDefined();
  }
});

test('static text on the home pages matches the translations of the page language', () => {
  for (const [file, , lang] of PAGES.home) {
    for (const m of read(file).matchAll(/<(h[1-3]|p|li|summary|span|label|a)\b[^>]*data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      expect(`${m[2]}: ${unescape(m[3])}`).toBe(`${m[2]}: ${TRANSLATIONS[lang][m[2]]}`);
    }
  }
});

test.each(Object.entries(PAGES))('%s: language, canonical, hreflang and metadata', (_, pair) => {
  const [[, enPath], [, nlPath]] = pair;
  for (const [file, path, lang] of pair) {
    const html = read(file);
    // Only the English home follows the visitor's language choice; every other public page is locked.
    expect(html).toMatch(path === '/' ? /<html lang="en">/ : new RegExp(`<html lang="${lang}" data-lang-locked>`));
    expect(html).toContain(`<link rel="canonical" href="${BASE}${path}" />`);
    expect(html).toContain(`hreflang="en" href="${BASE}${enPath}"`);
    expect(html).toContain(`hreflang="nl" href="${BASE}${nlPath}"`);
    expect(html).toContain(`hreflang="x-default" href="${BASE}${enPath}"`);
    expect(html).toMatch(/<meta name="description" content="[^"]{110,170}" \/>/);
    expect(html).toMatch(/<title>[^<]{20,90}<\/title>/);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(`property="og:image" content="${BASE}/img/og-image.png"`);
    expect(html).toContain('<site-nav show-cta show-links>');
  }
});

test('home pages describe the app in structured data', () => {
  for (const [file, , lang] of PAGES.home) {
    const app = jsonLd(read(file))['@graph'].find((n) => n['@type'] === 'WebApplication');
    expect(app.offers.price).toBe('0');
    expect(app.inLanguage).toBe(lang);
  }
});

test('home pages link to the features and FAQ pages in their own language', () => {
  for (const [file, , lang] of PAGES.home) {
    const html = read(file);
    const [features, faq] = lang === 'nl' ? ['/nl/functies', '/nl/faq'] : ['/features', '/faq'];
    expect(html).toContain(`href="${features}"`);
    expect(html).toContain(`href="${faq}"`);
  }
});

test('the FAQ structured data matches the visible questions and answers', () => {
  for (const [file] of PAGES.faq) {
    const html = read(file);
    const visible = [...html.matchAll(/<summary><h3>([^<]*)<\/h3><\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
      .map((m) => [unescape(m[1]), unescape(m[2].replace(/<[^>]+>/g, ''))]);
    const faq = jsonLd(html)['@graph'].find((n) => n['@type'] === 'FAQPage');
    expect(visible.length).toBeGreaterThanOrEqual(10);
    expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(visible);
  }
});

test('both language versions of a content page have the same shape', () => {
  for (const pair of [PAGES.features, PAGES.faq]) {
    const shape = (file) => read(file).match(/<(h2|h3|tr)\b/g);
    expect(shape(pair[1][0])).toEqual(shape(pair[0][0]));
  }
});

test('app pages are noindex; public pages are not', () => {
  const PUBLIC_PAGES = [...ALL.map(([file]) => file), 'privacy.html', 'terms.html', 'subscription.html'];
  const files = [...readdirSync(PUBLIC), ...readdirSync(join(PUBLIC, 'nl')).map((f) => `nl/${f}`)].filter((f) => f.endsWith('.html'));
  for (const file of files) {
    const noindex = /<meta name="robots" content="noindex/.test(read(file));
    expect(`${file}: ${noindex}`).toBe(`${file}: ${!PUBLIC_PAGES.includes(file)}`);
  }
});

test('robots.txt points to the sitemap and keeps the API out', () => {
  const robots = read('robots.txt');
  expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain('User-agent: GPTBot');
  expect(robots).toContain('User-agent: ClaudeBot');
});

test('sitemap lists every public page, and only existing ones', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>https:\/\/scrumfight\.com\/([^<]*)<\/loc>/g)].map((m) => `/${m[1]}`);
  expect(locs).toEqual([...ALL.map(([, path]) => path), '/subscription.html', '/privacy.html', '/terms.html']);
  for (const [file] of ALL) read(file);
});

test('llms.txt starts with the name and a one-line summary and links the public pages', () => {
  const llms = read('llms.txt');
  expect(llms.startsWith('# ScrumFight\n\n> ScrumFight is a free, real-time Planning Poker tool')).toBe(true);
  for (const [, path] of ALL) expect(llms).toContain(`(${BASE}${path})`);
});
