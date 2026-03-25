import {
  getFloatingControlHidden,
  getFloatingControlHiddenStorageKey,
  getSitePreference,
  getSitePreferencesStorageKey,
  normalizeSiteUrl,
  setFloatingControlHidden,
  setSitePreference,
  SitePreference,
} from '../utils/siteLikes';
import {
  applyOptimisticVoteStats,
  fetchSiteVoteStats,
  getCachedSiteVoteStats,
  getSiteCountsRevealStorageKey,
  getSiteCountsUnlocked,
  getSiteVoteStatsCacheStorageKey,
  isGlobalVotingConfigured,
  setCachedSiteVoteStats,
  SiteVoteStats,
  submitSiteVote,
  unlockSiteCounts,
} from '../utils/globalVotes';

const CONTROL_ID = 'website-liker-floating-control';
const DRAG_HANDLE_ID = 'website-liker-floating-drag-handle';
const DISLIKE_BUTTON_ID = 'website-liker-floating-dislike';
const LIKE_BUTTON_ID = 'website-liker-floating-like';
const HIDE_BUTTON_ID = 'website-liker-floating-hide';
const PREFERENCE_BUTTON_ICON_ONLY_WIDTH = '34px';
const PREFERENCE_BUTTON_WITH_COUNT_WIDTH = '56px';

type FloatingControl = {
  container: HTMLDivElement;
  dragHandle: HTMLButtonElement;
  dislikeButton: HTMLButtonElement;
  likeButton: HTMLButtonElement;
  hideButton: HTMLButtonElement;
  isDragging: boolean;
  isHovered: boolean;
  currentPreference: SitePreference;
};

const compactNumberFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const formatCompactCount = (count: number): string => compactNumberFormatter.format(count);

const createControlButton = (id: string, label: string, title: string, width = 34): HTMLButtonElement => {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.ariaLabel = title;
  button.style.width = `${width}px`;
  button.style.height = '34px';
  button.style.border = 'none';
  button.style.backgroundColor = '#273449';
  button.style.color = '#ffffff';
  button.style.fontSize = '15px';
  button.style.cursor = 'pointer';
  button.style.transition = 'background-color 0.2s ease, width 0.16s ease, opacity 0.16s ease';
  button.style.overflow = 'hidden';
  return button;
};

const ensureFloatingControl = (): FloatingControl => {
  const existingContainer = document.getElementById(CONTROL_ID);
  const existingDragHandle = document.getElementById(DRAG_HANDLE_ID);
  const existingDislike = document.getElementById(DISLIKE_BUTTON_ID);
  const existingLike = document.getElementById(LIKE_BUTTON_ID);
  const existingHide = document.getElementById(HIDE_BUTTON_ID);
  if (
    existingContainer instanceof HTMLDivElement &&
    existingDragHandle instanceof HTMLButtonElement &&
    existingDislike instanceof HTMLButtonElement &&
    existingLike instanceof HTMLButtonElement &&
    existingHide instanceof HTMLButtonElement
  ) {
    return {
      container: existingContainer,
      dragHandle: existingDragHandle,
      dislikeButton: existingDislike,
      likeButton: existingLike,
      hideButton: existingHide,
      isDragging: false,
      isHovered: false,
      currentPreference: 'neutral',
    };
  }

  const container = document.createElement('div');
  container.id = CONTROL_ID;
  container.style.position = 'fixed';
  container.style.right = '20px';
  container.style.bottom = '20px';
  container.style.zIndex = '2147483647';
  container.style.display = 'inline-flex';
  container.style.overflow = 'visible';
  container.style.borderRadius = '999px';
  container.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';

  const dragHandle = createControlButton(DRAG_HANDLE_ID, '⠿', 'Drag control', 26);
  dragHandle.style.fontSize = '11px';
  dragHandle.style.cursor = 'grab';
  dragHandle.style.position = 'absolute';
  dragHandle.style.left = '0';
  dragHandle.style.top = '0';
  dragHandle.style.transform = 'translateX(-100%)';
  dragHandle.style.opacity = '0';
  dragHandle.style.pointerEvents = 'none';
  dragHandle.style.borderTopLeftRadius = '999px';
  dragHandle.style.borderBottomLeftRadius = '999px';
  dragHandle.style.borderTopRightRadius = '0';
  dragHandle.style.borderBottomRightRadius = '0';

  const dislikeButton = createControlButton(DISLIKE_BUTTON_ID, '👎', 'Dislike site');
  const likeButton = createControlButton(LIKE_BUTTON_ID, '👍', 'Like site');
  const hideButton = createControlButton(HIDE_BUTTON_ID, '✕', 'Hide control', 26);
  hideButton.style.fontSize = '11px';
  hideButton.style.position = 'absolute';
  hideButton.style.right = '0';
  hideButton.style.top = '0';
  hideButton.style.transform = 'translateX(100%)';
  hideButton.style.opacity = '0';
  hideButton.style.pointerEvents = 'none';
  hideButton.style.borderTopLeftRadius = '0';
  hideButton.style.borderBottomLeftRadius = '0';
  hideButton.style.borderTopRightRadius = '999px';
  hideButton.style.borderBottomRightRadius = '999px';

  dragHandle.style.borderRight = '1px solid rgba(255, 255, 255, 0.12)';
  hideButton.style.borderLeft = '1px solid rgba(255, 255, 255, 0.12)';

  container.append(likeButton, dislikeButton, dragHandle, hideButton);
  document.body.append(container);

  return {
    container,
    dragHandle,
    dislikeButton,
    likeButton,
    hideButton,
    isDragging: false,
    isHovered: false,
    currentPreference: 'neutral',
  };
};

