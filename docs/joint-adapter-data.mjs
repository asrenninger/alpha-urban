/* Browser-only global display sample and aggregate v2 score summaries.
   Native embeddings, model parameters, heads and training rows are not shipped. */
export const TASKS = ['ndvi','volume','landcover'];
const clamp=value=>Math.max(0,Math.min(1,value));
const abortError=()=>Object.assign(new Error('Selection superseded'),{name:'AbortError'});

export function decodeProjection(buffer) {
  if(buffer.byteLength%6)throw new Error('Incomplete projection');
  return new Int16Array(buffer);
}

export function summarizeScores(scores,model,scope) {
  const record=scores.models[model];
  if(!record||!['test','validation'].includes(scope))throw new Error('Unknown score selection');
  const result={};
  for(const task of TASKS){
    const metric=record[scope][task],values=metric.values.slice();
    result[task]={n:metric.n,mean:metric.mean,values,min:Math.min(...values),max:Math.max(...values)};
  }
  return result;
}

export function summarizeInterpolatedScores(scores,sources,scope) {
  const summaries=sources.map(source=>({factor:source.factor,metrics:summarizeScores(scores,source.model,scope)}));
  const result={};
  for(const task of TASKS){
    const first=summaries[0].metrics[task],seedCount=first.values.length;
    const values=Array.from({length:seedCount},(_,seed)=>summaries.reduce((sum,source)=>sum+source.factor*source.metrics[task].values[seed],0));
    result[task]={n:first.n,mean:summaries.reduce((sum,source)=>sum+source.factor*source.metrics[task].mean,0),values,min:Math.min(...values),max:Math.max(...values)};
  }
  return result;
}

function barycentric(point,triangle,vertices) {
  const [a,b,c]=triangle.map(index=>vertices[index].weights),[x,y]=point;
  const denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(denominator)<1e-12)return null;
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator;
  const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator;
  return [u,v,1-u-v];
}

/* The regular resolution-10 lattice covers the full objective triangle.
   Optional exact result anchors (currently the equal-priority fit) refine that
   mesh. Off-grid audit fits are deliberately excluded by the manifest. */
export function createWeightInterpolator(vertices,vertexIds=null) {
  const allowed=vertexIds?new Set(vertexIds):null;
  const mesh=vertices.filter(vertex=>!allowed||allowed.has(vertex.id));
  const grid=new Map();let resolution=0;
  mesh.forEach((vertex,index)=>{
    const match=/^g(\d\d)_(\d\d)$/.exec(vertex.id);
    if(match){const i=Number(match[1]),j=Number(match[2]);grid.set(`${i},${j}`,index);resolution=Math.max(resolution,i+j);}
  });
  const triangles=[];
  for(let i=0;i<resolution;i++)for(let j=0;j<resolution-i;j++){
    const lower=[grid.get(`${i},${j}`),grid.get(`${i+1},${j}`),grid.get(`${i},${j+1}`)];
    if(lower.every(Number.isInteger))triangles.push(lower);
    if(i+j<=resolution-2){const upper=[grid.get(`${i+1},${j}`),grid.get(`${i+1},${j+1}`),grid.get(`${i},${j+1}`)];if(upper.every(Number.isInteger))triangles.push(upper);}
  }
  if(!triangles.length)throw new Error('Training weights do not cover the objective triangle');

  mesh.forEach((vertex,index)=>{
    if(/^g\d\d_\d\d$/.test(vertex.id))return;
    const hits=[];
    triangles.forEach((triangle,triangleIndex)=>{
      const factors=barycentric(vertex.weights,triangle,mesh);
      if(factors&&Math.min(...factors)>-1e-9)hits.push({triangleIndex,triangle,factors});
    });
    const interior=hits.find(hit=>Math.min(...hit.factors)>1e-8),selected=interior?[interior]:hits;
    if(!selected.length)return;
    const remove=new Set(selected.map(hit=>hit.triangleIndex)),next=triangles.filter((_,triangleIndex)=>!remove.has(triangleIndex));
    for(const hit of selected){
      const zero=hit.factors.findIndex(factor=>Math.abs(factor)<1e-8);
      if(zero<0){const [a,b,c]=hit.triangle;next.push([a,b,index],[b,c,index],[c,a,index]);}
      else{const opposite=hit.triangle[zero],edge=hit.triangle.filter((_,corner)=>corner!==zero);next.push([edge[0],index,opposite],[index,edge[1],opposite]);}
    }
    triangles.splice(0,triangles.length,...next);
  });

  return weights=>{
    const total=weights.reduce((sum,value)=>sum+clamp(value),0)||1,target=weights.map(value=>clamp(value)/total);
    let nearest=0,distance=Infinity;
    mesh.forEach((vertex,index)=>{const d=(vertex.weights[0]-target[0])**2+(vertex.weights[1]-target[1])**2;if(d<distance){distance=d;nearest=index;}});
    if(distance<1e-14)return [{model:mesh[nearest].id,factor:1}];
    let best=null;
    for(const triangle of triangles){
      const factors=barycentric(target,triangle,mesh);if(!factors)continue;
      const margin=Math.min(...factors);if(margin>=-1e-8&&(!best||margin>best.margin))best={triangle,factors,margin};
    }
    if(!best)return [{model:mesh[nearest].id,factor:1}];
    const sources=best.triangle.map((index,corner)=>({model:mesh[index].id,factor:clamp(best.factors[corner])})).filter(source=>source.factor>1e-7);
    const factorTotal=sources.reduce((sum,source)=>sum+source.factor,0);
    return sources.map(source=>({...source,factor:source.factor/factorTotal}));
  };
}

