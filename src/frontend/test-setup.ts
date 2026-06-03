import "@testing-library/jest-dom";

// jsdom (as configured by vitest here) does not expose a working `localStorage`,
// and Node's experimental global localStorage is unavailable without
// `--localstorage-file`. Many component/lib tests assume the browser default is
// present (calling `localStorage.getItem/setItem/clear` directly), so provide a
// spec-compliant in-memory implementation on the global object.
//
// Defined as `configurable`/`writable` so individual test files that install
// their own mock via `Object.defineProperty(window, "localStorage", ...)` can
// still override it without throwing "Cannot redefine property".
function createStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

Object.defineProperty(globalThis, "localStorage", {
  value: createStorage(),
  configurable: true,
  writable: true,
});
