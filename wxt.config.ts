import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Website Liker',
    description: 'Local thumbs up proof-of-concept for websites.',
    permissions: ['tabs', 'storage'],
  },
});