const renderControlState = (control: FloatingControl, preference: SitePreference): void => {
  control.currentPreference = preference;
  control.dislikeButton.style.backgroundColor = preference === 'dislike' ? '#b91c1c' : '#273449';
  control.likeButton.style.backgroundColor = preference === 'like' ? '#15803d' : '#273449';
};

const setAccessoryButtonsVisible = (control: FloatingControl, visible: boolean): void => {
  const opacity = visible ? '1' : '0';
  control.dragHandle.style.opacity = opacity;
  control.dragHandle.style.pointerEvents = visible ? 'auto' : 'none';
  control.hideButton.style.opacity = opacity;
  control.hideButton.style.pointerEvents = visible ? 'auto' : 'none';
};

const setPreferenceButtonsLayout = (control: FloatingControl): void => {
  const showBoth = true;
  const showLike = showBoth || control.currentPreference === 'like';
  const showDislike = showBoth || control.currentPreference === 'dislike';
  const likeHasCount = (control.likeButton.textContent ?? '').includes(' ');
  const dislikeHasCount = (control.dislikeButton.textContent ?? '').includes(' ');

  control.likeButton.style.width = showLike
    ? (likeHasCount ? PREFERENCE_BUTTON_WITH_COUNT_WIDTH : PREFERENCE_BUTTON_ICON_ONLY_WIDTH)
    : '0';
  control.likeButton.style.opacity = showLike ? '1' : '0';
  control.likeButton.style.borderRight = showLike && showDislike ? '1px solid rgba(255, 255, 255, 0.12)' : '0';

  control.dislikeButton.style.width = showDislike
    ? (dislikeHasCount ? PREFERENCE_BUTTON_WITH_COUNT_WIDTH : PREFERENCE_BUTTON_ICON_ONLY_WIDTH)
    : '0';
  control.dislikeButton.style.opacity = showDislike ? '1' : '0';
  control.dislikeButton.style.borderRight = '0';

  control.likeButton.style.borderTopLeftRadius = '0';
  control.likeButton.style.borderBottomLeftRadius = '0';
  control.likeButton.style.borderTopRightRadius = '0';
  control.likeButton.style.borderBottomRightRadius = '0';
  control.dislikeButton.style.borderTopLeftRadius = '0';
  control.dislikeButton.style.borderBottomLeftRadius = '0';
  control.dislikeButton.style.borderTopRightRadius = '0';
  control.dislikeButton.style.borderBottomRightRadius = '0';

  if (control.isHovered) {
    return;
  }

  if (showLike && showDislike) {
    control.likeButton.style.borderTopLeftRadius = '999px';
    control.likeButton.style.borderBottomLeftRadius = '999px';
    control.dislikeButton.style.borderTopRightRadius = '999px';
    control.dislikeButton.style.borderBottomRightRadius = '999px';
    return;
  }

  if (showLike) {
    control.likeButton.style.borderTopLeftRadius = '999px';
    control.likeButton.style.borderBottomLeftRadius = '999px';
    control.likeButton.style.borderTopRightRadius = '999px';
    control.likeButton.style.borderBottomRightRadius = '999px';
  }
  if (showDislike) {
    control.dislikeButton.style.borderTopLeftRadius = '999px';
    control.dislikeButton.style.borderBottomLeftRadius = '999px';
    control.dislikeButton.style.borderTopRightRadius = '999px';
    control.dislikeButton.style.borderBottomRightRadius = '999px';
  }
};

