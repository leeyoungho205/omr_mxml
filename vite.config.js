import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite 설정: React + Tailwind v4 플러그인 활성화
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 모바일 동일 네트워크에서 접속 테스트하기 위함
  },
})
