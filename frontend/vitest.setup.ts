import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Explicit rather than relying on Testing Library's global-afterEach
// auto-detection, which needs `test.globals: true` (not set here, since
// this project imports describe/it/expect explicitly from "vitest").
// Without this, render() output from one test leaks into the next test in
// the same file — confirmed live: it turned a single-match `getByText`
// into a "found multiple elements" failure on the second test.
afterEach(() => {
  cleanup();
});
