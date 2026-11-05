// The animated die and coin, adapted from Steve's "Moonlit Dice and Coin" design. Draws only: the app owns the buttons and text.

const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / Math.hypot(...a));

function rotate(v, x, y, z) {
  let [a, b, c] = v;
  [b, c] = [b * Math.cos(x) - c * Math.sin(x), b * Math.sin(x) + c * Math.cos(x)];
  [a, c] = [a * Math.cos(y) + c * Math.sin(y), -a * Math.sin(y) + c * Math.cos(y)];
  return [a * Math.cos(z) - b * Math.sin(z), a * Math.sin(z) + b * Math.cos(z), c];
}

const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_F = [[4, 5, 6, 7], [1, 0, 3, 2], [0, 4, 7, 3], [5, 1, 2, 6], [3, 7, 6, 2], [0, 1, 5, 4]];
const PIPS = {
  1: [[50, 50]], 2: [[27, 27], [73, 73]], 3: [[27, 27], [50, 50], [73, 73]], 4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]], 6: [[27, 25], [73, 25], [27, 50], [73, 50], [27, 75], [73, 75]],
};

// An icosahedron, turned so its first face points at the viewer. That face shows the result.
const { ICO_V, ICO_F } = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  let verts = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) verts.push([0, a, b], [a, b, 0], [b, 0, a]);
  verts = verts.map(norm);
  const dist = (i, j) => Math.hypot(...verts[i].map((v, k) => v - verts[j][k]));
  const faces = [];
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
    if (dist(a, b) < 1.1 && dist(b, c) < 1.1 && dist(c, a) < 1.1) {
      const f = [a, b, c];
      if (dot(cross(add(verts[b], mul(verts[a], -1)), add(verts[c], mul(verts[a], -1))), verts[a]) < 0) f.reverse();
      faces.push(f);
    }
  }
  const n = norm(faces[0].reduce((s, i) => add(s, verts[i]), [0, 0, 0]));
  const axis = norm(cross(n, [0, 0, 1])), ang = Math.acos(n[2]);
  const turned = verts.map(v => add(add(mul(v, Math.cos(ang)), mul(cross(axis, v), Math.sin(ang))), mul(axis, dot(axis, v) * (1 - Math.cos(ang)))));
  return { ICO_V: turned, ICO_F: faces };
})();

