const NS='http://www.w3.org/2000/svg';
const COLOURS=['#176a70','#345b88','#775484','#b16c42','#51889a','#9b5061','#86812e'];
const nice=n=>Number(n.toFixed(2)).toString();

// Angular magnification is explicit and linear: the tick labels retain native
// degrees. True-angle mode is exactly the quarter-circle construction in S2.
export function angularFan(trial,spread=true){
  const extent=spread?Math.max(5,Math.ceil(trial.competitors.at(-1)[1]/5)*5):90;
  const factor=90/extent;
  const angles=[trial.own,...trial.competitors.map(c=>c[1])];
  return {extent,factor,angles,displayAngles:angles.map(v=>v*factor),
    ticks:Array.from({length:spread?5:7},(_,i)=>extent*i/(spread?4:6))};
}

export function mountSplitHalf(root,{document:doc,loadData,cityById,onFollow}){
  let data,city,repeat=0,spread=true,active=0,ticket=0,loading=null;
  const rays=new Map();
  const element=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const svg=(tag,attrs={},text)=>{const e=doc.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
  const heading=element('div','split-heading'),intro=element('div'),title=element('h4'),lead=element('p');intro.append(title,lead);
  const control=element('label','split-repeat','Random split '),select=element('select');select.setAttribute('aria-label','Choose one of the five paper splits');
  for(let i=0;i<5;i++){const o=element('option','',String(i+1)+' of 5');o.value=String(i);select.append(o);}control.append(select);heading.append(intro,control);
  const body=element('div','split-body'),figure=element('figure','split-figure'),toolbar=element('div','split-scale');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Angular display scale');
  const expanded=element('button','','Spread nearby angles'),native=element('button','','True angles');toolbar.append(expanded,native);
  const fan=svg('svg',{viewBox:'0 0 440 430',role:'img','aria-label':'Angular fan of the query, its other half and competing city means'});
  const grid=svg('g'),fanRays=svg('g',{transform:'translate(52 374)'});fan.append(grid,fanRays);
  const caption=element('figcaption');figure.append(toolbar,fan,caption);
  const results=element('div','split-results'),query=element('p','split-query'),ranking=element('div','split-ranking'),summary=element('p','split-summary'),follow=element('button','next-step');
  follow.hidden=true;results.append(query,ranking,summary,follow);body.append(figure,results);
  const context=element('figure','split-context'),contextLabel=element('p','','All 1,000 candidate means'),hist=svg('svg',{viewBox:'0 0 900 150',role:'img','aria-label':'Angular-distance distribution across all 1,000 candidate means'}),contextCaption=element('figcaption');context.append(contextLabel,hist,contextCaption);
  const methods=element('p','split-methods');methods.textContent='Every angle is measured in the original 64 dimensions. The fan shows distance from one query direction; separation between candidate rays does not measure their distance to each other.';
  const status=element('p','load-status');status.setAttribute('role','status');
  const retry=element('button','retry-button','Try loading the split again');retry.hidden=true;
  root.append(heading,body,context,methods,status,retry);
  const xy=(degree,r=310)=>[52+r*Math.sin(degree*Math.PI/180),374-r*Math.cos(degree*Math.PI/180)];
  const points=(x,y,outer,inner,n=5)=>Array.from({length:n*2},(_,i)=>{const a=i*Math.PI/n-Math.PI/2,r=i%2?inner:outer;return [x+r*Math.cos(a),y+r*Math.sin(a)].join(',');}).join(' ');
  function setActive(index){active=index;paintActive();}
  function entries(){const trial=data.cities[city.id].trials[repeat];return [{id:city.id,angle:trial.own},...trial.competitors.map(([i,angle])=>({id:data.ids[i],angle}))];}
  function paintActive(){
    if(!data||!city)return;const candidates=entries();
    [...ranking.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===active)));
    candidates.forEach((c,i)=>{const item=rays.get(c.id);if(!item)return;item.group.setAttribute('opacity',i===active||i===0?'1':'.48');item.line.setAttribute('stroke-width',i===active?'3':'1.8');item.tip.setAttribute('r',i===active?'6':'3.5');});
    const selected=candidates[active];follow.hidden=active===0;follow.textContent=active===0?'':`Follow ${cityById.get(selected.id).name} →`;
  }
  function drawFan(trial,candidates){
    const model=angularFan(trial,spread);grid.replaceChildren();
    for(const r of [105,210,310]){const start=xy(0,r),end=xy(90,r);grid.append(svg('path',{d:`M${start} A${r} ${r} 0 0 1 ${end}`,fill:'none',stroke:'#dce4ea','stroke-width':1}));}
    for(const tick of model.ticks){const a=tick*model.factor,p=xy(a),q=xy(a,318),label=xy(a,339);grid.append(svg('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'#8b9caa'}),svg('text',{x:label[0],y:label[1]+5,'text-anchor':'middle'},nice(tick)+'°'));}
    grid.append(svg('line',{x1:52,y1:374,x2:52,y2:64,stroke:'#172638','stroke-width':1.6}),svg('line',{x1:52,y1:374,x2:362,y2:374,stroke:'#cbd6df'}),svg('polygon',{points:points(52,64,9,4.3),fill:'white',stroke:'#172638','stroke-width':1.7}));
    const keep=new Set(candidates.map(c=>c.id));for(const [id,mark]of rays)if(!keep.has(id)){mark.group.remove();rays.delete(id);}
    // Stable city keys retain each ray through scale changes and repeated splits.
    candidates.forEach((candidate,i)=>{
      let mark=rays.get(candidate.id);
      if(!mark){const group=svg('g',{'data-city-id':candidate.id,class:'split-ray'}),line=svg('line',{x1:0,y1:0,x2:0,y2:-301}),head=svg('path',{d:'M0 -310 L-4 -299 L4 -299 Z'}),tip=svg('circle',{cx:0,cy:-310,r:3.5}),title=svg('title');group.append(line,head,tip,title);fanRays.append(group);mark={group,line,head,tip,title};rays.set(candidate.id,mark);}
      mark.group.style.transform=`rotate(${model.displayAngles[i]}deg)`;
      mark.line.setAttribute('stroke',COLOURS[i]);mark.head.setAttribute('fill',COLOURS[i]);mark.tip.setAttribute('fill',COLOURS[i]);
      mark.title.textContent=`${cityById.get(candidate.id).name}, half A: ${candidate.angle.toFixed(2)}° from ${city.name}, half B`;
    });
    expanded.setAttribute('aria-pressed',String(spread));native.setAttribute('aria-pressed',String(!spread));
    caption.textContent=spread?`Angular scale expanded ×${nice(model.factor)}. Tick labels and readouts show the measured angles.`:'True angular scale, following Figure S2. The upright star is the query at 0°.';
    fan.setAttribute('aria-label',`${city.name}, split ${repeat+1}. Its other half is ${trial.own.toFixed(2)} degrees away. Nearest competitor: ${cityById.get(candidates[1].id).name}, ${candidates[1].angle.toFixed(2)} degrees. ${caption.textContent}`);
  }
  function drawHistogram(trial,candidates){
    hist.replaceChildren();const max=Math.max(...trial.hist),x=degree=>48+degree/180*820;
    hist.append(svg('line',{x1:48,y1:100,x2:868,y2:100,stroke:'#99aab7'}));
    trial.hist.forEach((count,i)=>{if(count){const bar=svg('rect',{x:x(i),y:100-count/max*64,width:820/180+.1,height:count/max*64,fill:'#c0cdd7'});bar.append(svg('title',{},`${i}–${i+1}°: ${count} candidate means`));hist.append(bar);}});
    for(const degree of [0,30,60,90,120,150,180])hist.append(svg('text',{x:x(degree),y:121,'text-anchor':'middle'},degree+'°'));
    hist.append(svg('text',{x:456,y:146,'text-anchor':'middle'},'Angle from the query half'),svg('text',{x:36,y:42,'text-anchor':'end'},max));
    candidates.forEach((c,i)=>hist.append(svg('line',{x1:x(c.angle),y1:20,x2:x(c.angle),y2:104,stroke:COLOURS[i],'stroke-width':i===0?2.5:1.3})));
    contextCaption.textContent='Grey bars count every candidate in 1° bins. Coloured lines locate the correct match and the six competitors highlighted above.';
  }
  function render(){
    if(!data||!city)return;const sample=data.cities[city.id],trial=sample.trials[repeat],candidates=entries();active=Math.min(active,6);
    title.textContent=`${city.name} finds its other half.`;
    lead.textContent=`Split ${repeat+1}: one query mean, 1,000 candidate means. Its own city ranks ${trial.rank}st.`;
    query.textContent=`☆ Query: ${city.name}, half B · ${sample.b.toLocaleString('en-GB')} pixels`;
    select.value=String(repeat);ranking.replaceChildren();
    candidates.forEach((c,i)=>{
      const button=element('button','split-candidate'),swatch=element('i'),label=element('span'),name=element('strong','',cityById.get(c.id).name),detail=element('small','',i===0?'Its other half · A':'Competing city · half A'),angle=element('span','split-angle',c.angle.toFixed(2)+'°');
      swatch.style.background=COLOURS[i];label.append(name,detail);button.append(swatch,label,angle);button.setAttribute('aria-label',`${name.textContent}, ${detail.textContent}, ${c.angle.toFixed(2)} degrees. Highlight this ray.`);
      button.addEventListener('click',()=>setActive(i));button.addEventListener('focus',()=>setActive(i));ranking.append(button);
    });
    summary.textContent=`${(candidates[1].angle-trial.own).toFixed(2)}° closer than the nearest competing mean in this split. Correct in all five splits.`;
    drawFan(trial,candidates);drawHistogram(trial,candidates);paintActive();
    status.textContent=`All ${data.meta.cities.toLocaleString('en-GB')} cities · ${data.meta.countries} countries · ${data.meta.pixels.toLocaleString('en-GB')} sampled urban pixels, 2024. Halves A and B contain different pixels.`;
    body.hidden=false;context.hidden=false;methods.hidden=false;retry.hidden=true;
  }
  select.addEventListener('change',()=>{const value=Number(select.value);if(Number.isInteger(value)&&value>=0&&value<5){repeat=value;render();}});
  expanded.addEventListener('click',()=>{spread=true;render();});native.addEventListener('click',()=>{spread=false;render();});
  follow.addEventListener('click',()=>{if(active>0)onFollow(entries()[active].id);});
  async function show(next){
    root.hidden=!next;if(!next){ticket++;return;}city=next;active=0;const request=++ticket;
    if(data){render();return;}
    title.textContent=`Two halves of ${city.name}`;lead.textContent='Loading the paper’s five recorded splits…';body.hidden=true;context.hidden=true;methods.hidden=true;retry.hidden=true;
    try{data=await (loading||(loading=loadData().catch(error=>{loading=null;throw error;})));if(request===ticket)render();}
    catch(error){if(request===ticket){lead.textContent='The split-half data could not load.';status.textContent='Try again to see the measured angles.';retry.hidden=false;}}
  }
  retry.addEventListener('click',()=>show(city));
  return {show};
}
