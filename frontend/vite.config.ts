import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento, /api vai para o backend; em produção quem faz isso é o Nginx.
    proxy: { '/api': 'http://localhost:3333' },
  },
  test: {
    environment: 'jsdom',
  },
});
