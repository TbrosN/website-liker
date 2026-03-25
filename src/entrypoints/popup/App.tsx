import { useEffect, useMemo, useState } from 'react';

import {
  getFloatingControlHiddenStorageKey,
  getFloatingControlHidden,
  getSitePreference,
  normalizeSiteUrl,
  setFloatingControlHidden,
  setSitePreference,
  SitePreference,
} from '../../utils/siteLikes';

type TabState = {
  site: string | null;
  title: string;
};

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const currentTab = await getActiveTabState();
      if (cancelled) return;
      setTabState(currentTab);
      if (!currentTab.site) {
        setPreference('neutral');
        setFloaterHidden(await getFloatingControlHidden());
        setLoading(false);
        return;
      }
      setPreference(await getSitePreference(currentTab.site));
      setFloaterHidden(await getFloatingControlHidden());
      setLoading(false);
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
    setLoading(true);
    await setSitePreference(tabState.site, nextPreference);
    setPreference(nextPreference);
    setLoading(false);
  };

  const onToggleFloater = async () => {
    setLoading(true);
    const nextHidden = !floaterHidden;
    await setFloatingControlHidden(nextHidden);
    setFloaterHidden(nextHidden);
    setLoading(false);
  };

  useEffect(() => {
    const onStorageChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== 'local') return;
      if (!changes[getFloatingControlHiddenStorageKey()]) return;
      void getFloatingControlHidden().then((hidden) => setFloaterHidden(hidden));
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return (
    <main className="popup-root">
      <p className="eyebrow">Website Liker</p>
      <h1 className="title">{tabState.title}</h1>
      <p className="subtitle">{subtitle}</p>

      <div className="preference-actions" role="group" aria-label="Site preference">
        <button
          className={`preference-button dislike ${preference === 'dislike' ? 'active' : ''}`}
          onClick={() => onSetPreference(preference === 'dislike' ? 'neutral' : 'dislike')}
          disabled={loading || !tabState.site}
          aria-label="Dislike site"
          title="Dislike site"
        >
          👎
        </button>
        <button
          className={`preference-button like ${preference === 'like' ? 'active' : ''}`}
          onClick={() => onSetPreference(preference === 'like' ? 'neutral' : 'like')}
          disabled={loading || !tabState.site}
          aria-label="Like site"
          title="Like site"
        >
          👍
        </button>
      </div>
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
