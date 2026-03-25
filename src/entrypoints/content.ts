import {
  getLikedSitesStorageKey,
  isSiteLiked,
  normalizeSiteUrl,
  toggleSiteLike,
} from '../utils/siteLikes';

const BUTTON_ID = 'website-liker-floating-button';

const ensureFloatingButton = (): HTMLButtonElement => {
  const existing = document.getElementById(BUTTON_ID);
  if (existing instanceof HTMLButtonElement) return existing;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.style.position = 'fixed';
  button.style.right = '20px';
  button.style.bottom = '20px';
  button.style.zIndex = '2147483647';
  button.style.border = 'none';
  button.style.borderRadius = '999px';
  button.style.padding = '10px 14px';
  button.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, sans-serif';
  button.style.fontSize = '14px';
  button.style.fontWeight = '600';
  button.style.cursor = 'pointer';
  button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.25)';
  button.style.transition = 'transform 0.15s ease, background-color 0.2s ease';

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
  });

  document.body.append(button);
  return button;
};

const renderButtonState = (button: HTMLButtonElement, liked: boolean): void => {
  button.textContent = liked ? '👍 Liked' : '👍 Like this site';
  button.style.backgroundColor = liked ? '#16a34a' : '#111827';
  button.style.color = '#ffffff';
};

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  async main() {
    if (!document.body) return;

    const currentSite = normalizeSiteUrl(window.location.href);
    if (!currentSite) return;

    const button = ensureFloatingButton();
    renderButtonState(button, await isSiteLiked(currentSite));

    button.addEventListener('click', async () => {
      const nextLikedState = await toggleSiteLike(currentSite);
      renderButtonState(button, nextLikedState);
    });

    browser.storage.onChanged.addListener((changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== 'local') return;
      if (!changes[getLikedSitesStorageKey()]) return;
      void isSiteLiked(currentSite).then((liked) => renderButtonState(button, liked));
    });
  },
});
