'use strict';
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.header');
  const progress = document.querySelector('.reading-progress__bar');
  const backTop = document.querySelector('.back-top');
  let scrollFrame = 0;
  function scrollState() {
    const available = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    progress.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollY / available))})`;
    header.classList.toggle('header_scrolled', scrollY > 24);
    backTop.hidden = scrollY < 650;
    scrollFrame = 0;
  }
  addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(scrollState); }, {passive:true});
  addEventListener('resize', scrollState, {passive:true});
  scrollState();
  // Content is visible by default. Only off-screen content gets a reveal state.
  let observer;
  const revealTargets = [...document.querySelectorAll('[data-reveal]')];
  const reveal = element => { element.classList.remove('reveal_pending'); observer?.unobserve(element); };
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) reveal(entry.target);
    }), {threshold:0.08, rootMargin:'0px 0px 36px 0px'});
    revealTargets.forEach((element, index) => {
      element.classList.add('reveal');
      if (element.getBoundingClientRect().top > innerHeight + 30) {
        element.style.setProperty('--reveal-delay', `${(index % 3) * 45}ms`);
        element.classList.add('reveal_pending');
        observer.observe(element);
      }
    });
    document.addEventListener('focusin', event => event.target.closest('[data-reveal]') && reveal(event.target.closest('[data-reveal]')));
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { revealTargets.forEach(reveal); observer?.disconnect(); }
  });
  // One-time image entrance is handled in CSS; no continuous or pointer-tracking motion.
  let toastTimer;
  function toast(message) {
    const element = document.getElementById('toast');
    clearTimeout(toastTimer);
    element.textContent = message;
    element.hidden = false;
    toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
  }
  document.querySelectorAll('[data-password]').forEach(button => {
    const input = document.getElementById(button.dataset.password);
    button.hidden = false;
    button.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
      button.textContent = visible ? 'Скрыть' : 'Показать';
    });
  });
  const date = document.getElementById('booking-date');
  if (date) {
    const time = document.getElementById('booking-time');
    const guests = document.getElementById('booking-guests');
    const table = document.getElementById('booking-table');
    const subject = document.getElementById('feedback-subject');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part => [part.type,part.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    date.min = today;
    function chooseBooking() {
      subject.value = 'booking';
      subject.dispatchEvent(new Event('change', {bubbles:true}));
    }
    function guestLabel(value) {
      const number = Number(value);
      const mod10 = number % 10;
      const mod100 = number % 100;
      const noun = mod100 > 10 && mod100 < 20 ? 'гостей' : mod10 === 1 ? 'гость' : mod10 >= 2 && mod10 <= 4 ? 'гостя' : 'гостей';
      return `${number} ${noun}`;
    }
    function updateSummary() {
      const selectedDate = date.value ? new Date(`${date.value}T12:00:00Z`) : null;
      document.getElementById('summary-date').textContent = selectedDate && !Number.isNaN(selectedDate.valueOf()) ? new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(selectedDate) : 'Выберите дату';
      document.getElementById('summary-time').textContent = time.value || 'Выберите время';
      document.getElementById('summary-guests').textContent = guests.checkValidity() && guests.value ? guestLabel(guests.value) : 'От 1 до 12 гостей';
      document.getElementById('summary-table').textContent = table.options[table.selectedIndex].textContent;
      document.querySelectorAll('[data-time]').forEach(button => {
        const selected = button.dataset.time === time.value;
        button.setAttribute('aria-pressed',String(selected));
        button.classList.toggle('quick-choice_selected',selected);
      });
      document.querySelectorAll('[data-date]').forEach(button => {
        const selected = button.dataset.date === date.value;
        button.setAttribute('aria-pressed',String(selected));
        button.classList.toggle('quick-choice_selected',selected);
      });
      const count = Number(guests.value || 0);
      document.getElementById('guest-minus').disabled = count <= 1;
      document.getElementById('guest-plus').disabled = count >= 12;
    }
    const dateRow = document.createElement('div');
    dateRow.className = 'quick-choices';
    dateRow.setAttribute('role','group');
    dateRow.setAttribute('aria-label','Быстрый выбор даты');
    ['Сегодня','Завтра'].forEach((label,index) => {
      const chosen = new Date(`${today}T12:00:00Z`);
      chosen.setUTCDate(chosen.getUTCDate()+index);
      const value = chosen.toISOString().slice(0,10);
      const button = document.createElement('button');
      button.className = 'button quick-choice'; button.type = 'button'; button.textContent = label;
      button.dataset.date = value; button.setAttribute('aria-pressed','false');
      button.addEventListener('click', () => { date.value=value; chooseBooking(); date.dispatchEvent(new Event('change',{bubbles:true})); });
      dateRow.append(button);
    });
    date.after(dateRow);
    const timeRow = document.createElement('div');
    timeRow.className = 'quick-choices'; timeRow.setAttribute('role','group'); timeRow.setAttribute('aria-label','Быстрый выбор времени');
    ['12:00','14:00','18:00','19:00','20:00','21:00'].forEach(value => {
      const button = document.createElement('button');
      button.type='button'; button.className='button quick-choice'; button.textContent=value; button.dataset.time=value; button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>{time.value=value;chooseBooking();time.dispatchEvent(new Event('change',{bubbles:true}));});
      timeRow.append(button);
    });
    time.after(timeRow);
    const stepper = document.createElement('div'); stepper.className='guest-stepper';
    guests.before(stepper);stepper.append(guests);guests.value='2';
    [-1,1].forEach(direction=>{
      const button=document.createElement('button'); button.type='button';button.className='button guest-stepper__button';
      button.id=direction<0?'guest-minus':'guest-plus';button.textContent=direction<0?'−':'+';button.setAttribute('aria-label',direction<0?'Уменьшить количество гостей':'Увеличить количество гостей');
      button.addEventListener('click',()=>{const current=Number(guests.value)||1;guests.value=String(Math.min(12,Math.max(1,current+direction)));chooseBooking();guests.dispatchEvent(new Event('input',{bubbles:true}));});
      if(direction<0)stepper.prepend(button);else stepper.append(button);
    });
    [date,time,guests,table].forEach(input=>{input.addEventListener('input',updateSummary);input.addEventListener('change',updateSummary);});
    document.querySelector('.visit-summary').hidden=false;
    updateSummary();
  }
})();
