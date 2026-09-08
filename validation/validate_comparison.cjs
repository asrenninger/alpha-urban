/* Real application + real data in a DOM/canvas harness. No browser automation.
   Checks observable interaction, geometry, colours, loading and failure states. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../docs');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'comparison.js'),'utf8');
const dataRoot=process.env.COMPARISON_DATA_ROOT?path.resolve(process.env.COMPARISON_DATA_ROOT):path.join(root,'data/comparison');
const manifest=JSON.parse(fs.readFileSync(path.join(dataRoot,'manifest.json')));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function harness(reduced=false){
  const all=[],ids=new Map(),events={},errors=[],requests=[],scrolls=[],timers=new Set();
  const delays=new Map(),failures=new Set();let pending=0;
  class Element{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.handlers={};this.hidden=false;this.disabled=false;this._classes=new Set();this._text='';this.offsetHeight=850;this.top=52;this.classList={toggle:(c,on)=>on?this._classes.add(c):this._classes.delete(c),contains:c=>this._classes.has(c)};all.push(this);}
    set className(v){this._classes=new Set(v.split(/\s+/));}get className(){return [...this._classes].join(' ');}
    set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>typeof c==='string'?c:c.textContent||'').join('');}
    setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
    append(...nodes){nodes.forEach(n=>{if(typeof n==='object')n.parentElement=this;this.children.push(n);});}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
    querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
    querySelectorAll(sel){return this.children.flatMap(c=>typeof c==='object'?[...(matches(c,sel)?[c]:[]),...(c.querySelectorAll?c.querySelectorAll(sel):[])]:[]);}
    addEventListener(k,f){(this.handlers[k]??=[]).push(f);}trigger(k,target=this){for(const f of this.handlers[k]||[])f({target,preventDefault(){}});}
    focus(){this.focused=true;}scrollIntoView(){scrolls.push(this.id);if(this.id==='city-comparison'){this.top=52;emit('scroll');}}
    getBoundingClientRect(){return {width:540,height:500,top:this.top};}
    getContext(){
      if(this.ctx)return this.ctx;
      const actual={fillStyle:'',globalAlpha:1,points:0,geometry:0,colours:0,imageDraws:0,
        clearRect(){this.points=0;this.geometry=0;this.colours=0;},
        fillRect(x,y,w,h){assert([x,y,w,h,this.globalAlpha].every(Number.isFinite));this.points++;this.geometry=(this.geometry+Math.round(x*100)*31+Math.round(y*100)*17)>>>0;for(const c of this.fillStyle)this.colours=(this.colours*33+c.charCodeAt(0))>>>0;},
        drawImage(){this.imageDraws++;},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};}};
      this.ctx=new Proxy(actual,{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});return this.ctx;
    }
  }
  const matches=(e,s)=>s.startsWith('.')?e._classes?.has(s.slice(1)):e.tagName===s;
  for(const match of html.matchAll(/<(\w+)([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const el=new Element(match[1]);el.id=match[3];el.hidden=/\bhidden\b/.test(match[2]);el.disabled=/\bdisabled\b/.test(match[2]);
    const classes=match[2].match(/class="([^"]+)"/);if(classes)el.className=classes[1];ids.set(el.id,el);
  }
  const stage=new Element();stage.className='comparison-stage';ids.get('city-comparison').append(stage);ids.get('city-comparison').offsetHeight=2250;
  for(const key of ['a','b']){const wrap=new Element();wrap.append(ids.get('comparison-canvas-'+key));}
  const emit=k=>(events[k]||[]).forEach(f=>f());
  const ctx={console:{log(){},error:(...a)=>errors.push(a)},document:{getElementById:id=>ids.get(id),querySelectorAll:s=>all.filter(e=>matches(e,s)),createElement:t=>new Element(t),createTextNode:t=>({textContent:t})},Uint8Array,Uint16Array,Int16Array,Float32Array,Uint8ClampedArray,Map,Set,Array,Object,Math,Number,String,Promise,Error,JSON,matchMedia:()=>({matches:reduced}),devicePixelRatio:1,scrollY:0,
    addEventListener:(k,f)=>(events[k]??=[]).push(f),scrollTo(o){ids.get('city-comparison').top=52-o.top;scrolls.push(o.top);emit('scroll');},
    ResizeObserver:class{constructor(f){this.f=f;}observe(){}},
    requestAnimationFrame(f){const t=setTimeout(()=>{timers.delete(t);try{f();}catch(e){errors.push(e);}},0);timers.add(t);return t;},
    fetch:async url=>{requests.push(url);pending++;try{if(delays.has(url))await pause(delays.get(url));if(failures.delete(url))return {ok:false,status:503};const b=await fs.promises.readFile(path.join(dataRoot,url.replace(/^data\/comparison\//,'')));return {ok:true,status:200,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}finally{pending--;}}
  };ctx.window=ctx;vm.runInNewContext(source,ctx,{filename:'comparison.js'});
  return {ids,requests,errors,scrolls,delays,failures,stage,
    get:id=>ids.get(id),tile:slug=>ids.get('city-tiles').children.find(b=>b.dataset.slug===slug),
    async settle(){for(let i=0;i<150;i++){await pause(10);if(!pending&&!timers.size&&ids.get('city-tiles').children.length)return;}throw Error('Application did not settle');},
    async sphere(){ids.get('city-comparison').top=-1100;emit('scroll');await this.settle();},
    async maps(){ids.get('city-comparison').top=52;emit('scroll');await this.settle();}
  };
}
(async()=>{
  const h=harness();await h.settle();
  assert.equal(h.get('city-tiles').children.length,8);assert.equal(h.requests.length,1,'No pixel buffers before a pair is selected');
  h.tile('singapore').trigger('click');assert.match(h.get('pair-prompt').textContent,/Now choose another/);assert.equal(h.requests.length,1);
  h.tile('singapore').trigger('click');assert.equal(h.requests.length,1,'Cannot compare a city to itself');
  h.tile('mexico_city').trigger('click');await h.settle();
  assert.equal(h.requests.filter(x=>x.endsWith('.bin')).length,3,'Only two city buffers and one pair projection load');
  assert.equal(h.get('city-comparison').hidden,false);assert.equal(h.get('comparison-controls').disabled,true);
  assert(h.get('comparison-canvas-a').ctx.imageDraws>0);assert(h.get('comparison-canvas-b').ctx.imageDraws>0);
  await h.sphere();assert.equal(h.get('comparison-controls').disabled,false);assert.match(h.get('comparison-title').textContent,/two spheres/);
  const geometries=['a','b'].map(k=>h.get('comparison-canvas-'+k).ctx.geometry),colours=[new Set(),new Set()];
  for(const mode of ['rgb','smod','ndvi','worldcover','volume']){
    h.get('comparison-controls').trigger('change',{value:mode});await h.settle();
    for(const [i,key]of ['a','b'].entries()){
      const c=h.get('comparison-canvas-'+key).ctx;assert.equal(c.geometry,geometries[i],'Colour toggles must not move the pixels');
      assert.equal(c.points,36864,'All valid pixels, including water, must be retained');colours[i].add(c.colours);
    }
    assert.match(h.get('comparison-canvas-a').getAttribute('aria-label'),/sphere coloured by/);
  }
  assert.equal(colours[0].size,5);assert.equal(colours[1].size,5,'Every colour mode changes both views');
  await h.maps();assert(h.get('comparison-controls').disabled);assert.match(h.get('comparison-meta-a').textContent,/51 km/);
  const before=h.get('comparison-canvas-a').ctx.imageDraws;h.get('comparison-controls').trigger('change',{value:'ndvi'});await h.settle();
  assert.equal(h.get('comparison-canvas-a').ctx.imageDraws,before,'Disabled controls cannot silently alter an unseen view');
  h.delays.set('data/comparison/london.bin',180);h.tile('london').trigger('click');h.tile('new_york').trigger('click');await h.settle();
  assert.equal(h.get('comparison-name-b').textContent,'New York','Late requests cannot replace the latest pair');
  await h.sphere();assert.equal(h.get('comparison-canvas-b').ctx.points,26592,'Missing embeddings must be omitted, not invented');
  h.failures.add('data/comparison/lagos.bin');h.tile('lagos').trigger('click');await h.settle();assert.match(h.get('pair-prompt').textContent,/could not load/);
  const retry=h.get('pair-prompt').querySelector('button');assert(retry);retry.trigger('click');await h.settle();assert.equal(h.get('comparison-name-b').textContent,'Lagos');
  h.get('pair-reset').trigger('click');assert.match(h.get('pair-prompt').textContent,/first city/);
  // Every supported pair can be selected in either order; the manifest's two
  // coordinate arrays must be associated with city ids, never selection order.
  let tested=0;const bulk=harness(true);await bulk.settle();
  for(const pair of manifest.pairs){
    let firstGeometry;
    for(const order of [pair.slugs,[...pair.slugs].reverse()]){
      bulk.get('pair-reset').trigger('click');bulk.tile(order[0]).trigger('click');bulk.tile(order[1]).trigger('click');await bulk.settle();await bulk.sphere();
      for(const [i,k] of ['a','b'].entries()){
        const m=manifest.cities.find(c=>c.slug===order[i]);assert.equal(bulk.get('comparison-name-'+k).textContent,m.name);assert.equal(bulk.get('comparison-canvas-'+k).ctx.points,m.valid_count);
      }
      const geometry=['a','b'].map(k=>bulk.get('comparison-canvas-'+k).ctx.geometry);
      if(firstGeometry)assert.deepEqual(geometry,[...firstGeometry].reverse(),'Reversing city selection must reverse the correct coordinate arrays');else firstGeometry=geometry;
      tested++;
    }
  }
  assert.equal(h.errors.length,1,'Only the intentionally injected load failure should be logged');
  assert.equal(bulk.errors.length,0);
  bulk.get('pair-reset').trigger('click');bulk.tile('singapore').trigger('click');bulk.tile('melbourne').trigger('click');await bulk.settle();await bulk.sphere();
  const melbourne=bulk.get('comparison-canvas-b').ctx,melbourneGeometry=melbourne.geometry,melbourneColours=new Set();
  for(const mode of ['rgb','smod','ndvi','worldcover','volume']){
    bulk.get('comparison-controls').trigger('change',{value:mode});await bulk.settle();assert.equal(melbourne.geometry,melbourneGeometry);melbourneColours.add(melbourne.colours);
  }
  assert.equal(melbourneColours.size,5,'Melbourne must have all four working measured layers');
  const reduced=harness(true);await reduced.settle();reduced.tile('dubai').trigger('click');reduced.tile('london').trigger('click');await reduced.settle();await reduced.sphere();assert.equal(reduced.get('comparison-controls').disabled,false);await reduced.maps();assert.equal(reduced.get('comparison-controls').disabled,true);assert.equal(reduced.errors.length,0);
  const result={status:'passed',city_pairs_tested_in_both_orders:tested,colour_modes:5,checks:['two-click selection','on-demand payloads','scroll to spheres and back','same geometry across colour modes','both cities visibly recoloured','invalid embedding masks','all eight cities and all 28 shared projections','Melbourne measured layers','selection race','load failure and retry','selection reset','reduced motion'],initial_pair_payload_bytes:2*manifest.cities[0].bytes+manifest.pairs[0].bytes};
  fs.writeFileSync(path.join(__dirname,'validation_result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
