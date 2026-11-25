// A language-specific URL (<html data-lang-locked lang="nl">) always renders in
// its own language, whatever the visitor chose before.
import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  document.documentElement.removeAttribute('data-lang-locked');
  document.head.innerHTML = '';
});

test('a locked page uses its own language and remembers it', async () => {
  localStorage.setItem('lang', 'en');
  document.documentElement.lang = 'nl';
  document.documentElement.setAttribute('data-lang-locked', '');
  const { getLang, t } = await import('../public/js/core/i18n.js?locked');
  expect(getLang()).toBe('nl');
  expect(t('landing.create.btn')).toBe('Kamer aanmaken →');
  expect(localStorage.getItem('lang')).toBe('nl');
});

test('an unlocked page follows the stored preference', async () => {
  localStorage.setItem('lang', 'nl');
  document.documentElement.lang = 'en';
  const { getLang } = await import('../public/js/core/i18n.js?unlocked');
  expect(getLang()).toBe('nl');
});
