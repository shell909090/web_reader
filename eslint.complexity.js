import base from './eslint.config.js';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  ...base,
  {
    files: ['lib.ts', 'read.ts', 'plugins/**/*.ts', 'src/**/*.ts'],
    plugins: { sonarjs },
    rules: {
      complexity: ['error', 9],
      'sonarjs/cognitive-complexity': ['error', 14],
    },
  },
];
