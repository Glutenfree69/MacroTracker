import { defineConfig } from 'vite'

// base : GitHub Pages sert le site sous /<repo>/, pas à la racine — et la casse
// compte. La CI passe BASE_PATH ; ce défaut sert au `vite build` lancé à la main.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/MacroTracker/',
  // sqlite-wasm charge son .wasm lui-même : le pré-bundler de Vite le casserait.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
})