function decodeObservations(buffer,count) {
  if(buffer.byteLength!==count*9)throw new Error('Incomplete observation asset');
  const landcover=new Uint8Array(buffer,0,count),view=new DataView(buffer),ndvi=new Float32Array(count),volume=new Float32Array(count);
  for(let row=0;row<count;row++){
    ndvi[row]=view.getFloat32(count+row*4,true);
    volume[row]=view.getFloat32(count*5+row*4,true);
  }
  return {landcover,ndvi,volume};
}

export function createJointData(baseURL=new URL('./data/joint-adapter-v2/',import.meta.url),{fetchImpl=fetch,maxCacheBytes=8_000_000}={}) {
  const base=new URL(baseURL,import.meta.url),cache=new Map();let cacheBytes=0,controller=null,generation=0,metadataPromise,interpolator,observationsPromise;
  async function request(file,signal){const response=await fetchImpl(new URL(file,base),{signal});if(!response.ok)throw new Error(`Could not load ${file} (${response.status})`);return response;}
  async function metadata(){
    if(!metadataPromise)metadataPromise=Promise.all(['manifest.json','scores.json'].map(async file=>(await request(file)).json())).then(([manifest,scores])=>({manifest,scores})).catch(error=>{metadataPromise=null;throw error;});
    return metadataPromise;
  }
  function put(key,value){
    if(cache.has(key))cacheBytes-=cache.get(key).byteLength;
    cache.delete(key);cache.set(key,value);cacheBytes+=value.byteLength;
    while(cacheBytes>maxCacheBytes&&cache.size>1){const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).byteLength;cache.delete(oldest);}
  }
  async function binary(file,size,signal){
    if(signal?.aborted)throw abortError();
    if(cache.has(file)){const value=cache.get(file);cache.delete(file);cache.set(file,value);return value;}
    const response=await request(file,signal),compressed=await response.arrayBuffer();
    if(compressed.byteLength!==size)throw new Error('Incomplete display asset');
    let value=compressed;
    if(file.endsWith('.gz')){
      if(typeof DecompressionStream==='undefined')throw new Error('This experiment needs a browser with gzip stream support.');
      value=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    if(signal?.aborted)throw abortError();put(file,value);return value;
  }
  async function observations(){
    const {manifest}=await metadata();
    if(!observationsPromise)observationsPromise=binary(manifest.observations.file,manifest.observations.bytes).then(buffer=>decodeObservations(buffer,manifest.sample.retainedRows)).catch(error=>{observationsPromise=null;throw error;});
    return observationsPromise;
  }
  async function loadSelection(sources,weights=null){
    const token=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
    const {manifest,scores}=await metadata();if(signal.aborted)throw abortError();
    for(const source of sources)if(source.model!=='baseline'&&!manifest.vertices.some(vertex=>vertex.id===source.model))throw new Error('Choose a trained setting');
    const [observed,...arrays]=await Promise.all([
      observations(),
      ...sources.map(async source=>{
        const chunk=manifest.chunks[source.model],raw=await binary(chunk.file,chunk.bytes,signal);
        if(raw.byteLength!==chunk.rawBytes)throw new Error('Incomplete decoded projection');
        return {...source,xyz:decodeProjection(raw)};
      })
    ]);
    if(token!==generation||signal.aborted)throw abortError();
    const count=manifest.sample.retainedRows,position=new Float32Array(count*3);
    for(let index=0;index<position.length;index++)position[index]=arrays.reduce((sum,array)=>sum+array.factor*array.xyz[index]*manifest.coordinateScale,0);
    const model=sources.length===1?sources[0].model:'interpolated';
    return {model,weights,sources,interpolated:sources.length>1,count,position,...observed,manifest,scores,
      metrics(scope='test'){return sources.length===1?summarizeScores(scores,model,scope):summarizeInterpolatedScores(scores,sources,scope);},
      baselineMetrics(scope='test'){return summarizeScores(scores,'baseline',scope);}};
  }
  async function loadModel(model='center'){
    const {manifest}=await metadata(),vertex=manifest.vertices.find(item=>item.id===model);
    if(model!=='baseline'&&!vertex)throw new Error('Choose a trained setting');
    return loadSelection([{model,factor:1}],vertex?.weights||null);
  }
  async function loadBlend(weights){
    const {manifest}=await metadata();
    interpolator??=createWeightInterpolator(manifest.vertices,manifest.interpolationVertexIds);
    return loadSelection(interpolator(weights),weights.slice());
  }
  return {metadata,loadModel,loadBlend,cancel(){generation++;controller?.abort();},clearCache(){cache.clear();cacheBytes=0;observationsPromise=null;},cacheInfo(){return {bytes:cacheBytes,entries:cache.size};}};
}
