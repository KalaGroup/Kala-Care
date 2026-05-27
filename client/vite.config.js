import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '',  
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,        // ✅ Allow access from LAN (0.0.0.0)
    port: 8383,        // ✅ Your frontend port
    strictPort: true   // ✅ Prevent auto port change
  }
})