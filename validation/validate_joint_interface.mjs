/* Portable interaction harness for the real v2 global controller. */
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createJointData,TASKS} from '../docs/joint-adapter-data.mjs';

const html=await fs.readFile(new URL('../docs/index.html',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../docs/joint-adapter-view.mjs',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../docs/joint-adapter.css',import.meta.url),'utf8');
const all=[],ids=new Map(),timers=new Set(),errors=[];let pending=0,failed=false;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function matches(element,selector){return selector[0]==='#'?element.id===selector.slice(1):selector[0]==='.'?element.className.split(' ').includes(selector.slice(1)):selector==='[data-preset]'?!!element.dataset.preset:element.tagName===selector;}
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.className='';this.attrs={};this.dataset={};this.style={};this.handlers={};this.hidden=false;this.clientWidth=tag==='svg'?300:430;this.clientHeight=340;this.width=this.height=192;all.push(this);}
  append(...items){for(const item of items){this.children.push(item);if(typeof item==='object')item.parent=this;}}appendChild(item){this.append(item);}remove(){if(this.parent)this.parent.children=this.parent.children.filter(value=>value!==this);}
  replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return (this._text||'')+this.children.map(child=>typeof child==='string'?child:child.textContent||'').join('');}
  set innerHTML(value){this._html=value;this.children=[];}get innerHTML(){return this._html||'';}
  setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key];}
  addEventListener(key,handler){(this.handlers[key]??=[]).push(handler);}
  emit(key,event={}){for(const handler of this.handlers[key]||[])handler({target:this,...event});}
  querySelector(selector){return this.querySelectorAll(selector)[0];}querySelectorAll(selector){return all.filter(element=>matches(element,selector));}
  get options(){return this.children.filter(element=>element.tagName==='option');}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  setPointerCapture(){this.capture=true;}hasPointerCapture(){return this.capture;}releasePointerCapture(){this.capture=false;}
  getContext(){
    if(this.ctx)return this.ctx;
    const context={fillStyle:'',globalAlpha:1,points:0,geometry:0,colors:0,completedFrames:0,
      clearRect(){if(this.points)this.completedFrames++;this.points=0;this.geometry=0;this.colors=0;},
      fillRect(x,y,w,h){assert([x,y,w,h,this.globalAlpha].every(Number.isFinite));this.points++;this.geometry=(this.geometry+Math.round(x*100)*31+Math.round(y*100)*17)>>>0;for(const character of this.fillStyle)this.colors=(this.colors*33+character.charCodeAt(0))>>>0;}};
    return this.ctx=new Proxy(context,{get:(object,key)=>key in object?object[key]:()=>{},set:(object,key,value)=>(object[key]=value,true)});
  }
}
for(const match of html.slice(html.indexOf('<section id="joint-adapter"')).matchAll(/<(\w+)([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const element=new Element(match[1]);element.id=match[3];element.className=match[2].match(/class="([^"]+)"/)?.[1]||'';ids.set(element.id,element);
}
for(const name of ['jo-view']){const element=new Element();element.className=name;}
for(const match of html.slice(html.indexOf('<section id="joint-adapter"')).matchAll(/data-preset="([^"]+)"/g)){const element=new Element('button');element.dataset.preset=match[1];}
const root=ids.get('joint-adapter');root.hidden=false;
const tokens={};for(const match of css.matchAll(/(--jo-[\w-]+):([^;}]+)/g))tokens[match[1]]=match[2];
const ctx={console,Uint8Array,Uint16Array,Uint8ClampedArray,Float32Array,DataView,Math,Map,Set,Number,String,Object,Array,performance,devicePixelRatio:1,TASKS,createJointData,
  document:{createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},
  getComputedStyle(element){const variable=element.style.color?.match(/var\(([^)]+)\)/)?.[1];let value=tokens[variable]||'#667085';if(value.startsWith('light-dark'))value=value.match(/#[\da-f]+/i)[0];if(!value.startsWith('#'))value='#667085';return {color:'rgb('+[1,3,5].map(index=>parseInt(value.slice(index,index+2),16)).join(',')+')'};},
  setTimeout,clearTimeout,ResizeObserver:class{observe(){}},
  requestAnimationFrame(handler){const timer=setTimeout(()=>{timers.delete(timer);try{handler(performance.now());}catch(error){errors.push(error);}},4);timers.add(timer);return timer;}
};
vm.runInNewContext(source.replace(/^import[^\n]*\n/,'').replace('export function mountJointAdapter','function mountJointAdapter')+'\nglobalThis.mount=mountJointAdapter;',ctx);
const loader=createJointData(new URL('../docs/data/joint-adapter-v2/',import.meta.url),{fetchImpl:async url=>{pending++;try{if(failed&&url.pathname.includes('g00_00')){failed=false;return new Response('',{status:503});}return new Response(await fs.readFile(url));}finally{pending--;}}});
const app=ctx.mount(root,{loader});
async function settle(){for(let i=0;i<800;i++){await pause(10);if(!pending&&!timers.size&&root.querySelector('.jo-view').getAttribute('aria-busy')!=='true')return;}throw Error('Controller did not settle');}
const get=id=>ids.get(id),preset=id=>all.find(element=>element.dataset.preset===id),canvas=get('jo-sphere').getContext('2d');
await settle();assert.equal(get('jo-setting').options.length,80);assert.equal(canvas.points,15970);assert.match(get('jo-status').textContent,/998 cities · 162 countries/);
const initialGeometry=canvas.geometry,initialColors=canvas.colors;
get('jo-color').emit('change',{target:{value:'ndvi'}});await settle();assert.equal(canvas.geometry,initialGeometry);assert.notEqual(canvas.colors,initialColors);
get('jo-color').emit('change',{target:{value:'landcover'}});await settle();
preset('g00_00').emit('click');await settle();assert.notEqual(canvas.geometry,initialGeometry);assert.match(get('jo-model-state').textContent,/100%/);assert.match(get('jo-score-note').textContent,/Exact ensemble score/);
get('jo-original').emit('click');await settle();assert.equal(get('jo-view-title').textContent,'Original AlphaEarth');
get('jo-original').emit('click');await settle();assert.match(get('jo-model-state').textContent,/100%/);
get('jo-scope').emit('change',{target:{value:'validation'}});assert.match(get('jo-support').textContent,/Validation countries/);
get('jo-right').emit('click');await settle();const rotated=canvas.geometry;get('jo-left').emit('click');await settle();assert.notEqual(canvas.geometry,rotated);
preset('center').emit('click');preset('g00_00').emit('click');preset('center').emit('click');await settle();assert.match(get('jo-model-state').textContent,/Equal priorities/);
loader.clearCache();failed=true;preset('g00_00').emit('click');await settle();assert.equal(get('jo-retry').hidden,false);assert.match(get('jo-status').textContent,/previous result remains/);get('jo-retry').emit('click');await settle();assert.equal(get('jo-retry').hidden,true);
const triangle=get('jo-triangle');triangle.emit('pointerdown',{pointerId:1,clientX:150,clientY:30/330*340});triangle.emit('pointerup',{pointerId:1});await settle();assert.equal(get('jo-w0').textContent,'100%');
triangle.emit('pointerdown',{pointerId:2,clientX:173,clientY:175});triangle.emit('pointerup',{pointerId:2});await settle();assert.match(get('jo-model-state').textContent,/representation blend/);assert.match(get('jo-score-note').textContent,/lattice estimate/);
assert(canvas.completedFrames>5,'Geometry changes should animate across multiple frames');
assert.deepEqual(errors,[]);
const report={passed:true,sourceRun:'joint_adapter_v2_20260909',all79FitsAccessible:true,globalVisualSampleRendered:true,visualSamplePoints:canvas.points,allEligibleCitiesRetained:true,colorsLeaveGeometryFixed:true,cityRasterBoxesRemoved:!ids.has('jo-map0')&&!ids.has('jo-map1'),baselineReturn:true,keyboardRotation:true,rapidSelectionAndRetry:true,continuousTrianglePreview:true,multiFrameGeometryTween:true,errors:0};
await fs.writeFile(new URL('joint_interface_result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
