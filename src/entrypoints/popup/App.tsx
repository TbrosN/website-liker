import { useEffect, useMemo, useState } from 'react';

import { isSiteLiked, normalizeSiteUrl, toggleSiteLike } from '../../utils/siteLikes';

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
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const currentTab = await getActiveTabState();
      if (cancelled) return;
      setTabState(currentTab);
      if (!currentTab.site) {
        setLiked(false);
        setLoading(false);
        return;
      }
      setLiked(await isSiteLiked(currentTab.site));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle = useMemo(() => {
    if (!tabState.site) return 'Open a normal website tab (http/https) to like it.';
    return tabState.site;
  }, [tabState.site]);

  const onToggleLike = async () => {
    if (!tabState.site) return;
    setLoading(true);
    const nextState = await toggleSiteLike(tabState.site);
    setLiked(nextState);
    setLoading(false);
  };

  return (
    <main className="popup-root">
      <p className="eyebrow">Website Liker</p>
      <h1 className="title">{tabState.title}</h1>
      <p className="subtitle">{subtitle}</p>

      <button className={`like-button ${liked ? 'liked' : ''}`} onClick={onToggleLike} disabled={loading || !tabState.site}>
        {liked ? '👍 Liked' : '👍 Like this site'}
      </button>
    </main>
  );
};
