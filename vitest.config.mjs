import { defineConfig } from 'vitest/config'

// 本阶段仅验证后端；前端测试文件保留，恢复前端阶段时另行接入。
export default defineConfig({
  test: {
    projects: ['./cloudfunctions-v2/vitest.config.mjs']
  }
})
