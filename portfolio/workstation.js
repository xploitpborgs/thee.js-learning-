/* The Workstation · one desk, one long day.
   A real PC setup in a dark room: a 27-inch monitor, a glass-sided tower, a mechanical keyboard, a network
   switch on the wall and a city outside the window. The monitor tells the story of a working day, from the
   08:00 sign-in to the 23:00 all-clear, while the camera moves around the desk.
   NS.workstation(opts) draws it on a fixed full-viewport canvas; the page feeds it the scroll position
   with setProgress(p), p in 0..1. Everything on screen is a function of p and the clock, so scrolling
   back plays it in reverse. Returns null when WebGL is unavailable. Units: 1 = 10 cm, desk top at y = 0. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const bump = (p, a, b, c, d) => smooth(span(p, a, b)) * (1 - smooth(span(p, c, d)));
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const UI = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';
  const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';

  // The day, as the monitor shows it. Chapter windows in p.
  const T = {
    onboard: [0.075, 0.19], net: [0.215, 0.355], desk: [0.375, 0.515], sec: [0.535, 0.675], maint: [0.695, 0.82], end: [0.85, 1]
  };

  function pchip(xs, ys) {
    const n = xs.length, h = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
    return x => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }
  function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rr(x, X, Y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }

  // Night studio for reflections: a warm lamp, a cool window, the glow of a screen.
  function buildEnv(THREE, renderer) {
    const s = new THREE.Scene(), trash = [];
    const add = (w, h, hex, k, pos) => {
      const g = new THREE.PlaneGeometry(w, h), m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide });
      const o = new THREE.Mesh(g, m); o.position.copy(pos); o.lookAt(0, 0, 0); s.add(o); trash.push(g, m);
    };
    const box = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 40), new THREE.MeshBasicMaterial({ color: 0x0a0b0d, side: THREE.BackSide }));
    s.add(box); trash.push(box.geometry, box.material);
    add(10, 6, 0x5b7da8, 0.9, new THREE.Vector3(-4, 6, -14));     // the window
    add(4, 4, 0xffc58a, 2.2, new THREE.Vector3(-8, 10, 4));       // the lamp
    add(8, 4, 0xbfe6ef, 0.7, new THREE.Vector3(0, 3, -9));        // the monitor
    add(30, 2, 0x2a2420, 0.6, new THREE.Vector3(0, -6, 0));       // warm floor bounce
    const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(s, 0.04).texture;
    pm.dispose(); trash.forEach(d => d.dispose());
    return tex;
  }

  NS.workstation = function (opts) {
    const THREE = window.THREE;
    const { canvas, reduced } = opts;
    let renderer;
    try {
      if (!THREE || !NS.slab || !NS.buildMacBook) throw new Error('modules missing');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const cw = () => canvas.clientWidth || innerWidth, ch = () => canvas.clientHeight || innerHeight;
    const lite = /[?&]lite/.test(location.search) || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3 || Math.min(innerWidth, screen.width || innerWidth) < 760;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1.5 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x050607, 1);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (THREE.RectAreaLightUniformsLib) THREE.RectAreaLightUniformsLib.init();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400);
    const env = buildEnv(THREE, renderer);
    scene.environment = env;
    const tex = (c, rep) => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = aniso; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
    const dataTex = (c, rep) => { const t = new THREE.CanvasTexture(c); t.anisotropy = aniso; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
    const slab = (w, h, d, r, bevel = 0.012) => NS.slab(THREE, w, d, h, r, Math.min(bevel, h / 2.2), 4);
    const std = (hex, rough, metal, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(hex), roughness: rough, metalness: metal }, extra || {}));
    const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (parent || scene).add(m); return m; };
    const shadowed = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

    // ---------- procedural textures ----------
    function woodCanvas(w, h, base, dark, rings) {
      const c = cnv(w, h), x = c.getContext('2d');
      x.fillStyle = base; x.fillRect(0, 0, w, h);
      for (let i = 0; i < rings; i++) {
        const y0 = hash(i) * h, amp = 4 + hash(i + 9) * 18, f = 0.002 + hash(i + 3) * 0.006, a = 0.05 + hash(i + 5) * 0.16;
        x.strokeStyle = `rgba(${dark},${a.toFixed(3)})`; x.lineWidth = 0.6 + hash(i + 7) * 2.4;
        x.beginPath();
        for (let px = 0; px <= w; px += 8) { const y = y0 + Math.sin(px * f + i) * amp + Math.sin(px * f * 3.1 + i * 2) * amp * 0.3; px ? x.lineTo(px, y) : x.moveTo(px, y); }
        x.stroke();
      }
      return c;
    }
    const deskTex = tex(woodCanvas(2048, 512, '#4a2e1e', '20,10,4', 260));
    const floorC = cnv(1024, 1024), fx = floorC.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const strip = woodCanvas(1024, 128, ['#2a1f18', '#30231a', '#261c15', '#2d2119'][i % 4], '8,4,2', 40);
      fx.drawImage(strip, (i % 2) * -400, i * 128); fx.drawImage(strip, (i % 2) * -400 + 1024, i * 128);
      fx.fillStyle = 'rgba(0,0,0,.55)'; fx.fillRect(0, i * 128, 1024, 3);
      fx.fillRect(((i * 397) % 1024), i * 128, 3, 128);
    }
    const floorTex = tex(floorC, [4, 4]);
    const feltC = cnv(256, 256), ftx = feltC.getContext('2d'), fimg = ftx.createImageData(256, 256);
    for (let i = 0; i < fimg.data.length; i += 4) { const v = 24 + Math.random() * 14; fimg.data[i] = v; fimg.data[i + 1] = v + 1; fimg.data[i + 2] = v + 3; fimg.data[i + 3] = 255; }
    ftx.putImageData(fimg, 0, 0);
    const feltTex = tex(feltC, [6, 3]);
    const plasterC = cnv(512, 512), px_ = plasterC.getContext('2d'), pimg = px_.createImageData(512, 512);
    for (let i = 0; i < pimg.data.length; i += 4) { const v = 34 + Math.random() * 8; pimg.data[i] = v + 2; pimg.data[i + 1] = v; pimg.data[i + 2] = v - 2; pimg.data[i + 3] = 255; }
    px_.putImageData(pimg, 0, 0);
    const wallTex = tex(plasterC, [6, 4]);
    // the city at night, seen through the window
    const cityC = cnv(2048, 1024), cx = cityC.getContext('2d');
    const sky = cx.createLinearGradient(0, 0, 0, 1024); sky.addColorStop(0, '#05070d'); sky.addColorStop(0.55, '#0d1424'); sky.addColorStop(0.8, '#1b2232'); sky.addColorStop(1, '#2a2622');
    cx.fillStyle = sky; cx.fillRect(0, 0, 2048, 1024);
    for (let layer = 0; layer < 3; layer++) {
      let bx = -20;
      while (bx < 2048) {
        const bw = 40 + hash(bx + layer * 99) * (110 - layer * 20), bh = 160 + hash(bx * 3 + layer) * (480 - layer * 90) + layer * 40;
        const top = 1024 - bh - (2 - layer) * 40;
        cx.fillStyle = ['#0c111b', '#0a0e16', '#07090e'][layer]; cx.fillRect(bx, top, bw, 1024 - top);
        for (let wy = top + 8; wy < 1000; wy += 8 + layer * 2) for (let wx = bx + 4; wx < bx + bw - 4; wx += 6 + layer) {
          const r = hash(wx * 7.1 + wy * 3.3 + layer);
          if (r > 0.72) { cx.fillStyle = r > 0.95 ? 'rgba(160,210,255,.85)' : `rgba(255,${190 + Math.round(r * 40)},120,${(0.35 + (r - 0.72) * 2).toFixed(2)})`; cx.fillRect(wx, wy, 2.5, 3.5); }
        }
        if (hash(bx + 4) > 0.8) { cx.fillStyle = '#ff3b30'; cx.beginPath(); cx.arc(bx + bw / 2, top - 6, 3, 0, 7); cx.fill(); }
        bx += bw + 4 + hash(bx) * 20;
      }
    }
    const haze = cx.createLinearGradient(0, 700, 0, 1024); haze.addColorStop(0, 'rgba(255,170,90,0)'); haze.addColorStop(1, 'rgba(255,170,90,.18)');
    cx.fillStyle = haze; cx.fillRect(0, 700, 2048, 324);
    const cityTex = tex(cityC);

    // ---------- the room ----------
    const FLOOR = -7.5, WALL_Z = -6.2;
    const floor = add(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std(0xffffff, 0.62, 0, { map: floorTex, envMapIntensity: 0.4 }), 0, FLOOR, 0);
    floor.receiveShadow = true;
    const wallMat = std(0xffffff, 0.95, 0, { map: wallTex, envMapIntensity: 0.2 });
    // back wall with a window opening: x -15..-1, y 2..14.5
    const WX0 = -15, WX1 = -1, WY0 = 2, WY1 = 14.5;
    const wallPart = (x0, x1, y0, y1) => { const m = add(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallMat, (x0 + x1) / 2, (y0 + y1) / 2, WALL_Z); m.receiveShadow = true; return m; };
    wallPart(-40, WX0, FLOOR, 24); wallPart(WX1, 40, FLOOR, 24); wallPart(WX0, WX1, FLOOR, WY0); wallPart(WX0, WX1, WY1, 24);
    const city = add(new THREE.PlaneGeometry(150, 75), new THREE.MeshBasicMaterial({ map: cityTex }), -6, 12, -70);
    city.material.color.setScalar(0.6);
    const frameMat = std(0x16181b, 0.5, 0.6);
    const fr = (w, h, d, x, y, z) => add(new THREE.BoxGeometry(w, h, d), frameMat, x, y, z);
    fr(WX1 - WX0 + 0.5, 0.25, 0.5, (WX0 + WX1) / 2, WY0, WALL_Z); fr(WX1 - WX0 + 0.5, 0.25, 0.5, (WX0 + WX1) / 2, WY1, WALL_Z);
    fr(0.25, WY1 - WY0, 0.5, WX0, (WY0 + WY1) / 2, WALL_Z); fr(0.25, WY1 - WY0, 0.5, WX1, (WY0 + WY1) / 2, WALL_Z);
    fr(0.14, WY1 - WY0, 0.3, (WX0 + WX1) / 2, (WY0 + WY1) / 2, WALL_Z); fr(WX1 - WX0, 0.14, 0.3, (WX0 + WX1) / 2, 8.6, WALL_Z);
    const sill = add(slab(WX1 - WX0 + 1.2, 0.18, 1.1, 0.04), std(0x2b2d31, 0.4, 0.1), (WX0 + WX1) / 2, WY0 - 0.12, WALL_Z + 0.45);
    sill.receiveShadow = true;
    const glass = add(new THREE.PlaneGeometry(WX1 - WX0, WY1 - WY0), new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.16, envMapIntensity: 0.6 }), (WX0 + WX1) / 2, (WY0 + WY1) / 2, WALL_Z - 0.05);
    glass.renderOrder = 2;
    add(new THREE.PlaneGeometry(60, 40).rotateY(Math.PI / 2), wallMat, -22, 12, 4).receiveShadow = true;

    // ---------- the desk: walnut top on a black steel frame ----------
    const DW = 17, DD = 7.6, DT = 0.42;
    const desk = new THREE.Group(); scene.add(desk);
    const top = add(slab(DW, DT, DD, 0.12, 0.03), std(0xffffff, 0.55, 0, { map: deskTex, envMapIntensity: 0.55 }), 0, -DT, 0, desk);
    const steel = std(0x111214, 0.38, 0.85);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => add(new THREE.BoxGeometry(0.5, -FLOOR - DT, 0.5), steel, sx * (DW / 2 - 0.9), (FLOOR - DT) / 2, sz * (DD / 2 - 0.6), desk));
    add(new THREE.BoxGeometry(DW - 1.8, 0.5, 0.4), steel, 0, -DT - 0.4, -DD / 2 + 0.6, desk);
    [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.4, 0.5, DD - 1.2), steel, sx * (DW / 2 - 0.9), -DT - 0.4, 0, desk));
    shadowed(desk);

    // desk mat
    const mat = add(slab(9.6, 0.04, 4.1, 0.25, 0.012), std(0xffffff, 0.98, 0, { map: feltTex, envMapIntensity: 0.1 }), -0.6, 0, 1.2);
    mat.receiveShadow = true;

    // ---------- the monitor: 27-inch, thin bezel, aluminium stand ----------
    const MW = 6.12, MH = 3.62, MX = -0.6, MY = 3.55, MZ = -2.0;
    const mon = new THREE.Group(); mon.position.set(MX, MY, MZ); mon.rotation.x = -0.05; scene.add(mon);
    const shell = std(0x1a1b1e, 0.45, 0.5);
    const panelGeo = slab(MW, 0.13, MH, 0.1, 0.02); panelGeo.rotateX(Math.PI / 2); panelGeo.translate(0, 0, -0.13);
    add(panelGeo, shell, 0, 0, 0, mon);
    const hump = slab(3.4, 0.36, 2.2, 0.4, 0.1); hump.rotateX(Math.PI / 2); hump.translate(0, 0, -0.36); add(hump, shell, 0, -0.2, -0.13, mon);
    const SW = 5.98, SH = 3.364;
    const scrRes = lite ? 1280 : 2048;
    const screenC = cnv(scrRes, Math.round(scrRes * SH / SW)), sx = screenC.getContext('2d'), sW = screenC.width, sH = screenC.height, U = sW / 100;
    const screenTex = tex(screenC);
    const screenMat = new THREE.MeshPhysicalMaterial({ color: 0x020304, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1, envMapIntensity: 0.5 });
    const screen = add(new THREE.PlaneGeometry(SW, SH), screenMat, 0, 0.06, 0.004, mon);
    const alu = std(0x9a9da2, 0.32, 1, { envMapIntensity: 1 });
    add(new THREE.BoxGeometry(0.7, 3.7, 0.2), alu, 0, -1.95, -0.75, mon).rotation.x = 0.12;
    const base = add(slab(2.6, 0.08, 1.9, 0.25, 0.02), alu, MX, 0, MZ - 0.55); base.castShadow = true;
    shadowed(mon);
    const bias = new THREE.PointLight(0xffffff, 0, 14, 2); bias.position.set(MX, MY + 0.4, MZ - 1.2); scene.add(bias);
    const biasStrip = add(new THREE.BoxGeometry(MW - 0.6, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 0, MH / 2 - 0.25, -0.5, mon);
    const monGlow = new THREE.RectAreaLight(0xffffff, 0, SW, SH);
    monGlow.position.set(MX, MY, MZ + 0.05); monGlow.lookAt(MX, MY - 0.6, MZ + 5); scene.add(monGlow);

    // ---------- the tower: glass side, three front fans, a GPU and an AIO ----------
    const PX = 5.95, PZ = -1.1, PW = 2.15, PH = 4.7, PD = 4.5;
    const pc = new THREE.Group(); pc.position.set(PX, 0, PZ); scene.add(pc);
    const caseMat = std(0x0b0c0e, 0.6, 0.5, { envMapIntensity: 0.5 });
    const rgb = new THREE.Color(), rgbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    add(new THREE.BoxGeometry(PW, 0.12, PD), caseMat, 0, PH - 0.06, 0, pc);                 // top
    add(new THREE.BoxGeometry(PW, 0.14, PD), caseMat, 0, 0.12, 0, pc);                      // bottom
    add(new THREE.BoxGeometry(0.08, PH, PD), caseMat, PW / 2 - 0.04, PH / 2, 0, pc);        // right panel
    add(new THREE.BoxGeometry(PW, PH, 0.08), caseMat, 0, PH / 2, -PD / 2 + 0.04, pc);       // back
    [[-0.85, -1.9], [0.85, -1.9], [-0.85, 1.9], [0.85, 1.9]].forEach(([x, z]) => add(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 16), std(0x1c1c1c, 0.9, 0), x, 0.05, z, pc));
    // front: a dark mesh panel with the fans' glow behind it
    const meshC = cnv(256, 512), mx = meshC.getContext('2d');
    mx.fillStyle = '#fff'; mx.fillRect(0, 0, 256, 512); mx.fillStyle = '#000';
    for (let y = 4; y < 512; y += 9) for (let x = (y / 9) % 2 ? 4 : 8.5; x < 256; x += 9) { mx.beginPath(); mx.arc(x, y, 3.2, 0, 7); mx.fill(); }
    const front = add(new THREE.PlaneGeometry(PW - 0.1, PH - 0.3), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.6, metalness: 0.6, alphaMap: dataTex(meshC), transparent: true, side: THREE.DoubleSide }), 0, PH / 2, PD / 2 - 0.02, pc);
    front.renderOrder = 3;
    add(new THREE.BoxGeometry(0.28, 0.035, 0.06), rgbMat, -0.6, PH + 0.005, PD / 2 - 0.25, pc);   // power LED strip
    // inside
    add(new THREE.BoxGeometry(0.05, PH - 1.4, PD - 0.9), std(0x101418, 0.6, 0.3), PW / 2 - 0.12, PH / 2 + 0.45, -0.1, pc);   // motherboard
    add(new THREE.BoxGeometry(PW - 0.2, 1.05, PD - 0.2), caseMat, 0, 0.72, 0, pc);                                          // PSU shroud
    add(new THREE.BoxGeometry(0.02, 0.05, PD - 0.6), rgbMat, -PW / 2 + 0.12, 1.26, 0, pc);
    // GPU
    const gpu = new THREE.Group(); gpu.position.set(0.15, 1.95, -0.15); pc.add(gpu);
    add(new THREE.BoxGeometry(1.5, 0.55, 3.1), std(0x1b1d21, 0.35, 0.8), 0, 0, 0, gpu);
    add(new THREE.BoxGeometry(0.02, 0.06, 2.4), rgbMat, -0.76, 0.15, 0, gpu);
    const fanBlades = [];
    function fan(r, parent, x, y, z, ry, rx) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx || 0, ry || 0, 0); parent.add(g);
      add(new THREE.TorusGeometry(r, r * 0.07, 8, 48), rgbMat, 0, 0, 0, g);
      add(new THREE.TorusGeometry(r * 1.06, r * 0.04, 6, 48), std(0x0c0c0d, 0.5, 0.2), 0, 0, -0.02, g);
      const blades = new THREE.Group(); g.add(blades);
      const bm = std(0x1a1b1d, 0.45, 0.1, { transparent: true, opacity: 0.92 });
      for (let k = 0; k < 9; k++) { const b = add(new THREE.BoxGeometry(r * 0.78, r * 0.26, 0.015), bm, 0, 0, 0, blades); b.geometry.translate(r * 0.46, 0, 0); b.rotation.z = k / 9 * Math.PI * 2; b.rotation.x = 0.35; }
      add(new THREE.CylinderGeometry(r * 0.24, r * 0.24, 0.06, 20).rotateX(Math.PI / 2), std(0x111111, 0.4, 0.3), 0, 0, 0.01, blades);
      fanBlades.push(blades); return g;
    }
    [-0.6, 0.3, 1.2].forEach(dz => fan(0.34, gpu, 0, -0.29, dz, 0, Math.PI / 2));
    [1.15, 2.55, 3.95].forEach(y => fan(0.62, pc, 0, y, PD / 2 - 0.22, 0, 0));
    fan(0.55, pc, 0.1, 3.4, -PD / 2 + 0.2, Math.PI, 0);
    // AIO pump and RAM
    const pump = add(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 32).rotateZ(Math.PI / 2), std(0x18191c, 0.3, 0.8), PW / 2 - 0.32, 3.45, 0.2, pc);
    add(new THREE.TorusGeometry(0.34, 0.035, 8, 40).rotateY(Math.PI / 2), rgbMat, PW / 2 - 0.47, 3.45, 0.2, pc);
    for (let k = 0; k < 4; k++) {
      add(new THREE.BoxGeometry(0.06, 0.9, 0.22), std(0x202226, 0.4, 0.6), PW / 2 - 0.3 - k * 0.11, 3.45, 1.1, pc);
      add(new THREE.BoxGeometry(0.05, 0.08, 0.2), rgbMat, PW / 2 - 0.3 - k * 0.11, 3.94, 1.1, pc);
    }
    [[0.25, 0.9], [0.25, -0.5]].forEach(([y, z]) => add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 10).rotateX(Math.PI / 2), std(0x0b0b0b, 0.7, 0), PW / 2 - 0.35, 3.45 + y, z - 1.1, pc));
    // the glass side panel faces the room
    const glassSide = add(new THREE.PlaneGeometry(PD - 0.12, PH - 0.2).rotateY(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.2, envMapIntensity: 1.4, depthWrite: false }), -PW / 2 + 0.02, PH / 2, 0, pc);
    glassSide.renderOrder = 4;
    pc.traverse(m => { if (m.isMesh && m.material !== rgbMat && m !== glassSide && m !== front) { m.castShadow = true; m.receiveShadow = true; } });
    const pcLight = new THREE.PointLight(0xffffff, 0, 9, 2); pcLight.position.set(PX - 0.3, 2.6, PZ + 0.4); scene.add(pcLight);

    // ---------- keyboard: tenkeyless, dark caps, soft backlight ----------
    const KX = -0.75, KZ = 1.25, KU = 0.19;
    const kb = new THREE.Group(); kb.position.set(KX, 0.04, KZ); kb.rotation.x = 0.05; scene.add(kb);
    add(slab(3.62, 0.24, 1.38, 0.08, 0.03), std(0x1d1f22, 0.4, 0.8), 0, 0, 0, kb);
    const plate = add(new THREE.PlaneGeometry(3.4, 1.18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 0, 0.245, 0, kb);
    const rows = [
      [[1], [0.5, 'gap'], [1], [1], [1], [1], [0.25, 'gap'], [1], [1], [1], [1], [0.25, 'gap'], [1], [1], [1], [1], [0.25, 'gap'], [1], [1], [1]],
      [[1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [2], [0.25, 'gap'], [1], [1], [1]],
      [[1.5], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1.5], [0.25, 'gap'], [1], [1], [1]],
      [[1.75], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [2.25]],
      [[2.25], [1], [1], [1], [1], [1], [1], [1], [1], [1], [1], [2.75], [1.25, 'gap'], [1]],
      [[1.25], [1.25], [1.25], [6.25], [1.25], [1.25], [1.25], [1.25], [0.25, 'gap'], [1], [1], [1]]
    ];
    const keys = [];
    rows.forEach((row, r) => {
      let x = 0;
      row.forEach(([w, g]) => { if (!g) keys.push({ x: x + w / 2, r, w }); x += w; });
    });
    const capGeo = slab(KU * 0.86, 0.11, KU * 0.86, 0.025, 0.018);
    const caps = new THREE.InstancedMesh(capGeo, std(0x2a2c30, 0.68, 0.05, { envMapIntensity: 0.35 }), keys.length);
    caps.castShadow = true; caps.receiveShadow = true; kb.add(caps);
    const keyPress = new Float32Array(keys.length);
    const Mtx = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Sc = V(), Ps = V();
    function placeKeys() {
      keys.forEach((k, i) => {
        Ps.set((k.x - 9.1) * KU, 0.25 - keyPress[i] * 0.05, (k.r - 2.6) * KU * 1.02 + (k.r === 0 ? -0.05 : 0));
        Sc.set((k.w * KU - KU * 0.14) / (KU * 0.86), 1, 1);
        Mtx.compose(Ps, Qt, Sc); caps.setMatrixAt(i, Mtx);
      });
      caps.instanceMatrix.needsUpdate = true;
    }
    placeKeys();
    // mouse
    const mouse = add(new THREE.SphereGeometry(0.5, 40, 24), std(0x1c1d20, 0.45, 0.2), 2.85, 0.02, 1.35);
    mouse.scale.set(0.62, 0.36, 1.1); mouse.geometry.translate(0, 0.32, 0); mouse.castShadow = true;
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16).rotateZ(Math.PI / 2), std(0x444448, 0.5, 0.4), 2.85, 0.33, 0.95);

    // ---------- the new starter's laptop, being set up beside the monitor ----------
    const grain = NS.grainTextures(THREE, lite ? 256 : 512, aniso);
    const mb = NS.buildMacBook(THREE, { grain, env, legendRes: lite ? 1024 : 2048, screenRes: lite ? 1024 : 1536, aniso });
    mb.group.position.set(-5.7, 0, 0.5); mb.group.rotation.y = 0.38; mb.lid.rotation.x = -106 * Math.PI / 180;
    shadowed(mb.group); scene.add(mb.group);
    const lc = mb.screenCanvas, lx = lc.getContext('2d'), LW = lc.width, LH = lc.height, LU = LW / 100;
    let lapKey = '';

    // ---------- the lamp ----------
    const lampMat = std(0x16171a, 0.35, 0.8);
    const lamp = new THREE.Group(); lamp.position.set(-8.4, 0, -3.2); scene.add(lamp);
    add(new THREE.CylinderGeometry(0.75, 0.82, 0.16, 40), lampMat, 0, 0.08, 0, lamp);
    const j1 = V(0, 0.16, 0), j2 = V(0.6, 5.2, 0.4), j3 = V(2.6, 6.8, 1.6);
    const arm = (a, b) => { const d = b.clone().sub(a), m = add(new THREE.CylinderGeometry(0.07, 0.07, d.length(), 10), lampMat, 0, 0, 0, lamp); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); };
    arm(j1, j2); arm(j2, j3);
    add(new THREE.SphereGeometry(0.14, 16, 12), lampMat, j2.x, j2.y, j2.z, lamp);
    const head = new THREE.Group(); head.position.copy(j3); lamp.add(head);
    const aimAt = V(6.6, -6.8, 3.4).normalize();
    head.quaternion.setFromUnitVectors(V(0, -1, 0), aimAt);
    add(new THREE.CylinderGeometry(0.28, 0.62, 1.0, 40, 1, true), std(0x16171a, 0.35, 0.8, { side: THREE.DoubleSide }), 0, -0.4, 0, head);
    const bulb = add(new THREE.CircleGeometry(0.5, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb8956c, toneMapped: false }), 0, -0.88, 0, head);
    shadowed(lamp); bulb.castShadow = false;
    const spot = new THREE.SpotLight(lin(0xffcf9e), 5, 36, 0.85, 0.7, 1.1);
    const lampPos = lamp.position.clone().add(j3).add(aimAt.clone().multiplyScalar(0.85));
    spot.position.copy(lampPos); spot.target.position.copy(lampPos).addScaledVector(aimAt, 10);
    spot.castShadow = true; spot.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048); spot.shadow.bias = -0.0006; spot.shadow.radius = 4;
    spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 30;
    scene.add(spot, spot.target);

    // ---------- the network shelf: router and 8-port switch, patched in ----------
    const shelf = new THREE.Group(); shelf.position.set(7.8, 6.4, WALL_Z + 1.05); scene.add(shelf);
    add(slab(7, 0.26, 2.0, 0.04, 0.02), std(0xffffff, 0.55, 0, { map: deskTex, envMapIntensity: 0.5 }), 0, -0.26, 0, shelf);
    const sw = new THREE.Group(); sw.position.set(-1.0, 0, 0.1); shelf.add(sw);
    add(slab(3.3, 0.44, 1.5, 0.04, 0.015), std(0x2b2e33, 0.38, 0.85), 0, 0, 0, sw);
    const portMat = std(0x050505, 0.9, 0), bootMat = [std(0x2f7bd8, 0.5, 0), std(0xd8d8d8, 0.5, 0), std(0xe5b23a, 0.5, 0), std(0x2f7bd8, 0.5, 0), std(0xd8d8d8, 0.5, 0), std(0x3aa86b, 0.5, 0)];
    const ledGeo = new THREE.BoxGeometry(0.05, 0.035, 0.02);
    const leds = [];
    const PORTS = 8, cables = [];
    for (let k = 0; k < PORTS; k++) {
      const x = -1.25 + k * 0.3;
      add(new THREE.BoxGeometry(0.22, 0.17, 0.08), portMat, x, 0.2, 0.73, sw);
      const l1 = add(ledGeo, new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }), x - 0.06, 0.34, 0.755, sw);
      const l2 = add(ledGeo, new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }), x + 0.06, 0.34, 0.755, sw);
      leds.push([l1, l2]);
      if (k < 6) {
        const boot = add(new THREE.BoxGeometry(0.2, 0.16, 0.3), bootMat[k], x, 0.2, 0.9, sw);
        const a = V(x, 0.2, 1.05), b = V(x, 0.05, 1.5), c = V(x * 0.6 + 0.6, -0.9, 1.2), d = V(1.2 + k * 0.06, -2.5, 0.2), e = V(1.4 + k * 0.06, -6.6, -0.6);
        const curve = new THREE.CatmullRomCurve3([a, b, c, d, e].map(v => v.clone().add(sw.position)));
        const cab = add(new THREE.TubeGeometry(curve, 60, 0.032, 6, false), std([0x2f7bd8, 0xd8d8d8, 0xe5b23a, 0x2f7bd8, 0xd8d8d8, 0x3aa86b][k], 0.6, 0), 0, 0, 0, shelf);
        cables.push({ curve, mesh: cab, boot });
      }
    }
    add(new THREE.BoxGeometry(0.06, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: lin(0x4cd07f), toneMapped: false }), 1.45, 0.34, 0.755, sw);
    const router = new THREE.Group(); router.position.set(2.0, 0, 0.0); shelf.add(router);
    add(slab(2.3, 0.4, 1.5, 0.12, 0.05), std(0xe9e9e6, 0.5, 0.05), 0, 0, 0, router);
    const rLeds = [];
    for (let k = 0; k < 5; k++) rLeds.push(add(new THREE.BoxGeometry(0.08, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }), -0.6 + k * 0.3, 0.22, 0.755, router));
    [[-0.85, -0.25], [0, -0.35], [0.85, -0.25]].forEach(([x, rz], i) => { const a = add(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 12), std(0x1b1b1b, 0.6, 0), x, 1.05, -0.55, router); a.rotation.z = [0.25, 0, -0.25][i]; a.rotation.x = -0.12; });
    shadowed(shelf);
    const shelfLight = new THREE.PointLight(lin(0xcfe2ff), 0.9, 9, 2); shelfLight.position.set(7.4, 8.6, -3.2); scene.add(shelfLight);
    const tracer = new THREE.Sprite(new THREE.SpriteMaterial({ map: NS.radial(THREE, 0), color: lin(0xffffff), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    tracer.scale.set(0.5, 0.5, 1); scene.add(tracer);
    const FAULT = 3;

    // ---------- small things on the desk ----------
    const mugPts = [V(0, 0, 0), V(0.42, 0, 0), V(0.46, 0.05, 0), V(0.48, 1.0, 0), V(0.44, 1.0, 0), V(0.42, 0.12, 0), V(0, 0.12, 0)].map(v => new THREE.Vector2(v.x, v.y));
    const mug = new THREE.Group(); mug.position.set(3.55, 0, -1.4); scene.add(mug);
    add(new THREE.LatheGeometry(mugPts, 48), std(0xd9d4cb, 0.35, 0), 0, 0, 0, mug);
    add(new THREE.TorusGeometry(0.26, 0.05, 12, 24, Math.PI), std(0xd9d4cb, 0.35, 0), 0.46, 0.52, 0, mug).rotation.z = -Math.PI / 2;
    add(new THREE.CircleGeometry(0.43, 32).rotateX(-Math.PI / 2), std(0x1d0f07, 0.15, 0), 0, 0.82, 0, mug);
    shadowed(mug);
    const hdd = new THREE.Group(); hdd.position.set(3.7, 0, 2.55); hdd.rotation.y = -0.3; scene.add(hdd);
    add(slab(0.85, 0.22, 1.25, 0.08, 0.03), std(0x232529, 0.45, 0.6), 0, 0, 0, hdd);
    const hddLed = add(new THREE.CircleGeometry(0.025, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }), 0.3, 0.225, 0.5, hdd);
    shadowed(hdd);
    const note = new THREE.Group(); note.position.set(-3.5, 0, 2.7); note.rotation.y = 0.18; scene.add(note);
    add(slab(1.55, 0.14, 2.15, 0.06, 0.02), std(0x1f2a2a, 0.8, 0), 0, 0, 0, note);
    add(new THREE.BoxGeometry(0.04, 0.15, 2.17), std(0xb04a2a, 0.7, 0), 0.5, 0.01, 0, note);
    add(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 10).rotateX(Math.PI / 2), std(0x111111, 0.3, 0.8), 0.95, 0.04, 0.1, note);
    shadowed(note);
    const plant = new THREE.Group(); plant.position.set(7.6, 0, 2.6); scene.add(plant);
    add(new THREE.CylinderGeometry(0.55, 0.42, 0.9, 32), std(0x7c7a75, 0.85, 0), 0, 0.45, 0, plant);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 24), std(0x2a1d14, 1, 0), 0, 0.86, 0, plant);
    const leafMat = std(0x4f7a52, 0.55, 0, { envMapIntensity: 0.4 });
    for (let k = 0; k < 14; k++) {
      const a = k * 2.4, r = 0.1 + (k % 5) * 0.06, lf = add(new THREE.SphereGeometry(0.2, 12, 8), leafMat, Math.cos(a) * r, 1.0 + (k % 3) * 0.08, Math.sin(a) * r, plant);
      lf.scale.set(0.5, 1.5, 0.35); lf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
    }
    shadowed(plant);

    // ---------- light ----------
    const hemi = new THREE.HemisphereLight(lin(0x46587a), lin(0x2a1c12), 0.6); scene.add(hemi);
    const moon = new THREE.DirectionalLight(lin(0x7f9cc8), 0.35); moon.position.set(-8, 10, -30); scene.add(moon);

    // ---------- the monitor's apps: one per hour of the day ----------
    const C = { bg: '#0c0f13', panel: '#141920', line: '#212833', ink: '#e9edf1', mute: 'rgba(233,237,241,.55)', dim: 'rgba(233,237,241,.3)', acc: '#f2a541', cyan: '#5fd4e6', ok: '#4fd08a', bad: '#ff6157', warn: '#f2a541' };
    function chrome(app, time, crumbs) {
      const x = sx;
      x.fillStyle = C.bg; x.fillRect(0, 0, sW, sH);
      x.fillStyle = '#0f1318'; x.fillRect(0, 0, U * 6, sH);
      for (let k = 0; k < 6; k++) { x.fillStyle = k === 0 ? C.acc : 'rgba(233,237,241,.14)'; rr(x, U * 1.9, U * (4 + k * 4.4), U * 2.2, U * 2.2, U * 0.5); x.fill(); }
      x.fillStyle = '#0f1318'; x.fillRect(U * 6, 0, sW, U * 4.2);
      x.fillStyle = C.line; x.fillRect(U * 6, U * 4.2, sW, 2);
      x.font = `600 ${U * 1.45}px ${UI}`; x.fillStyle = C.ink; x.textBaseline = 'middle';
      x.fillText(app, U * 8, U * 2.15);
      x.font = `400 ${U * 1.25}px ${UI}`; x.fillStyle = C.mute; x.fillText(crumbs || '', U * 8 + x.measureText(app).width * 1.18 + U * 1.5, U * 2.15);
            x.textBaseline = 'alphabetic';
    }
    const txt = (s, X, Y, size, color, weight, font) => { sx.font = `${weight || 400} ${U * size}px ${font || UI}`; sx.fillStyle = color || C.ink; sx.fillText(s, X, Y); };
    const card = (X, Y, w, h) => { sx.fillStyle = C.panel; rr(sx, X, Y, w, h, U * 0.8); sx.fill(); sx.strokeStyle = C.line; sx.lineWidth = 2; sx.stroke(); };
    const chip = (s, X, Y, col) => { sx.font = `600 ${U * 1.05}px ${MONO}`; const w = sx.measureText(s).width + U * 1.6; sx.fillStyle = col + '22'; rr(sx, X, Y - U * 1.1, w, U * 1.7, U * 0.85); sx.fill(); sx.fillStyle = col; sx.fillText(s, X + U * 0.8, Y + U * 0.12); return w; };
    const check = (X, Y, r, col) => { sx.fillStyle = col; sx.beginPath(); sx.arc(X, Y, r, 0, 7); sx.fill(); sx.strokeStyle = '#0b0f13'; sx.lineWidth = r * 0.28; sx.beginPath(); sx.moveTo(X - r * 0.45, Y); sx.lineTo(X - r * 0.1, Y + r * 0.38); sx.lineTo(X + r * 0.5, Y - r * 0.38); sx.stroke(); };
    const bar = (X, Y, w, k, col) => { sx.fillStyle = 'rgba(255,255,255,.08)'; rr(sx, X, Y, w, U * 0.6, U * 0.3); sx.fill(); if (k > 0) { sx.fillStyle = col; rr(sx, X, Y, Math.max(U * 0.6, w * clamp(k)), U * 0.6, U * 0.3); sx.fill(); } };

    function drawLock(k) {
      const g = sx.createLinearGradient(0, 0, sW, sH); g.addColorStop(0, '#141b26'); g.addColorStop(1, '#2a1e18');
      sx.fillStyle = g; sx.fillRect(0, 0, sW, sH);
      sx.fillStyle = 'rgba(242,165,65,.08)'; sx.beginPath(); sx.arc(sW * 0.78, sH * 0.9, sH * 0.7, 0, 7); sx.fill();
      sx.textAlign = 'center';
      txt('08:00', sW / 2, sH * 0.44, 9, C.ink, 300);
      txt('Monday · Good morning', sW / 2, sH * 0.52, 1.6, C.mute, 400);
      sx.fillStyle = 'rgba(255,255,255,.1)'; rr(sx, sW / 2 - U * 9, sH * 0.6, U * 18, U * 2.6, U * 1.3); sx.fill();
      txt('•'.repeat(Math.round(k * 10)) || 'Sign in', sW / 2, sH * 0.6 + U * 1.75, 1.3, C.mute, 500, MONO);
      sx.textAlign = 'left';
    }
    const STEPS = [['Create account', 'New starter · Finance'], ['Licences & groups', 'Microsoft 365 · Finance · Printers'], ['Multi-factor sign-in', 'Approved on phone'], ['Protect the device', 'Endpoint protection · Updates'], ['Hand over', 'Signed in, ready for day one']];
    function drawOnboard(u) {
      chrome('Admin centre', '08:30', '/  Users  /  New starter');
      txt('Set up a new starter', U * 8, U * 10, 2.6, C.ink, 600);
      txt('Account, access and device, done before they arrive.', U * 8, U * 12.8, 1.3, C.mute);
      card(U * 8, U * 16, U * 52, U * 37);
      const done = u * STEPS.length;
      STEPS.forEach(([t, s], i) => {
        const y = U * 21 + i * U * 6.4, k = clamp(done - i);
        if (k >= 1) check(U * 12, y, U * 1.2, i === 4 ? C.ok : C.cyan);
        else { sx.strokeStyle = 'rgba(233,237,241,.2)'; sx.lineWidth = U * 0.22; sx.beginPath(); sx.arc(U * 12, y, U * 1.1, 0, 7); sx.stroke(); if (k > 0) { sx.strokeStyle = C.cyan; sx.beginPath(); sx.arc(U * 12, y, U * 1.1, -1.57, -1.57 + k * 6.28); sx.stroke(); } }
        txt(t, U * 15, y - U * 0.2, 1.5, k > 0 ? C.ink : C.dim, 600);
        txt(s, U * 15, y + U * 1.9, 1.1, k > 0 ? C.mute : C.dim);
        if (k >= 1) chip('DONE', U * 50, y + U * 0.3, i === 4 ? C.ok : C.cyan);
      });
      card(U * 62, U * 16, U * 32, U * 37);
      txt('DEVICE', U * 65, U * 20.5, 1.05, C.mute, 600, MONO);
      txt('MacBook · FIN-LT-014', U * 65, U * 23.6, 1.5, C.ink, 600);
      const cxr = U * 78, cyr = U * 36, r = U * 7;
      sx.lineWidth = U * 1.1; sx.strokeStyle = 'rgba(255,255,255,.08)'; sx.beginPath(); sx.arc(cxr, cyr, r, 0, 7); sx.stroke();
      sx.strokeStyle = u >= 1 ? C.ok : C.cyan; sx.beginPath(); sx.arc(cxr, cyr, r, -1.57, -1.57 + clamp(u) * 6.28); sx.stroke();
      sx.textAlign = 'center'; txt(Math.round(clamp(u) * 100) + '%', cxr, cyr + U * 1, 3, C.ink, 300); txt(u >= 1 ? 'Compliant' : 'Enrolling', cxr, cyr + U * 3.4, 1.1, u >= 1 ? C.ok : C.mute, 600, MONO); sx.textAlign = 'left';
      bar(U * 65, U * 49, U * 26, u, u >= 1 ? C.ok : C.cyan);
    }
    function drawNet(p) {
      const fault = p >= 0.245 && p < 0.315, tracing = p >= 0.275 && p < 0.315, fixed = p >= 0.315;
      chrome('Network monitor', '09:40', '/  Head office  /  Floor 2');
      txt(fault ? 'Link down on switch port 4' : fixed ? 'All links up' : 'All links up', U * 8, U * 10, 2.6, C.ink, 600);
      sx.fillStyle = fault ? C.bad : C.ok; sx.beginPath(); sx.arc(U * 8.6, U * 13, U * 0.55, 0, 7); sx.fill();
      txt(fault ? (tracing ? 'Tracing the fault · cable re-seated, testing' : 'FIN-PC-04 unreachable · 1 user affected') : '24 devices online · 0 errors', U * 10, U * 13.5, 1.3, C.mute);
      card(U * 8, U * 16, U * 60, U * 39);
      const nodes = { net: [38, 21], fw: [38, 28], rt: [38, 35], sw: [38, 42] };
      const N = (k) => [U * nodes[k][0], U * nodes[k][1]];
      const link = (a, b, col, dash) => { sx.strokeStyle = col; sx.lineWidth = U * 0.25; sx.setLineDash(dash ? [U, U * 0.8] : []); sx.beginPath(); sx.moveTo(a[0], a[1]); sx.lineTo(b[0], b[1]); sx.stroke(); sx.setLineDash([]); };
      link(N('net'), N('fw'), C.cyan); link(N('fw'), N('rt'), C.cyan); link(N('rt'), N('sw'), C.cyan);
      for (let k = 0; k < 8; k++) {
        const ex = U * (13 + k * 7.2), ey = U * 50, bad = k === FAULT && fault;
        link(N('sw'), [ex, ey - U * 1.4], bad ? C.bad : fixed && k === FAULT && p < 0.345 ? C.ok : 'rgba(95,212,230,.55)', bad && !tracing);
        sx.fillStyle = bad ? C.bad : C.panel; sx.strokeStyle = bad ? C.bad : C.cyan; sx.lineWidth = 2; rr(sx, ex - U * 2.6, ey - U * 1.4, U * 5.2, U * 2.8, U * 0.5); sx.fill(); sx.stroke();
        sx.textAlign = 'center'; txt('PC-0' + (k + 1), ex, ey + U * 0.45, 0.95, bad ? '#200' : C.ink, 600, MONO); sx.textAlign = 'left';
      }
      if (tracing) { const t = span(p, 0.275, 0.315), a = N('sw'), b = [U * (13 + FAULT * 7.2), U * 48.6]; sx.fillStyle = '#fff'; sx.beginPath(); sx.arc(mix(a[0], b[0], t), mix(a[1], b[1], t), U * 0.6, 0, 7); sx.fill(); }
      [['net', 'Internet'], ['fw', 'Firewall'], ['rt', 'Router'], ['sw', 'Switch · 8 port']].forEach(([k, s]) => {
        const [X, Y] = N(k); sx.fillStyle = C.panel; sx.strokeStyle = C.cyan; sx.lineWidth = 2; rr(sx, X - U * 6, Y - U * 1.5, U * 12, U * 3, U * 1.5); sx.fill(); sx.stroke();
        sx.textAlign = 'center'; txt(s, X, Y + U * 0.45, 1.05, C.ink, 600); sx.textAlign = 'left';
      });
      card(U * 70, U * 16, U * 25, U * 39);
      txt('EVENTS', U * 72.5, U * 20.5, 1.05, C.mute, 600, MONO);
      const ev = [['09:12', 'DHCP lease renewed', C.dim]];
      if (p >= 0.245) ev.push(['09:41', 'Port 4 · link down', C.bad]);
      if (p >= 0.275) ev.push(['09:43', 'Cable test · fault', C.warn]);
      if (p >= 0.315) ev.push(['09:46', 'Port 4 · up 1 Gbps', C.ok]);
      ev.forEach(([t, s, c], i) => { txt(t, U * 72.5, U * (24.5 + i * 3.4), 1.05, C.dim, 500, MONO); txt(s, U * 77.5, U * (24.5 + i * 3.4), 1.15, c === C.dim ? C.mute : c, 500); });
      txt('LATENCY', U * 72.5, U * 42, 1.05, C.mute, 600, MONO);
      sx.strokeStyle = fault ? C.bad : C.cyan; sx.lineWidth = U * 0.18; sx.beginPath();
      for (let k = 0; k <= 40; k++) { const X = U * (72.5 + k * 0.5), v = (hash(k) * 0.5 + (fault && k > 26 ? 2.2 : 0)) * U * 1.6; k ? sx.lineTo(X, U * 51 - v) : sx.moveTo(X, U * 51 - v); }
      sx.stroke();
    }
    const TICKETS = [['INC-2041', 'Finance', "Can't sign in", 'Account unlocked'], ['INC-2042', 'Front desk', 'Printer offline', 'Driver reinstalled'], ['INC-2043', 'HR', 'No Wi-Fi on laptop', 'Profile re-pushed'], ['INC-2044', 'Sales', 'Outlook stuck syncing', 'Profile rebuilt'], ['INC-2045', 'Ops', 'Laptop running slow', 'Disk cleared'], ['INC-2046', 'Director', 'Zoom audio not working', 'Device reset']];
    const tOpen = i => T.desk[0] + 0.004 + i * 0.006, tFix = i => T.desk[0] + 0.05 + i * 0.013;
    function drawDesk(p) {
      const open = TICKETS.filter((_, i) => p >= tOpen(i)).length, fixed = TICKETS.filter((_, i) => p >= tFix(i)).length;
      chrome('Service desk', '11:15', '/  Queue  /  Today');
      txt('Service desk', U * 8, U * 10, 2.6, C.ink, 600);
      txt(`${open - fixed} open  ·  ${fixed} resolved today  ·  first response under 10 min`, U * 8, U * 13.2, 1.3, C.mute);
      card(U * 8, U * 16, U * 87, U * 39);
      ['ID', 'REQUESTER', 'ISSUE', 'STATUS'].forEach((h, i) => txt(h, U * [11, 22, 36, 70][i], U * 20.5, 1, C.dim, 600, MONO));
      TICKETS.forEach(([id, who, what, fix], i) => {
        const y = U * (24.5 + i * 5), seen = i < open, ok = i < fixed, act = seen && !ok && i === fixed;
        sx.globalAlpha = seen ? 1 : 0.25;
        if (act) { sx.fillStyle = 'rgba(95,212,230,.07)'; rr(sx, U * 9, y - U * 2.6, U * 85, U * 4.4, U * 0.5); sx.fill(); }
        sx.fillStyle = C.line; sx.fillRect(U * 9, y + U * 1.8, U * 85, 2);
        txt(id, U * 11, y, 1.15, C.mute, 500, MONO); txt(who, U * 22, y, 1.3, C.ink, 500); txt(what, U * 36, y, 1.3, C.ink, 600);
        if (ok) { chip('RESOLVED', U * 70, y - U * 0.3, C.ok); txt(fix, U * 79, y, 1.15, C.mute); }
        else if (act) { chip('REMOTE SESSION', U * 70, y - U * 0.3, C.cyan); }
        else chip('OPEN', U * 70, y - U * 0.3, C.bad);
        sx.globalAlpha = 1;
      });
    }
    const EVENTS = [['HIGH', 'Brute-force sign-in attempts', '203.0.113.24', 'Blocked · account locked'], ['MED', 'Port scan from external host', '198.51.100.7', 'Dropped at firewall'], ['HIGH', 'Phishing email, credential link', 'finance@ inbox', 'Quarantined · 14 copies'], ['HIGH', 'Malicious attachment opened', 'FIN-PC-02', 'Endpoint blocked · isolated'], ['MED', 'Sign-in from new country', 'j.ade@', 'MFA challenge · denied'], ['LOW', 'Outdated browser detected', 'OPS-PC-06', 'Patch queued']];
    const eAt = i => T.sec[0] + 0.012 + i * 0.012;
    function drawSec(p) {
      const n = EVENTS.filter((_, i) => p >= eAt(i)).length, contained = p >= T.sec[0] + 0.1;
      chrome('Security events', '14:05', '/  SIEM  /  Live');
      txt(contained ? 'Attack contained' : n ? 'Active attack · containing' : 'Monitoring', U * 8, U * 10, 2.6, C.ink, 600);
      sx.fillStyle = contained ? C.ok : n ? C.bad : C.cyan; sx.beginPath(); sx.arc(U * 8.6, U * 13, U * 0.55, 0, 7); sx.fill();
      txt(contained ? '0 breaches · all events handled and recorded' : 'Firewall, endpoint and identity alerts in one stream', U * 10, U * 13.5, 1.3, C.mute);
      const kpi = [['EVENTS', String(1180 + Math.round(span(p, T.sec[0], T.sec[1]) * 316))], ['BLOCKED', String(n ? n * 37 + 4 : 0)], ['QUARANTINED', String(p >= eAt(2) ? 14 : 0)], ['BREACHES', '0']];
      kpi.forEach(([k, v], i) => { card(U * (8 + i * 22), U * 16, U * 20, U * 8); txt(k, U * (10 + i * 22), U * 19.6, 1, C.mute, 600, MONO); txt(v, U * (10 + i * 22), U * 22.9, 2.3, i === 3 ? C.ok : C.ink, 600); });
      card(U * 8, U * 26, U * 86, U * 29);
      EVENTS.forEach(([sev, what, src, act], i) => {
        if (i >= n) return;
        const y = U * (30.5 + i * 4.2), col = sev === 'HIGH' ? C.bad : sev === 'MED' ? C.warn : C.mute;
        chip(sev, U * 10, y - U * 0.3, col); txt(what, U * 17, y, 1.3, C.ink, 600); txt(src, U * 48, y, 1.1, C.mute, 500, MONO); txt(act, U * 66, y, 1.2, contained || i < n - 1 ? C.ok : C.warn, 500);
      });
    }
    const DEVICES = ['FIN-PC-01', 'FIN-PC-02', 'FIN-LT-014', 'HR-PC-01', 'HR-PC-02', 'OPS-PC-03', 'OPS-PC-06', 'SALES-LT-02', 'SALES-PC-04', 'RECEPTION', 'DIRECTOR-LT', 'SRV-FILES'];
    function drawMaint(p) {
      const pu = span(p, T.maint[0] + 0.005, T.maint[0] + 0.07), bu = span(p, T.maint[0] + 0.05, T.maint[1] - 0.012);
      chrome('Updates & backup', '17:30', '/  Maintenance window');
      txt(pu >= 1 && bu >= 1 ? 'Patched and backed up' : pu < 1 ? 'Rolling out updates' : 'Running nightly backup', U * 8, U * 10, 2.6, C.ink, 600);
      txt('Security updates in rings, then a backup with a restore test.', U * 8, U * 13.2, 1.3, C.mute);
      card(U * 8, U * 16, U * 52, U * 39);
      DEVICES.forEach((d, i) => {
        const y = U * (20 + i * 2.85), k = clamp(pu * 1.6 - i * 0.05);
        txt(d, U * 10.5, y + U * 0.3, 1.05, C.ink, 500, MONO);
        bar(U * 26, y - U * 0.2, U * 22, k, k >= 1 ? C.ok : C.acc);
        txt(k >= 1 ? 'Up to date' : k > 0 ? 'Installing' : 'Queued', U * 50, y + U * 0.3, 1.05, k >= 1 ? C.ok : k > 0 ? C.acc : C.dim, 500);
      });
      card(U * 62, U * 16, U * 32, U * 39);
      txt('NIGHTLY BACKUP', U * 65, U * 20.5, 1.05, C.mute, 600, MONO);
      txt('Files · Mail · Configs → NAS', U * 65, U * 23.8, 1.4, C.ink, 600);
      bar(U * 65, U * 27, U * 26, bu, bu >= 1 ? C.ok : C.cyan);
      txt(bu >= 1 ? 'Completed · 312 GB' : `${Math.round(bu * 100)}% · ${Math.round(bu * 312)} GB`, U * 65, U * 31, 1.15, C.mute, 500, MONO);
      if (bu >= 1) { check(U * 66.5, U * 37, U * 1.2, C.ok); txt('Restore test passed', U * 69, U * 37.5, 1.4, C.ok, 600); txt('Runbook updated · ticket closed', U * 65, U * 42, 1.15, C.mute); }
    }
    function drawEnd() {
      chrome('Status', '23:00', '/  All systems');
      sx.textAlign = 'center';
      check(sW / 2, U * 17, U * 3, C.ok);
      txt('All systems operational', sW / 2, U * 26, 3.2, C.ink, 300);
      txt('Quiet night. Monitoring stays on.', sW / 2, U * 29.6, 1.4, C.mute);
      sx.textAlign = 'left';
      ['Network', 'Identity', 'Email', 'Endpoints', 'Backups', 'Firewall'].forEach((s, i) => {
        const X = U * (14 + (i % 3) * 25), Y = U * (35 + Math.floor(i / 3) * 8);
        card(X, Y, U * 22, U * 6); sx.fillStyle = C.ok; sx.beginPath(); sx.arc(X + U * 2.4, Y + U * 3, U * 0.6, 0, 7); sx.fill();
        txt(s, X + U * 4.2, Y + U * 3.5, 1.4, C.ink, 600); sx.textAlign = 'right'; txt('Healthy', X + U * 20.5, Y + U * 3.5, 1.1, C.ok, 500, MONO); sx.textAlign = 'left';
      });
    }
    let screenKey = '';
    function drawScreen(p) {
      let k;
      if (p < T.onboard[0]) { const v = span(p, 0.03, T.onboard[0]); k = 'l' + Math.round(v * 10); if (k !== screenKey) drawLock(v); }
      else if (p < T.net[0] - 0.005) { const u = span(p, T.onboard[0] + 0.01, T.onboard[1] - 0.012); k = 'o' + Math.round(u * 100); if (k !== screenKey) drawOnboard(u); }
      else if (p < T.desk[0]) { k = 'n' + Math.round(p * 400); if (k !== screenKey) drawNet(p); }
      else if (p < T.sec[0]) { k = 'd' + TICKETS.filter((_, i) => p >= tOpen(i)).length + TICKETS.filter((_, i) => p >= tFix(i)).length; if (k !== screenKey) drawDesk(p); }
      else if (p < T.maint[0]) { k = 's' + Math.round(p * 300); if (k !== screenKey) drawSec(p); }
      else if (p < T.end[0] - 0.01) { k = 'm' + Math.round(p * 500); if (k !== screenKey) drawMaint(p); }
      else { k = 'e'; if (k !== screenKey) drawEnd(); }
      if (k !== screenKey) { screenKey = k; screenTex.needsUpdate = true; }
    }
    function drawLaptop(p) {
      const u = span(p, T.onboard[0] + 0.01, T.onboard[1] - 0.012);
      const k = p < T.onboard[0] ? 'off' : 'u' + Math.round(u * 40) + (p > T.onboard[1] ? 'x' : '');
      if (k === lapKey) return; lapKey = k;
      const x = lx;
      const g = x.createLinearGradient(0, 0, LW, LH); g.addColorStop(0, '#16202c'); g.addColorStop(1, '#2b2018');
      x.fillStyle = g; x.fillRect(0, 0, LW, LH);
      x.textAlign = 'center'; x.fillStyle = C.ink;
      if (u < 1) {
        x.font = `600 ${LU * 4}px ${UI}`; x.fillText('Setting up your Mac', LW / 2, LH * 0.4);
        x.font = `400 ${LU * 2}px ${UI}`; x.fillStyle = C.mute; x.fillText('Managed by your organisation', LW / 2, LH * 0.48);
        x.fillStyle = 'rgba(255,255,255,.12)'; rr(x, LW * 0.3, LH * 0.58, LW * 0.4, LU * 1, LU * 0.5); x.fill();
        x.fillStyle = C.cyan; rr(x, LW * 0.3, LH * 0.58, Math.max(LU, LW * 0.4 * u), LU * 1, LU * 0.5); x.fill();
      } else {
        x.fillStyle = C.ok; x.beginPath(); x.arc(LW / 2, LH * 0.36, LU * 5, 0, 7); x.fill();
        x.strokeStyle = '#0b0f13'; x.lineWidth = LU * 1.2; x.beginPath(); x.moveTo(LW / 2 - LU * 2.2, LH * 0.36); x.lineTo(LW / 2 - LU * 0.5, LH * 0.36 + LU * 1.8); x.lineTo(LW / 2 + LU * 2.4, LH * 0.36 - LU * 1.8); x.stroke();
        x.fillStyle = C.ink; x.font = `600 ${LU * 4}px ${UI}`; x.fillText('Welcome aboard', LW / 2, LH * 0.56);
        x.font = `400 ${LU * 2}px ${UI}`; x.fillStyle = C.mute; x.fillText('Your device is secure and ready.', LW / 2, LH * 0.63);
      }
      x.textAlign = 'left';
      mb.screenTex.needsUpdate = true;
    }

    // ---------- camera ----------
    let aspect = 1, portrait = false, track = null;
    function shot(name) {
      const P = portrait, f = P ? Math.pow(clamp(1.3 / aspect, 1, 4), 0.62) : Math.pow(clamp(1.55 / aspect, 1, 3), 0.5);
      const S = (look, dir, dist, fov, sx_, sy_, sxP, syP) => ({ look: V(...look), dir: V(...dir).normalize(), dist: dist * f, fov, sx: P ? (sxP || 0) : sx_, sy: P ? (syP == null ? -0.28 : syP) : sy_ });
      switch (name) {
        case 'hero': return S([0.8, 2.6, -0.8], [-0.42, 0.3, 0.86], 27, 32, 0.26, -0.02);
        case 'hero2': return S([0.8, 2.6, -0.8], [-0.36, 0.26, 0.9], 25, 32, 0.26, -0.02);
        case 'onboard': return S([-2.5, 2.6, -0.7], [-0.05, 0.18, 0.98], 15.5, 32, 0.16, -0.02, 0, -0.3);
        case 'onboard2': return S([-2.3, 2.6, -0.9], [0.06, 0.17, 0.98], 14.5, 32, 0.16, -0.02, 0, -0.3);
        case 'net': return S([7.0, 6.55, -4.9], [-0.42, -0.08, 0.9], 8.2, 32, 0.24, 0, 0, -0.25);
        case 'net2': return S([7.0, 6.5, -4.9], [-0.2, 0.02, 0.98], 7.2, 32, 0.24, 0, 0, -0.25);
        case 'desk': return S([-0.6, 3.1, -2.0], [-0.22, 0.2, 0.95], 11.2, 32, 0.25, 0, 0, -0.32);
        case 'desk2': return S([-0.6, 3.0, -2.0], [-0.05, 0.24, 0.97], 10.4, 32, 0.25, 0, 0, -0.32);
        case 'sec': return S([4.4, 2.6, -1.2], [-0.86, 0.18, 0.48], 12, 32, 0.24, 0, 0, -0.28);
        case 'sec2': return S([4.3, 2.7, -1.3], [-0.72, 0.2, 0.66], 11, 32, 0.24, 0, 0, -0.28);
        case 'maint': return S([2.0, 2.4, -1.2], [0.52, 0.34, 0.78], 15, 32, 0.25, 0, 0, -0.3);
        case 'maint2': return S([1.6, 2.5, -1.4], [0.36, 0.3, 0.88], 14, 32, 0.25, 0, 0, -0.3);
        case 'end': return S([-3, 4.5, -3.2], [0.28, 0.16, 0.95], 34, 34, 0.18, 0, 0, -0.2);
        case 'end2': return S([-3.5, 4.8, -3.4], [0.36, 0.14, 0.92], 40, 34, 0.18, 0, 0, -0.2);
      }
    }
    const KEYS = [[0, 'hero'], [0.04, 'hero2'], [0.1, 'onboard'], [0.185, 'onboard2'], [0.235, 'net'], [0.34, 'net2'], [0.395, 'desk'], [0.505, 'desk2'],
      [0.555, 'sec'], [0.665, 'sec2'], [0.71, 'maint'], [0.815, 'maint2'], [0.89, 'end'], [1, 'end2']];
    function buildTrack() {
      const xs = KEYS.map(k => k[0]), shots = KEYS.map(k => shot(k[1])), c = fn => pchip(xs, shots.map(fn));
      track = { lx: c(s => s.look.x), ly: c(s => s.look.y), lz: c(s => s.look.z), dx: c(s => s.dir.x), dy: c(s => s.dir.y), dz: c(s => s.dir.z), ld: c(s => Math.log(s.dist)), fov: c(s => s.fov), sx: c(s => s.sx), sy: c(s => s.sy) };
    }
    const look = V(), dir = V(), par = { x: 0, y: 0, tx: 0, ty: 0 };
    function placeCamera(p, time) {
      look.set(track.lx(p), track.ly(p), track.lz(p));
      dir.set(track.dx(p), track.dy(p), track.dz(p)).normalize();
      const dist = Math.exp(track.ld(p));
      dir.applyAxisAngle(V(0, 1, 0), par.x * 0.035 + (reduced ? 0 : Math.sin(time * 0.13) * 0.012));
      const right = V().crossVectors(V(0, 1, 0), dir).normalize();
      dir.applyAxisAngle(right, -par.y * 0.02 + (reduced ? 0 : Math.sin(time * 0.17) * 0.006)).normalize();
      camera.fov = track.fov(p);
      camera.position.copy(look).addScaledVector(dir, dist);
      camera.lookAt(look);
      camera.near = Math.max(0.05, dist * 0.02); camera.far = 400;
      camera.updateProjectionMatrix();
      const e = camera.projectionMatrix.elements; e[8] = -track.sx(p); e[9] = -track.sy(p);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld(true);
    }

    // ---------- bloom: the scene renders linear into a float target, bright parts are blurred back on ----------
    const post = (() => {
      if (lite || /[?&]nopost/.test(location.search) || !renderer.capabilities.isWebGL2 || !THREE.WebGLMultisampleRenderTarget || !renderer.extensions.has('EXT_color_buffer_float')) return null;
      const sceneRT = new THREE.WebGLMultisampleRenderTarget(1, 1, { type: THREE.HalfFloatType, stencilBuffer: false }); sceneRT.samples = 4;
      const mk = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
      const bA = mk(), bB = mk(), cA = mk(), cB = mk();
      const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      quad.frustumCulled = false; qScene.add(quad);
      const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      const sh = (u, f) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: f, depthTest: false, depthWrite: false });
      const bright = sh({ t: { value: null } }, 'uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(0.62, 1.2, l), 1.0); }');
      const blur = sh({ t: { value: null }, d: { value: new THREE.Vector2() } }, 'uniform sampler2D t; uniform vec2 d; varying vec2 vUv;\nvoid main(){ vec3 s = texture2D(t, vUv).rgb * 0.2270;\n s += (texture2D(t, vUv + d * 1.3846).rgb + texture2D(t, vUv - d * 1.3846).rgb) * 0.3162;\n s += (texture2D(t, vUv + d * 3.2308).rgb + texture2D(t, vUv - d * 3.2308).rgb) * 0.0703;\n gl_FragColor = vec4(s, 1.0); }');
      const comp = sh({ tS: { value: sceneRT.texture }, tB: { value: bA.texture }, tC: { value: cA.texture }, uB: { value: 0 } },
        'uniform sampler2D tS, tB, tC; uniform float uB; varying vec2 vUv;\n' +
        'vec3 enc(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }\n' +
        'void main(){ vec3 c = texture2D(tS, vUv).rgb + (texture2D(tB, vUv).rgb * 0.7 + texture2D(tC, vUv).rgb * 0.6) * uB;\n' +
        ' vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.9;\n' +
        ' float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;\n gl_FragColor = vec4(enc(c) + n / 180.0, 1.0); }');
      const v2 = new THREE.Vector2(), cc = new THREE.Color();
      function pass(m, out) { quad.material = m; renderer.setRenderTarget(out); renderer.render(qScene, qCam); }
      function soften(a, b, step) { blur.uniforms.t.value = a.texture; blur.uniforms.d.value.set(step / a.width, 0); pass(blur, b); blur.uniforms.t.value = b.texture; blur.uniforms.d.value.set(0, step / a.height); pass(blur, a); }
      return {
        size() {
          renderer.getDrawingBufferSize(v2); sceneRT.setSize(v2.x, v2.y);
          bA.setSize(Math.max(1, v2.x >> 2), Math.max(1, v2.y >> 2)); bB.setSize(bA.width, bA.height);
          cA.setSize(Math.max(1, v2.x >> 4), Math.max(1, v2.y >> 4)); cB.setSize(cA.width, cA.height);
        },
        render(k) {
          renderer.getClearColor(cc); renderer.setClearColor(cc.clone().convertSRGBToLinear(), 1);
          renderer.setRenderTarget(sceneRT); renderer.render(scene, camera); renderer.setClearColor(cc, 1);
          bright.uniforms.t.value = sceneRT.texture; pass(bright, bA); soften(bA, bB, 1.2); soften(bA, bB, 2.4);
          blur.uniforms.t.value = bA.texture; blur.uniforms.d.value.set(0, 0); pass(blur, cA); soften(cA, cB, 1.5); soften(cA, cB, 3);
          comp.uniforms.uB.value = k; pass(comp, null);
        }
      };
    })();

    // ---------- per frame ----------
    const cCyan = lin(0x4fd1e8), cRed = lin(0xff3b30), cAmber = lin(0xffa53a), cGreen = lin(0x42d68a), cWarm = lin(0xffd2a0), white = new THREE.Color(1, 1, 1);
    const tracePt = V();
    function update(p, time) {
      placeCamera(p, time);
      drawScreen(p); drawLaptop(p);
      // the monitor wakes at the sign-in and lights the desk
      const wake = smooth(span(p, 0.012, 0.05));
      screenMat.emissiveIntensity = 0.25 + wake * 0.85;
      monGlow.intensity = (0.6 + wake * 2.2);
      mb.screenMat.emissiveIntensity = smooth(span(p, T.onboard[0] - 0.01, T.onboard[0] + 0.01)) * 1.0;

      // the case lighting follows the day: calm, red under attack, amber while patching, green at night
      const attack = bump(p, T.sec[0] + 0.01, T.sec[0] + 0.02, T.sec[0] + 0.09, T.sec[0] + 0.105);
      const patch = bump(p, T.maint[0] + 0.004, T.maint[0] + 0.012, T.maint[0] + 0.06, T.maint[0] + 0.075);
      const calm = smooth(span(p, T.end[0] - 0.02, T.end[0] + 0.03));
      rgb.copy(cCyan).lerp(cAmber, patch).lerp(cGreen, calm * 0.7);
      const pulse = reduced ? 1 : 0.65 + 0.35 * Math.sin(time * 7);
      rgb.lerp(cRed, attack * pulse);
      rgbMat.color.copy(rgb).multiplyScalar(1.6);
      pcLight.color.copy(rgb); pcLight.intensity = 1.1 + attack * 1.2;
      plate.material.color.copy(white).lerp(rgb, 0.5).multiplyScalar(0.12 + wake * 0.1);
      bias.color.copy(rgb); bias.intensity = 1.6 * wake; biasStrip.material.color.copy(rgb).multiplyScalar(1.2 * wake);
      monGlow.color.copy(white).lerp(attack > 0.1 ? cRed : cCyan, 0.25 + attack * 0.3);
      const fanSpeed = 4 + patch * 10 + attack * 8;
      fanBlades.forEach((b, i) => { b.rotation.z = time * fanSpeed * (i % 2 ? -1 : 1) + i; });

      // keys: someone typing while tickets are worked
      const typing = bump(p, T.desk[0] + 0.02, T.desk[0] + 0.03, T.desk[1] - 0.02, T.desk[1] - 0.01) + bump(p, T.onboard[0], T.onboard[0] + 0.01, T.onboard[1] - 0.03, T.onboard[1] - 0.02) * 0.6;
      const beat = Math.floor(time * 14);
      let moved = false;
      for (let i = 0; i < keys.length; i++) {
        const target = typing > 0.2 && !reduced && hash(beat * 0.37 + i * 13.1) > 0.93 ? typing : 0;
        const v = keyPress[i] + (target - keyPress[i]) * 0.5;
        if (Math.abs(v - keyPress[i]) > 1e-3) { keyPress[i] = v; moved = true; }
      }
      if (moved) placeKeys();

      // the switch: blinking activity, a dead port, a trace along its cable, a green link
      const netOn = span(p, T.net[0] - 0.02, T.net[0]);
      const fault = p >= 0.245 && p < 0.315, tracing = p >= 0.275 && p < 0.315;
      leds.forEach(([a, b], k) => {
        const patched = k < 6, act = reduced ? 1 : (hash(Math.floor(time * (8 + k)) + k * 7) > 0.35 ? 1 : 0.15);
        if (k === FAULT && fault) { a.material.color.setRGB(0, 0, 0); b.material.color.copy(cRed).multiplyScalar(tracing ? (Math.sin(time * 9) > 0 ? 1.4 : 0.2) : 1.4); }
        else if (patched) { a.material.color.copy(cGreen).multiplyScalar(1.3); b.material.color.copy(cAmber).multiplyScalar(act * 1.2); }
        else { a.material.color.setRGB(0, 0, 0); b.material.color.setRGB(0, 0, 0); }
      });
      rLeds.forEach((l, k) => l.material.color.copy(k === 4 ? cAmber : cGreen).multiplyScalar(reduced || k < 2 || hash(Math.floor(time * 6) + k) > 0.3 ? 1.2 : 0.2));
      cables[FAULT].boot.position.z = 0.9 + (fault && !tracing ? 0.07 : 0);
      if (tracing) {
        cables[FAULT].curve.getPointAt(1 - span(p, 0.275, 0.31), tracePt); tracePt.applyMatrix4(shelf.matrixWorld);
        tracer.position.copy(tracePt); tracer.material.opacity = 0.9 * netOn; tracer.material.color.copy(white);
      } else if (p >= 0.315 && p < 0.33) { tracer.material.opacity = (1 - span(p, 0.315, 0.33)) * 0.9; tracer.material.color.copy(cGreen); }
      else tracer.material.opacity = 0;

      // backup drive activity
      const bu = span(p, T.maint[0] + 0.05, T.maint[1] - 0.012);
      hddLed.material.color.copy(bu > 0 && bu < 1 ? (Math.sin(time * 18) > 0 ? cAmber : cWarm) : bu >= 1 ? cGreen : cCyan).multiplyScalar(bu > 0 ? 1.5 : 0.4);

      // the lamp dims a little as the night settles
      spot.intensity = 5 - calm * 1.6;
      city.material.color.setScalar(0.6 + calm * 0.15);
    }

    // ---------- loop ----------
    let p = 0, target = 0, raf = 0, visible = true, last = 0, clock = 0;
    function resize() {
      const w = cw(), h = ch();
      renderer.setSize(w, h, false);
      aspect = w / h; portrait = aspect < 0.82; camera.aspect = aspect;
      if (post) post.size();
      buildTrack(); requestFrame();
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (!reduced) clock += dt;
      p += (target - p) * (reduced ? 1 : 1 - Math.pow(0.001, dt));
      if (Math.abs(target - p) < 1e-5) p = target;
      par.x += (par.tx - par.x) * Math.min(1, dt * 2.5); par.y += (par.ty - par.y) * Math.min(1, dt * 2.5);
      update(p, clock);
      if (post) post.render(0.85); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function requestFrame() { if (!raf && visible) raf = requestAnimationFrame(frame); }
    addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { par.tx = (e.clientX / innerWidth - 0.5) * 2; par.ty = (e.clientY / innerHeight - 0.5) * 2; } }, { passive: true });
    document.addEventListener('visibilitychange', () => { last = 0; requestFrame(); });
    addEventListener('resize', resize);
    resize();
    update(0, 0);
    renderer.shadowMap.needsUpdate = true;
    requestFrame();

    return {
      setProgress(v, instant) { target = clamp(v); if (instant) p = target; requestFrame(); },
      setVisible(v) { visible = v; if (v) { last = 0; requestFrame(); } },
      get progress() { return p; }
    };
  };
  NS.WORK_T = T;
})();
