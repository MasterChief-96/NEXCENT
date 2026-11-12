import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const template=await readFile(new URL('../.env.example',import.meta.url),'utf8');
try{await writeFile(new URL('../.env',import.meta.url),template.replace('CHANGE_ME_RANDOM_PASSWORD',randomBytes(24).toString('hex')).replace('CHANGE_ME_ANOTHER_RANDOM_PASSWORD',randomBytes(24).toString('hex')),{flag:'wx',mode:0o600});console.log('.env создан со случайными паролями базы. Для сервера измените DOMAIN, APP_ORIGIN, NODE_ENV и TRUST_PROXY по README.');}
catch(e){if(e.code==='EEXIST')console.log('.env уже существует, оставлен без изменений.');else throw e;}
