import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Optimize build
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'vrm': ['@pixiv/three-vrm'],
        },
      },
    },
    // Reduce chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['three', '@pixiv/three-vrm'],
  },
  // Enable build caching
  cacheDir: 'node_modules/.vite',
});
