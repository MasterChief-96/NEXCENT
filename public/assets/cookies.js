'use strict';
(() => {
  const privacy = window.NexcentPrivacy;
  const banner = document.getElementById('cookie-banner');
  const settings = document.getElementById('cookie-settings');
  const current = document.getElementById('cookie-current');
  let returnFocus = null;
  function reserveSpace() {
    const height = banner.hidden ? 0 : Math.ceil(banner.getBoundingClientRect().height) + 32;
    document.documentElement.style.setProperty('--cookie-space',`${height}px`);
  }
  function open(manual = false) {
    current.textContent = privacy.choice === 'accepted' ? 'Сейчас сохранение настроек разрешено.' : privacy.choice === 'rejected' ? 'Сейчас сохранение настроек отключено.' : '';
    current.hidden = !current.textContent;
    returnFocus = manual ? settings : null;
    banner.hidden = false;
    reserveSpace();
    if (manual) document.getElementById('cookie-accept').focus({preventScroll:true});
  }
  function close() {
    const hadFocus = banner.contains(document.activeElement);
    banner.hidden = true;
    reserveSpace();
    if (hadFocus) {
      const target = returnFocus || document.querySelector('.header .brand');
      target.focus({preventScroll:true});
    }
    returnFocus = null;
  }
  let toastTimer;
  function notify(message) {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);toast.textContent=message;toast.hidden=false;
    toastTimer=setTimeout(()=>{if(toast.textContent===message)toast.hidden=true;},4000);
  }
  function decide(choice) {
    const saved = privacy.choose(choice);
    notify(saved ? (choice === 'accepted' ? 'Сохранение настроек разрешено. Выбор можно изменить внизу страницы.' : 'Сохранение настроек отключено. Дополнительные настройки на устройстве удалены.') : 'Хранилище браузера недоступно. Ваш выбор действует только на этой странице.');
  }
  settings.hidden=false;
  settings.addEventListener('click',()=>open(true));
  document.getElementById('cookie-accept').addEventListener('click',()=>decide('accepted'));
  document.getElementById('cookie-reject').addEventListener('click',()=>decide('rejected'));
  banner.addEventListener('keydown',event=>{if(event.key==='Escape' && returnFocus && privacy.choice){event.preventDefault();close();}});
  document.addEventListener('nexcent:consent-change',()=>{if(privacy.choice)close();else open();});
  addEventListener('resize',reserveSpace,{passive:true});
  if ('ResizeObserver' in window) new ResizeObserver(reserveSpace).observe(banner);
  if (!privacy.choice) open();
})();
