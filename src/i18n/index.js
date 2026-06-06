import en from './en';
import am from './am';

const translations = { en, am };
let currentLang = localStorage.getItem('aman_lang') || 'en';

export function t(key) {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}

export function setLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem('aman_lang', lang);
  document.documentElement.lang = lang;
  applyTranslations();
}

export function getLanguage() {
  return currentLang;
}

export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
}

export function initLanguageToggle() {
  const toggle = document.getElementById('langToggle');
  if (!toggle) return;
  toggle.textContent = currentLang === 'en' ? 'አማ' : 'EN';
  toggle.addEventListener('click', () => {
    setLanguage(currentLang === 'en' ? 'am' : 'en');
    toggle.textContent = currentLang === 'en' ? 'አማ' : 'EN';
  });
  document.documentElement.lang = currentLang;
  applyTranslations();
}
