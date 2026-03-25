const SITE_PREFERENCES_KEY = 'site-preferences';
const FLOATING_CONTROL_HIDDEN_KEY = 'floating-control-hidden';

export type SitePreference = 'like' | 'dislike' | 'neutral';

type StoredPreferences = Record<string, SitePreference>;
type SitePreferences = Record<string, SitePreference>;

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

const normalizeStoredPreference = (value: unknown): SitePreference => {
  if (value === 'like' || value === 'dislike' || value === 'neutral') return value;
  return 'neutral';
};

const readSitePreferences = async (): Promise<SitePreferences> => {
  const result = await browser.storage.local.get(SITE_PREFERENCES_KEY);
  const rawPreferences = result[SITE_PREFERENCES_KEY];
  if (!rawPreferences || typeof rawPreferences !== 'object') return {};

  const parsed: SitePreferences = {};
  for (const [site, value] of Object.entries(rawPreferences as StoredPreferences)) {
    parsed[site] = normalizeStoredPreference(value);
  }

  return parsed;
};

const writeSitePreferences = async (preferences: SitePreferences): Promise<void> => {
  await browser.storage.local.set({
    [SITE_PREFERENCES_KEY]: preferences,
  });
};

export const getSitePreference = async (rawUrl: string): Promise<SitePreference> => {
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  if (!normalizedUrl) return 'neutral';
  const preferences = await readSitePreferences();
  return preferences[normalizedUrl] ?? 'neutral';
};

export const setSitePreference = async (rawUrl: string, preference: SitePreference): Promise<SitePreference> => {
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  if (!normalizedUrl) return 'neutral';

  const preferences = await readSitePreferences();
  preferences[normalizedUrl] = preference;

  await writeSitePreferences(preferences);
  return preference;
};

export const getSitePreferencesStorageKey = (): string => SITE_PREFERENCES_KEY;

export const getFloatingControlHidden = async (): Promise<boolean> => {
  const result = await browser.storage.local.get(FLOATING_CONTROL_HIDDEN_KEY);
  return result[FLOATING_CONTROL_HIDDEN_KEY] === true;
};

export const setFloatingControlHidden = async (hidden: boolean): Promise<void> => {
  await browser.storage.local.set({
    [FLOATING_CONTROL_HIDDEN_KEY]: hidden,
  });
};

export const getFloatingControlHiddenStorageKey = (): string => FLOATING_CONTROL_HIDDEN_KEY;
