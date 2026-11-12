import {test,expect} from '@playwright/test';
const pages=['/','/menu.html','/about.html','/booking.html','/reviews.html','/cart.html','/account.html','/admin.html','/privacy.html'];
for(const width of [360,768,1440])test('adaptive layout and local resources at '+width+'px',async({page},info)=>{
 await page.setViewportSize({width,height:900});const errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(new URL(r.url()).origin===new URL(page.url()).origin&&r.status()>=400&&!r.url().includes('/api/admin'))failed.push(r.status()+' '+r.url());});
 for(const route of pages){
  await page.goto(route);await page.waitForFunction(()=>!!window.Nexcent);await page.evaluate(()=>window.Nexcent.ready);
  const consent=page.locator('#cookie-reject');if(await consent.isVisible())await consent.click();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  // Trigger native lazy image loading before checking naturalWidth.
  for(const img of await page.locator('img').all()){
   if(await img.isVisible()) {await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);}
  }
  if(route==='/')await page.screenshot({path:info.outputPath(`home-${width}.png`),fullPage:true});
 }
 expect(errors).toEqual([]);expect(failed).toEqual([]);
});
test('at least ten distinct internal link destinations resolve',async({page,request})=>{
 const links=new Set();for(const route of ['/','/menu.html','/about.html']){await page.goto(route);for(const href of await page.locator('a[href]').evaluateAll(a=>a.map(x=>x.href))){const u=new URL(href);if(u.origin===new URL(page.url()).origin)links.add(u.pathname+u.search+u.hash);}}
 expect(links.size).toBeGreaterThanOrEqual(10);
 for(const link of links){const response=await request.get(link);expect(response.status(),link).toBeLessThan(400);const hash=new URL(link,'http://local').hash;if(hash){await page.goto(link);expect(await page.locator(`[id=${JSON.stringify(decodeURIComponent(hash.slice(1)))}]`).count(),link).toBeGreaterThan(0);}}
});
test('registration form rejects invalid email in browser',async({page})=>{await page.goto('/about.html#register');await page.locator('#reg-email').fill('not-an-email');expect(await page.locator('#reg-email').evaluate(e=>e.validity.typeMismatch)).toBe(true);});
test('mobile menu is keyboard operable',async({page})=>{await page.setViewportSize({width:360,height:900});await page.goto('/');const consent=page.locator('#cookie-reject');if(await consent.isVisible())await consent.click();const burger=page.locator('.burger');await burger.focus();await page.keyboard.press('Enter');await expect(page.locator('#main-nav')).toBeVisible();await page.locator('#main-nav').getByRole('link',{name:'Меню',exact:true}).focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/menu\.html/);});
test('images have alternative text and fields have accessible labels',async({page})=>{for(const route of ['/','/about.html','/booking.html']){await page.goto(route);expect(await page.locator('img:not([alt])').count()).toBe(0);const missing=await page.locator('input:not([type=hidden]):not([type=submit]),select,textarea').evaluateAll(items=>items.filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>e.id||e.name));expect(missing,route).toEqual([]);}});
