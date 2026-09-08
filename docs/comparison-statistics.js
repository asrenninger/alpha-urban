/* Native AlphaEarth readouts and observed distributions; no adapter predictions. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
  const COLOURS=['var(--accent)','var(--navy)'];
  const NAMES={rgb:'Within-city angular spread',ndvi:'Vegetation greenness · NDVI',volume:'Building volume · m³, log scale',smod:'Urbanisation · share of observed pixels',worldcover:'Land cover · share of observed pixels'};
  const LABELS={smod:['Water','Very low rural','Low rural','Rural cluster','Peri-urban','Semi-dense','Dense cluster','Urban centre'],worldcover:['Trees','Shrubland','Grassland','Cropland','Built-up','Bare ground','Snow & ice','Water','Wetland','Mangrove','Moss / lichen']};
  let payload, pending, current, serial=0;
  const number=n=>n.toLocaleString('en-GB');
  function el(tag,attrs={},text) {
    const node=document.createElementNS(NS,tag);
    for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function load() {
    if(payload)return Promise.resolve(payload);
    if(!pending)pending=fetch('data/comparison/statistics.json').then(r=>{
      if(!r.ok)throw new Error('Comparison statistics could not load');
      return r.json();
    }).then(data=>{payload=data;return data;}).catch(e=>{pending=null;throw e;});
    return pending;
  }
  function clear() { serial++;current=null;$('comparison-distributions').hidden=true; }
  async function update(fields,mode) {
    if(fields.length!==2)return;
    const ticket=++serial; current={fields,mode};
    $('comparison-distributions').hidden=false;
    $('comparison-statistics-retry').hidden=true;
    try {
      const data=await load();
      if(ticket!==serial)return;
      render(data,fields,mode);
    } catch(error) {
      if(ticket!==serial)return;
      $('comparison-mean-angle').textContent='—';$('comparison-covariance').textContent='—';
      $('comparison-similarity-note').textContent='Similarity statistics could not load.';
      $('distribution-note').textContent='The distributions could not load. Your city views are still available.';
      $('distribution-plot').replaceChildren();$('distribution-city-key').replaceChildren();
      $('comparison-statistics-retry').hidden=false;
    }
  }
  function render(data,fields,mode) {
    const slugs=fields.map(f=>f.meta.slug);
    const pair=Object.values(data.native.pairs).find(p=>slugs.every(s=>p.slugs.includes(s)));
    if(!pair)throw new Error('Missing pair statistics');
    $('comparison-mean-angle').textContent=pair.all_valid.mean_angle_deg.toFixed(1)+'°';
    $('comparison-covariance').textContent=(pair.all_valid.covariance_overlap_k10*100).toFixed(1)+'%';
    $('comparison-similarity-note').textContent='All displayed pixels · original 64 dimensions · unchanged by colour';
    const series=fields.map((f,i)=>{
      const city=data.distributions.cities[f.meta.slug];
      const values=mode==='rgb'?data.angular_density[f.meta.slug]:city.variables[mode];
      return {name:f.meta.name,slug:f.meta.slug,n:values.n,missing:city.valid_embeddings-values.n,values,colour:COLOURS[i],letter:i?'B':'A'};
    });
    $('distribution-variable').textContent=NAMES[mode];
    const key=$('distribution-city-key');key.replaceChildren();
    series.forEach(s=>{
      const item=document.createElement('span');item.className='distribution-key-item';
      const swatch=document.createElement('i');swatch.style.background=s.colour;swatch.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=s.letter+' · '+s.name;
      const support=document.createElement('small');support.textContent=number(s.n)+' observed'+(s.missing?' · '+number(s.missing)+' missing':'');
      item.append(swatch,label,support);key.append(item);
    });
    const categorical=mode==='smod'||mode==='worldcover';
    const notes={rgb:'Each curve shows the angle of every pixel from its own field’s mean embedding. More mass to the right means greater internal angular spread.',ndvi:'Smoothed observed NDVI, including water. Each city’s curve has area one; height shows concentration, not the number of pixels.',volume:'Smoothed observed building volume on a log axis, including recorded zeros and values above the colour-scale cap. Each curve has area one; missing coverage is excluded.',smod:'Exact shares of observed pixels in each settlement category. The categories are not smoothed or interpolated.',worldcover:'Exact shares of observed pixels in each land-cover class. The categories are not smoothed or interpolated.'};
    $('distribution-note').textContent=notes[mode];
    if(mode==='volume')$('distribution-note').textContent+=' Recorded zero volume: '+series.map(s=>s.name+' '+number(s.values.zeros)).join('; ')+'.';
    draw(series,mode,categorical,data);
  }
  function draw(series,mode,categorical,data) {
    const holder=$('distribution-plot');
    const width=Math.max(300,Math.round(holder.getBoundingClientRect().width||900));
    const narrow=width<600, height=categorical?(narrow?345:315):315;
    const margins={left:52,right:18,top:24,bottom:categorical?(narrow?108:75):56};
    const w=width-margins.left-margins.right,h=height-margins.top-margins.bottom;
    const svg=el('svg',{viewBox:`0 0 ${width} ${height}`,width:'100%',height,role:'img','aria-labelledby':'distribution-svg-title distribution-svg-desc'});
    svg.append(el('title',{id:'distribution-svg-title'},NAMES[mode]+': '+series.map(s=>s.name).join(' and ')));
    const desc=series.map(s=>s.name+': '+number(s.n)+' observed pixels'+(s.missing?', '+number(s.missing)+' missing':'')).join('. ');
    svg.append(el('desc',{id:'distribution-svg-desc'},desc+'. '+$('distribution-note').textContent));
    const max=Math.max(.001,...series.flatMap(s=>categorical?s.values.shares:s.values.density))*1.08;
    const y=v=>margins.top+h*(1-v/max), bottom=y(0);
    for(let i=0;i<=4;i++) {
      const value=max*i/4, py=y(value);
      svg.append(el('line',{x1:margins.left,x2:width-margins.right,y1:py,y2:py,stroke:'var(--grid)','stroke-width':1}));
      svg.append(el('text',{x:margins.left-10,y:py+4,'text-anchor':'end',class:'distribution-tick'},categorical?Math.round(value*100)+'%':(value<10?value.toFixed(1):Math.round(value))));
    }
    svg.append(el('text',{x:margins.left,y:14,class:'distribution-axis-label'},categorical?'Share':'Density'));
    if(categorical) {
      const labels=LABELS[mode],step=w/labels.length;
      series.forEach((s,j)=>s.values.shares.forEach((v,i)=>{
        const bw=Math.min(24,step*.31), px=margins.left+step*(i+.5)+(j?2:-bw-2);
        const bar=el('rect',{x:px,y:y(v),width:bw,height:Math.max(0,bottom-y(v)),fill:s.colour,'fill-opacity':.78});
        bar.append(el('title',{},s.name+' · '+labels[i]+': '+(v*100).toFixed(1)+'% ('+number(s.values.counts[i])+')'));svg.append(bar);
      }));
      labels.forEach((label,i)=>{
        const px=margins.left+step*(i+.5),py=bottom+19;
        svg.append(el('text',{x:px,y:py,'text-anchor':'end',transform:`rotate(-${narrow?55:35} ${px} ${py})`,class:'distribution-tick'},label));
      });
    } else {
      const edges=mode==='rgb'?data.native.angular_histogram.edges_deg:data.distributions.variables[mode].edges;
      const lo=edges[0],hi=edges[edges.length-1],x=v=>margins.left+(v-lo)/(hi-lo)*w;
      series.forEach((s,j)=>{
        const density=s.values.density;
        const points=[[x(lo),y(density[0])],...density.map((v,i)=>[x((edges[i]+edges[i+1])/2),y(v)]),[x(hi),y(density[density.length-1])]];
        const line=points.map((p,i)=>(i?'L':'M')+p.map(v=>v.toFixed(2)).join(',')).join(' ');
        svg.append(el('path',{d:`M${x(lo)},${bottom} `+line.replace(/^M/,'L')+` L${x(hi)},${bottom} Z`,fill:s.colour,'fill-opacity':.23}));
        svg.append(el('path',{d:line,fill:'none',stroke:s.colour,'stroke-width':2.5,...(j?{'stroke-dasharray':'7 4'}:{})}));
      });
      const ticks=mode==='ndvi'?[-1,-.5,0,.5,1]:mode==='rgb'?[0,30,60,90,120,150,180]:[0,...Array.from({length:Math.floor(hi)},(_,i)=>Math.log10(1+10**(i+1)))].filter(v=>v<=hi);
      ticks.forEach(value=>{
        const volume=Math.round(10**value-1);
        const text=mode==='volume'?(volume<1000?number(volume):volume<1e6?(volume/1000)+'k':(volume/1e6)+'m'):String(value);
        svg.append(el('text',{x:x(value),y:bottom+23,'text-anchor':'middle',class:'distribution-tick'},text));
      });
      const label=mode==='ndvi'?'NDVI':mode==='rgb'?(narrow?'Angle from field mean (°)':'Angle from the field’s own mean direction (degrees)'):'Building volume (m³; log scale)';
      svg.append(el('text',{x:margins.left+w/2,y:height-7,'text-anchor':'middle',class:'distribution-axis-label'},label));
    }
    holder.replaceChildren(svg);
  }
  $('comparison-statistics-retry').addEventListener('click',()=>{if(current)update(current.fields,current.mode);});
  let lastWidth=0;
  new ResizeObserver(()=>{
    const width=$('distribution-plot').getBoundingClientRect().width;
    if(Math.abs(width-lastWidth)<1)return;lastWidth=width;
    if(payload&&current)render(payload,current.fields,current.mode);
  }).observe($('distribution-plot'));
  window.ComparisonStatistics={update,clear};
})();
