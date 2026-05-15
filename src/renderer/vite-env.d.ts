/// <reference types="vite/client" />

// IRIS — typed `import.meta.env` for renderer-only vars. // JASRAJ

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
