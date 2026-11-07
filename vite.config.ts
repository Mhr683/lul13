import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// Tailwind puts all of the design inside "@layer" blocks. Chrome older than version 99 (old phones such as
// the Oppo A5s) skips everything inside them, so the store opened without any design. For every CSS file
// a copy without the layer wrappers is written next to it (name.legacy.css); index.html switches only
// those old browsers to the copy, so new phones and computers keep the normal file.
function unwrapCssLayers(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@layer', i);
    if (at < 0) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    let j = at + 6;
    while (j < css.length && css[j] !== '{' && css[j] !== ';') j++;
    if (css[j] === ';') {
      // "@layer theme, base, utilities;" only names the layers
      i = j + 1;
      continue;
    }
    // Find the matching closing brace (skipping quoted text)
    let depth = 0;
    let k = j;
    let quote = '';
    for (; k < css.length; k++) {
      const ch = css[k];
      if (quote) {
        if (ch === '\\') k++;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) break;
    }
    out += unwrapCssLayers(css.slice(j + 1, k));
    i = k + 1;
  }
  return out;
}

const legacyCssCopies = () => ({
  name: 'anokha-legacy-css',
  apply: 'build' as const,
  generateBundle(_opts: unknown, bundle: Record<string, any>) {
    for (const file of Object.values(bundle)) {
      if (file.type !== 'asset' || !/\.css$/.test(file.fileName) || /\.legacy\.css$/.test(file.fileName)) continue;
      const source = typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
      (this as any).emitFile({
        type: 'asset',
        fileName: file.fileName.replace(/\.css$/, '.legacy.css'),
        source: unwrapCssLayers(source),
      });
    }
  },
});

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      legacyCssCopies(),
      VitePWA({
        registerType: 'autoUpdate',
        // Registered from src/main.tsx so the app can reload itself when a new version is installed
        injectRegister: false,
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Anokha Shopping Hub',
          short_name: 'Anokha',
          description: 'Unique products from trusted sellers, delivered across Pakistan.',
          theme_color: '#141413',
          background_color: '#FBFBF9',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          // A new version takes over right away and old cached files are removed
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Never answer API calls from the offline cache
          navigateFallbackDenylist: [/^\/api\//],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}'],
          runtimeCaching: [
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
    ],
    // Older phones (e.g. Oppo A5s with the Chrome it came with) do not understand the newest JavaScript
    // (?. and ??) and the app stayed on a white screen: the code is written for Chrome 70+ instead, and
    // the CSS gets fallbacks for old browsers (see also the old-browser notice in index.html)
    build: {
      target: ['es2019', 'chrome70', 'firefox68', 'safari12', 'edge79'],
      cssTarget: ['chrome70', 'firefox68', 'safari12', 'edge79'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio dev environment (Cloud Run proxy).
      hmr: false,
      watch: null,
    },
  };
});
