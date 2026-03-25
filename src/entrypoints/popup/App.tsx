import { useEffect, useMemo, useState } from 'react';

import {
  getFloatingControlHiddenStorageKey,
  getFloatingControlHidden,
  getSitePreference,
  getSitePreferencesStorageKey,
  normalizeSiteUrl,
  setFloatingControlHidden,
  setSitePreference,
  SitePreference,
} from '../../utils/siteLikes';
import {
  applyOptimisticVoteStats,
  fetchSiteVoteStats,
  getCachedSiteVoteStats,
  getSiteCountsRevealStorageKey,
  getSiteVoteStatsCacheStorageKey,
  getSiteCountsUnlocked,
  isGlobalVotingConfigured,
  setCachedSiteVoteStats,
  SiteVoteStats,
  submitSiteVote,
  unlockSiteCounts,
} from '../../utils/globalVotes';

type TabState = {
  site: string | null;
  title: string;
};

const countFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const formatCount = (value: number): string => countFormatter.format(value);

const getActiveTabState = async (): Promise<TabState> => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const site = normalizeSiteUrl(tab?.url ?? '');
  return {
    site,
    title: tab?.title ?? 'Current tab',
  };
};

export const App = () => {
  const [tabState, setTabState] = useState<TabState>({ site: null, title: 'Current tab' });
  const [preference, setPreference] = useState<SitePreference>('neutral');
  const [floaterHidden, setFloaterHidden] = useState(false);
  const [countsUnlocked, setCountsUnlocked] = useState(false);
  const [stats, setStats] = useState<SiteVoteStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPrimingStats, setIsPrimingStats] = useState(false);

  const primeStats = async (site: string, userPreference: SitePreference) => {
    if (isPrimingStats || stats) return;
    setIsPrimingStats(true);
    setStatsError(null);
    const nextStats = await fetchSiteVoteStats(site, userPreference);
    setIsPrimingStats(false);
    if (nextStats) {
      setStats(nextStats);
      return;
    }

    if (!isGlobalVotingConfigured()) {
      setStatsError('Set WXT_SUPABASE_URL and WXT_SUPABASE_PUBLISHABLE_KEY to enable global counts.');
      return;
    }

    setStatsError('Unable to load community stats right now.');
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [currentTab, hidden] = await Promise.all([getActiveTabState(), getFloatingControlHidden()]);
      if (cancelled) return;

      setTabState(currentTab);
      setFloaterHidden(hidden);
      setStats(null);
      setStatsError(null);

      if (!currentTab.site) {
        setPreference('neutral');
        setCountsUnlocked(false);
        setLoading(false);
        return;
      }

      const currentPreference = await getSitePreference(currentTab.site);
      if (cancelled) return;
      setPreference(currentPreference);
      const cachedStats = await getCachedSiteVoteStats(currentTab.site);
      if (cancelled) return;
      if (cachedStats) setStats(cachedStats);

      let unlocked = await getSiteCountsUnlocked(currentTab.site);
      if (cancelled) return;

      if (currentPreference !== 'neutral' && !unlocked) {
        unlocked = await unlockSiteCounts(currentTab.site);
      }

      setCountsUnlocked(unlocked);
      void primeStats(currentTab.site, currentPreference);

      if (!cancelled) setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle = useMemo(() => {
    if (!tabState.site) return 'Open a normal website tab (http/https) to set a preference.';
    return tabState.site;
  }, [tabState.site]);

  const onSetPreference = async (nextPreference: SitePreference) => {
    if (!tabState.site) return;
    const previousPreference = preference;
    setPreference(nextPreference);
    void setSitePreference(tabState.site, nextPreference);

    let unlocked = countsUnlocked;
    if (nextPreference !== 'neutral' && !unlocked) {
      unlocked = true;
      setCountsUnlocked(true);
      void unlockSiteCounts(tabState.site);
    }

    if (unlocked) {
      setStatsError(null);
      setStats((currentStats) => {
        const optimisticStats = applyOptimisticVoteStats(
          tabState.site!,
          currentStats,
          previousPreference,
          nextPreference,
        );
        if (optimisticStats) void setCachedSiteVoteStats(tabState.site!, optimisticStats);
        return optimisticStats ?? currentStats;
      });
    }

    void submitSiteVote(tabState.site, nextPreference);
    void primeStats(tabState.site, nextPreference);
  };

  const onToggleFloater = async () => {
    const nextHidden = !floaterHidden;
    await setFloatingControlHidden(nextHidden);
    setFloaterHidden(nextHidden);
  };

  useEffect(() => {
    const onStorageChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== 'local') return;

      if (changes[getFloatingControlHiddenStorageKey()]) {
        void getFloatingControlHidden().then((hidden) => setFloaterHidden(hidden));
      }

      const site = tabState.site;
      if (!site) return;

      if (changes[getSitePreferencesStorageKey()]) {
        void getSitePreference(site).then((nextPreference) => {
          setPreference(nextPreference);

          if (nextPreference !== 'neutral') {
            setCountsUnlocked(true);
            void unlockSiteCounts(site);
          }

          void primeStats(site, nextPreference);
        });
      }

      if (changes[getSiteVoteStatsCacheStorageKey()]) {
        void getCachedSiteVoteStats(site).then((nextStats) => {
          setStats(nextStats);
        });
      }

      if (changes[getSiteCountsRevealStorageKey()]) {
        void getSiteCountsUnlocked(site).then((isUnlocked) => {
          setCountsUnlocked(isUnlocked);
          if (isUnlocked) void primeStats(site, preference);
        });
      }
    };

    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [tabState.site, countsUnlocked, preference, isPrimingStats, stats]);

  const showCounts = Boolean(tabState.site && countsUnlocked && preference !== 'neutral' && !statsError && stats);
  const displayStats = showCounts ? stats : null;

  return (
    <main className="popup-root">
      <p className="eyebrow">Website Liker</p>
      <h1 className="title">{tabState.title}</h1>
      <p className="subtitle">{subtitle}</p>

      <div className="preference-actions" role="group" aria-label="Site preference">
        <button
          className={`preference-button like ${preference === 'like' ? 'active' : ''}`}
          onClick={() => onSetPreference(preference === 'like' ? 'neutral' : 'like')}
          disabled={loading || !tabState.site}
          aria-label="Like site"
          title="Like site"
        >
          <span className="preference-icon" aria-hidden="true">👍</span>
          {displayStats && <span className="preference-count">{formatCount(displayStats.likes)}</span>}
        </button>
        <span className="preference-divider" aria-hidden="true" />
        <button
          className={`preference-button dislike ${preference === 'dislike' ? 'active' : ''}`}
          onClick={() => onSetPreference(preference === 'dislike' ? 'neutral' : 'dislike')}
          disabled={loading || !tabState.site}
          aria-label="Dislike site"
          title="Dislike site"
        >
          {displayStats && <span className="preference-count">{formatCount(displayStats.dislikes)}</span>}
          <span className="preference-icon" aria-hidden="true">👎</span>
        </button>
      </div>

      {tabState.site && !countsUnlocked && (
        <p className="counts-hint">Vote to unlock community likes/dislikes for this site.</p>
      )}

      {tabState.site && countsUnlocked && statsError && (
        <p className="community-error" aria-live="polite">{statsError}</p>
      )}

      <button
        className="show-floater-button"
        onClick={onToggleFloater}
        disabled={loading}
        title={floaterHidden ? 'Show floating controls' : 'Hide floating controls'}
      >
        {floaterHidden ? 'Show floater' : 'Hide floater'}
      </button>
    </main>
  );
};
