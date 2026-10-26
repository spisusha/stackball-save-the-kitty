// Bridge to ad networks. One build works everywhere by checking what the host provides:
//   MRAID (AppLovin, Unity, ironSource, Mintegral, Vungle)  -> mraid.open(url)
//   Meta                                                    -> FbPlayableAd.onCTAClick()
//   Google (HTML5 ads with ExitApi)                         -> ExitApi.exit()
//   plain browser (demo)                                    -> window.open(url)
// Store links are constants, never taken from the page or URL.
const IOS_URL = 'https://apps.apple.com/app/id1456732568';
const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.azurgames.stackball';

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
}
export function storeUrl() { return isIOS() ? IOS_URL : ANDROID_URL; }

// Start the game when the ad container is ready and visible (MRAID), or right away.
export function whenReady(start) {
  const m = window.mraid;
  if (!m) { start(); return; }
  let started = false;
  const go = () => { if (!started) { started = true; start(); } };
  const checkViewable = () => {
    if (typeof m.isViewable === 'function' && !m.isViewable()) {
      const onView = (v) => { if (v) { m.removeEventListener('viewableChange', onView); go(); } };
      m.addEventListener('viewableChange', onView);
    } else go();
  };
  if (typeof m.getState === 'function' && m.getState() === 'loading') m.addEventListener('ready', checkViewable);
  else checkViewable();
}

// Calls fn(false) when the ad is hidden and fn(true) when it is shown again.
export function onVisibility(fn) {
  document.addEventListener('visibilitychange', () => fn(!document.hidden));
  const m = window.mraid;
  if (m && typeof m.addEventListener === 'function') {
    try { m.addEventListener('viewableChange', (v) => fn(!!v)); } catch { /* old MRAID */ }
  }
}

export function openStore() {
  const url = storeUrl();
  try {
    if (window.mraid && typeof window.mraid.open === 'function') { window.mraid.open(url); return; }
    if (window.FbPlayableAd && typeof window.FbPlayableAd.onCTAClick === 'function') { window.FbPlayableAd.onCTAClick(); return; }
    if (window.ExitApi && typeof window.ExitApi.exit === 'function') { window.ExitApi.exit(); return; }
  } catch { /* fall through to a normal link */ }
  window.open(url, '_blank', 'noopener');
}
