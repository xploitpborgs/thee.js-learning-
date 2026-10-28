/* Connect experience · procedural textures and shared geometry helpers.
   Everything is generated at runtime, so the scene ships no image or model files. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});

  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // Height field (0..1) to a tileable tangent-space normal map. Canvas rows run down, texture v runs up.
  function normalCanvas(H, size, strength) {
    const c = canvas(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = H[y * size + (x - 1 + size) % size], r = H[y * size + (x + 1) % size];
        const u = H[((y - 1 + size) % size) * size + x], dn = H[((y + 1) % size) * size + x];
        const nx = (l - r) * strength, ny = (dn - u) * strength, len = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
        d[i] = (nx / len * .5 + .5) * 255; d[i + 1] = (ny / len * .5 + .5) * 255; d[i + 2] = (1 / len * .5 + .5) * 255; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function tex(THREE, c, { srgb = false, aniso = 1, repeat = true } = {}) {
    const t = new THREE.CanvasTexture(c);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = aniso;
    return t;
  }

  /* Woven braid: two families of diagonal strands crossing over and under,
     each strand made of four fine fibres. One tile = 1/4 of the cable's circumference. */
  NS.braidTextures = function (THREE, size, aniso) {
    const n = 3, H = new Float32Array(size * size), tone = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const a = (u + v) * n, b = (u - v) * n + n;
        const ia = Math.floor(a), ib = Math.floor(b), fa = a - ia, fb = b - ib;
        const topA = ((ia + ib) & 1) === 0;
        const across = topA ? fa : fb, along = topA ? fb : fa;
        const round = Math.sqrt(Math.max(0, 1 - Math.pow(2 * across - 1, 2)));
        const fibres = Math.abs(Math.sin(across * Math.PI * 4));
        const arch = 0.5 + 0.5 * Math.sin(Math.PI * along);
        const i = y * size + x;
        H[i] = (0.74 * round + 0.26 * fibres) * (0.42 + 0.58 * arch);
        const strand = topA ? ia % n : (ib % n) + n;
        tone[i] = 0.9 + 0.22 * hash(strand * 3.7 + 1.3) + (hash(x * 1.31 + y * 7.73) - 0.5) * 0.07;
      }
    }
    const col = canvas(size, size), cctx = col.getContext('2d'), cimg = cctx.createImageData(size, size);
    const rough = canvas(size, size), rctx = rough.getContext('2d'), rimg = rctx.createImageData(size, size);
    const base = [88, 87, 84];
    for (let i = 0; i < size * size; i++) {
      const h = H[i], k = (0.7 + 0.3 * Math.pow(h, 0.85)) * tone[i], o = i * 4;
      cimg.data[o] = Math.min(255, base[0] * k); cimg.data[o + 1] = Math.min(255, base[1] * k); cimg.data[o + 2] = Math.min(255, base[2] * k); cimg.data[o + 3] = 255;
      const r = (0.5 + (1 - h) * 0.32) * 255;
      rimg.data[o] = r; rimg.data[o + 1] = r; rimg.data[o + 2] = r; rimg.data[o + 3] = 255;
    }
    cctx.putImageData(cimg, 0, 0); rctx.putImageData(rimg, 0, 0);
    return {
      map: tex(THREE, col, { srgb: true, aniso }),
      normalMap: tex(THREE, normalCanvas(H, size, size / 64), { aniso }),
      roughnessMap: tex(THREE, rough, { aniso })
    };
  };

  /* Brushed aluminium: long horizontal streaks for a fine bump and roughness variation. */
  NS.brushedTextures = function (THREE, size, aniso) {
    const H = new Float32Array(size * size), row = new Float32Array(size), R = Math.round(size / 24);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) row[x] = Math.random();
      const rowTone = hash(y * 3.17) * 0.5;
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += row[(k + size) % size];
      for (let x = 0; x < size; x++) {
        H[y * size + x] = rowTone * 0.45 + (sum / (2 * R + 1)) * 0.55;
        sum += row[(x + R + 1) % size] - row[(x - R + size) % size];
      }
    }
    let lo = 1, hi = 0;
    for (const v of H) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const bump = canvas(size, size), bctx = bump.getContext('2d'), bimg = bctx.createImageData(size, size);
    const rough = canvas(size, size), rctx = rough.getContext('2d'), rimg = rctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const h = (H[i] - lo) / (hi - lo || 1), o = i * 4, g = h * 255, r = (0.86 + h * 0.14) * 255;
      bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = g; bimg.data[o + 3] = 255;
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = r; rimg.data[o + 3] = 255;
    }
    bctx.putImageData(bimg, 0, 0); rctx.putImageData(rimg, 0, 0);
    return { bumpMap: tex(THREE, bump, { aniso }), roughnessMap: tex(THREE, rough, { aniso }) };
  };

  /* Bead-blasted aluminium: fine isotropic grain, no visible direction. */
  NS.grainTextures = function (THREE, size, aniso) {
    const N = new Float32Array(size * size), H = new Float32Array(size * size);
    for (let i = 0; i < N.length; i++) N[i] = Math.random();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += N[((y + j + size) % size) * size + (x + i + size) % size];
      H[y * size + x] = s / 9;
    }
    const bump = canvas(size, size), bctx = bump.getContext('2d'), bimg = bctx.createImageData(size, size);
    const rough = canvas(size, size), rctx = rough.getContext('2d'), rimg = rctx.createImageData(size, size);
    for (let i = 0; i < H.length; i++) {
      const h = Math.min(1, Math.max(0, (H[i] - 0.5) * 3 + 0.5)), o = i * 4, g = h * 255, r = (0.9 + h * 0.1) * 255;
      bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = g; bimg.data[o + 3] = 255;
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = r; rimg.data[o + 3] = 255;
    }
    bctx.putImageData(bimg, 0, 0); rctx.putImageData(rimg, 0, 0);
    return { bumpMap: tex(THREE, bump, { aniso }), roughnessMap: tex(THREE, rough, { aniso }) };
  };

  /* Softbox face: bright centre with a gentle falloff, so reflections read as gradients, not flat cards. */
  NS.softboxTexture = function (THREE) {
    const c = canvas(256, 256), ctx = c.getContext('2d'), g = ctx.createRadialGradient(128, 128, 10, 128, 128, 180);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#c8c8c8'); g.addColorStop(1, '#2a2a2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    return tex(THREE, c, { repeat: false });
  };

  /* Painted recess for a side port: lit chamfer rim, dark cavity, lit floor and the contact tongue.
     w, h are the opening in scene units; the decal adds a 0.6 mm rim around it. */
  NS.portTexture = function (THREE, w, h, kind) {
    const rim = 0.006, PW = w + rim * 2, PH = h + rim * 2, W = 512, H = Math.round(W * PH / PW), k = W / PW;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const stad = (ww, hh, inset) => { rrPath(ctx, (PW - ww) / 2 * k, (PH - hh) / 2 * k, ww * k, hh * k, hh * k / 2); };
    // chamfered rim catching the key light along its upper edge
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#dfe2e6'); g.addColorStop(0.45, '#9da1a7'); g.addColorStop(1, '#55595f');
    stad(w + rim * 1.4, h + rim * 1.4); ctx.fillStyle = g; ctx.fill();
    // cavity, darkest under the top lip, the floor catching a little light
    g = ctx.createLinearGradient(0, (PH - h) / 2 * k, 0, (PH + h) / 2 * k);
    g.addColorStop(0, '#020203'); g.addColorStop(0.6, '#08090a'); g.addColorStop(1, '#25272a');
    stad(w, h); ctx.fillStyle = g; ctx.fill();
    if (kind === 'usbc') {
      const tw = w * 0.7, th = h * 0.26, tx = (PW - tw) / 2 * k, ty = (PH - th) / 2 * k + h * 0.04 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; rrPath(ctx, tx, ty + th * k * 0.35, tw * k, th * k, th * k / 2); ctx.fill();
      g = ctx.createLinearGradient(0, ty, 0, ty + th * k);
      g.addColorStop(0, '#8d9197'); g.addColorStop(1, '#3d4045');
      rrPath(ctx, tx, ty, tw * k, th * k, th * k / 2); ctx.fillStyle = g; ctx.fill();
    } else {
      for (let i = 0; i < 5; i++) {
        const cx = (PW / 2 + (i - 2) * w * 0.14) * k, cy = PH / 2 * k;
        ctx.fillStyle = '#8a7a55'; ctx.beginPath(); ctx.arc(cx, cy, h * 0.12 * k, 0, Math.PI * 2); ctx.fill();
      }
    }
    const t = tex(THREE, c, { srgb: true, repeat: false, aniso: 4 });
    t.userData = { width: PW, height: PH };
    return t;
  };

  /* Front of a USB-C plug: hollow shell with the contact rows on the inner walls. */
  NS.plugMouthTexture = function (THREE, w, h) {
    const W = 512, H = Math.round(W * h / w), k = W / w, c = canvas(W, H), ctx = c.getContext('2d');
    rrPath(ctx, 0, 0, W, H, H / 2); ctx.fillStyle = '#9fa3a8'; ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0c0d'); g.addColorStop(0.5, '#020203'); g.addColorStop(1, '#141517');
    rrPath(ctx, W * 0.035, H * 0.16, W * 0.93, H * 0.68, H * 0.34); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(176,150,96,0.55)';
    for (let i = 0; i < 12; i++) {
      const x = W * (0.16 + i * 0.062);
      ctx.fillRect(x, H * 0.2, W * 0.022, H * 0.07); ctx.fillRect(x, H * 0.73, W * 0.022, H * 0.07);
    }
    return tex(THREE, c, { srgb: true, repeat: false, aniso: 4 });
  };

  /* Soft blurred rounded rectangle as an alpha map, for baked contact shadows. */
  NS.softRect = function (THREE, w, h, radius, softness) {
    const W = 256, Hh = Math.max(32, Math.round(256 * h / w)), c = canvas(W, Hh), ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, Hh);
    const layers = 28, padX = W * softness, padY = Hh * softness * (w / h) * (Hh / W) * (W / Hh);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1), ix = padX * (1 - t) * 0.95, iy = padY * (1 - t) * 0.95;
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#fff';
      rrPath(ctx, ix, iy, W - ix * 2, Hh - iy * 2, Math.max(2, radius * W / w * (0.5 + t * 0.5)));
      ctx.fill();
    }
    return tex(THREE, c, { repeat: false });
  };

  /* Radial alpha falloff, used for the subtle surface under the scene. */
  NS.radial = function (THREE, inner = 0.15) {
    const c = canvas(256, 256), ctx = c.getContext('2d'), g = ctx.createRadialGradient(128, 128, 128 * inner, 128, 128, 128);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    return tex(THREE, c, { repeat: false });
  };

  function rrPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  NS.rrPath = rrPath;

  /* ---------- Geometry helpers ---------- */
  NS.roundedRect = function (THREE, w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  };
  NS.stadium = function (THREE, w, h) { return NS.roundedRect(THREE, w, h, h / 2); };

  /* ExtrudeGeometry is non-indexed, so its normals come out faceted. Average face normals
     that share a position and sit within a crease angle, so bevels read as smooth rounded edges. */
  NS.smoothNormals = function (THREE, g, creaseDeg = 55) {
    const pos = g.attributes.position, n = pos.count, cos = Math.cos(creaseDeg * Math.PI / 180);
    const fn = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < n; t += 3) {
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      c.sub(b); b.sub(a); c.cross(b).normalize();
      for (let k = 0; k < 3; k++) { fn[(t + k) * 3] = -c.x; fn[(t + k) * 3 + 1] = -c.y; fn[(t + k) * 3 + 2] = -c.z; }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      let arr = groups.get(key); if (!arr) groups.set(key, arr = []); arr.push(i);
    }
    const out = new Float32Array(n * 3);
    groups.forEach(ids => {
      for (const i of ids) {
        let x = 0, y = 0, z = 0;
        for (const j of ids) {
          const d = fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2];
          if (d >= cos) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; }
        }
        const l = Math.hypot(x, y, z) || 1;
        out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
      }
    });
    g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
    return g;
  };

  /* Rounded slab lying flat: footprint w × d, height h, bottom at y = 0. */
  NS.slab = function (THREE, w, d, h, r, bevel, segs = 5) {
    const shape = NS.roundedRect(THREE, w - 2 * bevel, d - 2 * bevel, Math.max(0.002, r - bevel));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 20 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0);
    return NS.smoothNormals(THREE, g);
  };
})();
