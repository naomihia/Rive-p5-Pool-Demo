import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()], // Activate the React plugin
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('node_modules/p5')) return 'p5';
            if (id.includes('node_modules/matter-js')) return 'matter';
            if (id.includes('node_modules/@rive-app')) return 'rive';
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 2000,
  }
});