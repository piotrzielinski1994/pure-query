import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// A few tests opt into `@vitest-environment node` (build-level guards with no
// DOM). The DOM stubs below reference jsdom globals, so skip them when there is
// no document - guarding here keeps those node tests from crashing on import.
const hasDom = typeof document !== "undefined";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (hasDom && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (hasDom && !navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: () => Promise.resolve() },
  });
}

if (hasDom) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

afterEach(() => {
  cleanup();
});
