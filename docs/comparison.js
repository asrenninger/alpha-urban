/* City tiles → two maps → the same pixels in a shared sphere projection.
   Independent of the original guided walk; no original scenes are changed. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const BASE = 'data/comparison/';
  const section = $('city-comparison');
  const stage = section.querySelector('.comparison-stage');
  const controls = $('comparison-controls');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WC = {10:['Trees','#2c7a7b'],20:['Shrubland','#719e68'],30:['Grassland','#9bb575'],40:['Cropland','#d99b32'],50:['Built-up','#9d3157'],60:['Bare ground','#a0a6aa'],70:['Snow & ice','#99c5de'],80:['Water','#c7dae7'],90:['Wetland','#4f88bf'],95:['Mangrove','#317f99'],100:['Moss & lichen','#aaa467']};
  const DOU = {10:['Water','#294976'],11:['Very low density rural','#b7c9bc'],12:['Low density rural','#8eb296'],13:['Rural cluster','#527f61'],21:['Suburban / peri-urban','#d99b32'],22:['Semi-dense cluster','#ec8b54'],23:['Dense cluster','#d9515d'],30:['Urban centre','#9d3157']};
  const MISSING = '#d0d3d7';
  const NAMES = {rgb:'false colour', smod:'Urbanisation', ndvi:'NDVI', worldcover:'land cover', volume:'building volume'};
  const RAMPS = {ndvi:[[217,155,50],[141,154,85],[59,124,107]], volume:[[217,155,50],[217,81,93],[157,49,87]]};
  const TYPES = {Uint8Array, Int16Array, Uint16Array};
  const cityCache = new Map(), pairCache = new Map();
  let manifest, selected = [], fields = [], generation = 0, loading = false;
  let colour = 'rgb', morph = 0, target = 0, frame = 0, phase = '', sizes = [];
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x*x*(3-2*x); };
  const number = n => n.toLocaleString('en-GB');
  const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
  function ramp(name, t) {
    const stops = RAMPS[name], x = clamp(t)*2, k = Math.min(1, Math.floor(x)), f=x-k;
    return rgb(stops[k].map((v,j) => Math.round(v+(stops[k+1][j]-v)*f)));
  }
  const rampColours = Object.fromEntries(Object.keys(RAMPS).map(k => [k,Array.from({length:1001},(_,i)=>ramp(k,i/1000))]));

  async function request(file, asJSON=false) {
    const response = await fetch(BASE+file);
    if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
    return asJSON ? response.json() : response.arrayBuffer();
  }
  function cached(cache, key, limit, get) {
    if (cache.has(key)) {
      const value = cache.get(key); cache.delete(key); cache.set(key,value); return value;
    }
    const value = get().catch(error => { cache.delete(key); throw error; });
    cache.set(key,value);
    while (cache.size>limit) cache.delete(cache.keys().next().value);
    return value;
  }
  function loadCity(meta) {
    return cached(cityCache,meta.slug,4,async () => {
      const buffer = await request(meta.file);
      if (buffer.byteLength!==meta.bytes) throw new Error('Incomplete city field');
      const data = {};
      for (const [key,spec] of Object.entries(meta.arrays)) data[key]=new TYPES[spec.type](buffer,spec.byteOffset,spec.length);
      return {meta, data, colours:{}};
    });
  }
  function paintColours(field, mode) {
    if (field.colours[mode]) return field.colours[mode];
    const {data,meta} = field, result = new Array(meta.count);
    for (let i=0; i<meta.count; i++) {
      if (!data.valid[i]) { result[i]=MISSING; continue; }
      if (mode==='rgb') result[i]=data.worldcover[i]===80 ? '#c7dae7' : `rgb(${data.rgb[i*3]},${data.rgb[i*3+1]},${data.rgb[i*3+2]})`;
      else if (mode==='worldcover' || mode==='smod') result[i]=(mode==='worldcover'?WC:DOU)[data[mode][i]]?.[1] || MISSING;
      else if (mode==='ndvi') result[i]=data.ndvi[i]===-32768 ? MISSING : rampColours.ndvi[Math.round(clamp((data.ndvi[i]/10000+.2)/1.1)*1000)];
      else result[i]=data.volume[i]===65535 ? MISSING : rampColours.volume[data.volume[i]];
    }
    field.colours[mode]=result;
    return result;
  }
  function rotate(x,y,z) {
    const cy=Math.cos(.65),sy=Math.sin(.65),cx=Math.cos(-.55),sx=Math.sin(-.55);
    const x1=x*cy+z*sy,z1=-x*sy+z*cy;
    return [x1,y*cx-z1*sx,y*sx+z1*cx];
  }
  const graticule=[];
  for (let lat=-60;lat<=60;lat+=30) {
    const points=[],a=lat*Math.PI/180;
    for(let i=0;i<=96;i++){ const t=i*Math.PI/48; points.push(rotate(Math.cos(a)*Math.cos(t),Math.sin(a),Math.cos(a)*Math.sin(t))); }
    graticule.push(points);
  }
  for (let lon=0;lon<180;lon+=30) {
    const points=[],a=lon*Math.PI/180;
    for(let i=0;i<=96;i++){const t=i*Math.PI/48;points.push(rotate(Math.cos(a)*Math.cos(t),Math.sin(t),Math.sin(a)*Math.cos(t)));}
    graticule.push(points);
  }
  function prepareField(field, coordinates) {
    const n=field.meta.count, position=new Float32Array(n*3), order=Array.from({length:n},(_,i)=>i);
    for(let i=0;i<n;i++) position.set(rotate(coordinates[i*3]/32767,coordinates[i*3+1]/32767,coordinates[i*3+2]/32767),i*3);
    order.sort((a,b)=>position[a*3+2]-position[b*3+2]);
    const map=document.createElement('canvas'); map.width=map.height=field.meta.grid_side;
    const ctx=map.getContext('2d'), image=ctx.createImageData(map.width,map.height), {data}=field;
    for(let i=0;i<n;i++) {
      const c=!data.valid[i]?[208,211,215]:data.worldcover[i]===80?[199,218,231]:data.rgb.subarray(i*3,i*3+3);
      image.data.set(c,i*4); image.data[i*4+3]=255;
    }
    ctx.putImageData(image,0,0);
    return {...field,position,order,map};
  }

  function renderTiles() {
    const wall=$('city-tiles'); wall.replaceChildren();
    for(const city of manifest.cities) {
      const button=document.createElement('button'); button.type='button'; button.className='city-tile';
      button.dataset.slug=city.slug; button.setAttribute('aria-pressed','false');
      button.setAttribute('aria-label',`Choose ${city.name}`);
      const image=document.createElement('img'); image.src=BASE+city.thumbnail; image.alt=''; image.loading='lazy'; image.width=image.height=192;
      const label=document.createElement('span'); label.className='tile-label'; label.textContent=city.name;
      const note=document.createElement('small'); note.textContent=`${city.country} · ${Math.round(city.box.side_m/1000)} km across`; label.append(note);
      const badge=document.createElement('span'); badge.className='tile-selection'; badge.setAttribute('aria-hidden','true');
      button.append(image,label,badge); button.addEventListener('click',()=>pick(city)); wall.append(button);
    }
    updateSelection();
  }
  function updateSelection(message) {
    $('pair-reset').hidden=!selected.some(Boolean);
    $('pair-prompt').textContent=message || (!selected[0] ? (selected[1] ? `${selected[1].name} remains B. Choose a replacement first city (A).` : 'Choose your first city.') : !selected[1] ? `${selected[0].name} selected. Now choose another city.` : `${selected[0].name} and ${selected[1].name}. Click A to replace it, or choose a tile to change B.`);
    $('city-tiles').setAttribute('aria-busy',String(loading));
    document.querySelectorAll('.city-tile').forEach(button=>{
      const slot=selected.findIndex(c=>c?.slug===button.dataset.slug);
      const city=manifest.cities.find(c=>c.slug===button.dataset.slug);
      button.setAttribute('aria-pressed',String(slot>=0));
      button.setAttribute('aria-label',slot<0?`Choose ${city.name}`:`${city.name}, selected as ${slot===0?'A':'B'}`);
      button.querySelector('.tile-selection').textContent=slot===0?'A':slot===1?'B':'';
    });
  }
  function pick(city) {
    if (selected[0]?.slug===city.slug) {
      selected=selected[1] ? [null,selected[1]] : [];
      clearComparison(); updateSelection(); return;
    }
    if (selected[1]?.slug===city.slug) return;
    if (!selected[0]) selected[0]=city; else selected[1]=city;
    updateSelection();
    if(selected[0]&&selected[1]) openPair();
  }
  function clearComparison() {
    generation++; loading=false; fields=[]; sizes=[]; morph=target=0; phase='';
    window.JointAdapter?.clear();
    window.ComparisonStatistics.clear();
    section.hidden=true; $('comparison-methods').hidden=true; controls.disabled=true;
    stage.classList.toggle('show-spheres',false);
  }
  function resetSelection() {
    clearComparison(); selected=[]; updateSelection();
  }
  function changePair() {
    resetSelection();
    $('city-atlas').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
    const first=$('city-tiles').querySelector('button'); if(first) first.focus({preventScroll:true});
  }
  async function openPair() {
    if(!selected[0]||!selected[1]) return;
    const ticket=++generation, chosen=selected.slice(); loading=true;
    window.JointAdapter?.clear();
    updateSelection(`Opening ${chosen[0].name} and ${chosen[1].name}…`);
    try {
      const pair=manifest.pairs.find(p=>chosen.every(c=>p.slugs.includes(c.slug)));
      if(!pair) throw new Error('No shared projection for this pair');
      const [a,b,buffer]=await Promise.all([loadCity(chosen[0]),loadCity(chosen[1]),cached(pairCache,pair.file,3,()=>request(pair.file))]);
      if(ticket!==generation) return;
      if(buffer.byteLength!==pair.bytes) throw new Error('Incomplete shared projection');
      const count=pair.count_each*3;
      fields=[a,b].map(f=>prepareField(f,new Int16Array(buffer,pair.slugs.indexOf(f.meta.slug)*count*2,count)));
      morph=target=0; phase=''; section.hidden=false; $('comparison-methods').hidden=false;
      for(let i=0;i<2;i++) $('comparison-name-'+(i?'b':'a')).textContent=chosen[i].name;
      resize(); setPhase(false); draw(); loading=false; updateSelection();
      window.JointAdapter?.select(chosen.map(c=>c.slug));
      $('comparison-title').focus({preventScroll:true});
      section.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
    } catch(error) {
      if(ticket!==generation) return;
      loading=false; updateSelection('The city pixels could not load.');
      const retry=document.createElement('button'); retry.type='button'; retry.textContent='Try again'; retry.className='pair-retry';
      retry.addEventListener('click',openPair); $('pair-prompt').append(' ',retry);
      console.error('City comparison:',error);
    }
  }
  function legendItem(label,colour) {
    const span=document.createElement('span');span.className='legend-item';
    const chip=document.createElement('i');chip.style.background=colour;chip.setAttribute('aria-hidden','true');
    span.append(chip,document.createTextNode(label));return span;
  }
  function legend() {
    const el=$('comparison-legend');el.replaceChildren();
    if(phase!=='sphere') return;
    if(colour==='rgb') el.append(legendItem('A39 · red','#c84c4c'),legendItem('A62 · green','#4d9372'),legendItem('A08 · blue','#4f88bf'),legendItem('Water','#c7dae7'));
    else if(colour==='smod'||colour==='worldcover') {
      const seen=new Set();
      fields.forEach(f=>f.data[colour].forEach((v,i)=>{if(f.data.valid[i])seen.add(v);}));
      Object.entries(colour==='smod'?DOU:WC).forEach(([code,[label,c]])=>{if(seen.has(Number(code)))el.append(legendItem(label,c));});
    } else {
      const bar=document.createElement('i'); bar.className='legend-ramp'; bar.setAttribute('aria-hidden','true');
      bar.style.background=`linear-gradient(to right,${RAMPS[colour].map(rgb).join(',')})`;
      el.append(document.createTextNode(colour==='ndvi'?'−0.2':'Low volume'),bar,document.createTextNode(colour==='ndvi'?'0.9':'High volume'));
    }
    el.append(legendItem('No data',MISSING));
  }
  function setPhase(spheres) {
    const next=spheres?'sphere':'map';
    if(phase===next) return;
    phase=next; stage.classList.toggle('show-spheres',spheres); controls.disabled=!spheres;
    $('comparison-phase').textContent=spheres?'02 / 02 · IN THE EMBEDDING':'01 / 02 · ON THE MAP';
    $('comparison-title').textContent=spheres?'The same pixels, on two spheres.':'Two cities, in the embedding’s own colours.';
    $('comparison-advance').textContent=spheres?'Back to the maps ↑':'Scroll to follow the pixels ↓';
    updateDescription();
  }
  function updateDescription() {
    const spheres=phase==='sphere';
    for(let i=0;i<fields.length;i++) {
      const m=fields[i].meta,key=i?'b':'a';
      $('comparison-meta-'+key).textContent=spheres?`${number(m.valid_count)} pixels · shared projection`:`${Math.round(m.box.side_m/1000)} km across · ${Math.round(m.cell_size_m)} m cells`;
      $('comparison-canvas-'+key).setAttribute('aria-label',`${m.name}: ${spheres?'embedding sphere coloured by '+NAMES[colour]:'false-colour map'}, ${number(m.valid_count)} valid pixels.`);
    }
    const notes={rgb:'The same axes and camera in both spheres. Choose a measurement to recolour the pixels.',smod:'Urbanisation runs from rural areas to urban centres. GHSL, 2020.',ndvi:'NDVI measures vegetation greenness. Both cities use the same −0.2 to 0.9 scale. Sentinel-2, 2024.',worldcover:'Land cover describes the surface of each pixel. Both cities use the same ESA WorldCover classes, 2021.',volume:'Building volume uses the same square-root colour scale in both cities. Grey marks missing coverage. DLR WSF3D.'};
    $('comparison-note').textContent=spheres?notes[colour]:'The same colours mean the same values in both fields. Pale blue marks water.';
    legend();
    window.ComparisonStatistics.update(fields,colour);
  }
  function resize() {
    if(section.hidden||!fields.length) return;
    sizes=['a','b'].map(key=>{
      const canvas=$('comparison-canvas-'+key), box=canvas.parentElement.getBoundingClientRect();
      const w=Math.max(1,box.width),h=Math.max(1,box.height),dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
      return {ctx,w,h,cx:w/2,cy:h/2};
    });
    const size=Math.min(...sizes.flatMap(s=>[s.w,s.h]))*.96;
    sizes.forEach(s=>{s.mapSize=size;s.radius=size*.47;});
    schedule();
  }
  function globe(ctx,s,t) {
    const r=s.radius;
    ctx.globalAlpha=t;ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(s.cx,s.cy,r,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=.6;
    for(const curve of graticule) {
      ctx.beginPath();curve.forEach((p,i)=>{const x=s.cx+p[0]*r,y=s.cy-p[1]*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
      ctx.strokeStyle='#d6dee6';ctx.stroke();
    }
    ctx.strokeStyle='#9aa5b2';ctx.beginPath();ctx.arc(s.cx,s.cy,r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  function draw() {
    if(section.hidden||sizes.length!==2||fields.length!==2) return;
    for(let side=0;side<2;side++) {
      const f=fields[side],s=sizes[side],ctx=s.ctx,n=f.meta.grid_side;
      ctx.clearRect(0,0,s.w,s.h);
      const left=s.cx-s.mapSize/2,top=s.cy-s.mapSize/2,cell=s.mapSize/n;
      if(morph<.001) {ctx.imageSmoothingEnabled=false;ctx.drawImage(f.map,left,top,s.mapSize,s.mapSize);continue;}
      globe(ctx,s,smooth((morph-.08)/.8));
      const colours=paintColours(f,phase==='sphere'?colour:'rgb');
      const dot=cell*(1-morph)+Math.max(.85,Math.min(1.6,s.radius/200))*morph;
      for(const i of f.order) {
        const valid=f.data.valid[i];if(!valid&&morph>.995)continue;
        const mx=left+((i%n)+.5)*cell,my=top+(Math.floor(i/n)+.5)*cell;
        const sx=s.cx+f.position[i*3]*s.radius,sy=s.cy-f.position[i*3+1]*s.radius;
        const depth=f.position[i*3+2];
        ctx.globalAlpha=valid?1-morph*(depth<0?.65:.12):1-morph;
        ctx.fillStyle=colours[i];ctx.fillRect(mx+(sx-mx)*morph-dot/2,my+(sy-my)*morph-dot/2,dot+.15,dot+.15);
      }
      ctx.globalAlpha=1;
    }
  }
  function readScroll() {
    if(section.hidden||!fields.length)return;
    const box=section.getBoundingClientRect(),span=Math.max(1,section.offsetHeight-stage.offsetHeight);
    const progress=clamp((52-box.top)/span);
    target=reduced?(progress>=.5?1:0):smooth((progress-.15)/.5);
    schedule();
  }
  function schedule() {if(!frame)frame=requestAnimationFrame(tick);}
  function tick() {
    frame=0;
    if(section.hidden||fields.length!==2) return;
    if(reduced||Math.abs(target-morph)<.002)morph=target;else morph+=(target-morph)*.3;
    setPhase(morph>=.995);draw();
    if(Math.abs(target-morph)>.0001)schedule();
  }
  function chooseColour(value) {
    if(!fields.length||!Object.hasOwn(NAMES,value))return;
    colour=value;
    for(const key of Object.keys(NAMES))for(const prefix of ['comparison','distribution'])
      $(prefix+'-colour-'+key).checked=key===colour;
    updateDescription();schedule();
  }
  controls.addEventListener('change',event=>{if(!controls.disabled)chooseColour(event.target.value);});
  $('distribution-controls').addEventListener('change',event=>chooseColour(event.target.value));
  $('pair-reset').addEventListener('click',resetSelection);
  $('choose-pair').addEventListener('click',changePair);
  $('comparison-advance').addEventListener('click',event=>{
    event.preventDefault();
    const top=window.scrollY+section.getBoundingClientRect().top-52;
    const span=section.offsetHeight-stage.offsetHeight;
    window.scrollTo({top:top+(phase==='sphere'?0:span*.72),behavior:reduced?'instant':'smooth'});
  });
  window.addEventListener('scroll',readScroll,{passive:true});
  window.addEventListener('resize',()=>{resize();readScroll();});
  const observer=new ResizeObserver(resize);
  observer.observe(stage);
  for(const key of ['a','b'])observer.observe($('comparison-canvas-'+key).parentElement);
  request('manifest.json',true).then(data=>{manifest=data;renderTiles();}).catch(error=>{
    $('pair-prompt').textContent='City views could not load. Reload the page to try again.';
    console.error('City gallery:',error);
  });
})();
