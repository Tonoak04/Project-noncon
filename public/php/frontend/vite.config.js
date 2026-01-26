import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
    base: '/',
    plugins: [react()],
    root: resolve(__dirname),
    server: {
        port: 5173,
        open: false,
        fs: {
            allow: [resolve(__dirname), resolve(__dirname, '../css')],
        },
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@css': resolve(__dirname, '../css'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
