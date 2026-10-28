import assert from 'node:assert/strict';
import { runBrowserSuite } from './lib/browser-harness.mjs';

await runBrowserSuite('graphics', {
  async webglAndRuntimeFallback({ open }) {
    const game = await open();
    // Own the real Pixi scene to inject a GPU failure after successful frames.
    const ready = await game.page.evaluate(async () => {
      testClient.dispose();
      const {boot} = await import('/src/app/browser.js');
      const {createPixiScene} = await import('/src/view/pixi/scene.js');
      globalThis.testScene = null;
      testClient = boot({createScene: async options => {
        const scene = await createPixiScene(options);
        globalThis.testScene = scene;
        return scene;
      }});
      // No RAF polling: the controlled scheduler is advanced explicitly.
      for (let i = 0; i < 300 && document.querySelector('[data-renderer="pending"]'); i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return !!testScene;
    });
    // WebGL is optional on headless platforms. Explicitly report availability.
    if (!ready) { await game.finish(); return {webglAvailable:false, fallback:'initialization'}; }
    await game.start('demo'); await game.step(.2);
    assert.equal(await game.page.evaluate(() => !!document.querySelector('[data-renderer="webgl"]')), true);
    // A Canvas ellipse with a partial sweep must reach Pixi as a partial path.
    const partial = await game.page.evaluate(() => {
      const p = testScene.painter;
      p.reset(); p.beginPath(); p.ellipse(100,100,40,17,0,0,Math.PI/2); p.stroke();
      return testScene.app.stage.children.length;
    });
    assert.ok(partial > 0);
    const failure = await game.page.evaluate(() => {
      const extension = testScene.app.renderer.gl.getExtension('WEBGL_lose_context');
      if (extension) { extension.loseContext(); return 'real context loss'; }
      testScene.app.renderer.render = () => { throw Error('injected GPU failure'); };
      return 'render exception';
    });
    await game.step(.1);
    const result = await game.page.evaluate(() => ({ layers:document.querySelectorAll('[data-renderer]').length,
      frames:browserTest.pendingFrames(), screen:testClient.getState().screen,
      // A full 2D fallback paints the opaque sky, whereas the HUD leaves it transparent.
      skyAlpha:document.getElementById('game').getContext('2d').getImageData(10,10,1,1).data[3] }));
    assert.deepEqual(result,{layers:0,frames:1,screen:'playing',skyAlpha:255});
    await game.finish(); return {webglAvailable:true,partialPaths:true,failure,runtimeFallback:result};
  },
  async forced2D({open}) {
    const game=await open({renderer:'2d'});await game.start('demo');await game.step(.2);
    assert.equal(await game.page.evaluate(()=>document.querySelectorAll('[data-renderer]').length),0);
    await game.finish();return {forced2D:true};
  },
});