const renderInlineCounts = (
  control: FloatingControl,
  unlocked: boolean,
  stats: SiteVoteStats | null,
  state: 'ready' | 'loading' | 'error',
): void => {
  const canShowCounts = (
    control.currentPreference !== 'neutral' &&
    unlocked &&
    isGlobalVotingConfigured() &&
    state === 'ready'
  );
  const likes = stats ? formatCompactCount(stats.likes) : '0';
  const dislikes = stats ? formatCompactCount(stats.dislikes) : '0';

  control.likeButton.textContent = canShowCounts ? `👍 ${likes}` : '👍';
  control.dislikeButton.textContent = canShowCounts ? `${dislikes} 👎` : '👎';

  if (stats) {
    const positivePct = stats.total > 0 ? Math.round(stats.likeRatio * 100) : 0;
    control.likeButton.title = `${stats.likes.toLocaleString()} likes (${positivePct}% positive)`;
    control.dislikeButton.title = `${stats.dislikes.toLocaleString()} dislikes (${100 - positivePct}% negative)`;
  } else {
    control.likeButton.title = 'Like site';
    control.dislikeButton.title = 'Dislike site';
  }
};

const setupDragging = (control: FloatingControl): void => {
  const { container, dragHandle } = control;
  const DRAG_THRESHOLD = 6;
  const EDGE_MARGIN = 8;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let hasMoved = false;

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!hasMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      hasMoved = true;
      control.isDragging = true;
      dragHandle.style.cursor = 'grabbing';
    }
    if (!hasMoved) return;

    const rect = container.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - EDGE_MARGIN;
    const maxTop = window.innerHeight - rect.height - EDGE_MARGIN;
    const nextLeft = Math.min(Math.max(startLeft + dx, EDGE_MARGIN), maxLeft);
    const nextTop = Math.min(Math.max(startTop + dy, EDGE_MARGIN), maxTop);

    container.style.left = `${nextLeft}px`;
    container.style.top = `${nextTop}px`;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    dragHandle.style.cursor = 'grab';
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    window.setTimeout(() => {
      control.isDragging = false;
    }, 0);
  };

  dragHandle.addEventListener('pointerdown', (event: PointerEvent) => {
    pointerId = event.pointerId;
    hasMoved = false;
    startX = event.clientX;
    startY = event.clientY;

    const rect = container.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  });
};

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  async main() {
    if (!document.body) return;

    const currentSite = normalizeSiteUrl(window.location.href);
    if (!currentSite) return;

    const control = ensureFloatingControl();
    setupDragging(control);

    let countsUnlocked = false;
    let latestStats: SiteVoteStats | null = null;
    let isPrimingStats = false;

    const applyVisibility = async () => {
      control.container.style.display = (await getFloatingControlHidden()) ? 'none' : 'inline-flex';
    };

    const primeStats = async (preference: SitePreference) => {
      if (isPrimingStats || latestStats || !isGlobalVotingConfigured()) return;

      isPrimingStats = true;
      const fetchedStats = await fetchSiteVoteStats(currentSite, preference);
      isPrimingStats = false;

      if (!fetchedStats) {
        renderInlineCounts(control, countsUnlocked, latestStats, 'error');
        setPreferenceButtonsLayout(control);
        return;
      }

      latestStats = fetchedStats;
      renderInlineCounts(control, countsUnlocked, latestStats, 'ready');
      setPreferenceButtonsLayout(control);
    };

    const syncFromPreference = async () => {
      const preference = await getSitePreference(currentSite);
      renderControlState(control, preference);
      setPreferenceButtonsLayout(control);

      if (preference !== 'neutral' && !countsUnlocked) {
        countsUnlocked = await unlockSiteCounts(currentSite);
      }

      if (countsUnlocked) {
        if (latestStats) {
          renderInlineCounts(control, true, latestStats, 'ready');
        } else {
          renderInlineCounts(control, true, null, 'loading');
          void primeStats(preference);
        }
      } else {
        renderInlineCounts(control, false, null, 'ready');
        void primeStats(preference);
      }

      setPreferenceButtonsLayout(control);
    };

    await applyVisibility();
    setAccessoryButtonsVisible(control, false);
    countsUnlocked = await getSiteCountsUnlocked(currentSite);
    latestStats = await getCachedSiteVoteStats(currentSite);
    await syncFromPreference();
    void primeStats(control.currentPreference);

    control.container.addEventListener('mouseenter', () => {
      control.isHovered = true;
      setAccessoryButtonsVisible(control, true);
      setPreferenceButtonsLayout(control);
    });

    control.container.addEventListener('mouseleave', () => {
      control.isHovered = false;
      setAccessoryButtonsVisible(control, false);
      setPreferenceButtonsLayout(control);
    });

    control.hideButton.addEventListener('click', async () => {
      await setFloatingControlHidden(true);
      await applyVisibility();
    });

    const onSetPreference = async (target: 'like' | 'dislike') => {
      if (control.isDragging) return;

      const current = await getSitePreference(currentSite);
      const next: SitePreference = current === target ? 'neutral' : target;
      renderControlState(control, await setSitePreference(currentSite, next));
      setPreferenceButtonsLayout(control);

      if (next !== 'neutral' && !countsUnlocked) {
        countsUnlocked = await unlockSiteCounts(currentSite);
      }

      if (!countsUnlocked) return;

      latestStats = applyOptimisticVoteStats(currentSite, latestStats, current, next);
      if (latestStats) {
        renderInlineCounts(control, true, latestStats, 'ready');
        void setCachedSiteVoteStats(currentSite, latestStats);
      } else {
        renderInlineCounts(control, true, null, 'loading');
      }
      setPreferenceButtonsLayout(control);

      void submitSiteVote(currentSite, next);
      void primeStats(next);
    };

    control.dislikeButton.addEventListener('click', async () => {
      await onSetPreference('dislike');
    });

    control.likeButton.addEventListener('click', async () => {
      await onSetPreference('like');
    });

    browser.storage.onChanged.addListener((changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== 'local') return;

      if (changes[getSitePreferencesStorageKey()]) {
        void syncFromPreference();
      }

      if (changes[getSiteCountsRevealStorageKey()]) {
        void getSiteCountsUnlocked(currentSite).then((isUnlocked) => {
          countsUnlocked = isUnlocked;
          void syncFromPreference();
        });
      }

      if (changes[getSiteVoteStatsCacheStorageKey()]) {
        void getCachedSiteVoteStats(currentSite).then((nextStats) => {
          latestStats = nextStats;
          renderInlineCounts(control, countsUnlocked, latestStats, latestStats ? 'ready' : 'loading');
          setPreferenceButtonsLayout(control);
        });
      }

      if (changes[getFloatingControlHiddenStorageKey()]) {
        void applyVisibility();
      }
    });
  },
});
