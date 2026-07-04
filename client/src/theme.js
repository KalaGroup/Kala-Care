// Dark / Light theme switching for the whole ERP.
//
// The theme is just a `dark` class on <html>. All dark-mode colors live in
// index.css under `html.dark ...` overrides, so the LIGHT theme is untouched —
// removing the class restores the original design exactly.
//
// index.html also has a tiny inline script that applies the saved theme
// BEFORE the app loads, so there is no white flash on refresh in dark mode.

const STORAGE_KEY = 'erp-theme';

export function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable (private mode) — theme still applies for this tab
  }
}

export function initTheme() {
  applyTheme(getStoredTheme());
}
