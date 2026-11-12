import { readFile } from 'node:fs/promises';
import { root } from './paths.js';
import path from 'node:path';

export const consentVersion='2026-11-05';
const placeholder='Оператор и контакт для обращений: перед коммерческим запуском владелец должен заменить этот абзац своими реквизитами и действующим адресом для запросов. До этого проект предназначен для учебной демонстрации.';
const escapeHTML=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function legalDocument(format){
 let content=await readFile(path.join(root,'public','privacy.'+format),'utf8');
 const name=process.env.LEGAL_OPERATOR_NAME?.trim(),address=process.env.LEGAL_OPERATOR_ADDRESS?.trim(),email=process.env.LEGAL_CONTACT_EMAIL?.trim();
 // Do not invent operator details. Both downloadable and HTML versions use the same values.
 if(name&&address&&email){
  const details=`Оператор: ${name}. Адрес: ${address}. Контакт для обращений по обработке данных: ${email}.`;
  content=content.replace(placeholder,format==='html'?escapeHTML(details):details);
 }
 return content;
}
