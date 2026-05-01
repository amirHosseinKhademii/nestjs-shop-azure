import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir,
      },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  { ignores: ['dist/**', 'node_modules/**'] },
);
