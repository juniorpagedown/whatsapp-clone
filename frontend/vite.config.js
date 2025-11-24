import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    watch: false,
    threads: false,
    api: false
  },
  server: {
    host: '0.0.0.0', // Permite acesso externo
    port: 3000,
    allowedHosts: [
      'baladapp.lizagent.com.br'
    ],
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
});
