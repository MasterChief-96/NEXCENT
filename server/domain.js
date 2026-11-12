import { fail } from './validation.js';

// Money is summed in integer kopecks, never using a price sent by the browser.
export function orderTotal(items) {
 return items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100;
}
export function bookingInstant(day, time, now = Date.now()) {
 const date = new Date(day + 'T' + time + ':00+03:00');
 if (!Number.isFinite(+date) || new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) !== day ||
     +date < now + 3600000 || +date > now + 90 * 86400000) {
  fail(400, 'Бронируйте за час до визита, не более чем на 90 дней вперёд.');
 }
 return date.toISOString().slice(0, 19).replace('T', ' ');
}
export function canTransition(kind, from, to) {
 if (!['orders', 'bookings'].includes(kind)) return false;
 const transitions = {pending:['confirmed','cancelled'],
  confirmed:kind==='orders'?['ready','cancelled']:['completed','cancelled'],
  ...(kind==='orders'?{ready:['completed','cancelled']}:{}),completed:[],cancelled:[]};
 return Object.hasOwn(transitions, from) && (from === to || transitions[from].includes(to));
}
