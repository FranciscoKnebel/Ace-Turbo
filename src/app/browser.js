import { createController } from './controller.js';
export { serveIcon } from './controller.js';
import { createMenu } from './menu.js';
import { bindAccessibleUI } from './accessible-ui.js';
import { createKeyboard, pumpHumanInputs } from '../input.js';
import { computeView, drawHelp, drawLoading, drawMatch, drawMatchHud, drawMenu, drawPause, drawPlayers, drawSettings } from '../render.js';
import { createPixiScene } from '../view/pixi/scene.js';
import { createAudio } from '../audio.js';
import { loadMedia } from '../media.js';
import { BOOT_MEDIA } from '../assets/manifest.js';
import { UI_FOOTER_HEIGHT } from '../view/layout.js';
import { detectLang, setLang } from '../i18n.js';
const activeClients = new WeakMap();
export function boot({ createScene = createPixiScene } = {}) {
  const canvas=document.getElementById('game');
  if(activeClients.has(canvas))return activeClients.get(canvas);
  loadMedia({keys:BOOT_MEDIA});
  const ctx=canvas.getContext('2d');
  const keyboard=createKeyboard(window),audio=createAudio(),language=detectLang();
  setLang(language);
  const controller=createController({keyboard,audio,readInputs:pumpHumanInputs,onLanguage:setLang,menu:createMenu({language})});
  let last=performance.now(),rafId=null,disposed=false,view=computeView(window.innerWidth,Math.max(240,window.innerHeight-UI_FOOTER_HEIGHT));
  // Cena WebGL opcional (plano C): quando o PixiJS vendado carrega, a quadra
  // inteira é desenhada no canvas dele e o Canvas 2D fica como sobreposição
  // transparente (HUD, pausa). O #game é elevado explicitamente (#1) para
  // ficar acima do canvas GL; telas 2D opacas cobrem o mundo sem z negativo
  // (com z-index -1 o layer do WebGL não é composto em alguns ambientes).
  // Qualquer falha (import, GPU) cai no fallback 2D atual.
  let engine=null,glue=null;
  function disableEngine() {
    const previous=engine;engine=null;
    try { previous?.destroy(); } catch { /* A lost GPU may also reject cleanup. */ } finally { glue?.remove(); }
  }
  const rendererParam=(typeof location!=='undefined'?new URLSearchParams(location.search).get('renderer'):null);
  if(rendererParam!=='2d'&&typeof document==='object'&&typeof document.createElement==='function'){
    canvas.style.position='relative';canvas.style.zIndex='1';
    glue=document.createElement('canvas');
    glue.setAttribute('aria-hidden','true');
    glue.setAttribute('data-renderer','pending');
    glue.style.cssText='position:fixed;left:0;top:0;pointer-events:none;';
    document.body.insertBefore(glue,document.body.firstChild);
    createScene({canvas:glue,width:window.innerWidth,height:view.height,resolution:Math.min(2,window.devicePixelRatio||1),preference:'webgl'})
      .then((scene)=>{
        if(disposed){scene.destroy();glue.remove();return;}
        engine=scene;
        // Initialization may span a resize/rotation; use the current viewport.
        scene.resize(window.innerWidth,view.height,Math.min(2,window.devicePixelRatio||1));
        glue.setAttribute('data-renderer','webgl');
      })
      .catch(()=>{disableEngine();});
  }
  function resize() {
    const dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.floor(window.innerWidth*dpr);canvas.height=Math.floor(window.innerHeight*dpr);
    canvas.style.width=`${window.innerWidth}px`;canvas.style.height=`${window.innerHeight}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);view=computeView(window.innerWidth,Math.max(240,window.innerHeight-UI_FOOTER_HEIGHT));
    try { engine?.resize(window.innerWidth,view.height,dpr); } catch { disableEngine(); }
  }
  function render() {
    const {screen,menu,world,paused,fx,loading,helpPage}=controller.getState();
    if (screen === 'menu') {
      drawMenu(ctx, view, menu);
      return;
    }
    if (screen === 'settings') {
      drawSettings(ctx, view, menu);
      return;
    }
    if (screen === 'help') {
      controller.setHelpPages(drawHelp(ctx, view, helpPage));
      return;
    }
    if (screen === 'players') {
      drawPlayers(ctx, view, menu);
      return;
    }
    if (screen === 'loading') {
      drawLoading(ctx, view, world, menu, Math.min(1, loading.t / loading.duration));
      return;
    }
    if (engine) {
      // Cena do mundo no WebGL; o Canvas 2D vira overlay de HUD transparente.
      try {
        engine.render(world, view, fx);
        ctx.clearRect(0,0,view.width,view.height);
        drawMatchHud(ctx, world, view, fx);
        if (paused) drawPause(ctx, view);
        return;
      } catch {
        // Draw the full 2D world in this same frame after any scene/GPU failure.
        disableEngine();
      }
    }
    drawMatch(ctx, world, view, fx);
    if (paused) drawPause(ctx, view);
  }


  const ui=bindAccessibleUI(document,controller.actions);
  function frame(now) {
    if(disposed)return;
    const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;
    controller.advance(dt);
    // Clear and clip the reserved HTML footer, including projected court edges.
    ctx.fillStyle='#07211a';ctx.fillRect(0,view.height,window.innerWidth,UI_FOOTER_HEIGHT);
    ctx.save();ctx.beginPath();ctx.rect(0,0,view.width,view.height);ctx.clip();
    try { render(); } finally { ctx.restore(); }
    ui.update(controller.getState());keyboard.endFrame();
    rafId=requestAnimationFrame(frame);
  }
  const onBlur=controller.actions.blur;
  window.addEventListener('resize',resize);window.addEventListener('blur',onBlur);
  resize();rafId=requestAnimationFrame(frame);
  const client = {getState:controller.getState,dispose() {
    if(disposed)return;disposed=true;
    if(rafId!==null)globalThis.cancelAnimationFrame?.(rafId);
    window.removeEventListener?.('resize',resize);window.removeEventListener?.('blur',onBlur);
    disableEngine();
    controller.dispose();keyboard.dispose();audio.dispose();ui.dispose();
    activeClients.delete(canvas);
  }};
  activeClients.set(canvas,client);return client;
}
