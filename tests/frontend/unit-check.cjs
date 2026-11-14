const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const app = fs.readFile('src/main/resources/static/app.js','utf8').then(source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
test('price accepts decimal rubles without silently stripping invalid characters',async()=>{
 const {parsePrice}=await app;
 for(const value of ['', '0','-1','NaN','Infinity','1e3','9 000','1,2.3','true','1'.repeat(400)]) assert.equal(parsePrice(value),null,value);
 assert.equal(parsePrice('9000,50'),9000.5);assert.equal(parsePrice('0.001'),.001);assert.equal(parsePrice(' 12.25 '),12.25);
});
test('only newest request can write a result, including ignored aborts',async()=>{
 const {requestGate}=await app;const gate=requestGate();const old=gate.next();const next=gate.next();assert.equal(gate.current(old),false);assert.equal(gate.current(next),true);gate.next();assert.equal(gate.current(next),false);
});
test('network/server/forbidden retain distinct explanations and status',async()=>{
 const {ApiError,errorText}=await app;const forbidden=new ApiError(403,'FORBIDDEN','denied');assert.equal(forbidden.code,'FORBIDDEN');assert.match(errorText(forbidden),/отклонён \(403\)/);assert.doesNotMatch(errorText(forbidden),/истекла/);assert.match(errorText(new ApiError(0,'NETWORK','')),/недоступен/);assert.match(errorText(new ApiError(500,'SERVER','')),/Ошибка сервера/);
});

test('nice ticks include all real data, never add negative demand to a positive scenario',async()=>{
 const {niceTicks}=await app;
 for(const values of [[593,713,834,900],[875,995,1116,900],[-12097,-11977,-11856,900],[0,0]]) {
  const scale=niceTicks(values);assert.ok(scale.lo<=Math.min(...values));assert.ok(scale.hi>=Math.max(...values));assert.ok(scale.hi>scale.lo);assert.ok(scale.ticks.length>=2);
  if(values.every(x=>x>=0)) assert.equal(scale.lo,0);
  assert.deepEqual([...scale.ticks].sort((a,b)=>a-b),scale.ticks);
 }
 assert.deepEqual(niceTicks([593,713,834,900]).ticks,[0,250,500,750,1000]);
});
