import {CONTINENTS, clamp, mix, smooth} from './city-evolution-data.mjs';

export const DISPERSION_SCENES = ['centres', 'clouds', 'raw', 'context', 'matched', 'population', 'built_form', 'vintage', 'climate', 'ndvi', 'vh'];

const TITLES = {
  centres: 'Give every city its own centre.', clouds: 'The variation inside the point.',
  raw: 'Dispersion and national development.', context: 'After city context.',
  matched: 'The same model. A common sample.', population: 'Add population distribution.',
  built_form: 'Add the built environment.', vintage: 'Add settlement age.',
  climate: 'Add climate.', ndvi: 'Add vegetation.', vh: 'Add radar structure.',
};
const SHORT_CONTROLS = ['Population · area · collection stage · continent', 'Population spread', 'Built form', 'Settlement age', 'Climate', 'Vegetation', 'Radar'];
const signed = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
const compact = value => value.toLocaleString('en-GB');

// All coordinates are derived from the available stage; no rows are removed
// to fit the plot. Layout functions are also exercised by the portable audit.
export function plotBounds(width, height) {
  const mobile = width < 600;
  return {left: mobile ? 42 : Math.max(200, Math.min(360, width * .30)) + 64,
    right: width - (mobile ? 20 : 32), top: mobile ? 190 : 210,
    bottom: mobile ? height * .53 - 78 : height - 310};
}

