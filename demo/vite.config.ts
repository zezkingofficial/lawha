import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  css: { postcss: path.resolve(__dirname, '..') },
  // the single-file demo always runs on the in-browser data (artifact pages cannot call other sites)
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '""', 'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': '""' },
  build: { outDir: path.resolve(__dirname, '../dist-demo'), emptyOutDir: true },
});
