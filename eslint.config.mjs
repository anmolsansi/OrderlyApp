import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: js.configs.recommended.rules,
  },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      // Existing client pages synchronously initialize loading/view state in effects.
      // ST-12 keeps this debt visible without rewriting non-owned product behavior.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['e2e/**/*.ts'],
    rules: {
      // Existing Playwright harnesses intentionally model dynamic JSON payloads.
      // Keep the debt visible while allowing ST-12 to add a real lint gate without broad test refactors.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'artifacts/**',
  ]),
]);
