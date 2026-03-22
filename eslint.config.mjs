import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/wasm-engine/**',
      'src-tauri/**',
      'src-engine/**',
      'proto/generated/**',
      '**/*.d.ts',
      'public/**',
      'web/**',
      '*.config.ts',
      '*.config.mjs',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Detect deprecated function usage
      '@typescript-eslint/no-deprecated': 'error',

      // Already handled by tsconfig noUnusedLocals/noUnusedParameters
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
