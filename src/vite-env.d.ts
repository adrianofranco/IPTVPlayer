/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_XTREAM_BASE?: string;
  /** 'true' embute a lista do VITE_XTREAM_BASE no build/wgt (teste na TV). */
  readonly VITE_DEV_TIME?: string;
}
