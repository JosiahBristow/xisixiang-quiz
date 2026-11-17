import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base 用相对路径，部署到 GitHub Pages 的任意仓库路径下都能直接工作
export default defineConfig({
  base: './',
  plugins: [vue()],
})
