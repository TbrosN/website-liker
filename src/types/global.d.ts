declare module '*.css';

interface ImportMetaEnv {
  readonly WXT_SUPABASE_URL?: string;
  readonly WXT_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly WXT_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