export function dispersionLayout(data, scene, width, height, limits = {}) {
  const grid = scene === 'centres' || scene === 'clouds';
  const defaults = plotBounds(width, height);
  if (grid) defaults.bottom += 70;
  const bounds = {...defaults, ...limits};
  const size = Math.min(width, height);
  const normalized = (x, y, alpha = .60, cloud = 0) => [
    (x - (width - size) / 2) / size,
    (y - (height - size) / 2) / size, alpha, cloud,
  ];
  const allY = Object.values(data.stages).flatMap(stage => stage.logValues.filter(Number.isFinite));
  const yMin = Math.floor(Math.min(...allY) * 2) / 2;
  const yMax = Math.ceil(Math.max(...allY) * 2) / 2;
  const x = hdi => bounds.left + (hdi - .35) / .65 * (bounds.right - bounds.left);
  const y = logD => bounds.bottom - (logD - yMin) / (yMax - yMin) * (bounds.bottom - bounds.top);
  const cols = width >= 600 && bounds.right - bounds.left < 560 ? 2 : 4;
  const rows = Math.ceil(data.clouds.length / cols);
  const cellWidth = (bounds.right - bounds.left) / cols;
  const cellHeight = (bounds.bottom - bounds.top + 16) / rows;
  const cloudScale = Math.max(12, Math.min(cellWidth * .43, cellHeight * .36)) / data.cloudExtent;
  const gridCentres = data.clouds.map((_, index) => [
    bounds.left + cellWidth * (index % cols + .5),
    bounds.top + cellHeight * (Math.floor(index / cols) + .44),
  ]);
  const features = new Map(data.clouds.map((cloud, index) => [cloud.id, index]));
  let missing = 0;
  const stage = data.stages[scene];
  const absent = grid ? 0 : stage.logValues.filter(value => value === null).length;
  const points = data.ids.map((id, index) => {
    if (grid) {
      const feature = features.get(id);
      return feature === undefined
        ? normalized((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2, 0)
        : normalized(...gridCentres[feature], .95, scene === 'clouds' ? 1 : 0);
    }
    if (stage.logValues[index] === null) {
      return normalized(bounds.left + (missing++ + .5) / absent * (bounds.right - bounds.left), bounds.bottom + 67, .22);
    }
    return normalized(x(data.hdi[index]), y(stage.logValues[index]), features.has(id) ? .85 : .38);
  });
  return {points, bounds, grid, gridCentres, features, cloudScale, cellHeight,
    normalized, x, y, yMin, yMax};
}

// A frame is a function of scroll position, not elapsed time. Re-evaluating it
// after a resize or caption change cannot finish or restart a transition.
export function dispersionFrame({data, scene, progress, width, height, entry, layouts}) {
  const p = clamp(progress);
  const index = DISPERSION_SCENES.indexOf(scene);
  const previous = DISPERSION_SCENES[index - 1];
  const get = key => layouts?.[key] || dispersionLayout(data, key, width, height);
  const to = get(scene);
  const from = index ? get(previous) : {points: entry};
  const eased = smooth(p);
  const points = to.points.map((target, i) => {
    const start = from.points[i];
    let movement = eased;
    let cloud = mix(start[3] || 0, target[3], eased);
    let alpha = mix(start[2], target[2], eased);
    if (scene === 'centres') {
      const centre = to.normalized((to.bounds.left + to.bounds.right) / 2, (to.bounds.top + to.bounds.bottom) / 2);
      const gather = smooth(p / .38);
      const spread = smooth((p - .38) / .62);
      return [mix(mix(start[0], centre[0], gather), target[0], spread),
        mix(mix(start[1], centre[1], gather), target[1], spread),
        mix(start[2], target[2], smooth((p - .25) / .75)), 0];
    }
    if (scene === 'raw') {
      cloud = 1 - smooth(p / .48);
      movement = smooth((p - .22) / .78);
      if (!to.features.has(data.ids[i])) {
        cloud = 0;
        alpha = target[2] * smooth((p - .48) / .52);
      }
    }
    return [mix(start[0], target[0], movement), mix(start[1], target[1], movement), alpha, cloud];
  });
  const sourceStage = data.stages[previous];
  const targetStage = data.stages[scene];
  return {points, layout: to, cloudLayout: get('clouds'),
    gridAlpha: scene === 'centres' ? smooth((p - .38) / .62) : scene === 'clouds' ? 1 : scene === 'raw' ? 1 - eased : 0,
    scatterAlpha: scene === 'raw' ? smooth((p - .35) / .65) : targetStage ? 1 : 0,
    entryAlpha: scene === 'centres' ? 1 - smooth(p / .38) : 0,
    slope: targetStage ? mix(sourceStage?.slope ?? targetStage.slope, targetStage.slope, eased) : null};
}

export function mountDispersionStory({plot, cities, loadData, document: doc = document}) {
  const $ = id => doc.getElementById(id);
  const sticky = $('through-time').querySelector('.temporal-sticky');
  const heading = $('dispersion-heading');
  const reading = $('dispersion-reading');
  const narration = $('dispersion-narration');
  const steps = [...doc.querySelectorAll('[data-contrast-scene]')];
  let data, pending, scene, active = false, selected = -1, layout;
  let position = 0, entry, entryBackground, entryOverlay, frameState, layouts, dimensions;
  const indexById = new Map(cities.map((city, index) => [city.id, index]));
  const colours = cities.map(city => CONTINENTS[city.continent]);
  const legend = $('dispersion-legend');
  legend.replaceChildren();
  for (const [name, colour] of Object.entries(CONTINENTS)) {
    const item = doc.createElement('span');
    const swatch = doc.createElement('i');
    swatch.style.background = colour;
    item.append(swatch, doc.createTextNode(name));
    legend.append(item);
  }

  function details() {
    const city = cities[selected];
    if (!city || !data) return;
    const stage = data.stages[scene];
    const value = stage?.logValues[selected];
    const cloud = data.clouds.find(item => item.id === city.id);
    $('dispersion-selected').textContent = (scene === 'centres' || scene === 'clouds')
      ? (cloud ? `${city.name} · ${cloud.count} urban-centre observations` : '')
      : `${city.name} · ${city.country} · ${value == null
        ? 'outside this model’s sample; shown in grey below'
        : `HDI ${data.hdi[selected].toFixed(3)} · ${scene === 'raw' ? 'dispersion' : 'adjusted dispersion'} ${Math.exp(value).toFixed(3)} rad²`}`;
  }

  function readout() {
    $('dispersion-view-title').textContent = TITLES[scene];
    const stage = data.stages[scene];
    const controls = $('dispersion-controls');
    controls.replaceChildren();
    // Reserve the complete control ledger from the start, so adding a block
    // never changes the plot bounds. Unused slots have no visible or AX text.
    SHORT_CONTROLS.forEach((label, index) => {
      const chip = doc.createElement('span');
      const included = index < (stage?.controls.length || 0);
      chip.textContent = index === 0 && !included
        ? (stage ? 'No statistical controls' : 'City means centred · shared scale') : label;
      chip.title = stage?.controls[index] || '';
      if (index > 0 && !included) {
        chip.className = 'pending-control';
        chip.setAttribute('aria-hidden', 'true');
      } else if (included && index === stage.controls.length - 1 && scene !== 'matched') chip.className = 'new-control';
      controls.append(chip);
    });
    if (!stage) {
      $('dispersion-estimate').textContent = '';
      $('dispersion-caption').textContent = scene === 'centres'
        ? '2024 · Every centre is its own origin (0, 0). Centring preserves the spread.'
        : `All 2,000 sampled urban-centre observations · common axes and scale · these two directions show ${(100 * data.cloudAxesShare).toFixed(1)}% of the eight clouds’ angular variation.`;
      $('dispersion-sample').textContent = 'Eight cities illustrate the geometry. The global analysis uses the full eligible atlas.';
    } else {
      $('dispersion-estimate').replaceChildren();
      const number = doc.createElement('strong');
      number.textContent = signed(stage.effectPer01);
      $('dispersion-estimate').append(number, doc.createTextNode(' per +0.1 HDI'));
      $('dispersion-caption').replaceChildren(doc.createTextNode(`95% country-clustered interval: ${signed(stage.intervalPer01[0])} to ${signed(stage.intervalPer01[1])}.`));
      const explanation = doc.createElement('span');
      explanation.className = 'dispersion-chart-note';
      explanation.textContent = scene === 'raw'
        ? ' Observed dispersion; the line is the unadjusted fit.'
        : ' Points and line adjust for the listed controls, at a shared reference.';
      explanation.textContent += ' Rings follow the eight example cities.';
      $('dispersion-caption').append(explanation);
      $('dispersion-sample').textContent = `${compact(stage.cities)} cities · ${stage.countries} countries · 2024. ${1000 - stage.cities} without required inputs in grey below the axes.`;
    }
    plot.canvas.setAttribute('aria-label', `${TITLES[scene]} ${stage?.controls.length ? `Controls: ${stage.controls.join('; ')}` : 'No statistical controls'}. ${$('dispersion-estimate').textContent}. ${$('dispersion-caption').textContent}. ${$('dispersion-sample').textContent}`);
    details();
  }

  function label(ctx, text, x, y, align = 'center', colour = '#647482', font = 13) {
    ctx.font = `${font}px "IBM Plex Sans", sans-serif`;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  function background(view) {
    if (!layout || !data || !frameState) return;
    const {ctx} = view;
    const {bounds, normalized} = layout;
    const {gridCentres, cellHeight} = frameState.cloudLayout;
    if (frameState.entryAlpha > 0) {
      ctx.globalAlpha = frameState.entryAlpha;
      entryBackground?.(view);
      entryOverlay?.(view);
    }
    if (frameState.gridAlpha > 0) {
      ctx.globalAlpha = frameState.gridAlpha;
      gridCentres.forEach(([x, y], index) => {
        const half = Math.min(24, cellHeight * .16);
        view.line(normalized(x - half, y), normalized(x + half, y), '#c7d1dc');
        view.line(normalized(x, y - half), normalized(x, y + half), '#c7d1dc');
        label(ctx, data.clouds[index].name, x, y + cellHeight * .45, 'center', '#344054', view.w <= 900 ? 12 : 14);
      });
    }
    if (frameState.scatterAlpha > 0) {
      ctx.globalAlpha = frameState.scatterAlpha;
      for (const tick of [.05, .1, .2, .4, .8, 1.6]) {
        if (Math.log(tick) < layout.yMin || Math.log(tick) > layout.yMax) continue;
        const y = layout.y(Math.log(tick));
        view.line(normalized(bounds.left, y), normalized(bounds.right, y), '#e8eef4');
        label(ctx, String(tick), bounds.left - 10, y + 4, 'right');
      }
      for (const tick of [.4, .5, .6, .7, .8, .9, 1]) {
        label(ctx, tick.toFixed(1), layout.x(tick), bounds.bottom + 23);
      }
      label(ctx, 'National HDI · 2023', (bounds.left + bounds.right) / 2, bounds.bottom + 45);
      label(ctx, `${scene === 'raw' ? 'Dispersion' : 'Adjusted dispersion'} · rad² · log scale`, bounds.left, bounds.top - 17, 'left', '#344054');
      const slope = frameState.slope;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      ctx.clip();
      view.line(normalized(layout.x(.35), layout.y(data.logReference + slope * (.35 - data.hdiReference))),
        normalized(layout.x(1), layout.y(data.logReference + slope * (1 - data.hdiReference))), '#294976', 2.2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // Clouds belong to their city points throughout the transition. Their
    // opacity is a fourth animated coordinate, so they disperse and fold away
    // continuously even when the reader reverses or skips a scene.
    for (const cloud of data.clouds) {
      const index = indexById.get(cloud.id);
      const point = view.points[index];
      if (!point || !(point[3] > .005)) continue;
      const [cx, cy] = view.xy(point);
      ctx.fillStyle = colours[index];
      ctx.globalAlpha = point[3] * .27;
      for (const [x, y] of cloud.points) {
        ctx.beginPath();
        ctx.arc(cx + x * frameState.cloudLayout.cloudScale * point[3], cy - y * frameState.cloudLayout.cloudScale * point[3], view.w < 600 ? 1.25 : 1.65, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function overlay(view) {
    if (!layout || !(frameState.scatterAlpha > 0)) return;
    view.ctx.globalAlpha = frameState.scatterAlpha;
    // A visual highlight only; every eligible city is still rendered and fitted.
    for (const cloud of data.clouds) {
      const index = indexById.get(cloud.id);
      if (data.stages[scene].logValues[index] === null) continue;
      const point = view.points[index];
      if (!point) continue;
      view.ctx.strokeStyle = colours[index];
      view.ctx.lineWidth = 1.25;
      view.ctx.beginPath();
      view.ctx.arc(...view.xy(point), 4.5, 0, Math.PI * 2);
      view.ctx.stroke();
    }
    view.ctx.globalAlpha = 1;
  }

  function render() {
    if (!active || !data || !plot.w) return;
    const top = Math.max(plotBounds(plot.w, plot.h).top, heading.offsetTop + heading.offsetHeight + 36);
    const key = `${plot.w}:${plot.h}:${top}`;
    if (key !== dimensions) {
      dimensions = key;
      layouts = Object.fromEntries(DISPERSION_SCENES.map(key => [key, dispersionLayout(data, key, plot.w, plot.h, {top})]));
    }
    frameState = dispersionFrame({data, scene, progress: position, width: plot.w, height: plot.h, entry, layouts});
    layout = frameState.layout;
    plot.stop?.();
    plot.square = false;
    plot.drawOrder = null;
    plot.background = background;
    plot.overlay = overlay;
    plot.canvas.classList.add('is-point-selectable');
    plot.points = frameState.points;
    plot.pointRadius = mix(Math.max(2.1, plot.size / 165), Math.max(1.8, Math.min(2.5, plot.size / 300)), frameState.scatterAlpha);
    plot.colours = colours.map((colour, index) => !layout.grid && data.stages[scene].logValues[index] === null ? '#9aa5b2' : colour);
    plot.canvas.dataset.dispersionScene = scene;
    plot.canvas.dataset.dispersionProgress = position.toFixed(4);
    plot.canvas.dataset.dispersionPlotTop = top.toFixed(1);
    plot.draw();
    details();
  }

  async function ensureData() {
    if (data) return true;
    try {
      pending ||= loadData().then(value => {
        if (value.ids.length !== cities.length || value.ids.some((id, index) => id !== cities[index].id)) throw Error('City order mismatch');
        data = value;
      });
      await pending;
      $('dispersion-retry').hidden = true;
      return true;
    } catch (error) {
      pending = null;
      if (active) {
        $('dispersion-estimate').textContent = '';
        $('dispersion-caption').textContent = 'The dispersion data could not load. Please try again.';
        $('dispersion-sample').textContent = '';
        $('dispersion-selected').textContent = '';
        $('dispersion-retry').hidden = false;
      }
      return false;
    }
  }

  function sensitivityTable() {
    const target = $('dispersion-sensitivity');
    if (!target || target.children.length || !data) return;
    for (const key of ['matched', 'population', 'built_form', 'vintage', 'climate', 'ndvi', 'vh']) {
      const stage = data.stages[key];
      const broad = stage.largestSample;
      const tr = doc.createElement('tr');
      const values = [key === 'matched' ? 'City context' : SHORT_CONTROLS[stage.controls.length - 1],
        `${signed(stage.effectPer01)} (${signed(stage.intervalPer01[0])}, ${signed(stage.intervalPer01[1])})`,
        `${broad.cities} / ${broad.countries}`,
        `${signed(broad.effectPer01)} (${signed(broad.intervalPer01[0])}, ${signed(broad.intervalPer01[1])})`];
      for (const value of values) { const td = doc.createElement('td'); td.textContent = value; tr.append(td); }
      target.append(tr);
    }
  }

  $('dispersion-retry').addEventListener('click', async () => {
    $('dispersion-retry').hidden = true;
    if (await ensureData()) { readout(); render(); sensitivityTable(); }
  });
  const observer = new ResizeObserver(() => { if (active && data) render(); });
  observer.observe(plot.canvas);
  // Preload once the temporal sequence is near; this asset is small and keeps
  // the point handoff independent of the later full-resolution city fields.
  ensureData().then(ok => { if (ok) sensitivityTable(); });

  return {
    async seek(next, progress = 1) {
      if (!(next in TITLES)) return;
      const changed = scene !== next || !active;
      if (!active) {
        // A direct section link can arrive before the temporal canvas's first
        // animation frame. Its scheduled target already contains every city.
        const snapshot = plot.points.length === cities.length ? plot.points
          : plot.target?.length === cities.length ? plot.target
          : cities.map(() => [.52, .47, .6]);
        entry = snapshot.map(point => [point[0], point[1], point[2], 0]);
        entryBackground = plot.background;
        entryOverlay = plot.overlay;
      }
      scene = next;
      position = clamp(progress);
      active = true;
      sticky.classList.add('is-contrast');
      heading.hidden = reading.hidden = narration.hidden = false;
      if (changed) {
        const original = steps.find(step => step.dataset.contrastScene === next);
        if (original) {
          const copy = original.cloneNode(true);
          copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
          narration.replaceChildren(...copy.childNodes);
          narration.scrollTop = 0;
        }
        $('through-time').classList.add('dispersion-enhanced');
        steps.forEach(step => step.setAttribute('aria-hidden', 'true'));
        $('dispersion-view-title').textContent = TITLES[scene];
        if (!data) $('dispersion-caption').textContent = 'Loading the urban-centre observations…';
      }
      if (await ensureData()) {
        if (changed) readout();
        render();
        sensitivityTable();
      }
    },
    hide() {
      active = false;
      plot.pointRadius = null;
      sticky.classList.remove('is-contrast');
      heading.hidden = reading.hidden = narration.hidden = true;
    },
    select(index) { selected = index; if (active) details(); },
  };
}
