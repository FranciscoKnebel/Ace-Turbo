import { mulberry32 } from '../../src/sim/rng.js';
export function distribution(values) {
  if(!values.length)return {n:0,min:null,p10:null,median:null,p90:null,max:null,mean:null};
  const sorted=[...values].sort((a,b)=>a-b);
  const quantile=q=>{const x=(sorted.length-1)*q,i=Math.floor(x);return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*(x-i);};
  return {n:sorted.length,min:sorted[0],p10:quantile(.1),median:quantile(.5),p90:quantile(.9),max:sorted.at(-1),mean:sorted.reduce((a,b)=>a+b,0)/sorted.length};
}
// Resample seeds, keeping both sides together. RNG belongs only to this report.
export function seedClusterInterval(records, {resamples=2000,seed=8271}={}) {
  const groups=new Map();
  for(const r of records) {const key=r.options.seed;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  const complete=[...groups.values()].filter(rs=>rs.every(r=>r.completed));
  const clusters=complete.map(rs=>rs.filter(r=>r.winner===(r.swap?'b':'a')).length/rs.length);
  const estimate=clusters.length?clusters.reduce((a,b)=>a+b,0)/clusters.length:null;
  const result={method:'percentile bootstrap by complete seed cluster',confidence:.95,clusters:clusters.length,excludedClusters:groups.size-complete.length,estimate,lower:null,upper:null};
  if(clusters.length<2)return {...result,reason:'at least two complete independent seeds required'};
  const rng=mulberry32(seed),samples=[];
  for(let b=0;b<resamples;b++){let sum=0;for(let i=0;i<clusters.length;i++)sum+=clusters[Math.floor(rng()*clusters.length)];samples.push(sum/clusters.length);}
  samples.sort((a,b)=>a-b);return {...result,resamples,bootstrapSeed:seed,lower:samples[Math.floor(resamples*.025)],upper:samples[Math.ceil(resamples*.975)-1]};
}
