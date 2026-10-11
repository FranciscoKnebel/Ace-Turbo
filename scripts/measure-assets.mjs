// Local HTTP measurement, not a browser/network performance claim.
import { createStaticServer } from './serve.js';
import { MEDIA_SOURCES, ICON_SOURCES, BOOT_MEDIA } from '../src/assets/manifest.js';
import { statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { distribution } from './lib/report-statistics.mjs';
export async function measureAssets() {
  const all=[...Object.values(MEDIA_SOURCES),...Object.values(ICON_SOURCES)],boot=BOOT_MEDIA.map(key=>MEDIA_SOURCES[key]);
  const server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/`,policies={};
  try {
    for(const [policy,files] of Object.entries({previousEager:all,currentBoot:boot})) {
      const durations=[];
      for(let trial=0;trial<5;trial++) {
        const started=performance.now();
        await Promise.all(files.map(async path=>{const r=await fetch(url+path);if(!r.ok)throw Error(path+': '+r.status);await r.arrayBuffer();}));
        durations.push(performance.now()-started);
      }
      policies[policy]={requests:files.length,bytes:files.reduce((n,path)=>n+statSync(new URL('../'+path,import.meta.url)).size,0),durationMs:distribution(durations)};
    }
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  return {node:process.version,protocol:'5 concurrent-fetch batches over localhost; ordered policies, warm OS cache; excludes Image decode/render and real network',policies};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=await measureAssets();const output=JSON.stringify(report,null,2)+'\n';
  if(process.argv[2])writeFileSync(process.argv[2],output);else console.log(output);
}