/** `reduced()` says whether to skip the motion. `onSettled(value)` runs when a roll lands. */
export function createChance({ reduced, onSettled }) {
  let canvas = null, ctx = null, W = 300, H = 230, observer = null;
  let kind = 'd6', busy = false, value = null, progress = 1, raf = 0;

  function resize() {
    if (!canvas) return;
    // clientWidth rather than a measured box: the whole stage can be scaled to fit large screens.
    W = canvas.clientWidth; H = canvas.clientHeight;
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = W * d; canvas.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    paint();
  }

  function drawCoin(cx, cy, radius, moving, t, left) {
    const turns = moving ? left * Math.PI * 9 : 0, R = radius * .83;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(moving ? Math.sin(t * 8) * left * .35 : 0);
    ctx.scale(Math.max(.035, Math.abs(Math.cos(turns))), 1);
    ctx.shadowColor = '#000'; ctx.shadowBlur = 20;
    const g = ctx.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, '#f1f5fc'); g.addColorStop(.25, '#75879d'); g.addColorStop(.55, '#d5e0ee'); g.addColorStop(1, '#61748a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(5, 2, R, R, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111f30'; ctx.strokeStyle = '#d7e4f5'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, R - 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8197b3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, R - 14, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 36; i++) {
      const a = i * Math.PI / 18;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (R - 9), Math.sin(a) * (R - 9)); ctx.lineTo(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12)); ctx.stroke();
    }
    const side = moving ? (Math.cos(turns) > 0 ? 'Heads' : 'Tails') : (value ?? 'Heads');
    ctx.fillStyle = '#e8f1ff'; ctx.shadowColor = '#c7e2ff'; ctx.shadowBlur = 10;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${R * .65}px Georgia`;
    // The variation selector keeps phones from swapping these for emoji.
    ctx.fillText(side === 'Heads' ? '☾︎' : '✦︎', 0, -8);
    ctx.font = `${R * .18}px system-ui`;
    ctx.fillText(side.toUpperCase(), 0, R * .51);
    ctx.restore();
  }

  function drawDie(cx, cy, radius, moving, left) {
    const is20 = kind === 'd20', verts = is20 ? ICO_V : CUBE_V, faces = is20 ? ICO_F : CUBE_F;
    const sides = is20 ? 20 : 6;
    const points = verts.map(v => rotate(v, (is20 ? 0 : -.46) + left * 11, (is20 ? 0 : .56) + left * 15, left * 8));
    const scale = is20 ? radius : radius * .65;
    const project = v => { const f = 8 / (8 - v[2]); return [cx + v[0] * scale * f, cy - v[1] * scale * f]; };
    const list = faces.map((f, i) => {
      const vs = f.map(j => points[j]);
      const normal = norm(cross(add(vs[1], mul(vs[0], -1)), add(vs[2], mul(vs[0], -1))));
      return { i, vs, normal, z: vs.reduce((s, v) => s + v[2] / f.length, 0) };
    }).sort((a, b) => a.z - b.z);
    const landed = !moving && value !== null;
    for (const face of list) {
      if (face.normal[2] < .03) continue;
      const ps = face.vs.map(project);
      ctx.beginPath();
      ps.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
      ctx.closePath();
      const light = Math.max(.1, dot(face.normal, norm([-.6, .7, 1])));
      const g = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      g.addColorStop(0, `rgb(${19 + light * 35},${29 + light * 40},${43 + light * 48})`);
      g.addColorStop(1, '#080e18');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = face.i === 0 && landed ? '#e5f2ff' : '#a7b8ce';
      ctx.lineWidth = is20 ? 2 : 3;
      ctx.shadowColor = '#afcfff';
      ctx.shadowBlur = face.i === 0 && landed ? 12 : 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      const number = face.i === 0 ? (value ?? sides) : ((Number(value || 1) + face.i - 1) % sides) + 1;
      if (is20) {
        const area = Math.abs((ps[1][0] - ps[0][0]) * (ps[2][1] - ps[0][1]) - (ps[1][1] - ps[0][1]) * (ps[2][0] - ps[0][0]));
        const center = ps.reduce((s, p) => [s[0] + p[0] / ps.length, s[1] + p[1] / ps.length], [0, 0]);
        ctx.save();
        ctx.fillStyle = '#eef5ff'; ctx.shadowColor = '#c5e0ff'; ctx.shadowBlur = landed ? 12 : 2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `${Math.max(8, Math.min(42, Math.sqrt(area) * .34))}px Georgia`;
        ctx.fillText(String(number), center[0], center[1]);
        ctx.restore();
      } else {
        const [a, b, , d] = ps;
        ctx.save();
        ctx.transform((b[0] - a[0]) / 100, (b[1] - a[1]) / 100, (d[0] - a[0]) / 100, (d[1] - a[1]) / 100, a[0], a[1]);
        for (const [u, v] of PIPS[number]) {
          ctx.beginPath(); ctx.arc(u, v, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#e8f2ff'; ctx.shadowColor = '#c7e2ff'; ctx.shadowBlur = 8; ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  function paint() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const t = progress, moving = busy && !reduced();
    const left = moving ? Math.pow(1 - t, 3) : 0;
    const jump = moving ? -Math.sin(t * Math.PI) * 40 - Math.abs(Math.sin(t * Math.PI * 4)) * 12 * (1 - t) : 0;
    const cx = W / 2 + Math.sin(t * 12) * left * 45, cy = H / 2 + 5 + jump;
    const radius = Math.min(W * .28, H * .34);

    ctx.save();
    ctx.translate(W / 2, H * .87); ctx.scale(1, .19);
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, radius * 1.5);
    glow.addColorStop(0, '#a7cfff33'); glow.addColorStop(1, '#99c6ff00');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#9fb5d025'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(W / 2, H * .87, radius * 1.2, radius * .16, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    if (kind === 'coin') drawCoin(cx, cy, radius, moving, t, left);
    else drawDie(cx, cy, radius, moving, left);
  }

  return {
    get busy() { return busy; },
    /** The app redraws its pages by replacing them, so a new canvas can arrive at any time, even mid-roll. */
    attach(next) {
      if (next === canvas) return;
      observer?.disconnect();
      canvas = next; ctx = canvas.getContext('2d');
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
      resize();
    },
    choose(next) { if (busy) return; kind = next; value = null; progress = 1; paint(); },
    /** The result is decided by the caller, before the animation starts. */
    roll(result) {
      if (busy) return;
      busy = true; value = result; progress = 0;
      const start = performance.now(), duration = reduced() ? 120 : 1350;
      const step = now => {
        progress = Math.min(1, (now - start) / duration);
        if (progress === 1) { busy = false; paint(); onSettled(value); return; }
        paint();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
    destroy() { cancelAnimationFrame(raf); observer?.disconnect(); busy = false; canvas = ctx = null; },
  };
}
