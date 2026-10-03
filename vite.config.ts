import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    // CRITICAL: Must be high to inline WebLLM workers and assets for single-file export.
    // Do not reduce this value.
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 20_000,
  },
})
