/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAX_RECORDING_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
