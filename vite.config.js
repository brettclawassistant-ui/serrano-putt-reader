import { defineConfig } from 'vite';

export default defineConfig({
  base: '/serrano-putt-reader/',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
