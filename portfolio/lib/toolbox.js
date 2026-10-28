/* Toolbox · skills as bubbles in glass buckets. A small 2D physics sim on one canvas: grab a bubble and
   throw it into another bucket, shake them all, tidy them home, or tap one to read where the skill was
   used. Bubbles hop now and then so the buckets never sit still (unless reduced motion is on). */
(function () {
  'use strict';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const FONT = '"Hanken Grotesk", "Segoe UI", system-ui, sans-serif';

  window.Toolbox = { mount };

  function mount(canvas, opts) {
    const { groups, reduced } = opts;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, buckets = [], bubbles = [], segs = [];
    let raf = 0, visible = false, grabbed = null, quiet = 0;
    const ptr = { x: 0, y: 0, vx: 0, vy: 0, t: 0, downX: 0, downY: 0, downT: 0, ox: 0, oy: 0, id: null };

    // ---- layout: buckets in a row on wide screens, a grid on narrow ones ----
    function layout(fresh) {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const cols = W >= 900 ? groups.length : W >= 520 ? 3 : 2, rows = Math.ceil(groups.length / cols);
      const cellW = W / cols, cellH = H / rows;
      // bubbles are sized so the fullest bucket still holds all of its skills
      const most = Math.max(...groups.map(g => g.skills.length));
      const area = (cellW * (0.86 + 0.66) / 2) * (cellH * 0.66), fit = Math.sqrt(0.5 * area / (most * Math.PI * 1.15));
      const base = clamp(Math.min(cellW * 0.135, cellH * 0.115, fit), 13, 31);
      buckets = groups.map((g, i) => {
        const c = i % cols, row = Math.floor(i / cols), cx = cellW * (c + 0.5);
        const top = row * cellH + cellH * 0.14, bottom = row * cellH + cellH * 0.8;
        const wTop = cellW * 0.86, wBot = cellW * 0.66;
        return { g, cx, top, bottom, wTop, wBot, count: 0 };
      });
      segs = [];
      buckets.forEach(b => {
        const l0 = [b.cx - b.wTop / 2, b.top], l1 = [b.cx - b.wBot / 2, b.bottom], r1 = [b.cx + b.wBot / 2, b.bottom], r0 = [b.cx + b.wTop / 2, b.top];
        segs.push([l0, l1], [l1, r1], [r1, r0]);
      });
      if (fresh || !bubbles.length) {
        bubbles = [];
        groups.forEach((g, gi) => g.skills.forEach(([name, note]) => bubbles.push(makeBubble(name, note, gi, base))));
        tidy(true);
      } else bubbles.forEach(b => { b.r = b.r0 * base / b.base0; fitText(b); });
      draw();
    }
    function makeBubble(name, note, gi, base) {
      const b = { name, note, gi, home: gi, x: 0, y: 0, px: 0, py: 0, r: base * (0.95 + Math.min(0.28, name.length / 70)), r0: 0, base0: base, lines: [], fs: 12, hop: Math.random() * 4 };
      b.r0 = b.r; fitText(b);
      return b;
    }
    function fitText(b) {
      const words = b.name.split(' ');
      let fs = Math.max(9, Math.min(14, b.r * 0.42));
      ctx.font = `600 ${fs}px ${FONT}`;
      const maxW = b.r * 1.62;
      let lines = [b.name];
      if (ctx.measureText(b.name).width > maxW && words.length > 1) {
        let best = null;
        for (let k = 1; k < words.length; k++) {
          const a = words.slice(0, k).join(' '), c = words.slice(k).join(' ');
          const w = Math.max(ctx.measureText(a).width, ctx.measureText(c).width);
          if (!best || w < best.w) best = { w, l: [a, c] };
        }
        lines = best.l;
      }
      const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
      if (widest > maxW) fs = fs * maxW / widest;
      b.lines = lines; b.fs = fs;
    }
    // Pack each bucket row by row from the bottom, and hold every bubble inside its own bucket while it
    // settles, so nothing is flung over a wall into a neighbour before anyone has touched it.
    function tidy(instant) {
      const per = buckets.map(() => 0);
      bubbles.forEach(b => {
        const k = buckets[b.home], n = per[b.home]++, d = b.r * 2.1;
        const cols = Math.max(1, Math.floor(k.wBot / d)), row = Math.floor(n / cols), col = n % cols;
        const used = Math.min(cols, k.g.skills.length - row * cols);
        b.x = k.cx + (col - (used - 1) / 2) * d + (row % 2 ? b.r * 0.3 : 0);
        b.y = k.bottom - b.r - 3 - row * b.r * 1.85 - (instant ? 0 : 140 + n * 6);
        b.px = b.x; b.py = b.y; b.lock = instant ? 0 : 1.6;
      });
      if (instant) { bubbles.forEach(b => { b.lock = 99; }); for (let i = 0; i < 150; i++) step(1 / 60, true); bubbles.forEach(b => { b.lock = 0; }); }
      wake();
    }
    function keepHome(b) {
      const k = buckets[b.home], f = clamp((b.y - k.top) / (k.bottom - k.top), 0, 1), half = (k.wTop + (k.wBot - k.wTop) * f) / 2 - b.r - 3;
      if (half > 0) b.x = clamp(b.x, k.cx - half, k.cx + half);
    }

    // ---- physics: Verlet circles, bucket walls as thick segments ----
    const G = 1500, DAMP = 0.992;
    function step(dt, settle) {
      const g = G * dt * dt;
      for (const b of bubbles) {
        if (b === grabbed) continue;
        let vx = (b.x - b.px) * DAMP, vy = (b.y - b.py) * DAMP + g;
        if (b.lock > 0) b.lock -= dt;
        if (!reduced && !settle && !(b.lock > 0)) {
          b.hop -= dt;
          if (b.hop <= 0) { vy -= 2.2 + Math.random() * 2.6; vx += (Math.random() - 0.5) * 1.6; b.hop = 2.5 + Math.random() * 5; }
        }
        b.px = b.x; b.py = b.y; b.x += vx; b.y += vy;
      }
      for (let it = 0; it < 4; it++) {
        for (let i = 0; i < bubbles.length; i++) {
          const a = bubbles[i];
          for (let j = i + 1; j < bubbles.length; j++) {
            const b = bubbles[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2), push = (min - d) / d * 0.5, ka = a === grabbed ? 0 : b === grabbed ? 2 : 1, kb = b === grabbed ? 0 : a === grabbed ? 2 : 1;
            a.x -= dx * push * ka; a.y -= dy * push * ka; b.x += dx * push * kb; b.y += dy * push * kb;
          }
        }
        for (const b of bubbles) {
          if (b === grabbed) continue;
          for (const [p, q] of segs) {
            const ex = q[0] - p[0], ey = q[1] - p[1], t = clamp(((b.x - p[0]) * ex + (b.y - p[1]) * ey) / (ex * ex + ey * ey), 0, 1);
            const cx = p[0] + ex * t, cy = p[1] + ey * t, dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), min = b.r + 2.5;
            if (d < min && d > 0) { b.x += dx / d * (min - d); b.y += dy / d * (min - d); b.px += (b.x - b.px) * 0.08; }
          }
          if (b.lock > 0) keepHome(b);
          if (b.x < b.r) { b.x = b.r; } else if (b.x > W - b.r) { b.x = W - b.r; }
          if (b.y > H - b.r) { b.y = H - b.r; b.px += (b.x - b.px) * 0.2; }
          if (b.y < b.r - 200) b.y = b.r - 200;
        }
      }
      // a bubble balanced on a rim (or across two neighbouring rims) tips into the nearer bucket
      for (const b of bubbles) {
        if (b === grabbed) continue;
        let near = null, nd = Infinity;
        for (const k of buckets) for (const s of [-1, 1]) {
          const rx = k.cx + s * k.wTop / 2, d = Math.hypot(b.x - rx, b.y - k.top);
          if (d < nd) { nd = d; near = { k, rx }; }
        }
        if (near && nd < b.r + 6 && b.y < near.k.top) b.x += Math.sign(near.k.cx - near.rx) * 0.6;
      }
    }

    // ---- drawing ----
    const css = n => getComputedStyle(canvas).getPropertyValue(n).trim();
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const fg = css('--fg') || '#12161A', muted = css('--muted') || '#555D63';
      buckets.forEach(k => { k.count = 0; });
      bubbles.forEach(b => { const k = buckets.find(k => b.x > k.cx - k.wTop / 2 && b.x < k.cx + k.wTop / 2 && b.y > k.top - b.r && b.y < k.bottom); if (k) k.count++; });
      // back of each bucket
      buckets.forEach(k => {
        ctx.beginPath(); ctx.moveTo(k.cx - k.wTop / 2, k.top); ctx.lineTo(k.cx - k.wBot / 2, k.bottom); ctx.lineTo(k.cx + k.wBot / 2, k.bottom); ctx.lineTo(k.cx + k.wTop / 2, k.top); ctx.closePath();
        const gr = ctx.createLinearGradient(0, k.top, 0, k.bottom);
        gr.addColorStop(0, hexA(k.g.color, 0.02)); gr.addColorStop(1, hexA(k.g.color, 0.12));
        ctx.fillStyle = gr; ctx.fill();
      });
      // bubbles
      for (const b of bubbles) {
        const c = groups[b.gi].color;
        const gr = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
        gr.addColorStop(0, mix(c, '#ffffff', 0.42)); gr.addColorStop(0.7, c); gr.addColorStop(1, mix(c, '#000000', 0.18));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, -2.5, -1.6); ctx.stroke();
        if (b === grabbed) { ctx.strokeStyle = hexA(c, 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#ffffff'; ctx.font = `600 ${b.fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const lh = b.fs * 1.08, y0 = b.y - (b.lines.length - 1) * lh / 2;
        b.lines.forEach((l, i) => ctx.fillText(l, b.x, y0 + i * lh));
      }
      // glass front, rim and label
      buckets.forEach(k => {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = hexA(fg, 0.28); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(k.cx - k.wTop / 2, k.top); ctx.lineTo(k.cx - k.wBot / 2, k.bottom); ctx.lineTo(k.cx + k.wBot / 2, k.bottom); ctx.lineTo(k.cx + k.wTop / 2, k.top); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(k.cx - k.wTop / 2 + 9, k.top + 14); ctx.lineTo(k.cx - k.wBot / 2 + 8, k.bottom - 14); ctx.stroke();
        ctx.strokeStyle = k.g.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(k.cx - k.wTop / 2 - 4, k.top); ctx.lineTo(k.cx + k.wTop / 2 + 4, k.top); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = fg; ctx.font = `600 ${W < 520 ? 13 : 15}px ${FONT}`; ctx.fillText(k.g.name, k.cx, k.bottom + 12);
        ctx.fillStyle = muted; ctx.font = `500 ${W < 520 ? 10.5 : 11.5}px "IBM Plex Mono", monospace`;
        ctx.fillText(`${k.count} inside`, k.cx, k.bottom + (W < 520 ? 30 : 33));
      });
    }

    // ---- loop: runs while the section is on screen and something is moving ----
    let last = 0, acc = 0;
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      acc += dt; let n = 0;
      while (acc >= 1 / 60 && n < 4) { step(1 / 60, false); acc -= 1 / 60; n++; }
      if (n === 4) acc = 0;
      draw();
      let motion = 0; for (const b of bubbles) motion += Math.abs(b.x - b.px) + Math.abs(b.y - b.py);
      quiet = motion < 0.05 * bubbles.length && !grabbed ? quiet + 1 : 0;
      if (visible && (!reduced || quiet < 30 || grabbed)) raf = requestAnimationFrame(frame);
    }
    function wake() { if (!raf && visible) { last = performance.now(); quiet = 0; raf = requestAnimationFrame(frame); } }

    // ---- input ----
    function at(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function hit(p) { for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; if (Math.hypot(b.x - p.x, b.y - p.y) <= b.r + 2) return b; } return null; }
    function grab(b, p, id) {
      grabbed = b; bubbles.splice(bubbles.indexOf(b), 1); bubbles.push(b);
      Object.assign(ptr, { x: p.x, y: p.y, vx: 0, vy: 0, t: performance.now(), downX: p.x, downY: p.y, downT: performance.now(), ox: b.x - p.x, oy: b.y - p.y, id });
      try { canvas.setPointerCapture(id); } catch (err) { /* older browsers */ }
      canvas.style.cursor = 'grabbing';
      opts.onPick && opts.onPick(null);
      wake();
    }
    const pickOf = b => ({ name: b.name, note: b.note, group: groups[b.home].name, x: b.x, y: b.y - b.r, color: groups[b.home].color });
    // A finger on a bubble grabs it at once, as a mouse does, and that touch stops scrolling the page; a swipe
    // that starts on the glass, between the buckets or on the text around them still scrolls.
    canvas.addEventListener('pointerdown', e => {
      const p = at(e), b = hit(p);
      if (!b) return;
      e.preventDefault();
      grab(b, p, e.pointerId);
    });
    canvas.addEventListener('touchstart', e => { const t = e.touches[0]; if (e.touches.length === 1 && t && hit(at(t))) e.preventDefault(); }, { passive: false });
    canvas.addEventListener('pointermove', e => {
      const p = at(e);
      if (!grabbed) { if (e.pointerType === 'mouse') canvas.style.cursor = hit(p) ? 'grab' : 'default'; return; }
      const now = performance.now(), dt = Math.max(1, now - ptr.t);
      ptr.vx = ptr.vx * 0.5 + (p.x - ptr.x) / dt * 16 * 0.5; ptr.vy = ptr.vy * 0.5 + (p.y - ptr.y) / dt * 16 * 0.5;
      ptr.x = p.x; ptr.y = p.y; ptr.t = now;
      grabbed.x = clamp(p.x + ptr.ox, grabbed.r, W - grabbed.r); grabbed.y = clamp(p.y + ptr.oy, grabbed.r - 120, H - grabbed.r);
      wake();
    });
    const release = e => {
      if (!grabbed) return;
      const b = grabbed, p = at(e), tap = Math.hypot(p.x - ptr.downX, p.y - ptr.downY) < 6 && performance.now() - ptr.downT < 350;
      grabbed = null; canvas.style.cursor = e.pointerType === 'mouse' ? 'grab' : '';
      b.px = b.x - clamp(ptr.vx, -40, 40); b.py = b.y - clamp(ptr.vy, -40, 40);
      if (tap && opts.onPick) opts.onPick(pickOf(b));
      wake();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('touchmove', e => { if (grabbed) e.preventDefault(); }, { passive: false });

    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) wake(); });
    io.observe(canvas);
    const ro = new ResizeObserver(() => layout(false)); ro.observe(canvas);
    if (document.fonts) document.fonts.ready.then(() => { bubbles.forEach(fitText); draw(); });
    layout(true);

    return {
      shake() { for (const b of bubbles) { b.py = b.y + 9 + Math.random() * 9; b.px = b.x + (Math.random() - 0.5) * 10; } opts.onPick && opts.onPick(null); wake(); },
      tidy() { tidy(false); opts.onPick && opts.onPick(null); },
      redraw: draw
    };
  }

  // colour helpers for '#rrggbb'
  function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function hexA(h, a) { if (!h.startsWith('#')) return h; const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; }
  function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
})();
