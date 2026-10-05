import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      // Existing client pages synchronously initialize loading/view state in effects.
      // ST-12 records this as visible lint debt instead of rewriting non-owned product code.
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
