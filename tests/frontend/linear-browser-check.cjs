const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require('node:path').resolve('runtime/frontend-tools/node_modules/playwright'));
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.APP_URL || 'http://localhost:8090';
const output = 'docs/screenshots/linear-dark-2026-11-14';
(async()=>{
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const context = await browser.newContext({viewport:{width:1440,height:900}});
 const page = await context.newPage();
 const errors=[]; const results=[]; const consoleErrors=[]; const httpErrors=[]; let completed=false;
 page.on('console',entry=>{if(entry.type()==='error') consoleErrors.push(entry.text())});
 page.on('pageerror', e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400) httpErrors.push({url:r.url(),status:r.status()})});
 const check=async(name,fn)=>{await fn(); results.push({name,passed:true}); console.log('PASS '+name)};
 const ready=async()=>{await page.goto(base);await page.locator('#calculate').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#calculate').disabled)};
 const calculate=async(price)=>{await page.locator('#price').fill(price);await page.locator('#calculate').click();await page.waitForFunction(()=>document.querySelector('#result-state').textContent==='Рассчитано')};
 try {
 await check('initial empty, base price, independent account',async()=>{
  await page.route('**/api/auth/me',async route=>{await new Promise(r=>setTimeout(r,2200));try { await route.continue() } catch {} });
  await ready(); assert.equal(await page.locator('#price').inputValue(),'9000');assert.equal(await page.locator('#empty').isVisible(),true);assert.equal(await page.locator('#result').isVisible(),false);assert.equal(await page.locator('#route option').first().textContent(),'Сочи');
  await page.screenshot({path:output+'/after-empty-1440.png',fullPage:true});await page.unroute('**/api/auth/me');
 });
 await check('three real API reference cases',async()=>{
  for(const [price,demand,sales] of [['10000','713','713'],['8000','995','900'],['100000','-11 977','0']]){
   await calculate(price); if(price==='8000') await page.screenshot({path:output+'/after-capacity.png',fullPage:true}); assert.equal((await page.locator('#demand').innerText()).replace(/\s/g,''),demand.replace(/\s/g,''));assert.equal(await page.locator('#sales').innerText(),sales);
  }
  assert.equal(await page.locator('#result-warning').isVisible(),true);assert.match(await page.locator('#interpretation').innerText(),/отрицательный/);
  await page.screenshot({path:output+'/after-negative.png',fullPage:true});
 });
 await check('stale result, valid date retained, new base price',async()=>{
  await page.locator('#price').fill('123');assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#stale-note').isVisible(),true);
  await page.locator('#date').selectOption('2026-06-12');await page.locator('#route').selectOption('MOW-LED');assert.equal(await page.locator('#date').inputValue(),'2026-06-12');assert.equal(await page.locator('#price').inputValue(),'5500');
  await page.locator('#route').selectOption('MOW-AER');await page.locator('#date').selectOption('2026-06-01');
 });
 await check('price validation, comma decimals and base reset',async()=>{
  for(const p of ['', '0','-1','NaN','Infinity','12foo']){await page.locator('#price').fill(p);await page.locator('#calculate').click();assert.equal(await page.locator('#price').getAttribute('aria-invalid'),'true')}
  await page.screenshot({path:output+'/after-form-error.png',fullPage:true});
  await calculate('9000,50');assert.match(await page.locator('#result-context').innerText(),/9.000,5/);
  await page.locator('#base-price').click();assert.equal(await page.locator('#price').inputValue(),'9000');
 });
 await check('slow old response cannot overwrite newer result',async()=>{
  let count=0;
  await page.route('**/api/calculate',async route=>{count++;if(count===1){const response=await route.fetch();await new Promise(r=>setTimeout(r,1600));try{await route.fulfill({response})}catch{}}else try { await route.continue() } catch {} });
  await page.locator('#price').fill('10000');await page.locator('#calculate').click();await page.waitForTimeout(150);
  assert.equal(await page.locator('#calculate').isDisabled(),true);
  await calculate('8000');await page.waitForTimeout(1800);assert.equal(await page.locator('#demand').innerText(),'995');await page.unroute('**/api/calculate');
 });
 await check('network failure and recovery',async()=>{
  await context.setOffline(true);await page.locator('#price').fill('10000');await page.locator('#calculate').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('недоступен'));
  await context.setOffline(false);await calculate('10000');assert.equal(await page.locator('#sales').innerText(),'713');
 });
 await check('server 500, forbidden 403 retained and explicit CSRF recovery',async()=>{
  await page.route('**/api/calculate',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'INTERNAL_ERROR',message:'error'})}));await page.locator('#calculate').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('Ошибка сервера'));await page.unroute('**/api/calculate');
  await page.route('**/api/calculate',route=>{const headers={...route.request().headers(),'x-csrf-token':'invalid-token'};return route.continue({headers})});await page.locator('#calculate').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('(403)'));assert.equal(await page.locator('#recover').isVisible(),true);await page.unroute('**/api/calculate');
  await page.locator('#recover').click();await page.waitForFunction(()=>!document.querySelector('#calculate').disabled);await calculate('10000');
 });
 await check('account network/500 is not guest; modal Escape and focus',async()=>{
  await page.route('**/api/auth/me',route=>route.fulfill({status:503,contentType:'application/json',body:'{"code":"UNAVAILABLE","message":"test"}'}));await ready();await page.waitForFunction(()=>document.querySelector('#account-open').textContent.includes('проверить'));await page.locator('#account-open').click();assert.match(await page.locator('#auth-status').innerText(),/неизвестен/);await page.keyboard.press('Escape');assert.equal(await page.locator('#account-dialog').isVisible(),false);assert.equal(await page.locator('#account-open').evaluate(e=>e===document.activeElement),true);await page.unroute('**/api/auth/me');await ready();
 });
 await check('registration/login/report/logout real HTTP and passwords cleared',async()=>{
  await page.locator('#account-open').click();await page.locator('#tab-register').click();const username='design_'+Date.now();
  await page.locator('#register-username').fill(username);await page.locator('#register-password').fill('DemoRedesign2026!');await page.locator('#register-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#auth-status').textContent.includes('Аккаунт создан'));
  assert.equal(await page.locator('#register-password').inputValue(),'');await page.locator('#login-password').fill('wrong');await page.locator('#login-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#login-password-error').textContent.length>0);
  await page.locator('#login-password').fill('DemoRedesign2026!');await page.locator('#login-form button[type=submit]').click();await page.locator('#account-content').waitFor({state:'visible'});assert.equal(await page.locator('#login-password').inputValue(),'');
  await page.locator('#report').click();await page.waitForFunction(()=>document.querySelector('#report-content').textContent.length>0);await page.screenshot({path:output+'/after-account.png',fullPage:false});
  await page.locator('#logout').click();await page.locator('#login-form').waitFor({state:'visible'});assert.equal(await page.locator('#account-content').isVisible(),false);await page.keyboard.press('Escape');
 });
 await calculate('10000');
 await check('responsive layouts 1440 1280 768 390 360, chart text and table',async()=>{
  for(const width of [1440,1280,768,390,360]){
   await page.setViewportSize({width,height:width===1440?900:width===1280?800:width===390?844:width===360?800:1000});await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);
   const geometry=await page.locator('#chart').evaluate(e=>({actual:e.getBoundingClientRect().width,svg:e.viewBox.baseVal.width,font:e.querySelector('text').getAttribute('font-size')}));assert.ok(Math.abs(geometry.actual-geometry.svg)<2);assert.equal(geometry.font,'12'); if(width<540) assert.ok(await page.locator('#sales').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=56);
   await page.screenshot({path:output+`/after-${width}.png`,fullPage:true});
  }
  await page.getByText('Точные значения квантилей',{exact:true}).click();assert.equal(await page.locator('#quantiles tr').count(),9);assert.equal(await page.locator('#quantiles tr.median td').last().innerText(),'713');await page.screenshot({path:output+'/after-mobile-table.png',fullPage:true});
 });
 await check('keyboard Tab is contained in modal and Escape returns focus',async()=>{
  await page.locator('#account-open').click();
  for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#account-dialog').contains(document.activeElement)),true,JSON.stringify(await page.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,open:document.querySelector('#account-dialog').open}))))}
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.querySelector('#account-dialog').contains(document.activeElement)),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#account-open').evaluate(e=>e===document.activeElement),true);
 });
 await check('catalog failure has retry; account network failure stays unknown',async()=>{
  await page.route('**/api/catalog',route=>route.fulfill({status:503,contentType:'application/json',body:'{"code":"UNAVAILABLE","message":"test"}'}));
  await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#recover').hidden);assert.equal(await page.locator('#calculate').isDisabled(),true);await page.unroute('**/api/catalog');await page.locator('#recover').click();await page.waitForFunction(()=>!document.querySelector('#calculate').disabled);
  await page.route('**/api/auth/me',route=>route.abort('internetdisconnected'));await ready();await page.waitForFunction(()=>document.querySelector('#account-open').textContent.includes('проверить'));await page.unroute('**/api/auth/me');
 });
 await check('local font, nice ticks, long destinations and large values',async()=>{
  await ready();await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.fonts.check('500 16px "Golos Text"')),true);
  await calculate('10000');const labels=await page.locator('#chart text').allTextContents();assert.ok(labels.includes('250'));assert.ok(!labels.includes('-72'));
  await page.locator('#route').selectOption('MOW-MRV');await calculate('1000000000');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#result-route').focus();await page.screenshot({path:output+'/after-long-large.png',fullPage:true});
  await page.locator('#route').selectOption('MOW-AER');await calculate('10000');
 });
 await check('measured palette contrast and readable local typography',async()=>{
  const luminance = hex => {const c=hex.match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const ratios={text:contrast('f2f3f5','0d0f12'),secondary:contrast('a3a9b3','14171c'),accent:contrast('b8c3ff','14171c'),inputBorder:contrast('596170','0d0f12')};
  for(const key of ['text','secondary','accent']) assert.ok(ratios[key]>=4.5);assert.ok(ratios.inputBorder>=3);
  await fs.writeFile('docs/linear-dark-contrast.json',JSON.stringify(ratios,null,2));
  assert.match(await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Golos Text/);
 });
 assert.deepEqual(errors,[]);results.push({name:'no browser page errors',passed:true}); completed=true;
 } finally {await fs.writeFile('docs/frontend-linear-test-results.json',JSON.stringify({date:'2026-11-14',base,browser:browser.version(),passed:completed && errors.length===0,results,pageErrors:errors,consoleErrors,httpErrors},null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});









