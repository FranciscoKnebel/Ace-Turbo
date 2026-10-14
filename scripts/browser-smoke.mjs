// Optional development check: npm install --no-save --package-lock=false playwright@1.62.1
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createStaticServer } from './serve.js';
const directory=new URL('../browser-artifacts/',import.meta.url);await mkdir(directory,{recursive:true});
const server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,report=[],errors=[];
let browser;
try {
  browser=await chromium.launch({headless:true});
  for(const [width,height] of [[1280,720],[640,360],[390,844]])for(const lang of ['pt','en']) {
    const page=await browser.newPage({viewport:{width,height},locale:lang==='pt'?'pt-BR':'en-US'});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400&&new URL(response.url()).pathname!=='/favicon.ico')errors.push(`${response.status()}: ${response.url()}`);});
    await page.goto(base);await page.evaluate(async ()=>{const {boot}=await import('/src/app/browser.js');globalThis.testClient=boot();});
    const press=async key=>{await page.keyboard.press(key);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
    const state=()=>page.evaluate(()=>testClient.getState().screen);
    const capture=async name=>{
      await page.waitForLoadState('networkidle');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const file=`${lang}-${width}x${height}-${name}.png`;
      await page.screenshot({path:new URL(file,directory).pathname});report.push({file,width,height,lang,screen:await state()});
    };
    await capture('menu');
    // HTML native control activation must put keyboard focus on the canvas.
    await page.locator('summary').click();await page.locator('[data-action="start"]').focus();await press('Enter');
    await page.waitForFunction(()=>document.activeElement.id==='game');
    await press('KeyM');await page.waitForFunction(()=>testClient.getState().screen==='menu');
    for(const [digit,mode] of [['1','coop'],['2','singles'],['3','versus'],['4','demo']]) {
      await press('Digit'+digit);await press('Enter');
      await page.waitForFunction(expected=>testClient.getState().screen==='loading'&&testClient.getState().world.mode===expected,mode);
      await press('KeyM');await page.waitForFunction(()=>testClient.getState().screen==='menu');
    }
    await press('Digit7');await press('Enter');await page.waitForFunction(()=>testClient.getState().screen==='help');
    await capture('help-0');
    for(let n=1;n<30;n++) {
      await press('ArrowRight');
      const next=await page.evaluate(()=>testClient.getState().helpPage);if(next===0)break;
      await capture('help-'+next);
    }
    await press('Escape');await press('Digit6');await press('Enter');
    await page.waitForFunction(()=>testClient.getState().screen==='players');await capture('players');
    await press('Escape');await press('Digit5');await press('Enter');
    await page.waitForFunction(()=>testClient.getState().screen==='settings');await capture('settings-0');
    const difficulty=await page.evaluate(()=>testClient.getState().menu.difficultyIndex);
    await press('KeyE');
    if(await page.evaluate(()=>testClient.getState().menu.difficultyIndex)===difficulty)throw Error('Settings E did not change difficulty');
    await press('KeyQ');
    if(await page.evaluate(()=>testClient.getState().menu.difficultyIndex)!==difficulty)throw Error('Settings Q did not restore difficulty');
    for(let category=1;category<3;category++){await press('ArrowRight');await capture('settings-'+category);}
    await press('Escape');await press('Digit4');await press('Enter');
    await page.waitForFunction(()=>testClient.getState().screen==='loading');await capture('loading');
    await press('Enter');await page.waitForFunction(()=>testClient.getState().screen==='playing');await capture('match');
    await press('KeyP');await page.waitForFunction(()=>testClient.getState().paused);await capture('pause');
    // Presentation fixture: five sets, not a claim of playing a five-set match.
    await page.evaluate(async ()=>{
      const {makeStats}=await import('/src/sim/world.js');const w=testClient.getState().world;
      w.phase='matchover';w.score.winner='a';w.score.sets=[{a:6,b:4},{a:3,b:6},{a:7,b:6},{a:2,b:6},{a:6,b:3}];
      w.setHistory=Array.from({length:5},()=>makeStats());w.stats=makeStats();
    });
    await press('KeyP');await page.waitForFunction(()=>!testClient.getState().paused);await capture('result-0');
    if(width<600||height-64<600)for(let n=1;n<6;n++){await press('ArrowRight');await capture('result-'+n);}
    await page.locator('summary').click();await page.locator('[data-action="help"]').click();
    await page.waitForFunction(()=>!document.getElementById('help-transcript').hidden);
    if(!await page.locator('#help-transcript').textContent())throw Error('Empty help transcript');
    await page.evaluate(()=>testClient.dispose());await page.close();
  }
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(new URL('report.json',directory),JSON.stringify({screenshots:report,errors},null,2)+'\n');
  console.log(`Browser smoke: ${report.length} screenshots, 6 viewport/language cases; native focus, four modes, screens, pause and transcripts passed`);
}finally {
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
