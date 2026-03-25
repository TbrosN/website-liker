const LIKED_SITES_KEY = 'liked-sites';

type LikedSites = Record<string, boolean>;

export const normalizeSiteUrl = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return null;
  }
};

const readLikedSites = async (): Promise<LikedSites> => {
  const result = await browser.storage.local.get(LIKED_SITES_KEY);
  const likes = result[LIKED_SITES_KEY];
  if (!likes || typeof likes !== 'object') return {};
  return likes as LikedSites;
};

const writeLikedSites = async (likes: LikedSites): Promise<void> => {
  await browser.storage.local.set({
    [LIKED_SITES_KEY]: likes,
  });
};

export const isSiteLiked = async (rawUrl: string): Promise<boolean> => {
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  if (!normalizedUrl) return false;
  const likes = await readLikedSites();
  return Boolean(likes[normalizedUrl]);
};

export const toggleSiteLike = async (rawUrl: string): Promise<boolean> => {
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  if (!normalizedUrl) return false;

  const likes = await readLikedSites();
  const nextValue = !Boolean(likes[normalizedUrl]);
  likes[normalizedUrl] = nextValue;

  await writeLikedSites(likes);
  return nextValue;
};

export const getLikedSitesStorageKey = (): string => LIKED_SITES_KEY;
