import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Disables ESLint rules that conflict with Prettier. Must stay last.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from the local Supabase schema; never hand-edited.
    "src/lib/supabase/database.types.ts",
    // Scratch space written by the Supabase CLI; contains vendored bundles.
    "supabase/.temp/**",
    "supabase/.branches/**",
    ".lancers-runtime/**",
  ]),
]);

export default eslintConfig;
