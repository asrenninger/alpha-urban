/* Inside the field — the AlphaUrban companion walk.
   Act I: follow-the-pixel walk through Singapore (map → accounts → spheres).
   Act II: Mexico City fast walk, side-by-side spheres in one shared frame.
   Act III: both cities leave their local frame and collapse to points.
   Act IV: the globe of 1,000 city mean directions, cut three ways.
   Marks keep identity across every layout; all quoted numbers are native 64-D. */

(function () {
  "use strict";

  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");
  const captionEl = document.getElementById("stage-caption");
  const legendEl = document.getElementById("legend");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const GRID = 192;
  const NCELL = GRID * GRID;
  const SG0 = 0;
  const MX0 = NCELL;
  const GB0 = 2 * NCELL;
  let NT = 0; // total marks, set after load

  let data = null; // Act I Singapore story
  let v2 = null; // Act II-IV story

  let px, py, pr, pg, pb, pa, ps;
  let tx, ty, tr, tg, tb, ta, ts;
  let sx, sy, sr, sg_, sb, sa, ss;
  let drawOrder = null;

  let stage = { w: 0, h: 0, cx: 0, cy: 0, cell: 3, mapSize: 0 };
  let scene = "map";
  let prevScene = "map";
  let animE = 1;
  let animStart = 0;
  let animating = false;
  const DURATION = reduced ? 0 : 1150;

  /* Colour is the manuscript's. See site/AESTHETIC_PORT.md for the citations;
     every ramp is three-stop and monotone in lightness. */

  // The paper's degree-of-urbanisation ladder SUB -> DU -> UC
  // (render_si_sphere_context_kde.py:129-136): #d99b32 -> #d9515d -> #9d3157.
  const VOLUME_RAMP = [
    [217, 155, 50],
    [217, 81, 93],
    [157, 49, 87],
  ];
  // The vegetation figures' GOLD -> GREEN pairing, closed on the paper's TEAL:
  // #d99b32 -> #8d9a55 -> #3b7c6b.
  const NDVI_RAMP = [
    [217, 155, 50],
    [141, 154, 85],
    [59, 124, 107],
  ];
  // POPULATION_ANCHORS[1,2,4] (render_si_sphere_context_kde.py:138-141). The
  // palest anchor #dce4ea is dropped so quintile-1 marks stay visible on paper.
  const POP_RAMP = [
    [169, 192, 211],
    [110, 155, 194],
    [20, 38, 61],
  ];
  const FADE = [199, 209, 220]; // STRUCTURE #c7d1dc
  const SG_COLOR = [200, 76, 76]; // paper CRIMSON #c84c4c
  const MX_COLOR = [41, 73, 118]; // paper NAVY #294976

  // Named cuts, keyed by level name rather than index so a re-ordered cut
  // cannot silently re-colour the globe.
  const CONTINENT_COLORS = {
    Africa: "#e64b4b",
    America: "#294976",
    Asia: "#8c508d",
    Europe: "#4d9372",
    Oceania: "#d99b32", // paper #fab84a, darkened one step for legibility
    Antarctica: "#8f9aa8",
  };
  const CLIMATE_COLORS = {
    Temperate: "#4f88bf",
    Tropical: "#4d9372",
    Arid: "#d99b32",
    Continental: "#8c508d",
    Polar: "#8f9aa8", // paper #a7b8c8, darkened one step for legibility
  };
  const CUT_FALLBACK = ["#294976", "#4d9372", "#d99b32", "#8c508d", "#e64b4b", "#4f88bf"];

  function cutColors(kind) {
    const levels = (v2.meta.cut_levels && v2.meta.cut_levels[kind]) || [];
    const map = kind === "climate" ? CLIMATE_COLORS : CONTINENT_COLORS;
    return levels.map((name, i) => map[name] || CUT_FALLBACK[i % CUT_FALLBACK.length]);
  }

  // --- sphere chrome (Fig. 1 E-G / SI02: wp2_occupancy.py:347-406) ---------
  const SPHERE_FACE = "#f8fafc";
  const SPHERE_EDGE = "#717c8b";
  const GRAT_FRONT = "rgba(143, 154, 168, 0.48)"; // #8F9AA8 @ 0.48
  const GRAT_REAR = "rgba(199, 209, 220, 0.25)"; // #C7D1DC @ 0.25

  function hexToRgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }

  function ramp(stops, t) {
    const seg = t < 0.5 ? 0 : 1;
    const u = (t - seg * 0.5) * 2;
    const a = stops[seg];
    const b = stops[seg + 1];
    return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * u);
  }

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = Math.min(vh * 0.9, vw * 0.92);
    stage.w = vw;
    stage.h = vh;
    stage.mapSize = Math.min(size, vw > 900 ? vw * 0.52 : size);
    stage.cell = stage.mapSize / GRID;
    stage.cx = vw > 900 ? vw * 0.6 : vw * 0.5;
    stage.cy = vh * 0.5;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- geometry ----------------------------------------------------------

  const ROT = (function () {
    const ax = -0.55, ay = 0.65;
    return { cx: Math.cos(ax), sx: Math.sin(ax), cy: Math.cos(ay), sy: Math.sin(ay) };
  })();

  const tmp = [0, 0, 0];

  function sphPos(arr, k, cx, cy, R, out) {
    const x0 = arr[k * 3] / 1000;
    const y0 = arr[k * 3 + 1] / 1000;
    const z0 = arr[k * 3 + 2] / 1000;
    const x1 = x0 * ROT.cy + z0 * ROT.sy;
    const z1 = -x0 * ROT.sy + z0 * ROT.cy;
    const y2 = y0 * ROT.cx - z1 * ROT.sx;
    const z2 = y0 * ROT.sx + z1 * ROT.cx;
    out[0] = cx + x1 * R;
    out[1] = cy - y2 * R;
    out[2] = z2;
  }

  /* Graticule: the paper's 15-degree globe grid — 11 parallels and 12 meridian
     great circles (wp2_occupancy.py:347-384). Built once as unit vectors and
     pre-rotated through the same fixed ROT camera sphPos uses for the marks, so
     the grid and the points share one frame. Each entry is [x, y, z]* in the
     rotated view basis; z is the depth key (>= 0 is the near hemisphere). */
  const GRATICULE = (function () {
    const D = Math.PI / 180;
    const N = 181;
    const curves = [];
    function rotated(pts) {
      const out = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i += 3) {
        const x0 = pts[i], y0 = pts[i + 1], z0 = pts[i + 2];
        const x1 = x0 * ROT.cy + z0 * ROT.sy;
        const z1 = -x0 * ROT.sy + z0 * ROT.cy;
        out[i] = x1;
        out[i + 1] = y0 * ROT.cx - z1 * ROT.sx;
        out[i + 2] = y0 * ROT.sx + z1 * ROT.cx;
      }
      return out;
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const c = Math.cos(lat * D), s = Math.sin(lat * D);
      const p = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const lon = (i / (N - 1)) * 360 * D;
        p[i * 3] = c * Math.cos(lon);
        p[i * 3 + 1] = s;
        p[i * 3 + 2] = c * Math.sin(lon);
      }
      curves.push(rotated(p));
    }
    for (let lon = 0; lon < 180; lon += 15) {
      const cl = Math.cos(lon * D), sl = Math.sin(lon * D);
      const p = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const t = (i / (N - 1)) * 360 * D;
        const c = Math.cos(t);
        p[i * 3] = cl * c;
        p[i * 3 + 1] = Math.sin(t);
        p[i * 3 + 2] = sl * c;
      }
      curves.push(rotated(p));
    }
    return curves;
  })();

  const SPHERE_SCENES = {
    sphere: 1, ndvi: 1, city: 1, audit: 1, frame: 1, collapse: 1,
    globe_continent: 1, globe_climate: 1, globe_pop: 1, finale: 1,
  };

  // [centreX, centreY, radius] for every sphere a scene shows; [] otherwise.
  function sphereLayout(name) {
    if (name === "pair") {
      const r = stage.mapSize * 0.27;
      const dx = stage.mapSize * 0.28;
      return [[stage.cx - dx, stage.cy, r], [stage.cx + dx, stage.cy, r]];
    }
    if (SPHERE_SCENES[name]) return [[stage.cx, stage.cy, GLOBE_R()]];
    return [];
  }

  // The world-context KDE (baked by site/prepare_world_kde.py with the
  // manuscript's vMF constants): grey density of non-city terrestrial land in
  // the same global basis and camera. Shown on the closing globe.
  const kdeFront = new Image();
  const kdeRear = new Image();
  kdeFront.src = "data/world_kde_front.png";
  kdeRear.src = "data/world_kde_rear.png";

  function sceneShowsKde(name) {
    return name === "finale";
  }

  function drawSphere(cx, cy, R, alpha, withKde) {
    if (alpha <= 0.004 || R <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = SPHERE_FACE;
    ctx.fill();

    if (withKde && kdeRear.complete && kdeRear.naturalWidth > 0) {
      ctx.drawImage(kdeRear, cx - R, cy - R, 2 * R, 2 * R);
    }

    // Rear pass first, then front — the paper draws both and fades the far side
    // rather than removing it (wp2_occupancy.py:240-288).
    for (let pass = 0; pass < 2; pass++) {
      const front = pass === 1;
      ctx.strokeStyle = front ? GRAT_FRONT : GRAT_REAR;
      ctx.lineWidth = front ? Math.max(0.7, R * 0.0042) : Math.max(0.55, R * 0.0030);
      ctx.beginPath();
      for (let c = 0; c < GRATICULE.length; c++) {
        const arr = GRATICULE[c];
        let started = false;
        for (let i = 0; i < arr.length; i += 3) {
          if ((arr[i + 2] >= 0) !== front) { started = false; continue; }
          const X = cx + arr[i] * R;
          const Y = cy - arr[i + 1] * R;
          if (started) ctx.lineTo(X, Y);
          else { ctx.moveTo(X, Y); started = true; }
        }
      }
      ctx.stroke();
    }

    if (withKde && kdeFront.complete && kdeFront.naturalWidth > 0) {
      ctx.drawImage(kdeFront, cx - R, cy - R, 2 * R, 2 * R);
    }

    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = SPHERE_EDGE;
    ctx.lineWidth = Math.max(0.8, R * 0.0088);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function mapPosition(k, out) {
    const col = k % GRID;
    const row = (k / GRID) | 0;
    out[0] = stage.cx - stage.mapSize / 2 + (col + 0.5) * stage.cell;
    out[1] = stage.cy - stage.mapSize / 2 + (row + 0.5) * stage.cell;
    out[2] = 0;
  }

  // Waffle packings (Act I): ordered subsets in one shared frame.
  const WAFFLE_ASPECT = 1 / 0.62;
  function buildPacking(ids) {
    const index = new Int32Array(NCELL).fill(-1);
    for (let slot = 0; slot < ids.length; slot++) index[ids[slot]] = slot;
    const cols = Math.ceil(Math.sqrt(ids.length * WAFFLE_ASPECT));
    return { index, cols, rows: Math.ceil(ids.length / cols) };
  }

  let packs = null;
  function buildPackings() {
    const land = [];
    for (let i = 0; i < NCELL; i++) if (data.wc[i] !== 6) land.push(i);
    const byClass = land.slice().sort((a, b) => data.wc[a] - data.wc[b] || a - b);
    const ndviKey = (i) => (data.ndvi_q[i] < 0 ? 1e9 : data.ndvi_q[i]);
    const byNdvi = land.slice().sort((a, b) => ndviKey(a) - ndviKey(b) || a - b);
    const built = land.filter((i) => data.wc[i] === 0);
    const volKey = (i) => (data.built_q[i] < 0 ? -1 : data.built_q[i]);
    const byVol = built.slice().sort((a, b) => volKey(a) - volKey(b) || a - b);
    packs = { cartogram: buildPacking(byClass), ndviw: buildPacking(byNdvi), volw: buildPacking(byVol) };
  }

  function packCell(pack) {
    return stage.mapSize / pack.cols;
  }

  function packedPosition(pack, k, out) {
    const slot = pack.index[k];
    if (slot < 0) {
      mapPosition(k, out);
      return false;
    }
    const cell = packCell(pack);
    const col = slot % pack.cols;
    const row = (slot / pack.cols) | 0;
    out[0] = stage.cx - stage.mapSize / 2 + (col + 0.5) * cell;
    out[1] = stage.cy - (pack.rows * cell) / 2 + (row + 0.5) * cell;
    out[2] = 0;
    return true;
  }

  // ---- scene targets -----------------------------------------------------

  function setMark(i, x, y, color, alpha, size) {
    tx[i] = x;
    ty[i] = y;
    tr[i] = color[0];
    tg[i] = color[1];
    tb[i] = color[2];
    ta[i] = alpha;
    ts[i] = size;
  }

  function hideMark(i) {
    tx[i] = px[i];
    ty[i] = py[i];
    tr[i] = pr[i];
    tg[i] = pg[i];
    tb[i] = pb[i];
    ta[i] = 0;
    ts[i] = ps[i];
  }

  const GLOBE_R = () => stage.mapSize * 0.46;

  function setTargets(name) {
    const wcColors = data.meta.group_colors.map(hexToRgb);

    // --- Singapore cells (Act I identical to before; hidden after collapse)
    for (let k = 0; k < NCELL; k++) {
      const i = SG0 + k;
      const wc = data.wc[k];
      const isWater = wc === 6;
      let builtColor = null;
      if (wc === 0) {
        const q = data.built_q[k];
        builtColor = q >= 0 ? ramp(VOLUME_RAMP, q / 1000) : FADE;
      }

      if (name === "map") {
        mapPosition(k, tmp);
        setMark(i, tmp[0], tmp[1], wcColors[wc], isWater ? 0.45 : 0.95, 1);
      } else if (name === "embmap") {
        mapPosition(k, tmp);
        setMark(i, tmp[0], tmp[1], [data.emb_rgb[k * 3], data.emb_rgb[k * 3 + 1], data.emb_rgb[k * 3 + 2]], 0.95, 1);
      } else if (name === "cartogram" || name === "ndviw" || name === "volw") {
        const pack = packs[name];
        const inPack = packedPosition(pack, k, tmp);
        if (!inPack) {
          setMark(i, tmp[0], tmp[1], wcColors[wc], 0, 1);
        } else {
          let color = wcColors[wc];
          if (name === "ndviw") {
            const q = data.ndvi_q[k];
            color = q >= 0 ? ramp(NDVI_RAMP, q / 1000) : FADE;
          } else if (name === "volw") {
            color = builtColor;
          }
          setMark(i, tmp[0], tmp[1], color, 0.95, packCell(pack) / stage.cell);
        }
      } else if (name === "sphere" || name === "ndvi" || name === "city" || name === "audit") {
        sphPos(data.sphereArr, k, stage.cx, stage.cy, GLOBE_R(), tmp);
        const depth = (tmp[2] + 1) / 2;
        let color = wcColors[wc];
        let alpha = isWater ? 0 : 0.25 + depth * 0.65;
        if (name === "ndvi") {
          const q = data.ndvi_q[k];
          if (!isWater) color = q >= 0 ? ramp(NDVI_RAMP, q / 1000) : FADE;
        } else if (name === "city" || name === "audit") {
          if (wc === 0) {
            color = builtColor;
            alpha = 0.35 + depth * 0.6;
          } else {
            color = FADE;
            alpha = isWater ? 0 : 0.05 + depth * 0.08;
          }
        }
        setMark(i, tmp[0], tmp[1], color, alpha, 0.55 + depth * 0.75);
      } else if (name === "return") {
        mapPosition(k, tmp);
        if (wc === 0) setMark(i, tmp[0], tmp[1], builtColor, 0.98, 1);
        else setMark(i, tmp[0], tmp[1], FADE, isWater ? 0.25 : 0.5, 1);
      } else if (name === "pair") {
        sphPos(v2.sgPair, k, stage.cx - stage.mapSize * 0.28, stage.cy, stage.mapSize * 0.27, tmp);
        const depth = (tmp[2] + 1) / 2;
        setMark(i, tmp[0], tmp[1], wcColors[wc], isWater ? 0 : 0.22 + depth * 0.6, 0.5 + depth * 0.6);
      } else if (name === "frame") {
        sphPos(v2.sgGlobal, k, stage.cx, stage.cy, GLOBE_R(), tmp);
        const depth = (tmp[2] + 1) / 2;
        setMark(i, tmp[0], tmp[1], SG_COLOR, isWater ? 0 : 0.2 + depth * 0.5, 0.5 + depth * 0.6);
      } else if (name === "collapse") {
        sphPos(v2.globeArr, v2.sgIndex, stage.cx, stage.cy, GLOBE_R(), tmp);
        setMark(i, tmp[0], tmp[1], SG_COLOR, isWater ? 0 : 0.06, 0.5);
      } else {
        hideMark(i);
      }
    }

    // --- Mexico City cells
    for (let k = 0; k < NCELL; k++) {
      const i = MX0 + k;
      const wc = v2.mx.wc[k];
      const isWater = wc === 6;
      if (name === "mx_map") {
        mapPosition(k, tmp);
        setMark(i, tmp[0], tmp[1], wcColors[wc], isWater ? 0.45 : 0.95, 1);
      } else if (name === "pair") {
        sphPos(v2.mxPair, k, stage.cx + stage.mapSize * 0.28, stage.cy, stage.mapSize * 0.27, tmp);
        const depth = (tmp[2] + 1) / 2;
        setMark(i, tmp[0], tmp[1], wcColors[wc], isWater ? 0 : 0.22 + depth * 0.6, 0.5 + depth * 0.6);
      } else if (name === "frame") {
        sphPos(v2.mxGlobal, k, stage.cx, stage.cy, GLOBE_R(), tmp);
        const depth = (tmp[2] + 1) / 2;
        setMark(i, tmp[0], tmp[1], MX_COLOR, isWater ? 0 : 0.2 + depth * 0.5, 0.5 + depth * 0.6);
      } else if (name === "collapse") {
        sphPos(v2.globeArr, v2.mxIndex, stage.cx, stage.cy, GLOBE_R(), tmp);
        setMark(i, tmp[0], tmp[1], MX_COLOR, isWater ? 0 : 0.06, 0.5);
      } else {
        hideMark(i);
      }
    }

    // --- Globe dots (1,000 city mean directions)
    const continentRgb = cutColors("continent").map(hexToRgb);
    const climateRgb = cutColors("climate").map(hexToRgb);
    const nG = v2.nGlobe;
    for (let k = 0; k < nG; k++) {
      const i = GB0 + k;
      const featured = k === v2.sgIndex || k === v2.mxIndex;
      if (name === "collapse") {
        sphPos(v2.globeArr, k, stage.cx, stage.cy, GLOBE_R(), tmp);
        if (featured) {
          setMark(i, tmp[0], tmp[1], k === v2.sgIndex ? SG_COLOR : MX_COLOR, 1, 3.4);
        } else {
          setMark(i, tmp[0], tmp[1], FADE, 0, 1.6);
        }
      } else if (name === "globe_continent" || name === "globe_climate" || name === "globe_pop" || name === "finale") {
        sphPos(v2.globeArr, k, stage.cx, stage.cy, GLOBE_R(), tmp);
        const depth = (tmp[2] + 1) / 2;
        let color;
        if (name === "globe_continent" || name === "finale") {
          const c = v2.globe.continent[k];
          color = c >= 0 && continentRgb[c] ? continentRgb[c] : FADE;
        } else if (name === "globe_climate") {
          const c = v2.globe.climate[k];
          color = c >= 0 && climateRgb[c] ? climateRgb[c] : FADE;
        } else {
          const q = v2.globe.pop_q[k];
          color = q >= 1 ? ramp(POP_RAMP, (q - 1) / 4) : FADE;
        }
        const alpha = (name === "finale" ? 0.45 : 0.6) + depth * 0.35;
        setMark(i, tmp[0], tmp[1], color, alpha, (featured ? 3.2 : 1.7) + depth * 0.7);
      } else {
        hideMark(i);
      }
    }
  }

  function beginTransition(name) {
    prevScene = scene;
    animE = 0;
    scene = name;
    sx.set(px); sy.set(py); sr.set(pr); sg_.set(pg); sb.set(pb); sa.set(pa); ss.set(ps);
    setTargets(name);
    updateChrome(name);
    animStart = performance.now();
    animating = true;
    if (reduced) {
      snapToTargets();
      animating = false;
      draw();
    }
  }

  function snapToTargets() {
    px.set(tx); py.set(ty); pr.set(tr); pg.set(tg); pb.set(tb); pa.set(ta); ps.set(ts);
    animE = 1;
  }

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function tick(now) {
    if (animating) {
      const t = Math.min((now - animStart) / DURATION, 1);
      const e = ease(t);
      animE = e;
      for (let i = 0; i < NT; i++) {
        px[i] = sx[i] + (tx[i] - sx[i]) * e;
        py[i] = sy[i] + (ty[i] - sy[i]) * e;
        pr[i] = sr[i] + (tr[i] - sr[i]) * e;
        pg[i] = sg_[i] + (tg[i] - sg_[i]) * e;
        pb[i] = sb[i] + (tb[i] - sb[i]) * e;
        pa[i] = sa[i] + (ta[i] - sa[i]) * e;
        ps[i] = ss[i] + (ts[i] - ss[i]) * e;
      }
      if (t >= 1) animating = false;
      draw();
    }
    // Scroll events coalesce (and can be dropped outright) under fast
    // programmatic scrolling, so the progress sphere is sampled here too; the
    // 0.004 threshold makes it a no-op on almost every frame.
    updateProgressSphere(false);
    requestAnimationFrame(tick);
  }

  function draw() {
    ctx.clearRect(0, 0, stage.w, stage.h);

    // Sphere chrome is a separate pass, always behind the marks — the plates
    // put the graticule at zorder 1-5 and the city points at 11.
    const e = animating ? animE : 1;
    if (e < 1 && prevScene !== scene) {
      const out = sphereLayout(prevScene);
      for (let i = 0; i < out.length; i++)
        drawSphere(out[i][0], out[i][1], out[i][2], 1 - e, sceneShowsKde(prevScene));
    }
    const into = sphereLayout(scene);
    for (let i = 0; i < into.length; i++)
      drawSphere(into[i][0], into[i][1], into[i][2], e, sceneShowsKde(scene));

    const base = Math.max(stage.cell, 1.6);
    for (let k = 0; k < NT; k++) {
      const i = drawOrder[k];
      if (pa[i] <= 0.004) continue;
      const s = base * ps[i];
      ctx.globalAlpha = pa[i];
      ctx.fillStyle = `rgb(${pr[i] | 0},${pg[i] | 0},${pb[i] | 0})`;
      ctx.fillRect(px[i] - s / 2, py[i] - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ---- chrome ------------------------------------------------------------

  const CAPTIONS = {
    map: "ESA WORLDCOVER 2021 · 265 M EQUAL-AREA CELLS · SINGAPORE / JOHOR / BATAM",
    embmap: "ALPHAEARTH 2024 · A39 / A62 / A08 AS RGB — THE CANONICAL CITY VIEW",
    cartogram: "LAND CELLS PACKED BY CLASS · EQUAL AREA · 14,962 PERMANENT-WATER CELLS SET ASIDE",
    sphere: "ALPHAEARTH 2024 · FIXED 3-D DISPLAY PROJECTION (FIT ON LAND CELLS) · WATER SET ASIDE",
    ndvi: "SAME POINTS · RECOLOURED BY SENTINEL-2 NDVI, 2024 MEDIAN",
    ndviw: "LAND CELLS ORDERED BY NDVI · EQUAL AREA · DRY TO GREEN",
    city: "BUILT CELLS RECOLOURED BY WSF3D BUILT VOLUME · OTHERS FADED",
    volw: "8,293 BUILT CELLS ORDERED BY BUILT VOLUME · 997 WITHOUT WSF3D COVERAGE IN GREY, FIRST",
    audit: "NATIVE 64-D GEOMETRY · DISPLAYED PROJECTION UNCHANGED",
    return: "BUILT VOLUME RETURNED TO GEOGRAPHY",
    mx_map: "MEXICO CITY · 110 × 110 KM · 576 M CELLS · ESA WORLDCOVER 2021",
    pair: "ONE SHARED PROJECTION FIT ON BOTH CITIES' LAND CELLS · SINGAPORE LEFT · MEXICO CITY RIGHT",
    frame: "THE GLOBAL FRAME · PROJECTION FIT ON 1,000 CITY MEAN DIRECTIONS · COLOURED BY CITY",
    collapse: "EACH CITY REDUCED TO ITS MEAN DIRECTION · FUA CITY SUPPORT · 2024",
    globe_continent: "1,000 CITY MEAN DIRECTIONS · COLOURED BY CONTINENT",
    globe_climate: "1,000 CITY MEAN DIRECTIONS · COLOURED BY KÖPPEN CLIMATE FAMILY",
    globe_pop: "1,000 CITY MEAN DIRECTIONS · COLOURED BY POPULATION QUINTILE",
    finale: "1,000 CITIES OVER THE GREY DENSITY OF 273,410 NON-CITY LAND PIXELS · 2024",
  };

  function legendItems(items) {
    legendEl.innerHTML = items
      .map(
        (m) =>
          `<div class="item"><span class="swatch" style="background:${m[1]}"></span>${m[0].toUpperCase()}</div>`
      )
      .join("");
  }

  function rgbHex(c) {
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  const CONTEXTS = {
    mx_map: "MEXICO CITY · 2024",
    pair: "TWO CITIES · 2024",
    frame: "TWO CITIES · 2024",
    collapse: "TWO CITIES · 2024",
    globe_continent: "1,000 CITIES · 2024",
    globe_climate: "1,000 CITIES · 2024",
    globe_pop: "1,000 CITIES · 2024",
    finale: "1,000 CITIES · 2024",
  };

  // The masthead names a city only while the walk is at one: neutral on the
  // hero and outro, per-scene once a step card is on screen.
  let stepsOnScreen = 0;

  function updateContext(name) {
    const contextEl = document.getElementById("masthead-context");
    if (!contextEl) return;
    contextEl.textContent =
      stepsOnScreen > 0 ? CONTEXTS[name] || "SINGAPORE · 2024" : "ALPHAEARTH · 2024";
  }

  function updateChrome(name) {
    captionEl.textContent = CAPTIONS[name] || "";
    updateContext(name);
    if (name === "embmap") {
      legendItems([["A39 → red", "#f00"], ["A62 → green", "#0f0"], ["A08 → blue", "#00f"]]);
    } else if (name === "ndvi" || name === "ndviw") {
      legendItems([
        ["dry / bare", rgbHex(NDVI_RAMP[0])],
        ["mixed", rgbHex(NDVI_RAMP[1])],
        ["dense vegetation", rgbHex(NDVI_RAMP[2])],
      ]);
    } else if (name === "city" || name === "volw" || name === "audit" || name === "return") {
      legendItems([
        ["low built volume", rgbHex(VOLUME_RAMP[0])],
        ["mid", rgbHex(VOLUME_RAMP[1])],
        ["dense core", rgbHex(VOLUME_RAMP[2])],
        ["not built / no volume data", rgbHex(FADE)],
      ]);
    } else if (name === "frame" || name === "collapse") {
      legendItems([["Singapore", rgbHex(SG_COLOR)], ["Mexico City", rgbHex(MX_COLOR)]]);
    } else if (name === "globe_continent") {
      const hexes = cutColors("continent");
      legendItems(v2.meta.cut_levels.continent.map((c, i) => [c, hexes[i]]));
    } else if (name === "finale") {
      const hexes = cutColors("continent");
      legendItems(
        v2.meta.cut_levels.continent
          .map((c, i) => [c, hexes[i]])
          .concat([["non-city land · density", "#687386"]])
      );
    } else if (name === "globe_climate") {
      const hexes = cutColors("climate");
      legendItems(v2.meta.cut_levels.climate.map((c, i) => [c, hexes[i]]));
    } else if (name === "globe_pop") {
      legendItems([["quintile 1 (small)", rgbHex(POP_RAMP[0])], ["quintile 3", rgbHex(POP_RAMP[1])], ["quintile 5 (large)", rgbHex(POP_RAMP[2])]]);
    } else {
      legendEl.innerHTML = data.meta.group_names
        .map(
          (n, i) =>
            `<div class="item"><span class="swatch" style="background:${data.meta.group_colors[i]}"></span>${n.toUpperCase()}</div>`
        )
        .join("");
    }
  }

  // ---- the progress sphere ------------------------------------------------
  /* The manuscript class keeps a page-progress sphere in its running head
     (latex/alphaurbanism.cls:95-146): 43 pre-rendered frames of one sphere
     whose southern cap fills navy as the pages advance, with a coral latitude
     band on the fill boundary. This is the same shader as
     scripts/render_page_progress_spheres.py, re-implemented per pixel, with
     scroll through the 18 scenes standing in for the page counter. */

  const PS_PALE = [0.925, 0.942, 0.963];
  const PS_INK = [32 / 255, 39 / 255, 53 / 255];
  const PS_NAVY = [41 / 255, 73 / 255, 118 / 255];
  const PS_BLUE = [79 / 255, 136 / 255, 191 / 255];
  const PS_TEAL = [44 / 255, 140 / 255, 135 / 255];
  const PS_CORAL = [227 / 255, 61 / 255, 61 / 255];
  const PS_STRUCT = [200 / 255, 208 / 255, 218 / 255];
  const PS_LIGHT = (function () {
    const v = [-0.44, 0.66, 0.61];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  })();
  const PS_HALF = (function () {
    const v = [PS_LIGHT[0], PS_LIGHT[1], PS_LIGHT[2] + 1];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  })();
  const PS_LON = [-42, 0, 42].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);

  const psCanvas = document.getElementById("progress-sphere");
  const psCtx = psCanvas ? psCanvas.getContext("2d") : null;
  let psImage = null;
  let psLast = -1;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(a, b, x) {
    if (b === a) return x < a ? 0 : 1;
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  function renderProgressSphere(progress) {
    if (!psCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = psCanvas.clientWidth || 52;
    const cssH = psCanvas.clientHeight || 42;
    const W = Math.max(8, Math.round(cssW * dpr));
    const H = Math.max(8, Math.round(cssH * dpr));
    if (psCanvas.width !== W || psCanvas.height !== H) {
      psCanvas.width = W;
      psCanvas.height = H;
      psImage = null;
    }
    if (!psImage) psImage = psCtx.createImageData(W, H);

    // The generator's 300x240 frame: centre (119, 98), radius 77 px.
    const s = W / 300;
    const cx = 119 * s, cy = 98 * s, R = 77 * s;
    const fill = -1 + 2 * clamp01(progress);
    const showBand = progress > 0.012 && progress < 0.988;
    const d = psImage.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const fx = x + 0.5, fy = y + 0.5;

        // Two ground Gaussians (render_page_progress_spheres.py:77-88).
        let sh = 0;
        let dx = (fx - (cx + 19 * s)) / (59 * s);
        let dy = (fy - (cy + 87 * s)) / (10.5 * s);
        sh += 0.19 * Math.exp(-2.1 * (dx * dx + dy * dy));
        dx = (fx - (cx + 5 * s)) / (31 * s);
        dy = (fy - (cy + 78 * s)) / (4.4 * s);
        sh += 0.24 * Math.exp(-2.4 * (dx * dx + dy * dy));
        if (sh > 0.31) sh = 0.31;

        const nx = (fx - cx) / R;
        const ny = -(fy - cy) / R;
        const r = Math.hypot(nx, ny);
        const sa = 1 - smoothstep(0.992, 1.012, r);

        let cr, cg, cb, ca;
        if (sa <= 0.001) {
          cr = PS_INK[0] * 0.72; cg = PS_INK[1] * 0.72; cb = PS_INK[2] * 0.72;
          ca = sh;
        } else {
          const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r * r)));
          const mix = 1 - smoothstep(fill - 0.018, fill + 0.018, ny);
          const v = (ny + 1) / 2;
          const tex = 0.035 * Math.sin(4 * Math.atan2(nx, nz) + 2.2 * ny) * (0.25 + 0.75 * nz);
          let b0 = PS_PALE[0] * (1 - mix) + (PS_NAVY[0] * (1 - 0.58 * v) + PS_BLUE[0] * 0.42 * v + PS_TEAL[0] * 0.16 * v + tex) * mix;
          let b1 = PS_PALE[1] * (1 - mix) + (PS_NAVY[1] * (1 - 0.58 * v) + PS_BLUE[1] * 0.42 * v + PS_TEAL[1] * 0.16 * v + tex) * mix;
          let b2 = PS_PALE[2] * (1 - mix) + (PS_NAVY[2] * (1 - 0.58 * v) + PS_BLUE[2] * 0.42 * v + PS_TEAL[2] * 0.16 * v + tex) * mix;

          if (showBand) {
            const band = clamp01(1 - Math.abs(ny - fill) / 0.018);
            b0 = b0 * (1 - band) + PS_CORAL[0] * band;
            b1 = b1 * (1 - band) + PS_CORAL[1] * band;
            b2 = b2 * (1 - band) + PS_CORAL[2] * band;
          }

          // 3 parallels + 3 meridians, screen-space, front hemisphere only.
          let dist = Math.min(Math.abs(ny + 0.5), Math.abs(ny), Math.abs(ny - 0.5));
          for (let i = 0; i < 3; i++) {
            const dl = Math.abs(nx * PS_LON[i][0] - nz * PS_LON[i][1]);
            if (dl < dist) dist = dl;
          }
          const op = clamp01(1 - dist / 0.0105) * (0.54 + 0.18 * mix);
          if (op > 0) {
            const l0 = PS_STRUCT[0] * 0.78 * (1 - mix) + 0.94 * mix;
            const l1 = PS_STRUCT[1] * 0.78 * (1 - mix) + 0.97 * mix;
            const l2 = PS_STRUCT[2] * 0.78 * (1 - mix) + 1.0 * mix;
            b0 = b0 * (1 - op) + l0 * op;
            b1 = b1 * (1 - op) + l1 * op;
            b2 = b2 * (1 - op) + l2 * op;
          }

          const diff = clamp01(nx * PS_LIGHT[0] + ny * PS_LIGHT[1] + nz * PS_LIGHT[2]);
          const spec = 0.55 * Math.pow(clamp01(nx * PS_HALF[0] + ny * PS_HALF[1] + nz * PS_HALF[2]), 42);
          const lam = 0.54 + 0.46 * diff;
          let m0 = b0 * lam + spec, m1 = b1 * lam + spec, m2 = b2 * lam + spec;

          const fr = 0.34 * Math.pow(clamp01(1 - nz), 1.75);
          m0 = m0 * (1 - fr) + PS_NAVY[0] * 0.54 * fr;
          m1 = m1 * (1 - fr) + PS_NAVY[1] * 0.54 * fr;
          m2 = m2 * (1 - fr) + PS_NAVY[2] * 0.54 * fr;

          const rim = 0.42 * clamp01(1 - Math.abs(r - 0.984) / 0.012);
          m0 = m0 * (1 - rim) + PS_NAVY[0] * rim;
          m1 = m1 * (1 - rim) + PS_NAVY[1] * rim;
          m2 = m2 * (1 - rim) + PS_NAVY[2] * rim;

          const shA = sh * (1 - sa);
          ca = sa + shA;
          cr = (m0 * sa + PS_INK[0] * 0.72 * shA) / ca;
          cg = (m1 * sa + PS_INK[1] * 0.72 * shA) / ca;
          cb = (m2 * sa + PS_INK[2] * 0.72 * shA) / ca;
        }

        d[o] = clamp01(cr) * 255;
        d[o + 1] = clamp01(cg) * 255;
        d[o + 2] = clamp01(cb) * 255;
        d[o + 3] = clamp01(ca) * 255;
      }
    }
    psCtx.putImageData(psImage, 0, 0);
  }

  const scrollyEl = document.getElementById("scrolly");
  function scrollProgress() {
    if (!scrollyEl) return 0;
    const box = scrollyEl.getBoundingClientRect();
    const span = box.height - window.innerHeight;
    if (span <= 0) return box.top <= 0 ? 1 : 0;
    return clamp01(-box.top / span);
  }

  // Painted straight from the scroll handler rather than deferred to a frame:
  // the sphere is ~4,400 pixels, and rAF is throttled when the tab is hidden.
  function updateProgressSphere(force) {
    if (!psCtx) return;
    const p = scrollProgress();
    if (!force && Math.abs(p - psLast) < 0.004) return;
    psLast = p;
    renderProgressSphere(p);
  }
  if (psCtx) {
    updateProgressSphere(true);
    window.addEventListener("scroll", () => updateProgressSphere(false), { passive: true });
    window.addEventListener("resize", () => updateProgressSphere(true));
  }

  function fillMetrics() {
    const s = data.stats;
    const wetland = s.groups.find((g) => g.name === "Wetland & mangrove").dispersion_deg;
    const trees = s.groups.find((g) => g.name === "Trees").dispersion_deg;
    const audit = document.getElementById("audit-metrics");
    if (audit) {
      audit.innerHTML = [
        [s.built_dispersion_deg + "°", "SPREAD OF ALL BUILT CELLS (NATIVE 64-D ANGULAR DISPERSION)"],
        [trees + "°", "SPREAD OF TREE CELLS — THE FOREST IS AS WIDE AS THE CITY"],
        [s.built_low_vs_high_mean_separation_deg + "°", "LOW-VOLUME VS DENSE-CORE MEAN DIRECTIONS — INSIDE-CITY CONTRAST"],
        [wetland + "°", "SPREAD OF WETLAND & MANGROVE — THE TIGHTEST LAND CLASS"],
      ]
        .map((m) => `<div class="metric-card"><div class="value">${m[0]}</div><div class="label">${m[1]}</div></div>`)
        .join("");
    }
    const g = v2.stats;
    const globe = document.getElementById("globe-metrics");
    if (globe) {
      globe.innerHTML = [
        [g.median_between_city_deg + "°", "MEDIAN SEPARATION BETWEEN TWO CITY MEAN DIRECTIONS"],
        [g.sg_mx_mean_separation_deg + "°", "SINGAPORE VS MEXICO CITY MEAN DIRECTIONS"],
        [g.sg_land_dispersion_deg + "°", "SINGAPORE'S WHOLE LAND SPREAD AROUND ITS OWN MEAN"],
        [g.mx_land_dispersion_deg + "°", "MEXICO CITY'S WHOLE LAND SPREAD AROUND ITS OWN MEAN"],
      ]
        .map((m) => `<div class="metric-card"><div class="value">${m[0]}</div><div class="label">${m[1]}</div></div>`)
        .join("");
    }
  }

  // ---- boot --------------------------------------------------------------

  Promise.all([
    fetch("data/singapore_story.json").then((r) => r.json()),
    fetch("data/story_v2.json").then((r) => r.json()),
  ])
    .then(([payload, payload2]) => {
      data = payload;
      v2 = payload2;
      data.sphereArr = Int16Array.from(data.sphere);
      v2.sgPair = Int16Array.from(v2.sg.pair);
      v2.sgGlobal = Int16Array.from(v2.sg.global);
      v2.mxPair = Int16Array.from(v2.mx.pair);
      v2.mxGlobal = Int16Array.from(v2.mx.global);
      v2.globeArr = Int16Array.from(v2.globe.xyz);
      v2.sgIndex = v2.sg.globe_index;
      v2.mxIndex = v2.mx.globe_index;
      v2.nGlobe = v2.globe.continent.length;
      NT = 2 * NCELL + v2.nGlobe;

      const mk = () => new Float32Array(NT);
      px = mk(); py = mk(); pr = mk(); pg = mk(); pb = mk(); pa = mk(); ps = mk();
      tx = mk(); ty = mk(); tr = mk(); tg = mk(); tb = mk(); ta = mk(); ts = mk();
      sx = mk(); sy = mk(); sr = mk(); sg_ = mk(); sb = mk(); sa = mk(); ss = mk();

      // Static painter order: sg by local-sphere depth, mx by pair depth,
      // globe dots last (drawn on top in globe scenes).
      const p = [0, 0, 0];
      const sgIdx = Array.from({ length: NCELL }, (_, k) => k);
      const sgDepth = new Float32Array(NCELL);
      for (let k = 0; k < NCELL; k++) {
        sphPos(data.sphereArr, k, 0, 0, 1, p);
        sgDepth[k] = p[2];
      }
      sgIdx.sort((a, b) => sgDepth[a] - sgDepth[b]);
      const mxIdx = Array.from({ length: NCELL }, (_, k) => k);
      const mxDepth = new Float32Array(NCELL);
      for (let k = 0; k < NCELL; k++) {
        sphPos(v2.mxPair, k, 0, 0, 1, p);
        mxDepth[k] = p[2];
      }
      mxIdx.sort((a, b) => mxDepth[a] - mxDepth[b]);
      const gbIdx = Array.from({ length: v2.nGlobe }, (_, k) => k);
      const gbDepth = new Float32Array(v2.nGlobe);
      for (let k = 0; k < v2.nGlobe; k++) {
        sphPos(v2.globeArr, k, 0, 0, 1, p);
        gbDepth[k] = p[2];
      }
      gbIdx.sort((a, b) => gbDepth[a] - gbDepth[b]);
      drawOrder = new Int32Array(NT);
      let w = 0;
      for (const k of sgIdx) drawOrder[w++] = SG0 + k;
      for (const k of mxIdx) drawOrder[w++] = MX0 + k;
      for (const k of gbIdx) drawOrder[w++] = GB0 + k;

      resize();
      buildPackings();
      setTargets("map");
      snapToTargets();
      updateChrome("map");
      fillMetrics();
      draw();
      requestAnimationFrame(tick);

      const steps = document.querySelectorAll(".step");
      steps.forEach((s, i) => {
        const n = s.querySelector(".step-index");
        if (n) n.textContent = `${String(i + 1).padStart(2, "0")} / ${steps.length}`;
      });
      const visibleSteps = new Set();
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              visibleSteps.add(entry.target);
              steps.forEach((s) => s.classList.remove("active"));
              entry.target.classList.add("active");
              const next = entry.target.dataset.scene;
              stepsOnScreen = visibleSteps.size;
              if (next !== scene) beginTransition(next);
              else updateContext(scene);
            } else {
              visibleSteps.delete(entry.target);
              stepsOnScreen = visibleSteps.size;
              updateContext(scene);
            }
          });
        },
        { threshold: 0.6 }
      );
      steps.forEach((s) => io.observe(s));

      // Headless verification hook: jump to a scene with no animation.
      window.__gotoScene = (name) => {
        scene = name;
        prevScene = name;
        setTargets(name);
        updateChrome(name);
        snapToTargets();
        animating = false;
        draw();
      };

      window.addEventListener("resize", () => {
        resize();
        setTargets(scene);
        snapToTargets();
        draw();
      });
    })
    .catch((err) => {
      captionEl.textContent = "DATA FAILED TO LOAD: " + err.message;
    });
})();
