'use strict';
// Navigation is visible without JavaScript. Enhance only after handlers exist.
const body = document.body;
const burger = document.querySelector('.burger');
const nav = document.querySelector('#main-nav');
const desktop = window.matchMedia('(min-width: 768px)');
function closeMenu(returnFocus = false) {
  nav.classList.remove('nav_open');
  body.classList.remove('page_menu-open');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Открыть меню');
  if (returnFocus) burger.focus();
}
burger.addEventListener('click', () => {
  if (burger.getAttribute('aria-expanded') === 'true') return closeMenu(true);
  nav.classList.add('nav_open');
  body.classList.add('page_menu-open');
  burger.setAttribute('aria-expanded', 'true');
  burger.setAttribute('aria-label', 'Закрыть меню');
  nav.querySelector('a').focus();
});
document.addEventListener('keydown', event => {
  if (burger.getAttribute('aria-expanded') !== 'true') return;
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
  if (event.key === 'Tab') {
    const links = [...nav.querySelectorAll('a')];
    const first = burger;
    const last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.header') && burger.getAttribute('aria-expanded') === 'true') closeMenu();
});
nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
desktop.addEventListener('change', () => closeMenu());
burger.hidden = false;
body.classList.add('page_js');
// Links to legal details expose their content, including on initial hash navigation.
function revealHash() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (target?.matches('details')) target.open = true;
}
window.addEventListener('hashchange', revealHash);
revealHash();
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  const target = link && document.getElementById(link.getAttribute('href').slice(1));
  if (target?.matches('details')) target.open = true;
});
function loading(button, state) {
  button.disabled = state;
  button.classList.toggle('button_loading', state);
  button.setAttribute('aria-busy', String(state));
}
const password = document.getElementById('reg-password');
const confirmPassword = document.getElementById('reg-confirm');
function checkPasswords() {
  if (!confirmPassword) return;
  confirmPassword.setCustomValidity(confirmPassword.value && confirmPassword.value !== password.value ? 'Пароли не совпадают.' : '');
}
password?.addEventListener('input', checkPasswords);
confirmPassword?.addEventListener('input', checkPasswords);
// Client-side validation complements validation on the server.
const phoneInputs = [...document.querySelectorAll('input[type="tel"]')];
function checkPhone(input) {
  const valid = !input.value || !input.pattern || new RegExp(`^(?:${input.pattern})$`, 'u').test(input.value);
  input.setCustomValidity(valid ? '' : 'Введите номер с кодом страны, например +7 (999) 123-45-67. Для российских номеров можно начать с 8.');
}
function formatPhone(input) {
  input.value = input.value.trim();
  checkPhone(input);
  if (!input.value || !input.checkValidity()) return;
  let digits = input.value.replace(/[^0-9]/g, '');
  if (input.value.startsWith('8') && digits.length === 11) digits = '7' + digits.slice(1);
  input.value = digits.startsWith('7') && digits.length === 11
    ? `+7 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7,9)}-${digits.slice(9,11)}`
    : `+${digits}`;
  checkPhone(input);
}
phoneInputs.forEach(input => {
  input.addEventListener('input', () => checkPhone(input));
  input.addEventListener('change', () => checkPhone(input));
  input.addEventListener('blur', () => formatPhone(input));
});
const loginMethods = document.querySelector('.login-method');
if (loginMethods) {
  const loginForm = loginMethods.closest('form');
  const fields = {email:document.getElementById('login-email'), phone:document.getElementById('login-phone')};
  function updateLoginMethod() {
    const mode = loginMethods.querySelector('input:checked').value;
    Object.entries(fields).forEach(([key,input]) => {
      const active = key === mode;
      input.disabled = !active;
      input.required = active;
      input.closest('.form__field').hidden = !active;
      if (!active) input.setCustomValidity('');
    });
    if (mode === 'phone') checkPhone(fields.phone);
    loginForm.querySelector('.form__status').textContent = '';
  }
  loginMethods.addEventListener('change', updateLoginMethod);
  loginForm.addEventListener('reset', () => setTimeout(updateLoginMethod, 0));
  updateLoginMethod();
  loginMethods.hidden = false;
}
const dateInput = document.getElementById('booking-date');
const subject = document.getElementById('feedback-subject');
const bookingFields = ['booking-date','booking-time','booking-guests'].map(id => document.getElementById(id)).filter(Boolean);
if (dateInput) {
  const localDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
  dateInput.min = localDate;
}
function bookingRequirements() {
  const needed = subject?.value === 'booking';
  bookingFields.forEach(input => {
    input.required = needed;
    const label = document.querySelector(`label[for="${input.id}"]`);
    let marker = label.querySelector('.form__required');
    if (needed && !marker) { marker = document.createElement('span'); marker.className = 'form__required'; marker.setAttribute('aria-hidden','true'); marker.textContent = ' *'; label.append(marker); }
    if (!needed && marker) marker.remove();
  });
}
subject?.addEventListener('change', bookingRequirements);
bookingRequirements();
// Third-party map connects only after explicit user action.
const mapButton = document.getElementById('load-map');
mapButton?.addEventListener('click', () => {
  const map = document.getElementById('restaurant-map');
  const template = document.getElementById('map-template');
  const status = map.querySelector('.map__status');
  loading(mapButton, true);
  status.textContent = 'Карта загружается…';
  const frame = template.content.firstElementChild.cloneNode(true);
  let timeout;
  frame.addEventListener('load', () => {
    clearTimeout(timeout);
    map.querySelector('.map__consent')?.remove();
    frame.focus();
  }, {once:true});
  frame.addEventListener('error', () => { clearTimeout(timeout); frame.remove(); loading(mapButton,false); status.textContent = 'Карта недоступна. Можно открыть её по ссылке выше.'; }, {once:true});
  map.append(frame);
  timeout = setTimeout(() => { if(map.querySelector('.map__consent')) { frame.remove(); loading(mapButton,false); status.textContent = 'Карта не ответила. Повторите загрузку или откройте её по ссылке.'; } }, 15000);
});
