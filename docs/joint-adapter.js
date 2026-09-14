/* The country-robust v3 experiment is global rather than tied to the two-city comparison.
   Defer its data and renderer until the section approaches the viewport. */
(function(){
  const root=document.getElementById('joint-adapter');
  let visible=false,view=null,initializing=null;
  function initialize(){
    if(!visible||view)return;
    if(!initializing)initializing=import('./joint-adapter-view.mjs').then(({mountJointAdapter})=>{
      view=mountJointAdapter(root);
    }).catch(()=>{
      initializing=null;root.querySelector('#jo-status').textContent='The experiment could not load.';
      root.querySelector('#jo-retry').hidden=false;
    });
  }
  root.querySelector('#jo-retry').addEventListener('click',()=>{if(view)view.reload();else initialize();});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);if(visible)initialize();
  },{rootMargin:'500px'}).observe(root);else{visible=true;initialize();}
  // Keep the comparison bridge for compatibility; city choices no longer alter
  // or hide the global adapter experiment.
  window.JointAdapter={select(){initialize();},clear(){}};
})();
