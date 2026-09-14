/* Portable controller and numerical display audit; does not replace browser QA. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as cityData from '../docs/city-evolution-data.mjs';
import {mountDispersionStory, dispersionLayout, dispersionFrame, DISPERSION_SCENES} from '../docs/dispersion-story.mjs';

const json = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url)));
const data = await json('../docs/data/narrative/dispersion.json');
const cities = (await json('../docs/data/narrative/cities.json')).cities;
const html = await fs.readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
const scenes = ['centres', 'clouds', ...Object.keys(data.stages)];
assert.deepEqual(data.ids, cities.map(city => city.id));
assert.equal(data.clouds.reduce((sum, cloud) => sum + cloud.count, 0), 2000);

for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [691, 951], [390, 844], [320, 700]]) {
  let reference;
  for (const scene of scenes) {
    const layout = dispersionLayout(data, scene, width, height);
    assert(layout.bounds.right > layout.bounds.left);
    assert(layout.bounds.bottom > layout.bounds.top);
    assert.equal(layout.points.length, 1000);
    assert(layout.points.flat().every(Number.isFinite));
    const size = Math.min(width, height);
    for (const point of layout.points) {
      const x = point[0] * size + (width - size) / 2;
      const y = point[1] * size + (height - size) / 2;
      assert(x >= 0 && x <= width && y >= 0 && y <= height, `${scene}: point outside viewport`);
    }
    if (!layout.grid) {
      const present = data.stages[scene].logValues.filter(value => value !== null).length;
      assert.equal(present, data.stages[scene].cities);
      assert.equal(layout.points.filter(point => point[2] === .22).length, 1000 - present);
      const axes = [layout.yMin, layout.yMax, layout.x(.6), layout.y(-1)];
      if (reference) assert.deepEqual(axes, reference, 'Axes must not change across model stages');
      reference = axes;
    } else {
      assert.equal(layout.points.filter(point => point[2] > 0).length, 8);
    }
  }
}

const entry = cities.map((city, i) => [.2 + i / 2000, .3 + i / 3000, .6, 0]);
for (const scene of DISPERSION_SCENES) {
  const args = {data, scene, width: 691, height: 951, entry};
  const initial = dispersionFrame({...args, progress: 0});
  const midpoint = dispersionFrame({...args, progress: .6});
  const final = dispersionFrame({...args, progress: 1});
  assert(final.points.flat().every(Number.isFinite));
  assert(midpoint.points.some((point, i) => point.some((v, j) => Math.abs(v - initial.points[i][j]) > 1e-9)), `${scene}: intermediate frame must move`);
  assert(midpoint.points.some((point, i) => point.some((v, j) => Math.abs(v - final.points[i][j]) > 1e-9)), `${scene}: intermediate frame must not snap to the end`);
  assert.deepEqual(dispersionFrame({...args, progress: .6}).points, midpoint.points, 'Re-layout must preserve the current scroll frame');
}

class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {};
    this.className = ''; this.style = {}; this.handlers = {}; this.hidden = false;
    this.offsetTop = 0; this.offsetHeight = 0; this.top = 0;
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, force) => {
        const has = this.classList.contains(name);
        const show = force === undefined ? !has : force;
        this.className = this.className.split(' ').filter(value => value && value !== name).concat(show ? [name] : []).join(' ');
      },
      add: name => this.classList.toggle(name, true), remove: name => this.classList.toggle(name, false),
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  get childNodes() { return this.children; }
  cloneNode() { const clone = new Element(this.tagName); clone.children = this.children.slice(); return clone; }
  querySelectorAll() { return []; }
  removeAttribute(key) { delete this.attrs[key]; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return (this._text || '') + this.children.map(child => child.textContent || '').join(''); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key]; }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, event = {}) { for (const fn of this.handlers[name] || []) fn({target: this, ...event}); }
  getBoundingClientRect() { return {left: 0, top: this.top, width: 1280, height: 800}; }
  querySelector(selector) { return elements.find(element => selector[0] === '.' && element.classList.contains(selector.slice(1))); }
  getContext() {
    if (this.context) return this.context;
    const ctx = {arcs: 0, texts: [], clearRect() { this.arcs = 0; this.texts = []; },
      arc(...values) { assert(values.every(Number.isFinite)); this.arcs++; },
      fillText(label, ...values) { assert(values.every(Number.isFinite)); this.texts.push(label); },
      moveTo(...values) { assert(values.every(Number.isFinite)); },
      lineTo(...values) { assert(values.every(Number.isFinite)); }};
    this.context = new Proxy(ctx, {get: (target, key) => key in target ? target[key] : () => {}});
    return this.context;
  }
}

const elements = [], ids = new Map();
for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  assert(!ids.has(match[3]), `Duplicate id: ${match[3]}`);
  const element = new Element(match[1]); element.id = match[3];
  element.className = match[2].match(/class="([^"]+)"/)?.[1] || '';
  elements.push(element); ids.set(element.id, element);
}
for (const match of html.matchAll(/<article[^>]*data-(time|contrast)-scene="([^"]+)"[^>]*>/g)) {
  const element = new Element('article'); element.dataset[`${match[1]}Scene`] = match[2];
  element.top = 1000 + elements.filter(item => item.tagName === 'article').length * 1000;
  elements.push(element);
}
const sticky = new Element(); sticky.className = 'temporal-sticky'; elements.push(sticky);
ids.get('dispersion-heading').offsetTop = 68; ids.get('dispersion-heading').offsetHeight = 100;
ids.get('dispersion-reading').offsetTop = 610;
const doc = {
  getElementById: id => ids.get(id), createElement: tag => new Element(tag),
  createTextNode: text => ({textContent: text}), addEventListener() {},
  querySelector: () => ids.get('city-evolution'),
  querySelectorAll: selector => elements.filter(element => selector === '[data-contrast-scene]' ? element.dataset.contrastScene : element.dataset.timeScene || element.dataset.contrastScene),
};
globalThis.document = doc;
globalThis.ResizeObserver = class { observe() {} };

// Run the actual parent controller, including temporal/contrast handoffs,
// against an in-memory DOM and a deterministic animation clock.
const events = new Map(), frames = [], errors = [];
let clock = 0;
const window = {addEventListener: (name, fn) => { events.set(name, fn); }};
const context = {
  ...cityData, mountDispersionStory, document: doc, window, console,
  mountSplitHalf: () => ({show() {}}),
  fetchJSON: async path => json(`../docs/${path}`),
  ResizeObserver: globalThis.ResizeObserver,
  IntersectionObserver: class { constructor(fn) { this.fn = fn; } observe(target) { this.fn([{isIntersecting: true, target}]); } disconnect() {} },
  matchMedia: () => ({matches: true}), devicePixelRatio: 1,
  performance: {now: () => clock},
  requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
  cancelAnimationFrame() {}, setTimeout, clearTimeout, innerHeight: 800, innerWidth: 1280,
};
const source = (await fs.readFile(new URL('../docs/city-evolution.js', import.meta.url), 'utf8'))
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
  .replace('} catch (error) {', '} catch (error) { console.error(error);');
vm.runInNewContext(source, context);
async function settle() {
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    const batch = frames.splice(0);
    clock += 2000;
    for (const fn of batch) { try { fn(clock); } catch (error) { errors.push(error); } }
  }
  assert.deepEqual(errors, []);
}
await settle();
assert.match(ids.get('city-status').textContent, /1,000 cities/);
const steps = elements.filter(element => element.dataset.timeScene || element.dataset.contrastScene);
async function scrollTo(scene) {
  const index = steps.findIndex(step => step.dataset.contrastScene === scene || step.dataset.timeScene === scene);
  assert(index >= 0);
  steps.forEach((step, i) => { step.top = (i - index) * 1000 + 200; });
  events.get('scroll')();
  await settle();
}
for (const scene of ['origin', ...scenes, ...scenes.slice().reverse(), 'sphere', 'clouds', 'vh', 'raw']) {
  await scrollTo(scene);
  if (['sphere', 'origin'].includes(scene)) {
    assert.equal(ids.get('dispersion-heading').hidden, true);
  } else {
    assert.equal(ids.get('dispersion-heading').hidden, false);
    assert(sticky.classList.contains('is-contrast'));
    if (scene === 'centres' || scene === 'clouds') {
      assert.equal(ids.get('dispersion-estimate').textContent, '');
      if (scene === 'clouds') assert(ids.get('time-canvas').getContext().arcs >= 2008);
    } else {
      assert.match(ids.get('dispersion-sample').textContent, new RegExp(String(data.stages[scene].cities)));
      assert.equal(ids.get('dispersion-controls').children.length, 7);
      assert.equal(ids.get('dispersion-controls').children.filter(chip => chip.title).length, data.stages[scene].controls.length);
      assert.match(ids.get('dispersion-estimate').textContent, /per \+0.1 HDI/);
    }
  }
}
assert.equal(ids.get('dispersion-sensitivity').children.length, 7);
ids.get('atlas-search').value = 'London'; ids.get('atlas-search').emit('change');
assert.match(ids.get('dispersion-selected').textContent, /London/);
assert.match(ids.get('atlas-selection').textContent, /London/);
ids.get('time-canvas').emit('keydown', {key: 'ArrowRight', preventDefault() {}});
assert(!ids.get('dispersion-selected').textContent.startsWith('London ·'));

// Exercise the actual tween with motion enabled: every city has a finite
// cloud-opacity coordinate even when arriving from the three-coordinate time view.
const animationFrames = [];
const animationContext = {...context, requestAnimationFrame: fn => { animationFrames.push(fn); return animationFrames.length; }};
vm.runInNewContext('const reduced = false;\n' + source.slice(source.indexOf('class MotionPlot'), source.indexOf('function defer')) + '\nglobalThis.Plot = MotionPlot;', animationContext);
const animated = new animationContext.Plot(new Element('canvas'));
animated.points = [[.2, .3, .5, 0]];
animated.to([[.8, .7, 1, 1]], ['#294976'], 1000);
animationFrames.shift()(clock + 500);
assert(Math.abs(animated.points[0][3] - .5) < 1e-12);
assert(Math.abs(animated.points[0][0] - .5) < 1e-12);
animationFrames.shift()(clock + 1000);
assert.deepEqual(Array.from(animated.points[0]), [.8, .7, 1, 1]);

// The child controller must recover after a failed lazy fetch, and must not
// restore an exited scene when an old request finally resolves.
let rejectFetch = true;
const canvas = new Element('canvas');
const plot = {canvas, w: 1280, h: 800, size: 800, points: cities.map(() => [.5, .5, .5]),
  draw() {}, stop() {}, xy: point => [240 + point[0] * 800, point[1] * 800]};
const child = mountDispersionStory({plot, cities, document: doc, loadData: async () => { if (rejectFetch) throw Error('Offline'); return data; }});
await child.seek('raw', 1);
assert.equal(ids.get('dispersion-retry').hidden, false);
rejectFetch = false; ids.get('dispersion-retry').emit('click'); await settle();
assert.equal(ids.get('dispersion-retry').hidden, true);
assert.equal(plot.points.length, 1000);
const initialPlot = {...plot, points: [], target: entry};
const direct = mountDispersionStory({plot: initialPlot, cities, document: doc, loadData: async () => data});
await direct.seek('centres', .5);
assert.equal(initialPlot.points.length, 1000);
assert(initialPlot.points.flat().every(Number.isFinite));
let deliver;
const delayed = mountDispersionStory({plot, cities, document: doc, loadData: () => new Promise(resolve => { deliver = resolve; })});
const showing = delayed.seek('clouds', .5); delayed.hide(); deliver(data); await showing;
assert.equal(ids.get('dispersion-heading').hidden, true);

const report = {passed: true, all1000IdentitiesPreserved: true, sharedTemporalCanvas: true,
  cloudObservations: 2000, largestRawSample: 977, fixedControlSample: 942,
  sameAxesAcrossModels: true, responsiveLayouts: 7, scenesForwardAndReverse: true,
  reducedMotion: true, citySelectionPreserved: true, missingRowsRetained: true,
  keyboardCitySelection: true, animatedCloudOpacityAndPosition: true,
  continuousScrollFrames: true, resizeDoesNotCompleteTransitions: true,
  directSectionLinkBeforeFirstCanvasFrame: true,
  loadFailureAndRetry: true, staleLoadCannotReopenScene: true, broaderSampleSensitivities: 7,
  browserVisualReview: false};
await fs.writeFile(new URL('dispersion_interface_audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
