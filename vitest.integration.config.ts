import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { '@': path.resolve(__dirname, 'src') } }, test: { include: ['src/**/*.integration.test.ts'], testTimeout: 20000, fileParallelism: false } });
