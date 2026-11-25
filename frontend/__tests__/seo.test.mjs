// SEO: the English (/) and Dutch (/nl/) landing pages, their metadata and the
// crawler files (robots.txt, sitemap.xml, llms.txt).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TRANSLATIONS } from '../public/js/core/i18n.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const en = read('index.html');
const nl = read('nl/index.html');

const structure = (html) => html.match(/\bid="[^"]*"|data-i18n[a-z-]*="[^"]*"/g);
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test('both landing pages have the same ids and translation keys (the app script runs on both)', () => {
  expect(structure(nl)).toEqual(structure(en));
});

test('every data-i18n key on the landing page exists in both languages', () => {
  const keys = [...en.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)].map((m) => m[1]);
  for (const key of keys) {
    expect(TRANSLATIONS.nl[key]).toBeDefined();
    expect(TRANSLATIONS.en[key]).toBeDefined();
  }
});

test('static text matches the translations of the page language', () => {
  for (const [html, lang] of [[en, 'en'], [nl, 'nl']]) {
    for (const m of html.matchAll(/<(h[1-3]|p|li|summary|span|label)\b[^>]*data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      const text = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      expect(`${m[2]}: ${text}`).toBe(`${m[2]}: ${TRANSLATIONS[lang][m[2]]}`);
    }
  }
});

test('language, canonical and hreflang are set per page', () => {
  expect(en).toMatch(/<html lang="en">/);
  expect(nl).toMatch(/<html lang="nl" data-lang-locked>/);
  expect(en).toContain('<link rel="canonical" href="https://scrumfight.com/" />');
  expect(nl).toContain('<link rel="canonical" href="https://scrumfight.com/nl/" />');
  for (const html of [en, nl]) {
    expect(html).toContain('hreflang="en" href="https://scrumfight.com/"');
    expect(html).toContain('hreflang="nl" href="https://scrumfight.com/nl/"');
    expect(html).toContain('hreflang="x-default" href="https://scrumfight.com/"');
    expect(html).toMatch(/<meta name="description" content="[^"]{120,170}" \/>/);
    expect(html).toContain('property="og:image" content="https://scrumfight.com/img/og-image.png"');
  }
});

test('structured data is valid JSON with the app and an FAQ matching the visible questions', () => {
  for (const [html, lang] of [[en, 'en'], [nl, 'nl']]) {
    const graph = jsonLd(html)['@graph'];
    const app = graph.find((n) => n['@type'] === 'WebApplication');
    const faq = graph.find((n) => n['@type'] === 'FAQPage');
    expect(app.offers.price).toBe('0');
    expect(app.inLanguage).toBe(lang);
    expect(faq.mainEntity.map((q) => q.name)).toEqual(
      [1, 2, 3, 4, 5, 6].map((i) => TRANSLATIONS[lang][`landing.info.faq.${i}.q`]));
  }
});

test('app pages are noindex; public pages are not', () => {
  const PUBLIC_PAGES = ['index.html', 'privacy.html', 'terms.html', 'subscription.html'];
  for (const file of readdirSync(PUBLIC).filter((f) => f.endsWith('.html'))) {
    const noindex = /<meta name="robots" content="noindex/.test(read(file));
    expect(`${file}: ${noindex}`).toBe(`${file}: ${!PUBLIC_PAGES.includes(file)}`);
  }
});

test('robots.txt points to the sitemap and keeps the API out', () => {
  const robots = read('robots.txt');
  expect(robots).toContain('Sitemap: https://scrumfight.com/sitemap.xml');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain('User-agent: GPTBot');
  expect(robots).toContain('User-agent: ClaudeBot');
});

test('sitemap lists only existing public pages', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>https:\/\/scrumfight\.com\/([^<]*)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual(['', 'nl/', 'subscription.html', 'privacy.html', 'terms.html']);
  for (const loc of locs) read(loc === '' || loc.endsWith('/') ? `${loc}index.html` : loc);
});

test('llms.txt starts with the name and a one-line summary', () => {
  const llms = read('llms.txt');
  expect(llms.startsWith('# ScrumFight\n\n> ScrumFight is a free, real-time Planning Poker tool')).toBe(true);
});
