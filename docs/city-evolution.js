import {
  CONTINENTS,
  cityLayouts,
  fetchJSON,
  mix,
  smooth,
} from './city-evolution-data.mjs';
import {mountSplitHalf} from './split-half-view.mjs';
import {mountDispersionStory} from './dispersion-story.mjs';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_CITY_ISO = 'SGP';
let dataPromise;

const getData = () => dataPromise || (dataPromise = Promise.all([
  fetchJSON('data/narrative/cities.json'),
  fetchJSON('data/narrative/globe-order.json'),
]).catch(error => {
  dataPromise = null;
  throw error;
}));

function paletteLegend(element, entries) {
  element.replaceChildren();
  for (const [name, colour] of entries) {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = colour;
    item.append(swatch, document.createTextNode(name));
    element.append(item);
  }
}

class MotionPlot {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.points = [];
    this.colours = [];
    this.pointSizes = [];
    this.square = false;
    this.drawOrder = null;
    this.selected = -1;
    this.frame = 0;
    this.background = () => {};
    this.overlay = () => {};
    this.resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const density = Math.min(devicePixelRatio || 1, 2);
      this.w = bounds.width;
      this.h = bounds.height;
      canvas.width = Math.max(1, Math.round(bounds.width * density));
      canvas.height = Math.max(1, Math.round(bounds.height * density));
      this.ctx.setTransform(density, 0, 0, density, 0, 0);
      this.size = Math.min(this.w, this.h);
      this.draw();
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
  }

  xy(point) {
    return [
      (this.w - this.size) / 2 + point[0] * this.size,
      (this.h - this.size) / 2 + point[1] * this.size,
    ];
  }

  line(start, end, colour = '#dce3e9', width = 1) {
    const a = this.xy(start);
    const b = this.xy(end);
    this.ctx.strokeStyle = colour;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(...a);
    this.ctx.lineTo(...b);
    this.ctx.stroke();
  }

  text(label, point, align = 'center') {
    this.ctx.font = '12px "IBM Plex Sans", sans-serif';
    this.ctx.fillStyle = '#647482';
    this.ctx.textAlign = align;
    this.ctx.fillText(label, ...this.xy(point));
  }

  to(points, colours, duration = 1100) {
    this.colours = colours;
    this.start = this.points.length === points.length
      ? this.points.map(point => point.slice())
      : points.map(point => point.slice());
    this.target = points;
    this.started = performance.now();
    this.duration = reduced ? 0 : duration;
    cancelAnimationFrame(this.frame);

    const tick = now => {
      const progress = this.duration ? smooth((now - this.started) / this.duration) : 1;
      this.points = this.target.map((point, index) => point.map((value, dimension) => (
        mix(this.start[index][dimension], value, progress)
      )));
      this.draw();
      if (progress < 1) this.frame = requestAnimationFrame(tick);
      else this.frame = 0;
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  draw() {
    if (!this.w || !this.h) return;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.globalAlpha = 1;
    this.background(this);
    const dot = Math.max(2.1, this.size / 165);

    const order = this.drawOrder || this.points.map((_, index) => index);
    order.forEach(index => {
      const point = this.points[index];
      if (point[2] < 0.005) return;
      const [x, y] = this.xy(point);
      this.ctx.globalAlpha = point[2];
      this.ctx.fillStyle = this.colours[index] || '#8e9dab';
      if (this.square) {
        const side = this.pointSizes[index] || dot * 2;
        this.ctx.fillRect(x - side / 2, y - side / 2, side, side);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.pointRadius ?? dot, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.ctx.globalAlpha = 1;
    this.overlay(this);
    this.ctx.globalAlpha = 1;
    if (this.selected >= 0 && this.points[this.selected]?.[2] > 0.05) {
      const point = this.xy(this.points[this.selected]);
      this.ctx.strokeStyle = '#172638';
      this.ctx.fillStyle = '#fff';
      this.ctx.lineWidth = this.square ? 2.2 : 2;
      this.ctx.beginPath();
      const radius = this.square ? Math.max(8, (this.pointSizes[this.selected] || 6) * 1.9) : 7;
      this.ctx.arc(...point, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = '#ac3e49';
      this.ctx.beginPath();
      this.ctx.arc(...point, this.square ? Math.max(3.2, radius * 0.34) : 3.3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

function defer(root, initialize) {
  if (!root) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    initialize();
  };
  if (!('IntersectionObserver' in window)) {
    start();
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer.disconnect();
      start();
    }
  }, {rootMargin: '1400px'});
  observer.observe(root);
}

async function mountCities() {
  const timePlot = new MotionPlot($('time-canvas'));
  let dispersionView;
  const cityById = new Map();
  let story;
  let cities;
  let globeOrder;
  let spherePoints;
  let sphereSizes;
  let sphereFrame;
  let timeLayouts;
  let year = 2017;
  let selected = -1;
  let scrollScene = 'sphere';
  let timeScene = 'sphere';
  let pendingSphereSelection = null;
  let playing = false;
  let played = false;
  let timer = null;
  let contrastReturn = null;

  const splitView = mountSplitHalf($('split-half-panel'), {
    document,
    cityById,
    loadData: () => fetchJSON('data/narrative/split-halves.json'),
    onFollow: id => selectCity(cities.findIndex(city => city.id === id)),
  });

  function drawSphere(view) {
    if (!sphereFrame || !window.AlphaUrbanSphere?.drawGlobeChrome) return;
    const centre = view.xy([sphereFrame.cx, sphereFrame.cy]);
    window.AlphaUrbanSphere.drawGlobeChrome(
      view.ctx,
      centre[0],
      centre[1],
      sphereFrame.radius * view.size,
    );
  }

  function drawTimeAxes(view) {
    view.line([0.10, 0.47], [0.94, 0.47]);
    view.line([0.52, 0.07], [0.52, 0.87]);
    for (const tick of [-30, -15, 15, 30]) {
      view.text(`${tick}°`, [0.52 + 0.37 * tick / timeLayouts.maxPath, 0.51]);
      view.text(`${tick}°`, [0.49, 0.47 - 0.37 * tick / timeLayouts.maxPath + 0.01], 'right');
    }
    view.text('PC1 displacement', [0.54, 0.965]);
    view.text('PC2 displacement', [0.52, 0.04]);

    if (timeScene !== 'motion') return;
    const last = Math.max(0, Math.floor(year - 2017));
    cities.forEach((city, index) => {
      if (index === selected) return;
      for (let step = 1; step <= last; step += 1) {
        const point = vector => [
          0.52 + 0.37 * vector[0] / timeLayouts.maxPath,
          0.47 - 0.37 * vector[1] / timeLayouts.maxPath,
        ];
        view.line(
          point(city.path[step - 1]),
          point(city.path[step]),
          '#4868880b',
          1,
        );
      }
    });
  }

  function drawSelectedTimePath(view) {
    if (timeScene !== 'motion' || selected < 0) return;
    const last = Math.max(0, Math.floor(year - 2017));
    const city = cities[selected];
    const point = vector => [
      0.52 + 0.37 * vector[0] / timeLayouts.maxPath,
      0.47 - 0.37 * vector[1] / timeLayouts.maxPath,
    ];
    for (let step = 1; step <= last; step += 1) {
      view.line(point(city.path[step - 1]), point(city.path[step]), '#ac3e49', 2);
    }
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    $('time-go').setAttribute('aria-pressed', 'false');
    $('time-go').textContent = played ? 'View change again ↺' : 'View change over the years →';
  }

  function updateTimeSelection() {
    if (selected < 0) {
      $('time-selection').textContent = 'All 1,000 cities remain in view.';
      return;
    }
    const city = cities[selected];
    $('time-selection').textContent = `${city.name} · path ${city.pathSpeed.toFixed(2)}°/year · net ${city.netSpeed.toFixed(2)}°/year`;
  }

  function renderTime(duration = 1100) {
    if (!cities) return;
    timeLayouts = cityLayouts(cities, year);
    timePlot.overlay = drawSelectedTimePath;
    const colours = cities.map(city => CONTINENTS[city.continent]);
    let points;
    if (timeScene === 'sphere') {
      points = spherePoints;
      timePlot.background = drawSphere;
      timePlot.square = true;
      timePlot.pointSizes = sphereSizes;
      timePlot.drawOrder = spherePoints
        .map((point, index) => [point[2], index])
        .sort((a, b) => a[0] - b[0])
        .map(item => item[1]);
      $('time-year-label').textContent = '2024';
      $('time-caption').textContent = '1,000 cities over the grey density of 273,410 non-city land pixels · 2024.';
      $('time-canvas').setAttribute('aria-label', 'The same 1,000 city directions that ended the opening story.');
    } else if (timeScene === 'origin') {
      points = cities.map(() => [0.52, 0.47, 0.82]);
      timePlot.background = drawTimeAxes;
      timePlot.square = false;
      timePlot.drawOrder = null;
      $('time-year-label').textContent = '2017';
      $('time-caption').textContent = 'Every city translated to its own 2017 origin · 1,000 cities retained.';
      $('time-canvas').setAttribute('aria-label', 'All 1,000 city trajectories collapsed to their shared normalized 2017 origin.');
    } else {
      points = timeLayouts.time;
      timePlot.background = drawTimeAxes;
      timePlot.square = false;
      timePlot.drawOrder = null;
      $('time-year-label').textContent = year;
      $('time-caption').textContent = `All 1,000 cities · ${year} · displacement from each city’s 2017 origin. The displayed axes carry ${(story.pcShare * 100).toFixed(2)}% of variation.`;
      $('time-canvas').setAttribute('aria-label', `All 1,000 city trajectories at ${year}, relative to their own 2017 origins.`);
    }
    $('city-year').value = year;
    $('time-canvas').classList.toggle('is-point-selectable', timeScene !== 'origin');
    timePlot.to(points, colours, duration);
    updateTimeSelection();
  }

  function setScrollScene(next) {
    if (!cities || next === scrollScene) return;
    scrollScene = next;
    stop();
    if (next.startsWith('contrast:')) {
      if (timeScene !== 'contrast') contrastReturn = {scene: timeScene, year};
      timeScene = 'contrast';
      return;
    }
    dispersionView?.hide();
    if (next === 'sphere') {
      timeScene = 'sphere';
      year = 2017;
      $('city-year').disabled = true;
    } else if (contrastReturn) {
      timeScene = contrastReturn.scene === 'sphere' ? 'origin' : contrastReturn.scene;
      year = contrastReturn.year;
      $('city-year').disabled = !played;
      contrastReturn = null;
    } else {
      timeScene = 'origin';
      year = 2017;
      $('city-year').disabled = !played;
    }
    renderTime(1350);
  }

  function playTime() {
    if (playing) {
      stop();
      return;
    }
    played = true;
    playing = true;
    timeScene = 'motion';
    year = 2017;
    $('city-year').disabled = false;
    $('time-go').textContent = 'Pause';
    $('time-go').setAttribute('aria-pressed', 'true');
    renderTime(0);
    if (reduced) {
      year = 2024;
      renderTime(0);
      stop();
      return;
    }
    const step = () => {
      if (!playing) return;
      if (year >= 2024) {
        stop();
        return;
      }
      year += 1;
      renderTime(1000);
      timer = setTimeout(step, 1450);
    };
    timer = setTimeout(step, 500);
  }

  function appendStatistic(root, value, label) {
    const item = document.createElement('div');
    const number = document.createElement('strong');
    const caption = document.createElement('span');
    number.textContent = value;
    caption.textContent = label;
    item.append(number, caption);
    root.append(item);
  }

  function fingerprintDetails() {
    const element = $('selected-city');
    element.replaceChildren();
    if (selected < 0) {
      const prompt = document.createElement('p');
      prompt.textContent = 'No city selected yet. Return to the sphere and choose any point, or use the search in its story card.';
      element.append(prompt);
      splitView.show(null);
      return;
    }

    const city = cities[selected];
    const heading = document.createElement('div');
    const name = document.createElement('strong');
    const context = document.createElement('span');
    name.textContent = city.name;
    context.textContent = `${city.country} · ${city.climate}`;
    heading.append(name, context);

    const statistics = document.createElement('div');
    statistics.className = 'fingerprint-statistics';
    appendStatistic(statistics, city.population.toLocaleString('en-GB'), 'population · 2015');
    appendStatistic(statistics, `${city.pathSpeed.toFixed(2)}° / year`, 'annual path speed');
    appendStatistic(statistics, `${city.netSpeed.toFixed(2)}° / year`, 'endpoint net speed');

    const neighbours = document.createElement('div');
    neighbours.className = 'whole-mean-comparison';
    const neighbourTitle = document.createElement('h3');
    neighbourTitle.textContent = 'Nearest other city means';
    const label = document.createElement('p');
    label.textContent = 'Native 64-dimensional angles · selected city excluded';
    const note = document.createElement('p');
    note.textContent = `${city.name} is 0° from itself. These neighbours compare means built from all sampled pixels; the split-half check below instead compares separate random halves.`;
    const list = document.createElement('div');
    list.className = 'neighbour-list';
    for (const neighbour of city.neighbours) {
      const other = cityById.get(neighbour.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${other.name} · ${neighbour.angle.toFixed(1)}°`;
      button.addEventListener('click', () => selectCity(cities.indexOf(other)));
      list.append(button);
    }
    neighbours.append(neighbourTitle, label, list, note);
    element.append(heading, statistics, neighbours);
    splitView.show(city);
  }

  function selectCity(index, {syncSphere = true} = {}) {
    if (!cities || index < 0 || index >= cities.length) return;
    selected = index;
    timePlot.selected = index;
    const city = cities[index];
    $('atlas-search').value = `${city.name} · ${city.iso}`;
    $('atlas-selection').textContent = `Following ${city.name}. All 1,000 cities remain in view.`;
    $('fingerprint-readout-link').hidden = false;
    $('fingerprint-results-intro').textContent = `${city.name} is highlighted on the same sphere that ended the story. Its identity carries into the temporal and unequal-contrast views below.`;
    if (syncSphere) window.AlphaUrbanSphere?.selectCity(city.id);
    fingerprintDetails();
    dispersionView?.select(index);
    updateTimeSelection();
    timePlot.draw();
  }

  function findCity() {
    if (!cities) return;
    const value = $('atlas-search').value.trim().toLocaleLowerCase();
    if (!value) return;
    const exact = cities.findIndex(city => `${city.name} · ${city.iso}`.toLocaleLowerCase() === value);
    const match = exact >= 0 ? exact : cities.findIndex(city => city.name.toLocaleLowerCase() === value);
    if (match >= 0) selectCity(match);
    else $('atlas-selection').textContent = 'Choose a city from the suggestions.';
  }

  function choosePoint(plot, event) {
    const bounds = plot.canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    let best = -1;
    let distance = 12 * 12;
    plot.points.forEach((point, index) => {
      if (point[2] < 0.05) return;
      const position = plot.xy(point);
      const candidate = (x - position[0]) ** 2 + (y - position[1]) ** 2;
      if (candidate < distance) {
        distance = candidate;
        best = index;
      }
    });
    if (best >= 0) selectCity(best);
  }

  function observeTimeSteps() {
    const steps = [...document.querySelectorAll('[data-time-scene], [data-contrast-scene]')];
    let scheduled = false;
    const update = () => {
      scheduled = false;
      // Geometry, rather than intersection ratios, handles long mobile cards,
      // large scroll jumps, hash navigation and reversing through every scene.
      const active = steps.filter(step => step.getBoundingClientRect().top <= innerHeight * (step.dataset.contrastScene ? .86 : .60)).at(-1) || steps[0];
      steps.forEach(step => step.classList.toggle('active', step === active));
      setScrollScene(active.dataset.contrastScene ? `contrast:${active.dataset.contrastScene}` : active.dataset.timeScene);
      if (active.dataset.contrastScene) {
        const progress = Math.max(0, Math.min(1, (innerHeight * .86 - active.getBoundingClientRect().top) / (innerHeight * .62)));
        dispersionView?.seek(active.dataset.contrastScene, progress);
      }
    };
    const schedule = () => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', schedule, {passive: true});
    update();
  }

  $('atlas-find').addEventListener('click', findCity);
  $('atlas-search').addEventListener('change', findCity);
  $('atlas-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findCity();
    }
  });
  $('time-go').setAttribute('aria-pressed', 'false');
  $('time-go').addEventListener('click', playTime);
  $('city-year').addEventListener('input', event => {
    stop();
    played = true;
    timeScene = 'motion';
    year = Number(event.target.value);
    renderTime(450);
  });
  $('time-canvas').addEventListener('click', event => {
    if (timeScene !== 'origin') choosePoint(timePlot, event);
  });
  $('time-canvas').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || timeScene === 'origin') return;
    event.preventDefault();
    const visible = timePlot.points.map((point, index) => point[2] > .05 ? index : -1).filter(index => index >= 0);
    if (!visible.length) return;
    const current = visible.indexOf(selected);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
    selectCity(visible[next]);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  window.addEventListener('alphaurban:globe-chrome-ready', () => {
    if (timeScene === 'sphere') timePlot.draw();
  });

  window.addEventListener('alphaurban:globe-select', event => {
    const detail = event.detail || {};
    if (!cities) {
      pendingSphereSelection = detail;
      return;
    }
    const id = detail.id || globeOrder.ids[detail.index];
    selectCity(cities.findIndex(city => city.id === id), {syncSphere: false});
  });

  async function initialize() {
    try {
      [story, globeOrder] = await getData();
      cities = story.cities;
      const ids = new Set(cities.map(city => city.id));
      if (cities.length !== 1000 || globeOrder.ids.length !== 1000 || globeOrder.ids.some(id => !ids.has(id))) {
        throw new Error('City identities do not match the 1,000-point globe.');
      }
      cities.forEach(city => cityById.set(city.id, city));
      dispersionView = mountDispersionStory({plot: timePlot, cities,
        loadData: () => fetchJSON('data/narrative/dispersion.json')});
      window.AlphaUrbanSphere?.setCityOrder(globeOrder.ids);

      const exactGlobe = await window.AlphaUrbanSphere?.getGlobeLayout?.();
      if (exactGlobe && exactGlobe.length === cities.length) {
        const byId = new Map(globeOrder.ids.map((id, index) => [id, exactGlobe[index]]));
        spherePoints = cities.map(city => byId.get(city.id).slice(0, 3));
        sphereSizes = cities.map(city => byId.get(city.id)[3]);
        sphereFrame = await window.AlphaUrbanSphere.getGlobeFrame();
      } else {
        spherePoints = cityLayouts(cities).globe;
        sphereSizes = cities.map(() => 6);
        sphereFrame = {cx: 0.5, cy: 0.49, radius: 0.40};
      }

      const options = [...cities].sort((a, b) => a.name.localeCompare(b.name)).map(city => {
        const option = document.createElement('option');
        option.value = `${city.name} · ${city.iso}`;
        return option;
      });
      $('atlas-city-list').replaceChildren(...options);
      $('city-retry').hidden = true;
      $('city-status').textContent = '1,000 cities · 162 countries · 840,776 sampled urban pixels · five split-half repeats.';
      $('atlas-selection').textContent = 'Select a point on the sphere or find a city by name.';
      paletteLegend($('time-key'), [
        ...Object.entries(CONTINENTS),
        ['non-city land · density', '#687386'],
      ]);

      const pendingDetail = pendingSphereSelection;
      pendingSphereSelection = null;
      const initialIndex = pendingDetail
        ? cities.findIndex(city => city.id === (pendingDetail.id || globeOrder.ids[pendingDetail.index]))
        : cities.findIndex(city => city.iso === DEFAULT_CITY_ISO);
      if (initialIndex < 0) throw new Error('The default Singapore anchor is missing.');
      selectCity(initialIndex, {syncSphere: !pendingDetail});

      renderTime(0);
      observeTimeSteps();
    } catch (error) {
      $('city-status').textContent = 'The city identities could not load. Try again.';
      $('atlas-selection').textContent = 'The city identities could not load.';
      $('city-retry').hidden = false;
    }
  }

  $('city-retry').addEventListener('click', initialize);
  await initialize();
}

let citiesMounted = false;
const mountCitiesOnce = () => {
  if (citiesMounted) return;
  citiesMounted = true;
  mountCities();
};
defer(document.querySelector('[data-scene="fingerprints"]'), mountCitiesOnce);
defer($('through-time'), mountCitiesOnce);
