import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // npm workspaces hoist React to the repository root. Dedupe prevents the
    // optimizer from resolving a second copy from frontend/node_modules.
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: {
      '@pickup-counter/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/products': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/orders': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html') || (req.method === 'GET' && (req.url === '/orders' || req.url === '/orders/'))) {
            return '/index.html';
          }
        },
      },
      '/payments': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
