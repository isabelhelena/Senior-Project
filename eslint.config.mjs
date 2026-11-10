import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored bundles and local worker runtime artifacts are not source.
    "public/maplibre-gl-*.mjs",
    "workers/**/data/**",
    "**/.venv/**",
    ".npm-cache/**",
  ]),
]);

export default eslintConfig;
