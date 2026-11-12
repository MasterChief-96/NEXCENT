'use strict';
(() => {
 const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(Number(n));
 const date=v=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(v.replace(' ','T')+'Z'));
 const names={pending:'Ожидает подтверждения',confirmed:'Подтверждено',ready:'Готов к выдаче',completed:'Завершено',cancelled:'Отменено',published:'Опубликован',rejected:'Не опубликован',new:'Новое',in_progress:'В работе',resolved:'Решено'};
 let user=null,csrfToken='',cartItems=[],toastTimer;
 const key=()=>crypto.randomUUID();
 function toast(message){const el=$('#toast');clearTimeout(toastTimer);el.textContent=message;el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,4500);}
 async function api(path,method='GET',data){
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':csrfToken}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
  const result=await response.json();if(!response.ok){const e=new Error(result.error||'Ошибка запроса.');e.status=response.status;e.fields=result.fields;throw e;}
  if(result.csrfToken)csrfToken=result.csrfToken;return result;
 }
 function readGuest(){try{const v=JSON.parse(localStorage.getItem('nexcent-cart-v1')||'[]');return Array.isArray(v)?v.filter(i=>Number.isInteger(i.product_id)&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=50).slice(0,50):[];}catch{return[];}}
 function guestDetails(items){return items.map(i=>{const p=window.NexcentMenu.find(p=>p.id===String(i.product_id));return p?{...p,...i,available:true}:null;}).filter(Boolean);}
 function updateCartBadge(){const n=cartItems.reduce((s,i)=>s+i.quantity,0);$$('[data-cart-count]').forEach(el=>el.textContent=n);}
 async function loadCart(){
  if(user)cartItems=(await api('/cart')).items;
  else {const items=guestDetails(readGuest()).map(i=>({product_id:i.product_id,quantity:i.quantity}));cartItems=(await api('/cart','PUT',{items})).items;}
  updateCartBadge();return cartItems;
 }
 async function saveCart(items){
  cartItems=(await api('/cart','PUT',{items})).items;
  if(!user){try{localStorage.setItem('nexcent-cart-v1',JSON.stringify(items));}catch{toast('Браузер не сохраняет корзину после перезагрузки.');}}
  updateCartBadge();
 }
 let cartQueue=Promise.resolve();
 function changeCart(fn){cartQueue=cartQueue.catch(()=>{}).then(async()=>{const items=cartItems.map(i=>({product_id:Number(i.product_id),quantity:i.quantity}));await saveCart(fn(items));});return cartQueue;}
 function accountNav(){const nav=$('.nav__account');nav.innerHTML=`<a class="nav__login" href="cart.html">Корзина <span data-cart-count>0</span></a>`+(user?`<a class="nav__login" href="account.html" title="${esc(user.name)}">Кабинет</a>${user.role==='admin'?'<a class="nav__login" href="admin.html">Панель</a>':''}`:'<a class="nav__button button button_theme_primary" href="about.html#login">Войти</a>');updateCartBadge();}
 const ready=api('/session').then(async s=>{user=s.user;csrfToken=s.csrfToken;accountNav();await loadCart();return s;});
 ready.catch(()=>{toast('Нет соединения с сервером. Обновите страницу после восстановления связи.');});
 window.Nexcent={api,ready,esc,money,date,names,toast,get user(){return user;},key};
 async function afterLogin(result){user=result.user;accountNav();const guest=readGuest();if(guest.length){try{await api('/cart/merge','POST',{items:guest});localStorage.removeItem('nexcent-cart-v1');}catch{toast('Аккаунт открыт. Гостевую корзину не удалось перенести; она сохранена в браузере.');}}location.href='account.html';}
 document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('[data-form]'))return;
  event.preventDefault();const button=$('[type=submit]',form),status=$('.form__status',form);if(button.disabled||!form.reportValidity())return;
  button.disabled=true;status.textContent='Отправляем…';status.classList.remove('form__status_error');
  const data=Object.fromEntries(new FormData(form));
  try{
   await ready;
   switch(form.dataset.form){
    case 'register':await afterLogin(await api('/register','POST',{name:data.username,email:data.email,phone:data.phone,password:data.password,password_confirm:data.password_confirm,privacy:!!data.privacy,policy:!!data.policy,terms:!!data.terms}));break;
    case 'login':await afterLogin(await api('/login','POST',{identifier:data.login_method==='phone'?data.phone:data.email,password:data.password,remember:!!data.remember}));break;
    case 'feedback':{
     if(!user)throw new Error('Для отправки войдите в аккаунт. Ссылка «Войти» находится вверху страницы.');
     if(data.subject==='booking'){
      form.dataset.requestKey ||= key();
      const params=new URLSearchParams(location.search);const dinner=(params.get('dinner')||'').split(',').filter(Boolean).map(Number);
      const result=await api('/bookings','POST',{date:data.date,time:data.time,guests:Number(data.guests),table_preference:data.table_preference,message:data.message,privacy:!!data.privacy,policy:!!data.policy,dinner,idempotency_key:form.dataset.requestKey});
      delete form.dataset.requestKey;status.textContent=`Заявка №${result.booking.id} сохранена. Ресторан подтвердит её в личном кабинете.`;
     } else {const result=await api('/feedback','POST',{subject:$('#feedback-subject').selectedOptions[0].textContent,message:data.message,kind:'message',privacy:!!data.privacy,policy:!!data.policy});status.textContent=result.message+' Ответ появится в личном кабинете.';}
     break;
    }
    case 'review':{const r=await api('/feedback','POST',{subject:'Отзыв о визите',message:data.message,kind:'review',rating:Number(data.rating),privacy:!!data.privacy,policy:!!data.policy});form.reset();status.textContent=r.message;break;}
    case 'profile':{const r=await api('/profile','PUT',data);user=r.user;accountNav();status.textContent='Изменения сохранены.';break;}
    case 'password':await api('/profile/password','PUT',data);form.reset();status.textContent='Пароль изменён. Другие сессии завершены.';break;
    case 'checkout':{
     await cartQueue;form.dataset.requestKey ||= key();
     const r=await api('/orders','POST',{note:data.note||'',privacy:!!data.privacy,policy:!!data.policy,idempotency_key:form.dataset.requestKey});
     await loadCart();renderCart();$('#order-success').hidden=false;$('#order-success').textContent=`Заказ №${r.order.id} на ${money(r.order.total)} принят. Оплата при получении; статус — в личном кабинете.`;delete form.dataset.requestKey;break;
    }
   }
  }catch(e){status.textContent=e.message+(e.fields?.length?' '+e.fields.map(f=>f.message).join(' '):'');status.classList.add('form__status_error');}
  finally{button.disabled=false;status.focus();}
 });
 document.addEventListener('click',async event=>{
  const add=event.target.closest('[data-cart-add]');if(add){add.disabled=true;try{await ready;const pid=Number(add.dataset.cartAdd);await changeCart(items=>{const i=items.find(i=>i.product_id===pid);if(i)i.quantity=Math.min(50,i.quantity+1);else items.push({product_id:pid,quantity:1});return items;});toast('Блюдо добавлено в корзину.');}catch(e){toast(e.message);}finally{add.disabled=false;}}
  if(event.target.closest('[data-logout]')){try{await ready;await api('/logout','POST',{});location.href='index.html';}catch(e){toast(e.message);}}
 });
 if($('#feedback-name'))ready.then(()=>{if(user){$('#feedback-name').value=user.name;$('#feedback-email').value=user.email;$('#feedback-name').readOnly=true;$('#feedback-email').readOnly=true;}}).catch(()=>{});
 // Menu uses the database catalogue and server search; filters still work without a page reload.
 async function setupMenu(){
  const search=$('#menu-search');if(!search)return;
  const cards=$$('[data-dish]'),menu=window.NexcentMenu;let favorite=new Set(),category='all',query='',timer,sequence=0;
  await ready;if(user)favorite=new Set((await api('/favorites')).items);else {try{favorite=new Set(JSON.parse(window.NexcentPrivacy?.get('nexcent-favorites-v2')||'[]'));}catch{}}
  $('.menu-tools').hidden=false;$('.category-nav_fallback').hidden=true;
  const countLabel=$('[data-category="all"] .filter-chip__count');if(countLabel)countLabel.textContent=cards.length;
  function filter(matches=null){let count=0;cards.forEach(card=>{const p=menu.find(p=>p.id===card.dataset.dish);const visible=(category==='all'||p.category===category||(category==='favorites'&&favorite.has(p.id)))&&(!$('#menu-vegetarian').checked||p.vegetarian)&&(!matches||matches.has(p.id));card.hidden=!visible;if(visible)count++;});$$('.menu-section').forEach(s=>s.hidden=!$('[data-dish]:not([hidden])',s));$('#menu-empty').hidden=count>0;$('#menu-result').textContent=`Показано ${count} из ${cards.length} блюд`;$('#favorite-count').textContent=favorite.size;$$('button[data-category]').forEach(b=>{b.classList.toggle('filter-chip_active',b.dataset.category===category);b.setAttribute('aria-pressed',String(b.dataset.category===category));});$$('[data-favorite]').forEach(b=>{const selected=favorite.has(b.dataset.favorite);b.setAttribute('aria-pressed',String(selected));b.textContent=selected?'♥':'♡';});}
  let currentMatches=null;
  async function runSearch(){const seq=++sequence;query=search.value.trim();if(query.length>100){search.setCustomValidity('Введите не более 100 символов.');search.reportValidity();return;}search.setCustomValidity('');try{const result=query?await api('/search?q='+encodeURIComponent(query)):null;if(seq!==sequence)return;currentMatches=result?new Set(result.items.map(p=>p.id)):null;filter(currentMatches);}catch(e){$('#menu-result').textContent=e.message;}}
  search.addEventListener('input',()=>{clearTimeout(timer);sequence++;timer=setTimeout(runSearch,300);});$('#menu-vegetarian').addEventListener('change',()=>filter(currentMatches));
  $$('button[data-category]').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;filter(currentMatches);}));
  function reset(){search.value='';category='all';$('#menu-vegetarian').checked=false;runSearch();}
  $('#reset-menu').addEventListener('click',reset);$('#empty-reset').addEventListener('click',reset);
  document.addEventListener('nexcent:show-category',e=>{category=e.detail.category;search.value='';runSearch();});
  $$('[data-favorite]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;const pid=b.dataset.favorite,selected=!favorite.has(pid);try{if(user)await api('/favorites/'+pid,'PUT',{selected});if(selected)favorite.add(pid);else favorite.delete(pid);if(!user)window.NexcentPrivacy?.set('nexcent-favorites-v2',JSON.stringify([...favorite]));filter(currentMatches);}catch(e){toast(e.message);}finally{b.disabled=false;}}));
  const dialog=$('#dish-dialog');$('#close-dish').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>document.body.classList.remove('page_dialog-open'));
  $$('[data-details]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{const {product:p}=await api('/products/'+b.dataset.details);for(const [k,v] of Object.entries({title:p.name,description:p.description,allergens:p.allergens,weight:p.weight,price:money(p.price),category:p.category_name}))$('#dish-dialog-'+k).textContent=v;$('#dish-dialog-image').src=p.image;$('#dish-dialog-image').alt=p.name;$('#dialog-add-dinner').dataset.addDinner=p.id;document.dispatchEvent(new CustomEvent('nexcent:dish-open'));dialog.showModal();document.body.classList.add('page_dialog-open');}catch(e){toast(e.message);}finally{b.disabled=false;}}));
  filter();
  const dinnerCart=$('#dinner-to-cart');dinnerCart?.addEventListener('click',async()=>{dinnerCart.disabled=true;try{const url=new URL($('#dinner-book').href);const ids=(url.searchParams.get('dinner')||'').split(',').filter(Boolean).map(Number),guests=Number(url.searchParams.get('guests')||1);if(!ids.length)throw new Error('Сначала выберите блюда для ужина.');await changeCart(items=>{for(const pid of ids){const item=items.find(i=>i.product_id===pid);if(item)item.quantity=Math.min(50,item.quantity+guests);else items.push({product_id:pid,quantity:guests});}return items;});toast('Ужин добавлен в корзину с учётом числа гостей.');}catch(e){toast(e.message);}finally{dinnerCart.disabled=false;}});
 }
 setupMenu().catch(e=>toast(e.message));
 function renderCart(){
  const list=$('#cart-list');if(!list)return;
  list.innerHTML=cartItems.length?cartItems.map(i=>`<article class="cart-row"><img src="${esc(i.image)}" alt="" width="88" height="88"><div><h2>${esc(i.name)}</h2><p>${money(i.price)} за порцию ${!i.available||i.deleted_at?'· Недоступно':''}</p></div><label>Количество<input type="number" min="1" max="50" value="${i.quantity}" data-cart-qty="${i.product_id}" class="form__input"></label><strong>${money(i.price*i.quantity)}</strong><button class="button button_theme_tertiary" data-cart-remove="${i.product_id}" type="button">Убрать</button></article>`).join(''):'<div class="empty-box"><h2>Здесь пока пусто</h2><p>Выберите что-нибудь вкусное в меню.</p><a class="button button_theme_primary" href="menu.html">Открыть меню</a></div>';
  $('#cart-total').textContent=money(cartItems.reduce((s,i)=>s+i.price*i.quantity,0));$('#checkout-form').hidden=!user||!cartItems.length;$('#cart-login').hidden=!!user||!cartItems.length;
  $$('[data-cart-qty]').forEach(input=>input.addEventListener('change',async()=>{if(!input.reportValidity())return;input.disabled=true;try{await changeCart(items=>items.map(i=>i.product_id===Number(input.dataset.cartQty)?{...i,quantity:Number(input.value)}:i));renderCart();}catch(e){toast(e.message);input.disabled=false;}}));
  $$('[data-cart-remove]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await changeCart(items=>items.filter(i=>i.product_id!==Number(b.dataset.cartRemove)));renderCart();}catch(e){toast(e.message);b.disabled=false;}}));
 }
 if($('#cart-list'))ready.then(renderCart).catch(e=>$('#cart-list').textContent=e.message);
 async function reviews(page=1){const data=await api('/reviews?page='+page);$('#reviews-stat').textContent=data.stats.count?`${data.stats.average} из 5 · отзывов гостей: ${data.stats.count}`:'Пока нет опубликованных отзывов гостей. Будьте первым!';$('#reviews-list').innerHTML=data.items.map(r=>`<article class="review-card"><div class="review-top"><strong>${esc(r.author)}</strong><span class="stars" aria-label="Оценка ${r.rating} из 5">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p>${esc(r.message)}</p><small>${r.is_demo?'Пример отзыва · вымышленный автор':date(r.created_at)}</small>${r.response?`<blockquote><strong>Ответ ресторана</strong><p>${esc(r.response)}</p></blockquote>`:''}</article>`).join('');$('#reviews-pages').innerHTML=Array.from({length:data.pages},(_,i)=>`<button class="button ${i+1===data.page?'button_theme_primary':'button_theme_tertiary'}" data-review-page="${i+1}">${i+1}</button>`).join('');$$('[data-review-page]').forEach(b=>b.addEventListener('click',()=>reviews(Number(b.dataset.reviewPage)).catch(e=>toast(e.message))));}
 if($('#reviews-list'))ready.then(()=>{reviews().catch(e=>toast(e.message));$('#review-form').hidden=!user;$('#review-login').hidden=!!user;}).catch(e=>$('#reviews-list').textContent=e.message);
 const itemList=(items,fn)=>items.length?items.map(fn).join(''):'<p class="empty-box">Пока здесь ничего нет.</p>';
 async function account(){
  if(!$('#account-content'))return;await ready;
  $('#account-loading').hidden=true;if(!user){$('#account-login').hidden=false;return;}$('#account-content').hidden=false;
  $('#account-name').textContent=user.name;for(const field of ['name','email','phone'])$(`[name=${field}]`,$('[data-form=profile]')).value=user[field];
  const [orders,bookings,feedback,actions,sessions,profileData]=await Promise.all(['/orders','/bookings','/feedback','/actions','/sessions','/profile'].map(p=>api(p)));
  $('#account-orders').innerHTML=itemList(orders.items,o=>`<article class="record"><div class="record-head"><h3>Заказ №${o.id}</h3><span class="badge">${names[o.status]}</span></div><p>${date(o.created_at)} · ${money(o.total)}</p><ul>${o.items.map(i=>`<li>${esc(i.name)} × ${i.quantity} — ${money(i.unit_price*i.quantity)}</li>`).join('')}</ul>${o.status==='pending'?`<button class="button button_theme_tertiary" data-cancel="orders/${o.id}">Отменить заказ</button>`:''}</article>`);
  $('#account-bookings').innerHTML=itemList(bookings.items,b=>`<article class="record"><div class="record-head"><h3>Бронь №${b.id}</h3><span class="badge">${names[b.status]}</span></div><p>${date(b.visit_at)} (Москва) · гостей: ${b.guests}</p><p>${esc(b.message)}</p>${['pending','confirmed'].includes(b.status)?`<button class="button button_theme_tertiary" data-cancel="bookings/${b.id}">Отменить бронь</button>`:''}</article>`);
  $('#account-feedback').innerHTML=itemList(feedback.items,f=>`<article class="record"><h3>${esc(f.subject)}</h3><small>${names[f.status]}${f.kind==='review'?' · '+names[f.moderation]:''}</small><p>${esc(f.message)}</p>${f.response?`<blockquote><strong>Ответ ресторана</strong><p>${esc(f.response)}</p></blockquote>`:''}</article>`);
  const actionNames={register:'Регистрация',login:'Вход',logout:'Выход',profile_updated:'Изменение профиля',password_changed:'Смена пароля',cart_updated:'Изменение корзины',cart_merged:'Перенос корзины',order_created:'Новый заказ',order_cancelled:'Отмена заказа',booking_created:'Заявка на бронь',booking_cancelled:'Отмена брони',feedback_created:'Обращение или отзыв',search:'Поиск по меню',sessions_revoked:'Завершение сессий'};
  $('#account-actions').innerHTML=itemList(actions.items,a=>`<li>${esc(actionNames[a.action]||a.action)} <small>${date(a.created_at)}</small></li>`);
  $('#account-sessions').innerHTML=itemList(sessions.items,s=>`<p class="record">${s.current?'Текущая сессия':'Другая сессия'} · ${esc(s.ip_address)}<br><small>${esc(s.user_agent)}<br>До ${date(s.expires_at)}</small></p>`);
  const recent=profileData.state.recent||[],searches=profileData.state.searches||[];$('#account-recent').innerHTML=recent.length?recent.map(id=>window.NexcentMenu.find(p=>p.id===String(id))).filter(Boolean).map(p=>`<a class="text-link" href="menu.html#${esc(p.category)}">${esc(p.name)}</a>`).join(' · '):'Вы ещё не открывали карточки блюд.';$('#account-searches').textContent=searches.join(' · ')||'История поиска пуста.';
  $$('[data-cancel]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Отменить эту заявку?'))return;b.disabled=true;try{await api('/'+b.dataset.cancel+'/cancel','POST',{});await account();}catch(e){toast(e.message);b.disabled=false;}}));
 }
 account().catch(e=>{const el=$('#account-loading');if(el){el.hidden=false;el.textContent=e.message;}});
 $('#revoke-sessions')?.addEventListener('click',async()=>{try{await api('/sessions','DELETE',{});toast('Другие сессии завершены.');await account();}catch(e){toast(e.message);}});
 // Three-slide hero. No forced autoplay: keyboard and touch controls remain predictable.
 const slider=$('[data-slider]');if(slider){const slides=$$('[data-slide]',slider),tabs=$$('[data-slide-to]',slider);let current=0;const show=i=>{current=(i+slides.length)%slides.length;slides.forEach((s,n)=>s.hidden=n!==current);tabs.forEach((b,n)=>b.setAttribute('aria-pressed',String(n===current)));$('#slide-number').textContent=String(current+1).padStart(2,'0')+' / 03';};tabs.forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.slideTo))));$('#slide-prev').addEventListener('click',()=>show(current-1));$('#slide-next').addEventListener('click',()=>show(current+1));slider.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if(e.key==='ArrowRight')show(current+1);if(e.key==='ArrowLeft')show(current-1);});let startX;slider.addEventListener('touchstart',e=>startX=e.changedTouches[0].clientX,{passive:true});slider.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-startX;if(Math.abs(delta)>60)show(current+(delta<0?1:-1));},{passive:true});show(0);}
})();
