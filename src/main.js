/**
 * Serrano #1 Putt Reader
 * Transparent green-reading aid from digitized yardage-book slope samples.
 * Not a physics simulator — approximate break guidance for on-course use.
 */

const YARDS_TO_FEET = 3;
const CANVAS_PAD = 28;

const state = {
  data: null,
  ball: null,
  cup: null,
  mode: 'ball',
  showHeat: true,
  showArrows: true,
  dragging: null,
  view: { scale: 1, ox: 0, oy: 0, invY: true },
};

const canvas = document.getElementById('greenCanvas');
const ctx = canvas.getContext('2d');
const distVal = document.getElementById('distVal');
const gradeVal = document.getElementById('gradeVal');
const breakVal = document.getElementById('breakVal');
const aimVal = document.getElementById('aimVal');

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function radToDeg(r) {
  return (r * 180) / Math.PI;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function boundsOf(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function setupView(data) {
  const b = boundsOf(data.outline);
  const worldW = b.maxX - b.minX;
  const worldH = b.maxY - b.minY;
  const usableW = canvas.width - CANVAS_PAD * 2;
  const usableH = canvas.height - CANVAS_PAD * 2;
  const scale = Math.min(usableW / worldW, usableH / worldH) * 0.92;
  const drawnW = worldW * scale;
  const drawnH = worldH * scale;
  state.view = {
    scale,
    ox: (canvas.width - drawnW) / 2 - b.minX * scale,
    oy: (canvas.height - drawnH) / 2 + b.maxY * scale,
    invY: true,
    bounds: b,
  };
}

function worldToScreen(x, y) {
  const { scale, ox, oy } = state.view;
  return { x: ox + x * scale, y: oy - y * scale };
}

function screenToWorld(sx, sy) {
  const { scale, ox, oy } = state.view;
  return { x: (sx - ox) / scale, y: (oy - sy) / scale };
}

/** Inverse-distance weighted slope sample → {mag, dirRad, vx, vy} */
function sampleSlope(x, y) {
  const samples = state.data.samples;
  let wSum = 0;
  let vx = 0;
  let vy = 0;
  let magAcc = 0;
  let nearest = Infinity;

  for (const s of samples) {
    const d2 = (s.x - x) ** 2 + (s.y - y) ** 2;
    nearest = Math.min(nearest, Math.sqrt(d2));
    const w = 1 / (d2 + 0.35);
    const ang = degToRad(s.dir);
    vx += Math.cos(ang) * s.mag * w;
    vy += Math.sin(ang) * s.mag * w;
    magAcc += s.mag * w;
    wSum += w;
  }

  if (wSum === 0) return { mag: 0, dirRad: 0, vx: 0, vy: 0 };
  vx /= wSum;
  vy /= wSum;
  const mag = magAcc / wSum;
  const dirRad = Math.atan2(vy, vx);
  // Re-normalize vector to magnitude for consistent force use
  const len = Math.hypot(vx, vy) || 1;
  return {
    mag,
    dirRad,
    vx: (vx / len) * mag,
    vy: (vy / len) * mag,
    nearest,
  };
}

function heatColor(mag, alpha = 0.55) {
  // blue ~0 → cyan → green → yellow → orange → red ~7+
  const t = clamp(mag / 7, 0, 1);
  let r;
  let g;
  let b;
  if (t < 0.25) {
    const u = t / 0.25;
    r = 37 + (34 - 37) * u;
    g = 99 + (211 - 99) * u;
    b = 235 + (238 - 235) * u;
  } else if (t < 0.45) {
    const u = (t - 0.25) / 0.2;
    r = 34 + (34 - 34) * u;
    g = 211 + (197 - 211) * u;
    b = 238 + (94 - 238) * u;
  } else if (t < 0.65) {
    const u = (t - 0.45) / 0.2;
    r = 34 + (250 - 34) * u;
    g = 197 + (204 - 197) * u;
    b = 94 + (21 - 94) * u;
  } else if (t < 0.85) {
    const u = (t - 0.65) / 0.2;
    r = 250 + (249 - 250) * u;
    g = 204 + (115 - 204) * u;
    b = 21 + (22 - 21) * u;
  } else {
    const u = (t - 0.85) / 0.15;
    r = 249 + (239 - 249) * u;
    g = 115 + (68 - 115) * u;
    b = 22 + (68 - 22) * u;
  }
  return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
}

function drawGrid() {
  const { bounds } = state.view;
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  ctx.lineWidth = 1;
  for (let x = Math.floor(bounds.minX); x <= Math.ceil(bounds.maxX); x += 5) {
    const a = worldToScreen(x, bounds.minY - 1);
    const b = worldToScreen(x, bounds.maxY + 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = Math.floor(bounds.minY); y <= Math.ceil(bounds.maxY); y += 5) {
    const a = worldToScreen(bounds.minX - 1, y);
    const b = worldToScreen(bounds.maxX + 1, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOutline() {
  const outline = state.data.outline;
  ctx.save();
  ctx.beginPath();
  outline.forEach(([x, y], i) => {
    const p = worldToScreen(x, y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(167, 243, 208, 0.95)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function drawBunker() {
  const bunker = state.data.bunker;
  if (!bunker?.length) return;
  ctx.save();
  ctx.beginPath();
  bunker.forEach(([x, y], i) => {
    const p = worldToScreen(x, y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHeat() {
  if (!state.showHeat) return;
  const outline = state.data.outline;
  const { bounds } = state.view;
  const step = 0.75; // yards

  ctx.save();
  ctx.beginPath();
  outline.forEach(([x, y], i) => {
    const p = worldToScreen(x, y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.clip();

  for (let y = bounds.minY; y <= bounds.maxY; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      if (!pointInPolygon({ x, y }, outline)) continue;
      const s = sampleSlope(x, y);
      const p = worldToScreen(x, y);
      const px = state.view.scale * step * 1.05;
      ctx.fillStyle = heatColor(s.mag, 0.42);
      ctx.fillRect(p.x - px / 2, p.y - px / 2, px, px);
    }
  }
  ctx.restore();
}

function drawArrows() {
  if (!state.showArrows) return;
  const outline = state.data.outline;
  ctx.save();
  for (const s of state.data.samples) {
    if (!pointInPolygon({ x: s.x, y: s.y }, outline)) continue;
    const p = worldToScreen(s.x, s.y);
    const ang = degToRad(s.dir);
    // Screen y is inverted; convert world fall direction to screen
    const len = 8 + s.mag * 3.2;
    const dx = Math.cos(ang) * len;
    const dy = -Math.sin(ang) * len; // invert Y for canvas
    const tipX = p.x + dx;
    const tipY = p.y + dy;

    ctx.strokeStyle = heatColor(s.mag, 0.95).replace(/[\d.]+\)$/, '0.95)');
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.x - dx * 0.25, p.y - dy * 0.25);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const ah = 5;
    const backAng = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - Math.cos(backAng - 0.45) * ah,
      tipY - Math.sin(backAng - 0.45) * ah
    );
    ctx.lineTo(
      tipX - Math.cos(backAng + 0.45) * ah,
      tipY - Math.sin(backAng + 0.45) * ah
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawMarkers() {
  const { frontCenterP, backCenter, depthLabel } = state.data.markers;
  if (frontCenterP) {
    const p = worldToScreen(frontCenterP.x, frontCenterP.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(226,232,240,0.8)';
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', p.x, p.y + 0.5);
    ctx.restore();
  }
  if (backCenter) {
    const p = worldToScreen(backCenter.x, backCenter.y);
    ctx.save();
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (depthLabel) {
    const p = worldToScreen(depthLabel.x, depthLabel.y);
    ctx.save();
    ctx.fillStyle = '#fca5a5';
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.fillText(depthLabel.text, p.x - 18, p.y - 6);
    ctx.restore();
  }

  // North indicator
  ctx.save();
  const nx = canvas.width - 48;
  const ny = 42;
  // Page-up is canvas -y; north is rotated ~45° toward top-right
  const nAng = degToRad(-state.data.northDegreesFromUp); // from up toward right
  const ux = Math.sin(nAng);
  const uy = -Math.cos(nAng);
  ctx.strokeStyle = 'rgba(148,163,184,0.85)';
  ctx.fillStyle = 'rgba(226,232,240,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nx - ux * 14, ny - uy * 14);
  ctx.lineTo(nx + ux * 14, ny + uy * 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(nx + ux * 14, ny + uy * 14);
  ctx.lineTo(nx + ux * 6 - uy * 5, ny + uy * 6 + ux * 5);
  ctx.lineTo(nx + ux * 6 + uy * 5, ny + uy * 6 - ux * 5);
  ctx.closePath();
  ctx.fill();
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', nx + ux * 22, ny + uy * 22);
  ctx.restore();
}

function drawBallCup() {
  if (state.ball && state.cup) {
    drawAimPath(state.ball, state.cup);
  }
  if (state.ball) drawPin(state.ball, '#fbbf24', 'BALL');
  if (state.cup) drawPin(state.cup, '#f87171', 'CUP');
}

function drawPin(pt, color, label) {
  const p = worldToScreen(pt.x, pt.y);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(15,23,42,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(15,23,42,0.95)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '800 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(7,11,20,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(label, p.x, p.y - 18);
  ctx.fillText(label, p.x, p.y - 18);
  ctx.restore();
}

/**
 * Approximate break path:
 * Integrate a lightweight lateral acceleration from local fall-line component
 * perpendicular to the putt line. Tuned for readable aim offsets, not Stimp sim.
 */
function computePath(ball, cup) {
  const puttDist = dist(ball, cup);
  if (puttDist < 0.15) return null;

  const steps = Math.max(18, Math.round(puttDist * 6));
  const points = [];
  let x = ball.x;
  let y = ball.y;
  let vx = (cup.x - ball.x) / puttDist;
  let vy = (cup.y - ball.y) / puttDist;
  // speed in yards per step — finish near cup
  let speed = puttDist / steps;

  // Lateral aim offset estimate (yards at start, perpendicular)
  let lateralAccum = 0;

  for (let i = 0; i <= steps; i++) {
    points.push({ x, y });
    if (i === steps) break;

    const s = sampleSlope(x, y);
    // Fall vector in world yards
    const fx = s.vx; // mag * unit dir, units ≈ % slope
    const fy = s.vy;

    // Component perpendicular to intended line
    const cross = fx * (-vy) + fy * vx; // signed left/right relative to travel
    // Empirical scale: ~0.018 yd lateral per % cross per yard traveled
    const latPerYard = cross * 0.018;
    lateralAccum += latPerYard * speed;

    // Nudge velocity slightly toward fall for curved display path
    const bend = 0.045 * s.mag;
    vx = vx + fx * 0.0025 * bend;
    vy = vy + fy * 0.0025 * bend;
    const vlen = Math.hypot(vx, vy) || 1;
    vx /= vlen;
    vy /= vlen;

    // Soft attractor so path ends at cup
    const remain = Math.max(1, steps - i);
    const toCupX = (cup.x - x) / remain;
    const toCupY = (cup.y - y) / remain;
    x += vx * speed * 0.55 + toCupX * 0.45;
    y += vy * speed * 0.55 + toCupY * 0.45;
  }

  // Force last point to cup
  points[points.length - 1] = { x: cup.x, y: cup.y };

  // Straight-line grade (elevation proxy from fall · putt direction)
  const mid = {
    x: (ball.x + cup.x) / 2,
    y: (ball.y + cup.y) / 2,
  };
  const midS = sampleSlope(mid.x, mid.y);
  const puttUx = (cup.x - ball.x) / puttDist;
  const puttUy = (cup.y - ball.y) / puttDist;
  // Positive fall·putt means downhill along the putt
  const along = midS.vx * puttUx + midS.vy * puttUy;
  // Cross product for break side looking toward cup: + = fall to golfer's left
  const across = midS.vx * -puttUy + midS.vy * puttUx;

  // Aim tip: start left/right of cup by estimated lateral (screen/golfer view toward cup)
  // Looking along putt, positive across (fall to left) ⇒ ball breaks left ⇒ aim right
  const aimYards = clamp(Math.abs(across) * puttDist * 0.012, 0, puttDist * 0.35);
  const aimSide = across > 0.15 ? 'right' : across < -0.15 ? 'left' : 'straight';

  return {
    points,
    puttDist,
    along,
    across,
    midMag: midS.mag,
    aimYards,
    aimSide,
    breakLeft: across > 0.2,
    breakRight: across < -0.2,
  };
}

function drawAimPath(ball, cup) {
  const info = computePath(ball, cup);
  if (!info) return;

  // Straight reference
  const a = worldToScreen(ball.x, ball.y);
  const c = worldToScreen(cup.x, cup.y);
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(148,163,184,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Curved aim path
  ctx.strokeStyle = 'rgba(94,234,212,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  info.points.forEach((pt, i) => {
    const p = worldToScreen(pt.x, pt.y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Suggested aim point near cup (offset opposite break)
  if (info.aimSide !== 'straight' && info.aimYards > 0.05) {
    const puttDist = info.puttDist;
    const ux = (cup.x - ball.x) / puttDist;
    const uy = (cup.y - ball.y) / puttDist;
    // Perp to the right of travel: (uy, -ux); left: (-uy, ux)
    const sign = info.aimSide === 'right' ? 1 : -1;
    const ax = cup.x + uy * info.aimYards * sign;
    const ay = cup.y - ux * info.aimYards * sign;
    const ap = worldToScreen(ax, ay);
    ctx.fillStyle = 'rgba(94,234,212,0.95)';
    ctx.beginPath();
    ctx.arc(ap.x, ap.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.fillText('AIM', ap.x + 8, ap.y - 6);
  }
  ctx.restore();
}

function updateReadout() {
  if (!state.ball || !state.cup) {
    distVal.textContent = '—';
    gradeVal.textContent = '—';
    breakVal.textContent = 'Tap ball & cup';
    aimVal.textContent = 'Place both markers';
    return;
  }

  const info = computePath(state.ball, state.cup);
  if (!info) return;

  const feet = info.puttDist * YARDS_TO_FEET;
  const yards = info.puttDist;
  distVal.textContent =
    feet < 30
      ? `${feet.toFixed(1)} ft`
      : `${feet.toFixed(0)} ft · ${yards.toFixed(1)} yd`;

  const along = info.along;
  let grade;
  if (Math.abs(along) < 0.35) grade = 'Nearly level';
  else if (along > 0) grade = `Downhill ~${Math.abs(along).toFixed(1)}%`;
  else grade = `Uphill ~${Math.abs(along).toFixed(1)}%`;
  gradeVal.textContent = grade;

  let brk;
  if (Math.abs(info.across) < 0.25) brk = 'Little side break';
  else if (info.across > 0) brk = `Breaks left · ${info.midMag.toFixed(1)}%`;
  else brk = `Breaks right · ${info.midMag.toFixed(1)}%`;
  breakVal.textContent = brk;

  if (info.aimSide === 'straight') {
    aimVal.textContent = 'Start at the cup (mostly straight)';
  } else {
    const inch = info.aimYards * 36;
    const tip =
      inch < 4
        ? `just outside ${info.aimSide}`
        : inch < 12
          ? `~${inch.toFixed(0)} in ${info.aimSide} of cup`
          : `~${(inch / 12).toFixed(1)} ft ${info.aimSide} of cup`;
    aimVal.textContent = `Aim ${tip} (approx.)`;
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // subtle vignette bg
  const g = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.45,
    40,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.7
  );
  g.addColorStop(0, '#102033');
  g.addColorStop(1, '#0a121c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!state.data) return;
  drawGrid();
  drawBunker();
  drawHeat();
  drawOutline();
  drawArrows();
  drawMarkers();
  drawBallCup();
  updateReadout();
}

function nearestMarker(world, radiusYd = 1.6) {
  const hits = [];
  if (state.ball && dist(world, state.ball) <= radiusYd) {
    hits.push({ kind: 'ball', d: dist(world, state.ball) });
  }
  if (state.cup && dist(world, state.cup) <= radiusYd) {
    hits.push({ kind: 'cup', d: dist(world, state.cup) });
  }
  hits.sort((a, b) => a.d - b.d);
  return hits[0]?.kind || null;
}

function clampToGreen(pt) {
  const outline = state.data.outline;
  if (pointInPolygon(pt, outline)) return pt;
  // pull toward centroid
  let cx = 0;
  let cy = 0;
  for (const [x, y] of outline) {
    cx += x;
    cy += y;
  }
  cx /= outline.length;
  cy /= outline.length;
  let best = { x: cx, y: cy };
  let bestD = Infinity;
  for (let t = 0; t <= 1; t += 0.02) {
    const x = cx + (pt.x - cx) * t;
    const y = cy + (pt.y - cy) * t;
    if (pointInPolygon({ x, y }, outline)) {
      const d = Math.hypot(x - pt.x, y - pt.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

function placeAt(world) {
  const pt = clampToGreen(world);
  if (state.mode === 'ball') state.ball = pt;
  else state.cup = pt;
  render();
}

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = e.clientX ?? e.touches?.[0]?.clientX;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function onPointerDown(e) {
  e.preventDefault();
  const sp = canvasPointFromEvent(e);
  const wp = screenToWorld(sp.x, sp.y);
  const hit = nearestMarker(wp);
  if (hit) {
    state.dragging = hit;
    state.mode = hit;
    syncModeButtons();
  } else {
    placeAt(wp);
    state.dragging = state.mode;
  }
}

function onPointerMove(e) {
  if (!state.dragging) return;
  e.preventDefault();
  const sp = canvasPointFromEvent(e);
  const wp = clampToGreen(screenToWorld(sp.x, sp.y));
  if (state.dragging === 'ball') state.ball = wp;
  else state.cup = wp;
  render();
}

function onPointerUp() {
  state.dragging = null;
}

function syncModeButtons() {
  document.getElementById('modeBall').classList.toggle('active', state.mode === 'ball');
  document.getElementById('modeCup').classList.toggle('active', state.mode === 'cup');
}

function reset() {
  state.ball = null;
  state.cup = null;
  state.mode = 'ball';
  state.dragging = null;
  syncModeButtons();
  render();
}

async function init() {
  const res = await fetch(`${import.meta.env.BASE_URL}green-data.json`);
  state.data = await res.json();
  setupView(state.data);
  render();

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerdown', (e) => canvas.setPointerCapture?.(e.pointerId));

  document.getElementById('modeBall').addEventListener('click', () => {
    state.mode = 'ball';
    syncModeButtons();
  });
  document.getElementById('modeCup').addEventListener('click', () => {
    state.mode = 'cup';
    syncModeButtons();
  });
  document.getElementById('resetBtn').addEventListener('click', reset);
  document.getElementById('toggleHeat').addEventListener('click', (e) => {
    state.showHeat = !state.showHeat;
    e.currentTarget.classList.toggle('active', state.showHeat);
    render();
  });
  document.getElementById('toggleArrows').addEventListener('click', (e) => {
    state.showArrows = !state.showArrows;
    e.currentTarget.classList.toggle('active', state.showArrows);
    render();
  });
  document.getElementById('toggleChart').addEventListener('click', () => {
    document.getElementById('chartDialog').showModal();
  });

  // default toggles look "on"
  document.getElementById('toggleHeat').classList.add('active');
  document.getElementById('toggleArrows').classList.add('active');

  // Sensible default demo positions (front-left ball → mid-right cup-ish)
  state.ball = clampToGreen({ x: 10.5, y: 6.5 });
  state.cup = clampToGreen({ x: 22.0, y: 12.0 });
  render();
}

init().catch((err) => {
  console.error(err);
  aimVal.textContent = 'Failed to load green data';
});
