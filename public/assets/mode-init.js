'use strict';
(() => {
  let mode = 'day';
  try { if (window.NexcentPrivacy.get('nexcent-mode-v3') === 'evening') mode = 'evening'; } catch { /* Storage is optional. */ }
  const requested = new URLSearchParams(location.search).get('mode');
  if (requested === 'day' || requested === 'evening') mode = requested;
  document.documentElement.dataset.mode = mode;
})();
