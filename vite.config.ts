import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// Si ton vite.config.ts actuel importe le plugin React autrement
// (ex. plugin-react-swc), garde ton import et ajoute juste cloudflare().
export default defineConfig({
  plugins: [react(), cloudflare()],
})
