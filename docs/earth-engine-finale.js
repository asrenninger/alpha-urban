(() => {
  const finale = document.getElementById('live-earth-engine');
  if (!finale || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(([entry]) => {
    document.body.classList.toggle('earth-engine-active', entry.isIntersecting);
  }, { threshold: 0.12 });

  observer.observe(finale);
})();
