/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sync server base URL (e.g. `https://erythos.eoswolf.com`). */
  readonly VITE_SYNC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
