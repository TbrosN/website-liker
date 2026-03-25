export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.log('Website Liker installed');
  });
});
