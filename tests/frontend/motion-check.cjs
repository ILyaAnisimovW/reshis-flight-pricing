const {chromium}=require(process.env.PLAYWRIGHT_MODULE || require('node:path').resolve('runtime/frontend-tools/node_modules/playwright'));
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const output='docs/screenshots/linear-dark-2026-11-14';
const base=process.env.APP_URL || 'http://localhost:8092';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 let context, page;
 try {
  context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:output+'/motion',size:{width:1440,height:900}}});
  page=await context.newPage();
 } catch(e){
  console.log('Video unavailable: '+e.message);await context?.close();
  context=await browser.newContext({viewport:{width:1440,height:900}});page=await context.newPage();
 }
 const results=[];let completed=false;
 const check=async(name,fn)=>{const evidence=await fn();results.push({name,passed:true,evidence});console.log('PASS '+name)};
 try {
 await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#calculate').disabled);
 await page.waitForTimeout(600);
 await page.locator('#price').fill('10000');
 await check('loading retains button geometry and last result',async()=>{
  const initial=await page.locator('#calculate').boundingBox();
  await page.route('**/api/calculate',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue()});
  await page.locator('#calculate').click();
  const loading=await page.locator('#calculate').boundingBox();
  assert.equal(loading.width,initial.width);assert.equal(loading.height,initial.height);
  assert.equal(await page.locator('#calculate').getAttribute('aria-busy'),'true');
  await page.screenshot({path:output+'/after-loading.png'});
  await page.waitForFunction(()=>document.querySelector('#result-state').textContent==='Рассчитано');
  await page.unroute('**/api/calculate');return {initial,loading};
 });
 await page.waitForFunction(()=>document.querySelector('#result-state').textContent==='Рассчитано');
 await page.waitForTimeout(900);
 await check('stagger and SVG line animate through real intermediate values',async()=>{
  await page.locator('#calculate').click();
  await page.waitForFunction(()=>document.querySelector('#chart .demand-line')?.getAnimations().length>0);
  const first=await page.locator('#chart .demand-line').evaluate(e=>({offset:parseFloat(getComputedStyle(e).strokeDashoffset),points:e.getAttribute('points')}));
  const stagger=await page.evaluate(()=>['.result-context','.main-metric','.secondary-metrics','.chart-panel'].map(s=>document.querySelector(s).getAnimations().map(a=>({delay:a.effect.getTiming().delay,duration:a.effect.getTiming().duration}))));
  assert.deepEqual(stagger.map(a=>a[0].delay),[0,55,110,165]);
  await page.waitForTimeout(300);
  const middle=await page.locator('#chart .demand-line').evaluate(e=>parseFloat(getComputedStyle(e).strokeDashoffset));
  await page.screenshot({path:output+'/motion-middle.png'});
  await page.waitForTimeout(800);
  const end=await page.locator('#chart .demand-line').evaluate(e=>({offset:parseFloat(getComputedStyle(e).strokeDashoffset),points:e.getAttribute('points')}));
  assert.ok(first.offset>middle);assert.ok(middle>0);assert.equal(end.offset,0);assert.equal(end.points,first.points);
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'||a.pending).length),0);
  return {firstOffset:first.offset,middleOffset:middle,endOffset:end.offset,stagger};
 });
 await check('dialog panel and backdrop fade, keyboard closes and restores focus',async()=>{
  await page.locator('#account-open').click();
  const animations=await page.locator('#account-dialog').evaluate(e=>e.getAnimations({subtree:true}).map(a=>({name:a.animationName,duration:a.effect.getTiming().duration})));
  assert.ok(animations.some(a=>a.name==='enter'));
  await page.waitForTimeout(100);await page.screenshot({path:output+'/dialog-motion.png'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#account-open').evaluate(e=>e===document.activeElement),true);return animations;
 });
 await check('reduced motion disables CSS and JS animation with identical real data',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#calculate').disabled);
  await page.locator('#price').fill('10000');await page.locator('#calculate').click();
  await page.waitForFunction(()=>document.querySelector('#result-state').textContent==='Рассчитано');
  assert.equal(await page.evaluate(()=>document.getAnimations().length),0);assert.equal(await page.locator('#sales').innerText(),'713');
  await page.locator('#account-open').click();assert.equal(await page.evaluate(()=>document.getAnimations().length),0);await page.keyboard.press('Escape');
 });
 await check('mobile short viewport with focused price and scrollable account',async()=>{
  await page.setViewportSize({width:360,height:500});await page.locator('#price').focus();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#account-open').click();await page.locator('#tab-register').click();
  const geometry=await page.locator('#account-dialog').evaluate(e=>({height:e.getBoundingClientRect().height,viewport:innerHeight,scroll:e.scrollHeight,client:e.clientHeight}));
  assert.ok(geometry.height<=geometry.viewport-30);assert.ok(geometry.scroll>=geometry.client);await page.keyboard.press('Escape');return geometry;
 });
 completed=true;
 } finally {
  await fs.writeFile('docs/frontend-motion-results.json',JSON.stringify({date:'2026-11-14',passed:completed,results},null,2));
  await context.close();await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
