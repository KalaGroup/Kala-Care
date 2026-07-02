import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Split large third-party libraries into their own chunks. These change
    // rarely, so the browser can cache them independently of app code, and the
    // heavy visualisation/export libs only download for the routes that use them.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-chartjs': ['chart.js', 'react-chartjs-2', 'chartjs-plugin-datalabels'],
          'vendor-echarts': ['echarts', 'echarts-for-react', 'echarts-gl'],
          'vendor-plotly': ['plotly.js', 'react-plotly.js'],
          'vendor-recharts': ['recharts'],
          'vendor-xlsx': ['xlsx'],
          'vendor-mui': ['@mui/material', '@mui/icons-material'],
        },
      },
    },
    // Raise the warning threshold so the intentionally large vendor chunks
    // above don't spam the build log.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,        // ✅ Allow access from LAN (0.0.0.0)
    port: 8383,        // ✅ Your frontend port
    strictPort: true   // ✅ Prevent auto port change
  }
})