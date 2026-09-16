import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, '../../', '');
    return {
        plugins: [react()],
        envDir: '../../',
        server: {
            port: 5173,
            proxy: {
                '/api': {
                    target: env.VITE_API_PROXY || 'http://localhost:8080',
                    changeOrigin: true,
                },
            },
        },
        build: { sourcemap: true },
    };
});
