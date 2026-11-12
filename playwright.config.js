import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./test/e2e',timeout:45000,fullyParallel:false,workers:1,retries:0,
 reporter:[['list'],['html',{outputFolder:'playwright-report',open:'never'}]],
 use:{baseURL:process.env.BASE_URL||'http://localhost:3000',screenshot:'only-on-failure',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium',launchOptions:process.env.PW_BROWSER_EXECUTABLE?{executablePath:process.env.PW_BROWSER_EXECUTABLE}:undefined}},{name:'firefox',use:{browserName:'firefox'}}]
});
