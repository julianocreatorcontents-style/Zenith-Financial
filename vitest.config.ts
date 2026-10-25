import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    include: [
      'src/domain/**/*.test.ts',
      'src/lib/adapters/**/*.test.ts',
    ],
    environment: 'node',
  },
});
