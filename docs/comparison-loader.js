/* Load the city comparison only when its gallery approaches the viewport. */
(function () {
  'use strict';
  const root = document.getElementById('city-atlas');
  let loading = null;

  function initialize() {
    if (loading) return loading;
    loading = import('./comparison-statistics.js')
      .then(() => import('./comparison.js'))
      .catch(error => {
        loading = null;
        const status = document.getElementById('pair-prompt');
        if (status) status.textContent = 'City views could not load. Reload the page to try again.';
        console.error('City comparison:', error);
      });
    return loading;
  }

  if (!root || !('IntersectionObserver' in window)) {
    initialize();
    return;
  }

  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    initialize();
  }, { rootMargin: '1000px' });
  observer.observe(root);
})();
