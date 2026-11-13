/**
 * Sprint 3 — T3: Configuração do Vitest para testes de regras Firestore.
 * Executado via: firebase emulators:exec --only firestore 'vitest run --config vitest.rules.config.ts'
 * Ou diretamente via: npm run test:rules
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.rules.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
