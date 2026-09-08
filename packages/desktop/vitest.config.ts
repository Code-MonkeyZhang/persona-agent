/**
 * @file vitest.config.ts
 * @description vitest 配置，前端测试集中在 tests/ 目录，源码导入统一走 @ 与 @shared 别名
 */
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src/renderer'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
