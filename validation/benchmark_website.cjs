/* Reproducible browser performance probe for the static website.
   Usage: node validation/benchmark_website.cjs http://127.0.0.1:8766/ */
'use strict';

const { chromium } = require('playwright');

const url = process.argv[2] || 'http://127.0.0.1:8766/';
const profiles = [
  { name: 'desktop', viewport: { width: 1280, height: 720 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
];

const round = (value, digits = 2) => Number(value.toFixed(digits));

async function cdpMetrics(client) {
  const result = await client.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
}

function metricDelta(before, after) {
  const seconds = name => round((after[name] - before[name]) * 1000, 3);
  return {
    taskMs: seconds('TaskDuration'),
    scriptMs: seconds('ScriptDuration'),
    layoutMs: seconds('LayoutDuration'),
    styleMs: seconds('RecalcStyleDuration'),
  };
}

async function idleProbe(page, client, durationMs = 2000) {
  const beforeCounts = await page.evaluate(() => ({ ...window.__perfProbe }));
  const beforeMetrics = await cdpMetrics(client);
  await page.waitForTimeout(durationMs);
  const afterMetrics = await cdpMetrics(client);
  const afterCounts = await page.evaluate(() => ({ ...window.__perfProbe }));
  const metrics = metricDelta(beforeMetrics, afterMetrics);
  const rafCallbacks = afterCounts.rafCallbacks - beforeCounts.rafCallbacks;
  return {
    durationMs,
    ...metrics,
    rafCallbacks,
    taskMsPerFrame: rafCallbacks ? round(metrics.taskMs / rafCallbacks, 3) : 0,
    scriptMsPerFrame: rafCallbacks ? round(metrics.scriptMs / rafCallbacks, 3) : 0,
    fillRects: afterCounts.fillRects - beforeCounts.fillRects,
    imageWrites: afterCounts.imageWrites - beforeCounts.imageWrites,
  };
}

async function activityProbe(page, client, action, durationMs = 1000) {
  const beforeCounts = await page.evaluate(() => ({
    rafCallbacks: window.__perfProbe.rafCallbacks,
    fillRects: window.__perfProbe.fillRects,
    imageWrites: window.__perfProbe.imageWrites,
    longTasks: window.__perfProbe.longTasks.length,
  }));
  const beforeMetrics = await cdpMetrics(client);
  await action();
  await page.waitForTimeout(durationMs);
  const afterMetrics = await cdpMetrics(client);
  const afterCounts = await page.evaluate(() => ({
    rafCallbacks: window.__perfProbe.rafCallbacks,
    fillRects: window.__perfProbe.fillRects,
    imageWrites: window.__perfProbe.imageWrites,
    longTasks: window.__perfProbe.longTasks.length,
  }));
  const metrics = metricDelta(beforeMetrics, afterMetrics);
  const rafCallbacks = afterCounts.rafCallbacks - beforeCounts.rafCallbacks;
  return {
    durationMs,
    ...metrics,
    rafCallbacks,
    taskMsPerFrame: rafCallbacks ? round(metrics.taskMs / rafCallbacks, 3) : 0,
    scriptMsPerFrame: rafCallbacks ? round(metrics.scriptMs / rafCallbacks, 3) : 0,
    fillRects: afterCounts.fillRects - beforeCounts.fillRects,
    imageWrites: afterCounts.imageWrites - beforeCounts.imageWrites,
    longTasks: afterCounts.longTasks - beforeCounts.longTasks,
  };
}

async function pageSnapshot(page, client) {
  const browserMetrics = await cdpMetrics(client);
  return page.evaluate(metrics => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const bytes = entries => entries.reduce((sum, entry) => sum + entry.encodedBodySize, 0);
    const byType = {};
    for (const entry of resources) {
      const type = entry.initiatorType || 'other';
      byType[type] = (byType[type] || 0) + entry.encodedBodySize;
    }
    return {
      appReadyMs: Math.round(window.__perfProbe.appReadyAt || 0),
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
      loadMs: Math.round(navigation.loadEventEnd),
      resources: resources.length,
      resourceBytes: bytes(resources),
      resourceBytesByType: byType,
      longTasks: window.__perfProbe.longTasks.length,
      longTaskMs: Math.round(window.__perfProbe.longTasks.reduce((sum, task) => sum + task.duration, 0) * 10) / 10,
      heapUsedBytes: Math.round(metrics.JSHeapUsedSize),
      nodes: Math.round(metrics.Nodes),
    };
  }, browserMetrics);
}

async function runProfile(browser, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.isMobile || false,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(() => {
    const probe = {
      appReadyAt: 0,
      rafCallbacks: 0,
      fillRects: 0,
      imageWrites: 0,
      longTasks: [],
    };
    Object.defineProperty(window, '__perfProbe', { value: probe });

    const nativeRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => nativeRaf(timestamp => {
      probe.rafCallbacks++;
      return callback(timestamp);
    });

    const nativeFillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      probe.fillRects++;
      return nativeFillRect.apply(this, args);
    };
    const nativePutImageData = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (...args) {
      probe.imageWrites++;
      return nativePutImageData.apply(this, args);
    };

    if ('PerformanceObserver' in window) {
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            probe.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch (_) {}
    }

    let gotoScene;
    Object.defineProperty(window, '__gotoScene', {
      configurable: true,
      get: () => gotoScene,
      set(value) {
        gotoScene = value;
        probe.appReadyAt = performance.now();
      },
    });
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__gotoScene === 'function');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  const initial = await pageSnapshot(page, client);
  initial.idle = await idleProbe(page, client);
  initial.storyTransition = await activityProbe(page, client, async () => {
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      document.querySelector('.step').scrollIntoView({ block: 'center' });
    });
  }, 1600);

  const lateStoryStart = await page.evaluate(() => performance.now());
  await page.evaluate(() => {
    document.querySelector('[data-scene="mx_map"]').scrollIntoView({ block: 'center' });
  });
  await page.waitForFunction(() =>
    document.getElementById('stage-caption').textContent.startsWith('MEXICO CITY')
  );
  const lateStory = await pageSnapshot(page, client);
  lateStory.readyMs = round(await page.evaluate(start => performance.now() - start, lateStoryStart), 1);
  const v2Scenes = [
    'mx_map', 'pair', 'frame', 'dou', 'collapse',
    'globe_continent', 'globe_climate', 'globe_pop', 'finale',
  ];
  const sweepStart = await page.evaluate(() => performance.now());
  await page.evaluate(async scenes => {
    for (const scene of scenes) await window.__gotoScene(scene);
  }, v2Scenes);
  lateStory.sceneSweepMs = round(await page.evaluate(start => performance.now() - start, sweepStart), 1);

  const pairStart = await page.evaluate(() => performance.now());
  await page.locator('#city-atlas').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('[data-slug]').length === 8);
  await page.locator('[data-slug="singapore"]').click();
  await page.locator('[data-slug="london"]').click();
  await page.waitForFunction(() => !document.getElementById('city-comparison').hidden);
  await page.waitForFunction(() => document.getElementById('comparison-mean-angle').textContent !== '—');
  const pair = await pageSnapshot(page, client);
  pair.readyMs = round(await page.evaluate(start => performance.now() - start, pairStart), 1);

  const adapterStart = await page.evaluate(() => performance.now());
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.getElementById('joint-adapter').scrollIntoView({ block: 'start' });
  });
  await page.waitForFunction(() => document.getElementById('jo-status').textContent.includes('visual points'));
  await page.waitForTimeout(250);
  const adapter = await pageSnapshot(page, client);
  adapter.readyMs = round(await page.evaluate(start => performance.now() - start, adapterStart), 1);
  await page.waitForTimeout(1200);
  adapter.idle = await idleProbe(page, client);
  adapter.modelTransition = await activityProbe(page, client, async () => {
    await page.locator('[data-preset="g00_00"]').click();
  });

  await context.close();
  return { profile: profile.name, viewport: profile.viewport, errors, initial, lateStory, pair, adapter };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PERF_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  try {
    const results = [];
    for (const profile of profiles) results.push(await runProfile(browser, profile));
    console.log(JSON.stringify({ url, results }, null, 2));
    const failures = [];
    for (const result of results) {
      if (result.errors.length) failures.push(`${result.profile}: ${result.errors.join('; ')}`);
      if (result.initial.idle.rafCallbacks !== 0) failures.push(`${result.profile}: opening view schedules idle animation frames`);
      if (result.adapter.idle.rafCallbacks !== 0) failures.push(`${result.profile}: adapter schedules idle animation frames`);
    }
    if (failures.length) {
      console.error(`Performance regression checks failed:\n- ${failures.join('\n- ')}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
