import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the browser calls /api on the Vite origin and Vite forwards it to the NestJS API,
// so no CORS setup and no VITE_API_URL are needed locally.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:3000' } },
});
