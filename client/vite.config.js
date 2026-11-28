import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Το panel ζει στον Fastify· σε ανάπτυξη το localhost:3000/panel περνά εκεί.
      '/panel': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
