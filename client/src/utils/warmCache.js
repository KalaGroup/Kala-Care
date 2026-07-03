// Warm cache: instantly repaint a page with the last data it showed while the
// normal network fetch runs in the background. The fetch ALWAYS proceeds and
// its fresh result overwrites the warm copy, so the data users end up seeing
// is exactly what it would have been without the cache — it just appears
// immediately on repeat visits instead of after a spinner.
//
// Usage inside an existing load function:
//   const warm = readWarmCache(warmKey('customers', { userId, branch }));
//   if (warm) setCustomers(warm);           // instant paint (only if state is empty)
//   const res = await axios.get(...);        // normal fetch, unchanged
//   setCustomers(res.data);
//   writeWarmCache(warmKey('customers', { userId, branch }), res.data);
//
// Keys MUST include everything that changes the dataset (user id, branch,
// filters) so one user/filter's data is never flashed for another.
// sessionStorage is per-tab and cleared when the tab closes, and writes are
// best-effort: oversized payloads simply skip caching.

const VERSION = 'v1';

export function warmKey(name, params) {
  try {
    return `warm:${VERSION}:${name}:${params ? JSON.stringify(params) : ''}`;
  } catch {
    return `warm:${VERSION}:${name}`;
  }
}

export function readWarmCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeWarmCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Quota exceeded or unserializable — caching is best-effort only.
  }
}
