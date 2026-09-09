import {createJointData,TASKS} from './joint-adapter-data.mjs';

const number=n=>n.toLocaleString('en-GB');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const labels={ndvi:['Vegetation','NDVI · root mean square error'],volume:['Building volume','log volume · root mean square error'],landcover:['Land cover','negative log likelihood']};
const weightLabel=weights=>weights.map(w=>(Math.round(w*1000)/10)+'%').join(' / ');
const TRIANGLE={width:360,height:330,a:[180,30],b:[30,30+150*Math.sqrt(3)],c:[330,30+150*Math.sqrt(3)]};

export function mountJointAdapter(root,{loader=createJointData()}={}) {
  const $=selector=>root.querySelector(selector);
  const state={mode:'adapted',selectedModel:'center',weights:[1/3,1/3,1/3],lastSelection:{selectedModel:'center',weights:[1/3,1/3,1/3]},scope:'test',outcome:'landcover',yaw:.65,pitch:-.55};
  const triangle=$('#jo-triangle'),sphere=$('#jo-sphere'),menu=$('#jo-setting');
  let metadata=null,view=null,timer=0,ticket=0,drag=null,frame=0,coloured=null,previewLoading=false,previewQueued=false;
  let displayPosition=null,fromPosition=null,toPosition=null,transitionStart=0;
  const status=text=>{$('#jo-status').textContent=text;};
  function busy(value){$('.jo-view').setAttribute('aria-busy',String(value));$('#jo-scores').setAttribute('aria-busy',String(value));}
  function modelName(){
    if(state.mode==='baseline')return 'Original AlphaEarth';
    if(!state.selectedModel)return 'Interpolated position';
    if(state.selectedModel==='center')return 'Equal priorities';
    const vertex=metadata?.manifest.vertices.find(v=>v.id===state.selectedModel);
    return vertex?weightLabel(vertex.weights):'Selected trained model';
  }
  function color(variable){const probe=document.createElement('span');probe.style.color='var('+variable+')';root.appendChild(probe);const value=getComputedStyle(probe).color;probe.remove();return value;}
  const parseRGB=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);

  function drawTriangle(){
    if(!metadata||root.hidden)return;
    const vertices=metadata.manifest.vertices,{width:w,height:h,a,b,c}=TRIANGLE;
    triangle.setAttribute('viewBox',`0 0 ${w} ${h}`);
    const xy=weights=>[a[0]*weights[0]+b[0]*weights[1]+c[0]*weights[2],a[1]*weights[0]+b[1]*weights[1]+c[1]*weights[2]];
    let svg=`<title>Drag across the v2 joint-objective surface</title><path d="M${a}L${b}L${c}Z" fill="var(--jo-soft)" stroke="var(--jo-line)"/>`;
    for(let i=1;i<10;i++){const t=i/10;for(const [p,q] of [[[t,0,1-t],[t,1-t,0]],[[0,t,1-t],[1-t,t,0]],[[0,1-t,t],[1-t,0,t]]])svg+=`<path d="M${xy(p)}L${xy(q)}" stroke="var(--jo-line)" stroke-width=".45"/>`;}
    vertices.forEach(vertex=>{
      const p=xy(vertex.weights),active=state.mode==='adapted'&&vertex.id===state.selectedModel,audit=vertex.role==='offgrid_check';
      svg+=`<circle cx="${p[0]}" cy="${p[1]}" r="${active?4:audit?2.2:2.5}" fill="${active?'var(--jo-ink)':audit?'var(--jo-panel)':'var(--jo-muted)'}" stroke="${audit?'var(--jo-orange)':'none'}" stroke-width="${audit?1.2:0}" opacity=".82"/>`;
    });
    const anchor=xy(state.weights),opacity=state.mode==='baseline'?'.42':'1';
    svg+=`<circle cx="${anchor[0]}" cy="${anchor[1]}" r="7" fill="var(--jo-panel)" stroke="var(--jo-ink)" stroke-width="2" opacity="${opacity}"/><circle cx="${anchor[0]}" cy="${anchor[1]}" r="12" fill="none" stroke="var(--jo-ink)" opacity="${opacity}"/>`;
    svg+=`<text x="${w/2}" y="17" text-anchor="middle">Vegetation</text><text x="7" y="321">Building volume</text><text x="${w-7}" y="321" text-anchor="end">Land cover</text>`;
    triangle.innerHTML=svg;
  }

  function selection(){
    if(!metadata)return;
    for(let i=0;i<3;i++)$('#jo-w'+i).textContent=(Math.round(state.weights[i]*1000)/10)+'%';
    menu.value=state.mode==='adapted'&&state.selectedModel?state.selectedModel:'__interpolated';
    $('#jo-original').setAttribute('aria-pressed',String(state.mode==='baseline'));
    $('#jo-original').textContent=state.mode==='baseline'?'Return to adapted embedding':'Compare with original AlphaEarth';
    root.querySelectorAll('[data-preset]').forEach(button=>button.setAttribute('aria-pressed',String(state.mode==='adapted'&&button.dataset.preset===state.selectedModel)));
    drawTriangle();
  }

  function colorize(){
    if(!view)return;
    const classes=view.manifest.classes,missing=color('--jo-missing'),palette=[missing],codes=new Map(),seen=new Set();
    const range=state.outcome==='ndvi'?view.manifest.ndviExtent:view.manifest.volumeExtent;
    let gradient;
    if(state.outcome==='landcover')classes.forEach(item=>{codes.set(item.code,palette.length);palette.push(color('--jo-lc'+item.code));});
    else{
      const stops=(state.outcome==='ndvi'?['--jo-ndvi-low','--jo-ndvi-mid','--jo-ndvi-high']:['--jo-volume-low','--jo-volume-high']).map(v=>parseRGB(color(v)));
      gradient=stops.map(a=>`rgb(${a})`).join(',');
      for(let i=0;i<=255;i++){const t=i/255*(stops.length-1),j=Math.min(stops.length-2,Math.floor(t)),f=t-j,a=stops[j].map((v,k)=>Math.round(v*(1-f)+stops[j+1][k]*f));palette.push(`rgb(${a})`);}
    }
    const indices=new Uint16Array(view.count);
    for(let row=0;row<view.count;row++){
      const value=view[state.outcome][row],exists=Number.isFinite(value)&&(state.outcome!=='landcover'||codes.has(value));
      indices[row]=exists?(state.outcome==='landcover'?codes.get(value):1+Math.round(clamp((value-range[0])/(range[1]-range[0]))*255)):0;
      if(exists)seen.add(value);
    }
    coloured={palette,indices};
    const legend=$('#jo-outcome-legend');legend.replaceChildren();
    function chip(label,fill){const span=document.createElement('span'),dot=document.createElement('i');dot.className='jo-dot';dot.style.background=fill;dot.setAttribute('aria-hidden','true');span.append(dot,document.createTextNode(label));legend.append(span);}
    if(state.outcome==='landcover')classes.filter(item=>seen.has(item.code)).forEach(item=>chip(item.name,palette[codes.get(item.code)]));
    else{const ramp=document.createElement('i');ramp.className='jo-color-ramp';ramp.style.background=`linear-gradient(to right,${gradient})`;ramp.setAttribute('aria-hidden','true');legend.append(document.createTextNode(range[0].toFixed(1)),ramp,document.createTextNode(`${range[1].toFixed(1)} ${state.outcome==='ndvi'?'NDVI':'log1p(m³)'}`));}
    sphere.setAttribute('aria-label',`${number(view.count)} visual-sample embeddings from ${number(view.manifest.sample.retainedCities)} cities and ${view.manifest.sample.retainedCountries} countries, coloured by ${labels[state.outcome][0]}, in a shared three-dimensional projection.`);
  }

  function drawSphere(timestamp){
    frame=0;if(!view||!coloured||root.hidden)return;
    const now=Number.isFinite(timestamp)?timestamp:performance.now(),duration=180;
    let blend=1;
    if(fromPosition&&toPosition){const raw=clamp((now-transitionStart)/duration);blend=raw*raw*(3-2*raw);if(raw>=1){displayPosition=toPosition;fromPosition=toPosition=null;}}
    const position=displayPosition||toPosition||view.position,w=sphere.clientWidth,h=sphere.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(!w||!h)return;
    sphere.width=Math.round(w*dpr);sphere.height=Math.round(h*dpr);const ctx=sphere.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    const r=Math.min(w,h)*.44,cx=w/2,cy=h/2;ctx.clearRect(0,0,w,h);ctx.strokeStyle=color('--jo-line');ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(cx,cy,r,r*.24,-.2,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(cx,cy,r*.32,r,.2,0,Math.PI*2);ctx.stroke();
    const cyaw=Math.cos(state.yaw),syaw=Math.sin(state.yaw),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),bins=Array.from({length:16},()=>[]);
    for(let row=0;row<view.count;row++){
      const k=row*3;
      let x=position[k],y=position[k+1],z=position[k+2];
      if(fromPosition&&toPosition){x=fromPosition[k]*(1-blend)+toPosition[k]*blend;y=fromPosition[k+1]*(1-blend)+toPosition[k+1]*blend;z=fromPosition[k+2]*(1-blend)+toPosition[k+2]*blend;}
      const xx=x*cyaw+z*syaw,zz=-x*syaw+z*cyaw,yy=y*cp-zz*sp,depth=y*sp+zz*cp;
      bins[Math.floor(clamp((depth+1)/2)*15)].push([cx+xx*r,cy-yy*r,coloured.indices[row]]);
    }
    const dot=Math.max(.85,Math.min(1.35,r/160));
    bins.forEach((points,j)=>{for(const [x,y,index] of points){ctx.globalAlpha=index?.24+.58*j/15:.14;ctx.fillStyle=coloured.palette[index];ctx.fillRect(x-dot/2,y-dot/2,dot,dot);}});ctx.globalAlpha=1;
    if(fromPosition&&toPosition)schedule();
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(drawSphere);}

  function scores(){
    if(!view)return;
    const actual=view.metrics(state.scope),baseline=view.baselineMetrics(state.scope),container=$('#jo-scores');container.replaceChildren();
    $('#jo-score-note').textContent=view.interpolated?'Barycentric lattice estimate · exact values appear at trained dots':'Exact ensemble score · lower error is better · original AlphaEarth is the reference';
    for(const task of TASKS){
      const a=actual[task],b=baseline[task],change=(a.mean/b.mean-1)*100,domain=view.scores.extents[state.scope][task],x=value=>clamp((value-domain[0])/(domain[1]-domain[0]))*100,card=document.createElement('div');card.className='jo-score';
      const digits=task==='volume'?3:4,changeText=view.model==='baseline'?'Original reference':`${view.interpolated?'Estimated · ':''}${Math.abs(change).toFixed(1)}% ${change>0?'higher error':'lower error'}`;
      card.innerHTML=`<div><div class="jo-score-title">${labels[task][0]}</div><div class="jo-small">${labels[task][1]}</div></div><div class="jo-score-number">${a.mean.toFixed(digits)}</div><div class="jo-change ${change>0?'worse':''}">${changeText}</div><div class="jo-range" aria-label="Range across runs ${a.min.toFixed(4)} to ${a.max.toFixed(4)}; original ${b.mean.toFixed(4)}"><div class="jo-track"></div><div class="jo-baseline-mark" style="left:${x(b.mean)}%"></div><div class="jo-seed-range" style="left:${x(a.min)}%;width:${Math.max(.4,x(a.max)-x(a.min))}%"></div><div class="jo-mean-mark" style="left:${x(a.mean)}%"></div></div><div class="jo-footnote">${number(a.n)} task-valid pixels</div>`;
      container.append(card);
    }
    const scope=state.scope==='test'?'Held-out countries':'Validation countries';
    $('#jo-support').textContent=`${scope} · full task-specific support`;
  }

  function beginTransition(next){
    if(!displayPosition){displayPosition=next.position;fromPosition=toPosition=null;return;}
    if(fromPosition&&toPosition){
      const now=performance.now(),raw=clamp((now-transitionStart)/180),blend=raw*raw*(3-2*raw),current=new Float32Array(displayPosition.length);
      for(let i=0;i<current.length;i++)current[i]=fromPosition[i]*(1-blend)+toPosition[i]*blend;
      displayPosition=current;
    }
    fromPosition=displayPosition.slice();toPosition=next.position;transitionStart=performance.now();
  }

  async function load(quiet=false){
    if(quiet&&previewLoading){previewQueued=true;return;}
    if(quiet){previewLoading=true;previewQueued=false;}
    const current=++ticket,mode=state.mode,selectedModel=state.selectedModel,weights=state.weights.slice();
    if(!quiet||!view)busy(true);$('#jo-retry').hidden=true;
    if(!quiet||!view)status('Loading '+(metadata?modelName():'the v2 global experiment')+'…');
    try{
      const next=mode==='baseline'?await loader.loadModel('baseline'):selectedModel?await loader.loadModel(selectedModel):await loader.loadBlend(weights);
      if(current!==ticket)return;
      beginTransition(next);view=next;metadata={manifest:view.manifest,scores:view.scores};
      if(!menu.options.length){
        const preview=document.createElement('option');preview.value='__interpolated';preview.textContent='Interpolated position';preview.disabled=true;menu.append(preview);
        for(const vertex of metadata.manifest.vertices){const option=document.createElement('option');option.value=vertex.id;const prefix=vertex.role==='offgrid_check'?'Audit check · ':'';option.textContent=vertex.id==='center'?'Equal priorities':prefix+weightLabel(vertex.weights);menu.append(option);}
      }
      $('#jo-view-title').textContent=mode==='baseline'?'Original AlphaEarth':'Adapted embedding';
      const stateText=mode==='baseline'?'reference':view.interpolated?`representation blend of ${view.sources.length} neighbouring fits`:metadata.manifest.vertices.find(vertex=>vertex.id===view.model)?.role==='offgrid_check'?'trained off-grid audit fit':'exact trained ensemble';
      $('#jo-model-state').textContent=modelName()+' · '+stateText;
      const sample=view.manifest.sample;
      status(`${number(sample.retainedRows)} visual points · ${number(sample.retainedCities)} cities · ${sample.retainedCountries} countries`);
      selection();colorize();scores();schedule();busy(false);
    }catch(error){if(current!==ticket||error.name==='AbortError')return;busy(false);status('The requested setting could not load. '+(view?'The previous result remains displayed.':''));$('#jo-retry').hidden=false;}
    finally{if(quiet){previewLoading=false;if(previewQueued&&state.mode==='adapted'){previewQueued=false;setTimeout(()=>load(true),0);}}}
  }

  function chooseModel(model,delay=0){
    if(!metadata)return;const vertex=metadata.manifest.vertices.find(item=>item.id===model);if(!vertex)return;
    if(state.mode==='adapted'&&state.selectedModel===model&&view?.model===model)return;
    state.mode='adapted';state.selectedModel=model;state.weights=vertex.weights.slice();state.lastSelection={selectedModel:model,weights:state.weights.slice()};
    ticket++;loader.cancel();previewQueued=false;clearTimeout(timer);timer=0;selection();busy(true);status('Loading '+modelName()+'…');timer=setTimeout(()=>{timer=0;load();},delay);
  }
  function chooseWeights(weights){
    if(!metadata)return;
    const total=weights.reduce((sum,value)=>sum+clamp(value),0)||1,next=weights.map(value=>clamp(value)/total);
    let exact=null,distance=Infinity;
    metadata.manifest.vertices.filter(vertex=>vertex.role!=='offgrid_check').forEach(vertex=>{const d=vertex.weights.reduce((sum,value,index)=>sum+(value-next[index])**2,0);if(d<distance){distance=d;exact=vertex.id;}});
    state.mode='adapted';state.weights=next;state.selectedModel=distance<1e-10?exact:null;state.lastSelection={selectedModel:state.selectedModel,weights:next.slice()};selection();
    if(!timer)timer=setTimeout(()=>{timer=0;load(true);},16);
  }
  function trianglePick(event){
    if(!metadata)return;
    const rect=triangle.getBoundingClientRect(),x=(event.clientX-rect.left)*TRIANGLE.width/rect.width,y=(event.clientY-rect.top)*TRIANGLE.height/rect.height,{a,b,c}=TRIANGLE;
    const denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator;
    chooseWeights([u,v,1-u-v]);
  }

  triangle.addEventListener('pointerdown',event=>{triangle.setPointerCapture(event.pointerId);trianglePick(event);});
  triangle.addEventListener('pointermove',event=>{if(triangle.hasPointerCapture(event.pointerId))trianglePick(event);});
  triangle.addEventListener('pointerup',event=>{triangle.releasePointerCapture(event.pointerId);});
  menu.addEventListener('change',()=>{if(menu.value!=='__interpolated')chooseModel(menu.value);});
  root.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{if(metadata)chooseModel(button.dataset.preset);}));
  $('#jo-original').addEventListener('click',()=>{
    if(!metadata)return;
    if(state.mode==='baseline'){state.mode='adapted';state.selectedModel=state.lastSelection.selectedModel;state.weights=state.lastSelection.weights.slice();selection();load();}
    else{state.lastSelection={selectedModel:state.selectedModel,weights:state.weights.slice()};state.mode='baseline';state.selectedModel=null;selection();load();}
  });
  $('#jo-scope').addEventListener('change',event=>{state.scope=event.target.value;scores();});
  $('#jo-color').addEventListener('change',event=>{state.outcome=event.target.value;colorize();schedule();});
  $('#jo-retry').addEventListener('click',()=>load());
  $('#jo-left').addEventListener('click',()=>{state.yaw-=.2;schedule();});$('#jo-right').addEventListener('click',()=>{state.yaw+=.2;schedule();});
  sphere.addEventListener('pointerdown',event=>{sphere.setPointerCapture(event.pointerId);drag=[event.clientX,event.clientY];});
  sphere.addEventListener('pointermove',event=>{if(!drag)return;state.yaw+=(event.clientX-drag[0])*.009;state.pitch+=(event.clientY-drag[1])*.009;drag=[event.clientX,event.clientY];schedule();});
  for(const name of ['pointerup','pointercancel'])sphere.addEventListener(name,()=>{drag=null;});
  new ResizeObserver(()=>{drawTriangle();schedule();}).observe(root);
  load();
  return {reload(){load();},clear(){ticket++;clearTimeout(timer);timer=0;previewQueued=false;loader.cancel();view=null;coloured=null;displayPosition=fromPosition=toPosition=null;busy(false);}};
}
