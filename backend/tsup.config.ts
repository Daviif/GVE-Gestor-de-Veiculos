import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  // O pacote shared é TypeScript puro: vai embutido no bundle do backend.
  noExternal: ['@gve/shared'],
});
