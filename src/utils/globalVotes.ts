import { normalizeSiteKey, normalizeSiteUrl, SitePreference } from './siteLikes';

const SITE_COUNTS_REVEAL_KEY = 'site-counts-reveal';
const GLOBAL_VOTE_INSTALLATION_ID_KEY = 'global-vote-installation-id';

const SUPABASE_URL = (import.meta.env.WXT_SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_PUBLIC_KEY = (
  import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.WXT_SUPABASE_ANON_KEY ?? ''
).trim();
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SiteCountsRevealMap = Record<string, true>;

export type SiteVoteStats = {
  siteKey: string;
  likes: number;
  dislikes: number;
  total: number;
  likeRatio: number;
  userVote: SitePreference;
};

type SubmitSiteVoteRow = {
  site_key: string;
  likes: number | string;
  dislikes: number | string;
  user_vote: SitePreference;
};

type SiteVoteCountsRow = {
  site_key: string;
  likes: number | string;
  dislikes: number | string;
};

const toNonNegativeInteger = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const isSupportedPreference = (value: unknown): value is SitePreference => {
  return value === 'like' || value === 'dislike' || value === 'neutral';
};

const buildStats = (
  siteKey: string,
  likesRaw: number | string,
  dislikesRaw: number | string,
  userVote: SitePreference,
): SiteVoteStats => {
  const likes = toNonNegativeInteger(likesRaw);
  const dislikes = toNonNegativeInteger(dislikesRaw);
  const total = likes + dislikes;
  const likeRatio = total === 0 ? 0 : likes / total;
  return {
    siteKey,
    likes,
    dislikes,
    total,
    likeRatio,
    userVote,
  };
};

const getHeaders = (): HeadersInit => ({
  apikey: SUPABASE_PUBLIC_KEY,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

const callRpc = async (rpcName: string, payload: Record<string, unknown>): Promise<unknown> => {
  if (!isGlobalVotingConfigured()) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    let detail = body;

    try {
      const parsed = JSON.parse(body) as {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
      };
      detail = [parsed.code, parsed.message, parsed.details, parsed.hint].filter(Boolean).join(' | ');
    } catch {
      // Keep raw body when response isn't JSON.
    }

    throw new Error(`RPC ${rpcName} failed (${response.status}): ${detail}`);
  }

  const rawBody = await response.text();
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error(`RPC ${rpcName} returned non-JSON response: ${rawBody}`);
  }
};

const normalizeRpcRows = <T>(raw: unknown): T[] => {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') return [raw as T];
  return [];
};

const readRevealMap = async (): Promise<SiteCountsRevealMap> => {
  const result = await browser.storage.local.get(SITE_COUNTS_REVEAL_KEY);
  const raw = result[SITE_COUNTS_REVEAL_KEY];
  if (!raw || typeof raw !== 'object') return {};

  const parsed: SiteCountsRevealMap = {};
  for (const [site, isUnlocked] of Object.entries(raw as Record<string, unknown>)) {
    if (isUnlocked === true) parsed[site] = true;
  }
  return parsed;
};

const writeRevealMap = async (map: SiteCountsRevealMap): Promise<void> => {
  await browser.storage.local.set({
    [SITE_COUNTS_REVEAL_KEY]: map,
  });
};

const getOrCreateInstallationId = async (): Promise<string> => {
  const result = await browser.storage.local.get(GLOBAL_VOTE_INSTALLATION_ID_KEY);
  const existing = result[GLOBAL_VOTE_INSTALLATION_ID_KEY];
  if (typeof existing === 'string' && UUID_V4_PATTERN.test(existing)) return existing;

  const created = crypto.randomUUID();
  await browser.storage.local.set({
    [GLOBAL_VOTE_INSTALLATION_ID_KEY]: created,
  });
  return created;
};

export const isGlobalVotingConfigured = (): boolean => {
  return SUPABASE_URL.length > 0 && SUPABASE_PUBLIC_KEY.length > 0;
};

export const getSiteCountsUnlocked = async (rawUrl: string): Promise<boolean> => {
  const normalizedSite = normalizeSiteUrl(rawUrl);
  if (!normalizedSite) return false;

  const revealMap = await readRevealMap();
  return revealMap[normalizedSite] === true;
};

export const unlockSiteCounts = async (rawUrl: string): Promise<boolean> => {
  const normalizedSite = normalizeSiteUrl(rawUrl);
  if (!normalizedSite) return false;

  const revealMap = await readRevealMap();
  if (revealMap[normalizedSite]) return true;
  revealMap[normalizedSite] = true;
  await writeRevealMap(revealMap);
  return true;
};

export const getSiteCountsRevealStorageKey = (): string => SITE_COUNTS_REVEAL_KEY;

export const fetchSiteVoteStats = async (rawUrl: string, userVote: SitePreference): Promise<SiteVoteStats | null> => {
  const siteKey = normalizeSiteKey(rawUrl);
  if (!siteKey || !isGlobalVotingConfigured()) return null;

  try {
    const raw = await callRpc('get_site_vote_counts', {
      p_site_key: siteKey,
    });
    const rows = normalizeRpcRows<SiteVoteCountsRow>(raw);

    if (rows.length === 0) {
      return buildStats(siteKey, 0, 0, userVote);
    }

    const row = rows[0];
    return buildStats(row.site_key, row.likes, row.dislikes, userVote);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Unable to fetch site vote stats:', { message, siteKey });
    return null;
  }
};

export const submitSiteVote = async (rawUrl: string, vote: SitePreference): Promise<SiteVoteStats | null> => {
  const siteKey = normalizeSiteKey(rawUrl);
  if (!siteKey || !isGlobalVotingConfigured()) return null;

  try {
    const installationId = await getOrCreateInstallationId();
    const raw = await callRpc('submit_site_vote', {
      p_site_key: siteKey,
      p_install_id: installationId,
      p_vote: vote,
    });
    const rows = normalizeRpcRows<SubmitSiteVoteRow>(raw);

    if (rows.length === 0) return null;

    const row = rows[0];
    return buildStats(
      row.site_key,
      row.likes,
      row.dislikes,
      isSupportedPreference(row.user_vote) ? row.user_vote : vote,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Unable to submit site vote:', { message, siteKey, vote });
    return null;
  }
};
