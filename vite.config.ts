import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

// https://vitejs.dev/guide/build#library-mode
export default defineConfig({
  plugins: [
    // vite-plugin-dts automatically generates TypeScript declaration files
    // (*.d.ts) from the source files, placing them alongside the build output.
    // This is what lets library consumers get full type-checking and IntelliSense.
    dts({
      include: ['src'],
      rollupTypes: true, // Merge all .d.ts files into a single declaration bundle
      tsconfigPath: './tsconfig.json',
    }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },

  build: {
    // "lib" mode tells Vite to build an importable library rather than
    // a standalone web app. It skips the HTML entry point entirely.
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'XfdfAnnotator',          // Global var name for the UMD bundle
      fileName: 'xfdf-annotator',     // Output: xfdf-annotator.js / .cjs / .umd.js
      formats: ['es', 'cjs', 'umd'],  // ESM for bundlers, CJS for Node, UMD for CDN <script>
    },

    rollupOptions: {
      // Externals tell Rollup: "don't bundle these; the host app provides them."
      // This keeps the library lightweight and avoids shipping duplicate copies
      // of fabric and pdfjs-dist when the consumer already has them.
      external: ['fabric', 'pdfjs-dist'],

      output: {
        // When the UMD bundle is loaded via <script>, it needs to know which
        // global variable holds each external dependency.
        globals: {
          fabric: 'fabric',
          'pdfjs-dist': 'pdfjsLib',
        },
        // Ensures CSS assets (if any) are extracted rather than inlined.
        assetFileNames: 'xfdf-annotator[extname]',
      },
    },

    // Generate separate sourcemap files so consumers can debug into library code.
    sourcemap: true,

    // Clear dist/ before each build to avoid stale artifacts.
    emptyOutDir: true,

    // Prevent new URL('…', import.meta.url) assets from being inlined as data URIs.
    // Without this the pdfjs-dist worker (~1.4 MB) gets base64-embedded in every bundle.
    assetsInlineLimit: 0,
  },
})
