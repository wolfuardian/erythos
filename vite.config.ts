import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function gitHash(): string {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(); }
  catch { return 'unknown'; }
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [solidPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${gitHash()}`),
    __GIT_HASH__: JSON.stringify(gitHash()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: process.env.NODE_ENV === 'production'
        ? '[hash:base64:6]'
        : '[name]__[local]__[hash:base64:4]',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Match the vite 7 object-form behavior:
        //   manualChunks: { 'vendor-three': ['three'], 'vendor-solid': ['solid-js', 'solid-js/web'] }
        // Old form matched only the package entry; subpaths like `three/examples/*`
        // (GLTFLoader, OrbitControls, etc.) stayed in the main bundle.
        // The function form needs explicit subpath exclusion to preserve that split.
        manualChunks: (id) => {
          if (/[\\/]node_modules[\\/]three[\\/](?!examples[\\/]|addons[\\/])/.test(id)) {
            return 'vendor-three';
          }
          if (/[\\/]node_modules[\\/]solid-js[\\/]/.test(id)) {
            return 'vendor-solid';
          }
        },
      },
    },
  },
});
