'use strict';
(() => {
  const root = document.documentElement;
  const modes = [...document.querySelectorAll('[data-mode-choice]')];
  const categories = ['starters', 'mains', 'desserts'];
  const menu = new Map(window.NexcentMenu.map(dish => [dish.id, dish]));
  const storageKey = 'nexcent-dinner-v3';
  const params = new URLSearchParams(location.search);
  const money = value => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  const validGuests = value => /^([1-9]|1[0-2])$/.test(String(value)) ? Number(value) : 2;
  function emptySelection() { return {starters:null, mains:null, desserts:null}; }
  function cleanState(value) {
    const result = {selected:emptySelection(), guests:2};
    if (!value || typeof value !== 'object') return result;
    result.guests = validGuests(value.guests);
    categories.forEach(category => {
      const id = value.selected?.[category];
      if (typeof id === 'string' && menu.get(id)?.category === category) result.selected[category] = id;
    });
    return result;
  }
  let state = cleanState(null);
  try { state = cleanState(JSON.parse(window.NexcentPrivacy.get(storageKey) || 'null')); } catch { /* A valid in-memory state always remains available. */ }
  if (params.has('dinner')) {
    state.selected = emptySelection();
    params.get('dinner').split(',').forEach(id => { const dish = menu.get(id); if (dish) state.selected[dish.category] = id; });
    state.guests = validGuests(params.get('guests'));
  }
  function selectedDishes() { return categories.map(category => menu.get(state.selected[category])).filter(Boolean); }
  function persist() {
    try { return window.NexcentPrivacy.set(storageKey, JSON.stringify(state)); } catch { return false; }
  }
  function route(path, hash) {
    const url = new URL(path, location.href);
    url.searchParams.set('dinner', selectedDishes().map(dish => dish.id).join(','));
    url.searchParams.set('guests', String(state.guests));
    url.searchParams.set('mode', root.dataset.mode);
    return `${path}?${url.searchParams.toString()}#${hash}`;
  }
  function updateModeLinks() {
    document.querySelectorAll('a[href]').forEach(link => {
      const raw = link.getAttribute('href');
      if (!/^(index|menu|about|booking)\.html(?:[?#]|$)/.test(raw)) return;
      const url = new URL(raw, location.href);
      url.searchParams.set('mode', root.dataset.mode);
      link.setAttribute('href', `${raw.split(/[?#]/)[0]}?${url.searchParams.toString()}${url.hash}`);
    });
  }
  function showMode(mode) {
    root.dataset.mode = mode;
    modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.modeChoice === mode)));
    document.querySelector('meta[name="theme-color"]').content = mode === 'evening' ? '#15251f' : '#f5f7fa';
    document.querySelectorAll('.atmosphere__image_day').forEach(img => img.setAttribute('aria-hidden', String(mode === 'evening')));
    document.querySelectorAll('.atmosphere__image_evening').forEach(img => img.setAttribute('aria-hidden', String(mode !== 'evening')));
    updateModeLinks();
    // Keep an explicit mode URL in sync so refreshing preserves the last choice.
    try {
      const url = new URL(location.href);
      if (url.searchParams.has('mode')) { url.searchParams.set('mode', mode); history.replaceState(null, '', url); }
    } catch { /* Some file viewers do not allow history changes. */ }
  }
  modes.forEach(button => button.addEventListener('click', () => {
    showMode(button.dataset.modeChoice);
    try { window.NexcentPrivacy.set('nexcent-mode-v3', root.dataset.mode); } catch { /* Internal links also carry the mode. */ }
  }));
  document.querySelector('.mode-switch').hidden = false;
  showMode(root.dataset.mode || 'day');
  const builder = document.getElementById('dinner-builder');
  const bookingGuests = document.getElementById('booking-guests');
  const status = document.getElementById('dinner-status');
  function announce(message) { if (status) status.textContent = message; }
  function updateAddButtons() {
    document.querySelectorAll('[data-add-dinner]').forEach(button => {
      const dish = menu.get(button.dataset.addDinner);
      const selected = dish && state.selected[dish.category] === dish.id;
      button.hidden = false;
      button.setAttribute('aria-pressed', String(Boolean(selected)));
      button.textContent = selected ? 'В вашем ужине ✓' : 'В мой ужин +';
      button.setAttribute('aria-label', `${selected ? 'Убрать из ужина' : 'Добавить в ужин'}: ${dish?.name || ''}`);
    });
  }
  function render() {
    const dishes = selectedDishes();
    const perPerson = dishes.reduce((sum,dish) => sum + dish.price, 0);
    if (builder) {
      document.getElementById('dinner-progress').textContent = `${dishes.length} из 3`;
      categories.forEach(category => {
        const dish = menu.get(state.selected[category]);
        const content = document.querySelector(`[data-selection="${category}"]`);
        content.replaceChildren();
        if (dish) {
          const img = document.createElement('img');
          img.className = 'dinner-slot__image'; img.src = dish.image; img.alt = ''; img.width = 88; img.height = 72;
          const body = document.createElement('div'); body.className = 'dinner-slot__body';
          const name = document.createElement('p'); name.className = 'dinner-slot__name'; name.textContent = dish.name;
          const price = document.createElement('p'); price.className = 'dinner-slot__price'; price.textContent = `${money(dish.price)} · ${dish.weight}`;
          body.append(name,price); content.append(img,body);
        } else {
          const hint = document.createElement('p'); hint.className = 'dinner-slot__empty'; hint.textContent = {starters:'Начните с чего-нибудь лёгкого',mains:'Выберите главное блюдо вечера',desserts:'Оставьте место для сладкого'}[category]; content.append(hint);
        }
        document.querySelector(`[data-slot="${category}"]`).classList.toggle('dinner-slot_selected', Boolean(dish));
        document.querySelector(`[data-remove="${category}"]`).hidden = !dish;
        document.querySelector(`[data-choose="${category}"]`).firstChild.textContent = dish ? 'Заменить блюдо ' : 'Выбрать блюдо ';
      });
      document.getElementById('dinner-per-person').textContent = money(perPerson);
      document.getElementById('dinner-total').textContent = money(perPerson * state.guests);
      document.getElementById('dinner-guests').value = String(state.guests);
      document.getElementById('dinner-total-label').textContent = `На ${state.guests} ${state.guests === 1 ? 'гостя' : 'гостей'}`;
      document.getElementById('dinner-clear').disabled = !dishes.length;
      document.getElementById('dinner-book').href = route('booking.html', 'feedback');
      document.querySelectorAll('[data-preset]').forEach(button => {
        button.setAttribute('aria-pressed',String(button.dataset.preset === dishes.map(d=>d.id).join(',')));
        button.disabled = button.dataset.preset.split(',').some(id => !menu.has(id));
        button.title = button.disabled ? 'Некоторые блюда этого сочетания временно недоступны.' : '';
      });
      updateAddButtons();
    }
    if (bookingGuests) {
      const list = document.getElementById('summary-dishes'); list.replaceChildren();
      dishes.forEach(dish => {
        const item = document.createElement('li'); item.className = 'dinner-summary__dish';
        const img = document.createElement('img'); img.className='dinner-summary__image'; img.src=dish.image; img.alt=''; img.width=60;img.height=60;
        const name = document.createElement('span'); name.textContent = dish.name;
        const price = document.createElement('strong'); price.textContent=money(dish.price);
        item.append(img,name,price); list.append(item);
      });
      const guestsValid = bookingGuests.value !== '' && bookingGuests.checkValidity();
      document.getElementById('summary-dinner-empty').hidden = dishes.length > 0;
      document.getElementById('summary-cost').hidden = !dishes.length;
      document.getElementById('summary-dinner-note').hidden = !dishes.length;
      document.getElementById('summary-per-person').textContent = money(perPerson);
      document.getElementById('summary-total-label').textContent = guestsValid ? `На ${state.guests} ${state.guests === 1 ? 'гостя' : 'гостей'}` : 'Укажите число гостей';
      document.getElementById('summary-dinner-total').textContent = guestsValid ? money(perPerson * state.guests) : '—';
      const edit = document.getElementById('edit-dinner'); edit.href = route('menu.html','dinner-builder'); edit.textContent = dishes.length ? 'Изменить ужин' : 'Собрать ужин';
    }
  }
  function commit(message) {
    const saved = persist(); render();
    announce(message + (saved ? '' : ' Выбор сохранится при переходе по кнопке «Выбрать стол».'));
  }
  if (builder) {
    builder.hidden = false;
    document.querySelectorAll('[data-add-dinner]').forEach(button => button.addEventListener('click', () => {
      const dish = menu.get(button.dataset.addDinner); if (!dish) return;
      const removed = state.selected[dish.category] === dish.id;
      const replaced = state.selected[dish.category] !== null;
      state.selected[dish.category] = removed ? null : dish.id;
      commit(`${dish.name}: ${removed ? 'убрано из ужина.' : replaced ? 'заменяет предыдущее блюдо в этой категории.' : 'добавлено в ужин.'}`);
      if (button.id === 'dialog-add-dinner') document.getElementById('dish-dialog').close();
    }));
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
      const category = button.dataset.remove; state.selected[category] = null; commit('Блюдо убрано из ужина.');
      document.querySelector(`[data-choose="${category}"]`).focus();
    }));
    document.querySelectorAll('[data-choose]').forEach(link => link.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('nexcent:show-category', {detail:{category:link.dataset.choose}}));
    }));
    document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
      state.selected = emptySelection(); button.dataset.preset.split(',').forEach(id => { const dish=menu.get(id); if(dish)state.selected[dish.category] = id; }); commit(`Выбрано сочетание «${button.textContent}».`);
    }));
    document.getElementById('dinner-clear').addEventListener('click', () => {
      state.selected=emptySelection(); commit('Ваш ужин очищен.'); document.querySelector('[data-choose]').focus();
    });
    document.getElementById('dinner-guests').addEventListener('change', event => { state.guests=validGuests(event.target.value); commit('Стоимость пересчитана.'); });
    document.addEventListener('nexcent:dish-open', updateAddButtons);
  }
  if (bookingGuests) {
    bookingGuests.value=String(state.guests); bookingGuests.dispatchEvent(new Event('input',{bubbles:true}));
    if (params.has('dinner') && selectedDishes().length) {
      const subject=document.getElementById('feedback-subject'); subject.value='booking';subject.dispatchEvent(new Event('change',{bubbles:true}));
    }
    ['input','change'].forEach(type => bookingGuests.addEventListener(type, () => {
      if (bookingGuests.value !== '' && bookingGuests.checkValidity()) { state.guests = validGuests(bookingGuests.value); persist(); }
      render();
    }));
  }
  persist(); render();
})();
