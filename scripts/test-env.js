import {existsSync} from 'node:fs';
if(existsSync('.env.test')) process.loadEnvFile('.env.test');
if(!process.env.DB_NAME?.endsWith('_test') || process.env.NODE_ENV==='production') {
 throw new Error('Use .env.test: DB_NAME must end with _test and NODE_ENV must not be production.');
}
