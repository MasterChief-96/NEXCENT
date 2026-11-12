'use strict';
// Load before every preference reader. Only the consent choice is always stored.
(() => {
  const consentKey = 'nexcent-consent-v1';
  const optionalKeys = new Set(['nexcent-mode-v3', 'nexcent-favorites-v2', 'nexcent-dinner-v3', 'nexcent-reviews-v1']);
  const memory = new Map();
  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(consentKey) || 'null');
      return saved?.version === 1 && ['accepted','rejected'].includes(saved.choice) ? saved.choice : null;
    } catch { return null; }
  }
  let choice = readChoice();
  function clearOptional() {
    optionalKeys.forEach(key => { try { localStorage.removeItem(key); } catch { /* Unavailable storage. */ } });
  }
  if (choice === 'rejected') clearOptional();
  function get(key) {
    if (!optionalKeys.has(key)) return null;
    if (memory.has(key)) return memory.get(key);
    if (choice === 'accepted') {
      try { const value = localStorage.getItem(key); if (value !== null) memory.set(key,value); return value; } catch { /* Use current-page memory. */ }
    }
    return null;
  }
  function set(key,value) {
    if (!optionalKeys.has(key)) return false;
    memory.set(key,String(value));
    if (choice !== 'accepted') return false;
    try { localStorage.setItem(key,String(value)); return true; } catch { return false; }
  }
  function choose(next) {
    if (!['accepted','rejected'].includes(next)) return false;
    choice = next;
    let saved = true;
    try { localStorage.setItem(consentKey,JSON.stringify({version:1,choice})); } catch { saved = false; }
    if (choice === 'rejected') clearOptional();
    else memory.forEach((value,key) => { if (!set(key,value)) saved = false; });
    document.dispatchEvent(new CustomEvent('nexcent:consent-change',{detail:{choice,saved}}));
    return saved;
  }
  window.NexcentPrivacy = Object.freeze({get,set,choose,get choice(){return choice;}});
  addEventListener('storage', event => {
    if (event.key !== consentKey && event.key !== null) return;
    choice = readChoice();
    if (choice !== 'accepted') clearOptional();
    document.dispatchEvent(new CustomEvent('nexcent:consent-change',{detail:{choice,saved:true}}));
  });
})();
