// Funnel events. No personal data: only an event name, time since load and a few numbers.
// In a real campaign these would go to the ad network or MMP; here they are kept locally:
//   window.__pbEvents     — the list for this session (handy in DevTools)
//   postMessage to parent — so the demo page (stage 4) can draw a live funnel
//   localStorage counters — totals across sessions on this device
const t0 = performance.now();
const events = (window.__pbEvents = []);
const COUNTS_KEY = 'stackball_playable_counts';

export function track(name, data = {}) {
  const e = { name, t: Math.round(performance.now() - t0), ...data };
  events.push(e);
  console.debug('[playable]', e);
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'stackball-playable', event: e }, '*'); } catch { /* sandboxed */ }
  try {
    const c = JSON.parse(localStorage.getItem(COUNTS_KEY) || '{}');
    c[name] = (c[name] || 0) + 1;
    localStorage.setItem(COUNTS_KEY, JSON.stringify(c));
  } catch { /* storage may be blocked inside ad webviews */ }
}

export function once(name, data) {
  if (!events.some((e) => e.name === name)) track(name, data);
}
