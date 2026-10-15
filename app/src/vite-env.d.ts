/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEPLOYMENT_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CIRCUIT_WASM_SHA256?: string;
  readonly VITE_CIRCUIT_ZKEY_SHA256?: string;
}
