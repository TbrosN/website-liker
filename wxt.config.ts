import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Website Liker',
    description:
      'Like and dislike websites, and see how many others have liked or disliked them.',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://*.supabase.co/*'],
  },
});
