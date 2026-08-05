// Flat ESLint config. Source and tests are linted; generated output is ignored.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const typedFiles = ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: typedFiles,
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-lines-per-function': [
        'error',
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-statements': ['error', 40],
    },
  },
  {
    // Existing architectural debt. Keep these explicit so the normal source
    // policy remains enforceable while App and the synthesizer are refactored.
    files: ['src/App.tsx', 'src/audio/dialUpEffect.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'max-statements': 'off',
    },
  },
  {
    // Tests intentionally contain larger scenario callbacks and fixtures.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      complexity: ['error', 15],
      'max-depth': ['error', 5],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
