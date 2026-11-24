import { fileURLToPath } from 'node:url';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'));
const buildTarget = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'build-target.json'), 'utf8'));
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const legacyTargets = String(buildTarget.legacyBrowsers)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function classicAndroidWebViewPlugin(capacitorBuild: boolean): Plugin {
  return {
    name: 'classic-android-webview-compat',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Strip crossorigin from local script/stylesheet tags to avoid Android WebView CORS quirks,
        // while keeping type="module" and nomodule intact for @vitejs/plugin-legacy.
        return html
          .replace(/(<script\b[^>]*?)\s+crossorigin(?:="[^"]*")?/gi, '$1')
          .replace(/(<link\b[^>]*?)\s+crossorigin(?:="[^"]*")?/gi, '$1');
      },
    },
    closeBundle() {
      if (!capacitorBuild) return;
      const distDir = path.resolve(rootDir, 'dist');
      for (const file of ['sw.js', 'registerSW.js']) {
        const target = path.join(distDir, file);
        if (fs.existsSync(target)) {
          fs.rmSync(target, { force: true });
        }
      }
      if (fs.existsSync(distDir)) {
        for (const entry of fs.readdirSync(distDir)) {
          if (/^workbox-.*\.js$/i.test(entry)) {
            fs.rmSync(path.join(distDir, entry), { force: true });
          }
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version || '1.0.0'),
      'import.meta.env.VITE_MIN_CHROMIUM': JSON.stringify(String(buildTarget.minTestedChromium)),
      'import.meta.env.VITE_GITHUB_REPO': JSON.stringify(process.env.VITE_GITHUB_REPO || 'wilsonlimamn/car-control'),
    },
    plugins: [
      react(),
      legacy({
        targets: legacyTargets,
        modernPolyfills: false,
        polyfills: true,
        renderLegacyChunks: true,
      }),
      VitePWA({
        disable: isCapacitorBuild,
        injectRegister: false,
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'sql-wasm.wasm',
        ],
        manifest: {
          id: '/',
          name: 'Car Control - Auto em Dia',
          short_name: 'Car Control',
          description: 'Cockpit automotivo offline para controle de manutenção, autonomia e peças na central multimídia.',
          theme_color: '#05070c',
          background_color: '#05070c',
          display: 'fullscreen',
          orientation: 'landscape',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cacheId: `car-control-v${pkg.version || '1.0.0'}`,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff,woff2}'],
          globIgnores: ['**/sql-asm*.js'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/sql-asm\.js(?:\?.*)?$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sql-asm-fallback-cache',
                expiration: {
                  maxEntries: 2,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      classicAndroidWebViewPlugin(isCapacitorBuild),
    ],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      target: buildTarget.esTarget,
      cssTarget: buildTarget.cssTarget,
      cssMinify: 'esbuild' as const,
      modulePreload: false,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
