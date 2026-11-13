import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    include: [
      'src/domain/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'src/hooks/**/*.test.ts',
    ],
    // Excluir testes de regras Firestore (requerem emulador — rodar via test:rules)
    exclude: [
      '**/node_modules/**',
      'src/**/*.rules.test.ts',
    ],
    environment: 'node',
  },
});
