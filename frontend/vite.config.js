import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.API_URL || 'http://localhost:3001';

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      watch: false,
      threads: false,
      api: false
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: [
        'baladapp.lizagent.com.br'
      ],
      proxy: {
        '/api': apiUrl,
        '/socket.io': {
          target: apiUrl,
          ws: true
        }
      }
    }
  };
});
