/* Validate the shipped country-robust v3 payload through the real website loader. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createJointData,createWeightInterpolator,decodeProjection,TASKS} from '../docs/joint-adapter-data.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=new URL('../docs/data/joint-adapter-v2/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',base))),scores=JSON.parse(await fs.readFile(new URL('scores.json',base)));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.schema,3);assert.equal(manifest.run,'joint_adapter_v2_20260909/robust_v3');
assert.equal(manifest.vertices.length,81);assert.equal(manifest.interpolationVertexIds.length,69);assert.equal(manifest.metricInterpolationVertexIds.length,67);
assert.equal(manifest.vertices.filter(vertex=>vertex.role==='post_audit_refinement').length,2);
assert.equal(manifest.sample.startingRows,501969);assert.equal(manifest.sample.retainedRows,15970);
assert.equal(manifest.sample.retainedCities,998);assert.equal(manifest.sample.retainedCountries,162);
const interpolate=createWeightInterpolator(manifest.vertices,manifest.interpolationVertexIds);
for(const id of manifest.interpolationVertexIds){const vertex=manifest.vertices.find(item=>item.id===id);assert.deepEqual(interpolate(vertex.weights),[{model:id,factor:1}]);}

let chunkChecks=0;
for(const [model,chunk] of Object.entries(manifest.chunks)){
  const compressed=await fs.readFile(new URL(chunk.file,base));assert.equal(sha(compressed),chunk.sha256);
  const raw=zlib.gunzipSync(compressed);assert.equal(raw.byteLength,chunk.rawBytes);assert.equal(sha(raw),chunk.rawSha256);
  const decoded=decodeProjection(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));assert.equal(decoded.length,manifest.sample.retainedRows*3);chunkChecks++;
}
const observedCompressed=await fs.readFile(new URL(manifest.observations.file,base));
assert.equal(sha(observedCompressed),manifest.observations.sha256);
const observedRaw=zlib.gunzipSync(observedCompressed);assert.equal(observedRaw.byteLength,manifest.observations.rawBytes);assert.equal(sha(observedRaw),manifest.observations.rawSha256);

const requests=[];let fail=null,delay=null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchImpl(url,{signal}={}){
  requests.push(url.pathname);if(signal?.aborted)throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
  if(delay&&url.pathname.includes(delay))await wait(30);
  if(fail&&url.pathname.includes(fail)){fail=null;return new Response('',{status:503});}
  return new Response(await fs.readFile(url));
}
const loader=createJointData(base,{fetchImpl,maxCacheBytes:2_000_000});
let pointChecks=0,maxRadius=0;
for(const vertex of manifest.vertices){
  const view=await loader.loadModel(vertex.id);assert.equal(view.count,manifest.sample.retainedRows);assert.equal(view.model,vertex.id);
  for(let row=0;row<view.count;row++){
    const k=row*3,x=view.position[k],y=view.position[k+1],z=view.position[k+2];assert([x,y,z].every(Number.isFinite));
    maxRadius=Math.max(maxRadius,Math.hypot(x,y,z));pointChecks++;
  }
  for(const task of TASKS){
    const metric=view.metrics('pixel')[task];assert.equal(metric.values.length,1);
    if(scores.models[vertex.id])assert.equal(metric.mean,scores.models[vertex.id].pixel[task].mean);
    else assert(view.scoreInterpolated,'Unscored refinement knots must disclose metric interpolation');
  }
}
assert(maxRadius<=1.0001,'Projected visual points must remain inside the display sphere');
const baseline=await loader.loadModel('baseline'),centre=await loader.loadModel('center');
assert(Math.abs(baseline.metrics().ndvi.mean-0.07645838188537935)<1e-12);
assert(Math.abs(centre.metrics().ndvi.mean-0.061935623984987295)<1e-12);
assert(Math.abs(centre.metrics().volume.mean-0.6437134595989781)<1e-12);
assert(Math.abs(centre.metrics().landcover.mean-0.6304046084010149)<1e-12);
assert(Math.abs(centre.metrics('country').ndvi.mean-0.054222741324546735)<1e-12);
assert(Math.abs(centre.metrics('country').volume.mean-0.590176715478231)<1e-12);
assert(Math.abs(centre.metrics('country').landcover.mean-0.4933515151676571)<1e-12);
for(const task of TASKS)assert.deepEqual(baseline[task],centre[task],'Observed outcomes must not change with model weights');

loader.clearCache();
const blended=await loader.loadBlend([.35,.35,.3]);assert(blended.interpolated);assert(blended.sources.length<=3);assert(Math.abs(blended.sources.reduce((sum,source)=>sum+source.factor,0)-1)<1e-12);
for(const task of TASKS){
  const expected=blended.scoreSources.reduce((sum,source)=>sum+source.factor*scores.models[source.model].pixel[task].mean,0);
  assert(Math.abs(blended.metrics()[task].mean-expected)<1e-12);
}
const left=await loader.loadBlend([.35001,.34999,.3]),right=await loader.loadBlend([.34999,.35001,.3]);
let maximumContinuityStep=0;
for(let i=0;i<left.position.length;i++)maximumContinuityStep=Math.max(maximumContinuityStep,Math.abs(left.position[i]-right.position[i]));
assert(maximumContinuityStep<.01,'A tiny anchor move must produce a tiny geometry move');
assert(loader.cacheInfo().bytes<=2_000_000);

const before=requests.length;await loader.loadBlend([.34999,.35001,.3]);assert.equal(before,requests.length,'Repeated setting should use the cache');
loader.clearCache();delay='g00_00';
const obsolete=loader.loadModel('g00_00').then(()=>false,error=>error.name==='AbortError');
const latest=await loader.loadModel('center');assert(await obsolete);assert.equal(latest.model,'center');delay=null;
loader.clearCache();fail='g00_00';await assert.rejects(loader.loadModel('g00_00'));assert.equal((await loader.loadModel('g00_00')).model,'g00_00');
await assert.rejects(loader.loadModel('untrained-mixture'));

const report={passed:true,sourceRun:manifest.run,trainedSettings:manifest.vertices.length,scoredSettings:Object.keys(scores.models).length-1,interpolationAnchors:manifest.interpolationVertexIds.length,metricInterpolationAnchors:manifest.metricInterpolationVertexIds.length,offgridAuditSettings:manifest.vertices.filter(vertex=>vertex.role==='offgrid_check').length,postAuditRefinementSettings:manifest.vertices.filter(vertex=>vertex.role==='post_audit_refinement').length,projectionChunks:chunkChecks,visualSamplePoints:manifest.sample.retainedRows,visualSampleCities:manifest.sample.retainedCities,visualSampleCountries:manifest.sample.retainedCountries,pointChecks,maxRadius,maximumContinuityStep,continuousRepresentationInterpolation:true,fullTaskScoreSupport:true,pixelAndCountryWeighting:true,cacheRetryAndRaceChecks:true,observedOutcomesFixed:true};
await fs.writeFile(path.join(root,'validation/joint_validation_result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
