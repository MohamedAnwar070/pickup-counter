import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3000';

const proxyConfig = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
  '/products': {
    target: apiTarget,
    changeOrigin: true,
  },
  '/orders': {
    target: apiTarget,
    changeOrigin: true,
    bypass: (req: { headers: { accept?: string }; method?: string; url?: string }) => {
      if (
        req.headers.accept?.includes('text/html') ||
        (req.method === 'GET' && (req.url === '/orders' || req.url === '/orders/'))
      ) {
        return '/index.html';
      }
    },
  },
  '/payments': {
    target: apiTarget,
    changeOrigin: true,
  },
  '/health': {
    target: apiTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    // npm workspaces hoist React to the repository root. Dedupe prevents the
    // optimizer from resolving a second copy from frontend/node_modules.
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  server: {
    port: 5173,
    proxy: proxyConfig,
  },
  preview: {
    port: 5173,
    host: true,
    proxy: proxyConfig,
  },
});
