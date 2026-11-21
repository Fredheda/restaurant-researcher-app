import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
  {
    // System font stacks only (--font-display, --font-sans in globals.css): no bundled or hosted fonts.
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next/font", "next/font/*"],
              message: "Use the system font stacks in globals.css; no bundled or hosted fonts.",
            },
          ],
        },
      ],
    },
  },
  {
    // Every locator lives in e2e/selectors.ts; specs call its helpers.
    files: ["e2e/**/*.spec.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='locator']",
          message: "Put locators in e2e/selectors.ts and call the helper.",
        },
      ],
    },
  },
]);

export default eslintConfig;
