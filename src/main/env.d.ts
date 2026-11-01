interface ImportMetaEnv {
  readonly MAIN_VITE_GITHUB_CLIENT_ID?: string;
  readonly MAIN_VITE_GITHUB_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
