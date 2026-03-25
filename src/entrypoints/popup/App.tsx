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
  fetchSiteVoteStats,
  getSiteCountsRevealStorageKey,
  getSiteCountsUnlocked,
  isGlobalVotingConfigured,
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
  const [busy, setBusy] = useState(false);

  const refreshStats = async (site: string, userPreference: SitePreference) => {
    setStatsError(null);
    const nextStats = await fetchSiteVoteStats(site, userPreference);
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

      let unlocked = await getSiteCountsUnlocked(currentTab.site);
      if (cancelled) return;

      if (currentPreference !== 'neutral' && !unlocked) {
        unlocked = await unlockSiteCounts(currentTab.site);
      }

      setCountsUnlocked(unlocked);
      if (unlocked) {
        await refreshStats(currentTab.site, currentPreference);
      }

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
    setBusy(true);

    await setSitePreference(tabState.site, nextPreference);
    setPreference(nextPreference);

    let unlocked = countsUnlocked;
    if (nextPreference !== 'neutral' && !unlocked) {
      unlocked = await unlockSiteCounts(tabState.site);
      setCountsUnlocked(unlocked);
    }

    if (unlocked) {
      setStatsError(null);
      const submitted = await submitSiteVote(tabState.site, nextPreference);
      if (submitted) {
        setStats(submitted);
      } else {
        await refreshStats(tabState.site, nextPreference);
      }
    }

    setBusy(false);
  };

  const onToggleFloater = async () => {
    setBusy(true);
    const nextHidden = !floaterHidden;
    await setFloatingControlHidden(nextHidden);
    setFloaterHidden(nextHidden);
    setBusy(false);
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
            void unlockSiteCounts(site).then((isUnlocked) => {
              setCountsUnlocked(isUnlocked);
              if (isUnlocked) void refreshStats(site, nextPreference);
            });
          } else if (countsUnlocked) {
            void refreshStats(site, nextPreference);
          }
        });
      }

      if (changes[getSiteCountsRevealStorageKey()]) {
        void getSiteCountsUnlocked(site).then((isUnlocked) => {
          setCountsUnlocked(isUnlocked);
          if (isUnlocked) void refreshStats(site, preference);
        });
      }
    };

    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [tabState.site, countsUnlocked, preference]);

  const positivePct = stats && stats.total > 0 ? Math.round(stats.likeRatio * 100) : null;

  return (
    <main className="popup-root">
      <p className="eyebrow">Website Liker</p>
      <h1 className="title">{tabState.title}</h1>
      <p className="subtitle">{subtitle}</p>

      <div className="preference-actions" role="group" aria-label="Site preference">
        <button
          className={`preference-button dislike ${preference === 'dislike' ? 'active' : ''}`}
          onClick={() => onSetPreference(preference === 'dislike' ? 'neutral' : 'dislike')}
          disabled={loading || busy || !tabState.site}
          aria-label="Dislike site"
          title="Dislike site"
        >
          👎
        </button>
        <button
          className={`preference-button like ${preference === 'like' ? 'active' : ''}`}
          onClick={() => onSetPreference(preference === 'like' ? 'neutral' : 'like')}
          disabled={loading || busy || !tabState.site}
          aria-label="Like site"
          title="Like site"
        >
          👍
        </button>
      </div>

      {tabState.site && !countsUnlocked && (
        <p className="counts-hint">Vote to unlock community likes/dislikes for this site.</p>
      )}

      {tabState.site && countsUnlocked && (
        <section className="community-card" aria-live="polite">
          <p className="community-label">Community</p>
          {statsError && <p className="community-error">{statsError}</p>}
          {!statsError && !stats && <p className="community-loading">Loading community stats...</p>}
          {!statsError && stats && (
            <div className="community-counts">
              <span>{formatCount(stats.likes)} 👍</span>
              <span>{formatCount(stats.dislikes)} 👎</span>
              {positivePct !== null && <span>{positivePct}% positive</span>}
            </div>
          )}
        </section>
      )}

      <button
        className="show-floater-button"
        onClick={onToggleFloater}
        disabled={loading || busy}
        title={floaterHidden ? 'Show floating controls' : 'Hide floating controls'}
      >
        {floaterHidden ? 'Show floater' : 'Hide floater'}
      </button>
    </main>
  );
};
