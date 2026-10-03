import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const root = process.cwd();
const output = root + '/qualification-results/native';
await mkdir(output,{recursive:true});
const require = createRequire(root + '/package.json');
const { _electron: electron, expect } = require('@playwright/test');
const { buildFixtureEnv } = await import(root + '/scripts/fixture-env.mjs');
const { closeElectronApplication } = await import(root + '/scripts/electron-lifecycle.mjs');
const requests = [];
const sockets = new Set();
const server = createServer((req,res) => {
  requests.push(req.url);
  res.writeHead(200, {'content-type':'text/html'});
  res.write('<!doctype html><title>Toolbar validation</title><h1>Local browser fixture</h1><p>' + req.url + '</p>');
  if(req.url !== '/slow') res.end();
});
server.on('connection', s => {sockets.add(s);s.on('close',()=>sockets.delete(s));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const results = [];
try {
 for(const theme of ['light','dark']) {
  const userData=await mkdtemp(join(tmpdir(),'maka-toolbar-native-'));
  const home=join(userData,'home'); await mkdir(home);
  let app;
  try {
   app=await electron.launch({args:['.','--no-sandbox'],cwd:root+'/apps/desktop',
     env:buildFixtureEnv(userData,home,{scenario:'turn-narrative-browser',locale:'en',theme,showWindow:true})});
   const page=await app.firstWindow();
   app.process().stdout?.on('data',data=>process.stdout.write(data));
   app.process().stderr?.on('data',data=>process.stderr.write(data));
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.locator('.maka-browser-panel').waitFor({timeout:30000});
   // Observe completion of the production close handler, including async view disposal.
   await app.evaluate(({ipcMain})=>{
    const original=ipcMain._invokeHandlers.get('browser:close-page');
    if(!original) throw new Error('Production browser close handler is not registered');
    globalThis.__closeCompletions=0;
    ipcMain.removeHandler('browser:close-page');
    ipcMain.handle('browser:close-page',async (...args)=>{
      const result=await original(...args);
      globalThis.__closeCompletions++;
      return result;
    });
   });
   // The screenshot fixture disables transitions, but this journey exercises normal interactive dismissal.
   await page.evaluate(()=>document.documentElement.removeAttribute('data-maka-e2e-fixture'));
   const sid=await page.evaluate(async()=> (await window.maka.e2eFixture.getState()).activeSessionId);
   assert.ok(sid);
   const state=()=>page.evaluate(id=>window.maka.browser.getState(id),sid);
   const address=page.getByRole('textbox',{name:'Browser address',exact:true});
   async function navigate(path,loading=false) {
    await address.fill(base+path);
    await expect(address).toHaveValue(base+path);
    await address.press('Enter');
    try {
     await expect.poll(async()=>{const s=await state();return Boolean(s&&s.url===base+path&&s.hasPage&&s.loading===loading);},{timeout:15000}).toBe(true);
    } catch(error) {
     console.error('Navigation diagnostic',JSON.stringify({theme,path,loading,state:await state(),address:await address.inputValue(),errors,requests}));
     await page.screenshot({path:join(output,'navigation-failure-'+theme+'.png')});
     throw error;
    }
   }
   const button=name=>page.getByRole('button',{name,exact:true});
   await navigate('/a');await navigate('/b');
   await button('Go back in browser').click();
   await expect.poll(async()=> (await state())?.url).toBe(base+'/a');
   await button('Go forward in browser').click();
   await expect.poll(async()=> (await state())?.url).toBe(base+'/b');
   const count=requests.filter(p=>p==='/b').length;
   await button('Reload page').click();
   await expect.poll(()=>requests.filter(p=>p==='/b').length).toBeGreaterThan(count);
   await expect.poll(async()=> (await state())?.loading).toBe(false);
   await navigate('/slow',true);
   await button('Stop loading page').click();
   await expect.poll(async()=> (await state())?.loading).toBe(false);
   await navigate('/a');
   await button('Close browser page').click();
   await expect.poll(()=>app.evaluate(()=>globalThis.__closeCompletions)).toBe(1);
   await expect.poll(async()=> Boolean((await state())?.hasPage)).toBe(false);
   assert.equal(await page.getByText('Browser action failed',{exact:true}).count(),0);
   results.push({theme,case:'five normal toolbar actions',passed:true});
   console.log('PASS',theme,'five normal toolbar actions');
   for(const [method,label] of [['back','Go back in browser'],['forward','Go forward in browser'],['reload','Reload page'],['stop','Stop loading page'],['close-page','Close browser page']]) {
    await navigate('/a');await navigate('/b');await navigate('/c');
    await button('Go back in browser').click();
    await expect.poll(async()=> (await state())?.url).toBe(base+'/b');
    await expect.poll(async()=> (await state())?.loading).toBe(false);
    if(method==='stop') await navigate('/slow',true);
    const channel='browser:'+method;
    await app.evaluate(({ipcMain},channel)=>{
      const original=ipcMain._invokeHandlers.get(channel);
      if(!original) throw new Error('Missing production IPC handler '+channel);
      globalThis.__toolbarValidation={original,calls:0};
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel,()=>{globalThis.__toolbarValidation.calls++;throw new Error('private toolbar transport detail');});
    },channel);
    try {
     await button(label).click();
     await expect(page.getByText('Browser action failed',{exact:true})).toHaveCount(1);
     await expect(page.getByText('The action could not be completed. Try again.',{exact:true})).toBeVisible();
     assert.equal(await page.getByText('private toolbar transport detail').count(),0);
     assert.equal(await app.evaluate(()=>globalThis.__toolbarValidation.calls),1);
     // Capture the fully entered toast, rather than an intermediate animation frame.
     await page.evaluate(async()=>{
       // The toast's lifetime progress animation must keep running; only await layout transitions.
       const animations=document.getAnimations().filter(a=>a instanceof CSSTransition);
       await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
     });
     const toast=page.getByRole('alert').filter({hasText:'Browser action failed'});
     await expect(toast).toBeInViewport({ratio:1});
     const w=await app.browserWindow(page);
     const png=await w.evaluate(async w=>(await w.capturePage()).toPNG().toString('base64'));
     await writeFile(join(output,'electron-'+theme+'-'+method+'.png'),Buffer.from(png,'base64'));
     await w.dispose();
     results.push({theme,case:method+' IPC rejection',passed:true});
     console.log('PASS',theme,method,'real IPC rejection and localized toast');
    } finally {
     await app.evaluate(({ipcMain},channel)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,globalThis.__toolbarValidation.original);delete globalThis.__toolbarValidation;},channel);
    }
    if(method==='stop') {await button('Stop loading page').click();await expect.poll(async()=> (await state())?.loading).toBe(false);}
    await page.getByRole('alert').filter({hasText:'Browser action failed'}).getByRole('button').last().click();
    await expect(page.getByText('Browser action failed',{exact:true})).toHaveCount(0);
   }
   assert.deepEqual(errors,[]);
   results.push({theme,case:'no unhandled renderer errors',passed:true});
  } finally {
   if(app) await closeElectronApplication(app,5000);
   await rm(userData,{recursive:true,force:true});
   await writeFile(join(output,'electron-toolbar-results.json'),JSON.stringify(results,null,2));
  }
 }
} finally {
 for(const socket of sockets) socket.destroy();
 await new Promise(resolve=>server.close(resolve));
}
console.log('PASS all native toolbar qualification scenarios');
