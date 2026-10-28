/* Always On · the scroll is one camera move through one office.
   A new laptop is set up on a desk, the floor wakes up, the network is traced and repaired, the help desk
   clears its queue, a shield holds off attacks, patches and backups roll through, and the building settles
   into a calm, secure night. NS.office(opts) draws it on a fixed, full-viewport canvas; the page feeds it
   the scroll position with setProgress(p), p in 0..1. Everything is a function of p and the clock, so
   scrolling back plays the film in reverse. Returns null when WebGL is unavailable. Units: 1 = 10 cm. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const span = (p, [a, b]) => clamp((p - a) / (b - a));
  const bump = (p, a, b, c, d) => smooth(span(p, [a, b])) * (1 - smooth(span(p, [c, d])));
  const FONT = '"Segoe UI Variable Text", "Segoe UI", "Hanken Grotesk", system-ui, -apple-system, sans-serif';
  const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

  const COL = { night: 0x06080a, cyan: 0x5fe3da, green: 0x4cc97f, red: 0xff4d4d, amber: 0xffb04a, violet: 0xa98bff, white: 0xeaf6f6 };

  // Monotone cubic interpolation through (xs, ys): the camera eases between keyframes without overshoot.
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

  // A small studio for reflections: softboxes in a dark room, baked once into an environment map.
  function buildEnv(THREE, renderer, softbox, dark) {
    const s = new THREE.Scene(), trash = [];
    const add = (geo, mat, pos) => { const m = new THREE.Mesh(geo, mat); m.position.copy(pos); m.lookAt(0, 0, 0); s.add(m); trash.push(geo, mat); };
    const lit = (hex, k, map) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), map: map || null, side: THREE.DoubleSide });
    const box = new THREE.Mesh(new THREE.BoxGeometry(34, 18, 34), new THREE.MeshBasicMaterial({ color: dark ? 0x060708 : 0x111213, side: THREE.BackSide }));
    box.position.y = 7; s.add(box); trash.push(box.geometry, box.material);
    add(new THREE.PlaneGeometry(14, 10), lit(0xfff7ee, 2.5, softbox), new THREE.Vector3(-7, 12, 4));
    add(new THREE.PlaneGeometry(1.8, 9), lit(0xf2f4f5, 1.5, softbox), new THREE.Vector3(5.6, 2.2, 10.6));
    add(new THREE.PlaneGeometry(10, 1.3), lit(0xffffff, 1.6), new THREE.Vector3(6, 5, -10));
    add(new THREE.PlaneGeometry(22, 9), lit(0xf6f6f4, 0.85, softbox), new THREE.Vector3(0, 4, -15));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lit(dark ? 0x1a1d1f : 0xece8e1, dark ? 0.35 : 0.9));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5; s.add(floor); trash.push(floor.geometry, floor.material);
    const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(s, 0.02).texture;
    pm.dispose(); trash.forEach(d => d.dispose());
    return tex;
  }

  function canvasTex(THREE, w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  function rr(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }

  NS.office = function (opts) {
    const THREE = window.THREE;
    const { canvas, reduced } = opts;
    let renderer;
    try {
      if (!THREE || !NS.buildMacBook || !NS.grainTextures) throw new Error('modules missing');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (err) { return null; }
    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const cw = () => canvas.clientWidth || innerWidth, ch = () => canvas.clientHeight || innerHeight;
    const lite = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
    const PR = Math.min(devicePixelRatio || 1, lite ? 1.5 : 2);
    renderer.setPixelRatio(PR);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 2000);
    const softbox = NS.softboxTexture(THREE);
    const isDark = () => !!(opts.isDark && opts.isDark());
    let dark = isDark(), env = buildEnv(THREE, renderer, softbox, dark);
    scene.environment = env;
    const fog = new THREE.Fog(0xffffff, 14, 30);
    scene.fog = fog;
    const glowTex = NS.radial(THREE, 0.0);
    const dotTex = NS.radial(THREE, 0.35);

    // ---------- light ----------
    const key = new THREE.DirectionalLight(lin(0xfff6ec), 1.2);
    key.position.set(-7, 12, 4); key.target.position.set(-0.5, 0, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.006;
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 3, far: 24 });
    scene.add(key, key.target);
    const fill = new THREE.HemisphereLight(lin(0xf4f2ee), lin(0xc9c2b6), 0.3);
    const rim = new THREE.DirectionalLight(lin(0xeef2ff), 0.55); rim.position.set(4.5, 3.6, -5);
    const moon = new THREE.DirectionalLight(lin(0x9fc7ff), 0); moon.position.set(30, 80, 40);
    scene.add(fill, rim, moon);

    // ---------- the office: 7 × 4 desks, desk tops at y = 0, floor 74 cm below ----------
    const FLOOR = -7.4, COLS = 7, ROWS = 4, PX = 16, PZ = 18;
    const desks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) desks.push({ x: (c - 3) * PX, z: -r * PZ, r, c });
    const N = desks.length, HERO = desks.findIndex(d => d.x === 0 && d.z === 0);
    const RACK = V(70, FLOOR, -27);
    const CENTER = V(8, FLOOR, -27);

    const deskMat = new THREE.MeshStandardMaterial({ color: lin(0xe6e3dd), roughness: 0.72, metalness: 0 });
    const legMat = new THREE.MeshStandardMaterial({ color: lin(0x2b2f33), roughness: 0.5, metalness: 0.6 });
    const chairMat = new THREE.MeshStandardMaterial({ color: lin(0x22272c), roughness: 0.9, metalness: 0 });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = V(1, 1, 1), P = V();
    function instanced(geo, mat, list, place) {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((d, i) => { place(d, i); m.setMatrixAt(i, M); });
      m.instanceMatrix.needsUpdate = true;
      scene.add(m); return m;
    }
    const at = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => { Q.setFromAxisAngle(V(0, 1, 0), ry); M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz)); };
    const deskTop = instanced(new THREE.BoxGeometry(14, 0.3, 8), deskMat, desks, d => at(d.x, -0.15, d.z));
    deskTop.receiveShadow = true;
    const legs = [];
    desks.forEach(d => [[-6.6, -3.6], [6.6, -3.6], [-6.6, 3.6], [6.6, 3.6]].forEach(([x, z]) => legs.push({ x: d.x + x, z: d.z + z })));
    instanced(new THREE.BoxGeometry(0.4, -FLOOR - 0.3, 0.4), legMat, legs, d => at(d.x, (FLOOR - 0.3) / 2, d.z));
    const chairs = [
      instanced(new THREE.BoxGeometry(5, 0.7, 4.8), chairMat, desks, d => at(d.x, -2.9, d.z + 7.2)),
      instanced(new THREE.BoxGeometry(5, 5.4, 0.6), chairMat, desks, d => at(d.x, 0.2, d.z + 9.6)),
      instanced(new THREE.CylinderGeometry(0.25, 0.25, 4.2, 8), legMat, desks, d => at(d.x, -5.3, d.z + 7.2))
    ];

    // Everyone else's laptop: a simple aluminium shell, lid and a screen that glows in its state colour.
    const LID_A = -106 * Math.PI / 180;
    const shellMat = new THREE.MeshStandardMaterial({ color: lin(0xb7b9bd), roughness: 0.35, metalness: 0.9 });
    const others = desks.map((d, i) => i).filter(i => i !== HERO);
    instanced(new THREE.BoxGeometry(3.04, 0.08, 2.15), shellMat, others, i => at(desks[i].x, 0.04, desks[i].z));
    const lidQ = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), LID_A + Math.PI / 2);
    const lidOff = V(0, 1.06, 0).applyQuaternion(lidQ);   // lid centre from the hinge
    const lids = new THREE.InstancedMesh(new THREE.BoxGeometry(3.04, 2.12, 0.04), shellMat, others.length);
    const screenGeo = new THREE.PlaneGeometry(2.86, 1.86);
    const deskScreenTex = canvasTex(THREE, 512, 332, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#9aa7b3'); g.addColorStop(1, '#4a5662');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,.92)'; rr(x, 60, 46, 250, 170, 8); x.fill();
      x.fillStyle = 'rgba(255,255,255,.75)'; rr(x, 230, 110, 220, 150, 8); x.fill();
      x.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 6; k++) x.fillRect(80, 80 + k * 18, 150 - k * 12, 6);
      x.fillStyle = 'rgba(20,24,28,.85)'; x.fillRect(0, h - 26, w, 26);
      x.fillStyle = 'rgba(255,255,255,.8)'; for (let k = 0; k < 6; k++) { rr(x, w / 2 - 75 + k * 26, h - 21, 16, 16, 4); x.fill(); }
    });
    const screenMat = new THREE.MeshBasicMaterial({ map: deskScreenTex, toneMapped: false });
    const screens = new THREE.InstancedMesh(screenGeo, screenMat, others.length);
    const hinge = V(), qS = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), LID_A + Math.PI / 2);
    others.forEach((i, k) => {
      const d = desks[i];
      hinge.set(d.x, 0.083, d.z - 1.035);
      M.compose(P.copy(hinge).add(lidOff), lidQ, S.set(1, 1, 1)); lids.setMatrixAt(k, M);
      const front = V(0, 0, 0.03).applyQuaternion(qS);
      M.compose(P.copy(hinge).add(lidOff).add(front), qS, S.set(1, 1, 1)); screens.setMatrixAt(k, M);
      screens.setColorAt(k, new THREE.Color(0x000000));
    });
    scene.add(lids, screens);

    // Screen spill on each desk: a soft additive pool that takes the screen's colour.
    const spillMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 1, toneMapped: false });
    const spill = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 6).rotateX(-Math.PI / 2), spillMat, N);
    desks.forEach((d, i) => { at(d.x, 0.02, d.z + 0.6); spill.setMatrixAt(i, M); spill.setColorAt(i, new THREE.Color(0)); });
    scene.add(spill);

    // Floor and a faint architectural grid.
    const floorMat = new THREE.MeshStandardMaterial({ color: lin(0x07090b), roughness: 0.9, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), floorMat);
    floor.position.y = FLOOR; floor.receiveShadow = false; scene.add(floor);
    const grid = new THREE.GridHelper(400, 50, 0x1f3236, 0x142125);
    grid.position.set(8, FLOOR + 0.02, -27); grid.material.transparent = true; grid.material.opacity = 0; grid.material.depthWrite = false;
    scene.add(grid);

    // ---------- the server rack: switch, router, firewall, backup ----------
    const rackMat = new THREE.MeshStandardMaterial({ color: lin(0x15191d), roughness: 0.45, metalness: 0.7 });
    const rack = new THREE.Mesh(new THREE.BoxGeometry(7, 22, 10), rackMat);
    rack.position.set(RACK.x, FLOOR + 11, RACK.z); scene.add(rack);
    const LEDS = 8 * 6;
    const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.35, 0.9), new THREE.MeshBasicMaterial({ toneMapped: false }), LEDS);
    for (let k = 0; k < LEDS; k++) {
      const u = Math.floor(k / 8), j = k % 8;
      at(RACK.x - 3.55, FLOOR + 4 + u * 2.8, RACK.z - 3.6 + j * 1.05); leds.setMatrixAt(k, M); leds.setColorAt(k, new THREE.Color(0));
    }
    scene.add(leds);
    const rackGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lin(COL.cyan), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    rackGlow.scale.set(40, 40, 1); rackGlow.position.set(RACK.x - 4, FLOOR + 10, RACK.z); scene.add(rackGlow);

    // ---------- cables: every desk to the rack, along the floor ----------
    const links = desks.map((d, i) => {
      const yo = 0.06 + (i % 5) * 0.05, spine = d.z - 9 - d.r * 0.0, lane = 60 + d.r * 1.2;
      const pts = [V(d.x + 5.8, -0.2, d.z - 3.4), V(d.x + 5.8, FLOOR + yo, d.z - 3.4), V(d.x + 5.8, FLOOR + yo, spine), V(lane, FLOOR + yo, spine),
        V(lane, FLOOR + yo, RACK.z + (d.r - 1.5) * 0.8), V(RACK.x - 3.5, FLOOR + yo, RACK.z + (d.r - 1.5) * 0.8), V(RACK.x - 3.5, FLOOR + 3 + d.r, RACK.z + (d.r - 1.5) * 0.8)];
      const path = new THREE.CurvePath();
      for (let k = 0; k < pts.length - 1; k++) if (pts[k].distanceTo(pts[k + 1]) > 0.01) path.add(new THREE.LineCurve3(pts[k], pts[k + 1]));
      const geo = new THREE.TubeGeometry(path, 90, 0.16, 5, false);
      const mat = new THREE.MeshBasicMaterial({ color: lin(COL.cyan), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
      return { path, mesh, mat, len: path.getLength() };
    });

    // Packets riding the cables: three per link.
    const PK = 3, packetCount = N * PK;
    const pkGeo = new THREE.BufferGeometry();
    const pkPos = new Float32Array(packetCount * 3), pkCol = new Float32Array(packetCount * 3);
    pkGeo.setAttribute('position', new THREE.BufferAttribute(pkPos, 3));
    pkGeo.setAttribute('color', new THREE.BufferAttribute(pkCol, 3));
    const pkMat = new THREE.PointsMaterial({ size: 2.6, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true, opacity: 0, toneMapped: false });
    const packets = new THREE.Points(pkGeo, pkMat); packets.frustumCulled = false; scene.add(packets);

    // ---------- the shield: a geodesic dome over the building, rippling where attacks land ----------
    const R = 108;
    const hits = Array.from({ length: 8 }, () => new THREE.Vector4(0, 1, 0, -99));
    const domeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uCenter: { value: CENTER }, uHits: { value: hits }, uCol: { value: lin(COL.cyan) }, uRed: { value: lin(COL.red) } },
      vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform float uTime; uniform float uOpacity; uniform vec3 uCenter; uniform vec4 uHits[8]; uniform vec3 uCol; uniform vec3 uRed;',
        'varying vec3 vW; varying vec3 vN;',
        'void main(){',
        '  if (vW.y < uCenter.y + 0.2) discard;',
        '  vec3 v = normalize(cameraPosition - vW);',
        '  float fres = pow(1.0 - abs(dot(v, normalize(vN))), 3.0);',
        '  vec3 d = normalize(vW - uCenter); float ring = 0.0; float core = 0.0;',
        '  for (int i = 0; i < 8; i++) { float age = uTime - uHits[i].w; if (age < 0.0 || age > 2.2) continue;',
        '    float a = acos(clamp(dot(d, uHits[i].xyz), -1.0, 1.0)); float r = age * 0.55;',
        '    ring += smoothstep(0.035, 0.0, abs(a - r)) * exp(-age * 1.8); core += smoothstep(0.12, 0.0, a) * exp(-age * 4.0); }',
        '  vec3 c = uCol * (fres * 0.5 + ring * 0.7) + uRed * core * 1.3;',
        '  gl_FragColor = vec4(c * uOpacity, 1.0);',
        '}'].join('\n')
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.copy(CENTER); scene.add(dome);
    const ico = new THREE.IcosahedronGeometry(R + 0.2, 5), edges = new THREE.EdgesGeometry(ico, 1), ep = edges.attributes.position.array, keep = [];
    for (let k = 0; k < ep.length; k += 6) if (ep[k + 1] > 0.5 && ep[k + 4] > 0.5) keep.push(ep[k], ep[k + 1], ep[k + 2], ep[k + 3], ep[k + 4], ep[k + 5]);
    ico.dispose(); edges.dispose();
    const meshGeo = new THREE.BufferGeometry(); meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    const latticeMat = new THREE.LineBasicMaterial({ color: lin(COL.cyan), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const lattice = new THREE.LineSegments(meshGeo, latticeMat); lattice.position.copy(CENTER); scene.add(lattice);

    // Incoming attacks: red streaks from the dark that stop at the shield.
    const rnd = (s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; })(7);
    const THREATS = 12;
    const threats = Array.from({ length: THREATS }, (_, i) => {
      const az = rnd() * Math.PI * 2, el = 0.15 + rnd() * 1.1;
      const dirv = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
      return { dir: dirv, period: 2.6 + rnd() * 2.2, off: rnd() * 5, lastCycle: -1, slot: i % 7 };
    });
    const thGeo = new THREE.BufferGeometry();
    const thPos = new Float32Array(THREATS * 6), thCol = new Float32Array(THREATS * 6);
    thGeo.setAttribute('position', new THREE.BufferAttribute(thPos, 3));
    thGeo.setAttribute('color', new THREE.BufferAttribute(thCol, 3));
    const thMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
    const thLines = new THREE.LineSegments(thGeo, thMat); thLines.frustumCulled = false; scene.add(thLines);
    const thHeads = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 5, map: dotTex, color: lin(COL.red), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
    const thHeadPos = new Float32Array(THREATS * 3); thHeads.geometry.setAttribute('position', new THREE.BufferAttribute(thHeadPos, 3)); thHeads.frustumCulled = false; scene.add(thHeads);

    // The phishing email: one envelope, steered by the scroll, that never gets through.
    const PHISH_DIR = V(-0.55, 0.42, 0.72).normalize();
    const phishFar = CENTER.clone().addScaledVector(PHISH_DIR, R * 3.2), phishStop = CENTER.clone().addScaledVector(PHISH_DIR, R + 1);
    const envTex = canvasTex(THREE, 128, 96, (x) => {
      x.strokeStyle = '#fff'; x.lineWidth = 7; x.lineJoin = 'round'; rr(x, 10, 10, 108, 76, 8); x.stroke();
      x.beginPath(); x.moveTo(14, 16); x.lineTo(64, 56); x.lineTo(114, 16); x.stroke();
    });
    const phish = new THREE.Sprite(new THREE.SpriteMaterial({ map: envTex, color: lin(COL.amber), transparent: true, depthWrite: false, fog: false, opacity: 0, toneMapped: false }));
    phish.scale.set(9, 6.75, 1); scene.add(phish);
    const phishTrailGeo = new THREE.BufferGeometry(); const phishTrail = new Float32Array(6);
    phishTrailGeo.setAttribute('position', new THREE.BufferAttribute(phishTrail, 3));
    const phishLine = new THREE.Line(phishTrailGeo, new THREE.LineBasicMaterial({ color: lin(COL.amber), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    phishLine.frustumCulled = false; scene.add(phishLine);

    // ---------- help desk: remote sessions arc from my desk to whoever needs help ----------
    const TICKETS = [
      { desk: 1 * COLS + 1, text: "Can't sign in", fix: 'Account unlocked' },
      { desk: 2 * COLS + 5, text: 'Printer offline', fix: 'Driver fixed' },
      { desk: 0 * COLS + 5, text: 'No Wi-Fi', fix: 'Reconnected' },
      { desk: 3 * COLS + 2, text: 'Outlook stuck', fix: 'Profile rebuilt' },
      { desk: 2 * COLS + 0, text: 'Laptop slow', fix: 'Disk cleared' }
    ].map((t, i) => {
      const a = V(0, 2.4, -1.2), b = V(desks[t.desk].x, 2.4, desks[t.desk].z - 1.2);
      const mid = a.clone().lerp(b, 0.5); mid.y += 8 + a.distanceTo(b) * 0.25;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.TubeGeometry(curve, 64, 0.14, 5, false);
      const mat = new THREE.MeshBasicMaterial({ color: lin(COL.cyan), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
      return Object.assign(t, { curve, mesh, mat, idx: geo.index.count, open: 0.452 + i * 0.011, fixAt: 0.49 + i * 0.014 });
    });

    // ---------- the hero laptop ----------
    const grain = NS.grainTextures(THREE, lite ? 256 : 512, aniso);
    const mb = NS.buildMacBook(THREE, { grain, env, legendRes: lite ? 1024 : 2048, screenRes: lite ? 1024 : 2048, aniso });
    mb.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    mb.lid.rotation.x = LID_A;
    scene.add(mb.group);
    const SCREEN_C = V(0, 1.1, -1.33);

    // ---------- DOM labels pinned to points in the scene ----------
    const layer = opts.labels;
    function label(cls) {
      const el = document.createElement('div'); el.className = 'tag ' + (cls || ''); el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<i></i><span></span>'; layer && layer.appendChild(el);
      return { el, txt: el.querySelector('span'), last: '', state: '' };
    }
    const tagFault = label(), tagPhish = label(), tagBackup = label(), tagTickets = TICKETS.map(() => label());
    const proj = V();
    function pin(tag, pos, alpha, text, state) {
      if (!layer) return;
      if (alpha < 0.01) { if (tag.el.style.opacity !== '0') tag.el.style.opacity = '0'; return; }
      proj.copy(pos).project(camera);
      if (proj.z > 1) { tag.el.style.opacity = '0'; return; }
      const edge = cw() < 600 ? 64 : 110, x = clamp((proj.x * 0.5 + 0.5) * cw(), edge, cw() - edge), y = (-proj.y * 0.5 + 0.5) * ch();
      tag.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -130%)`;
      tag.el.style.opacity = alpha.toFixed(3);
      if (text !== tag.last) { tag.txt.textContent = text; tag.last = text; }
      if (state !== tag.state) { tag.el.dataset.state = state; tag.state = state; }
    }

    // ---------- the hero screen: onboarding, then the help-desk console ----------
    const sc = mb.screenCanvas, sx = sc.getContext('2d'), SW = sc.width, SH = sc.height, U = SW / 100;
    let screenKey = '';
    const STEPS = [
      ['Create account', 'New starter · Finance team'],
      ['Licences & groups', 'Microsoft 365 · Finance · Printers'],
      ['Multi-factor sign-in', 'Approved on phone'],
      ['Protect the device', 'Endpoint protection on · Updates installed'],
      ['Ready for day one', 'Signed in and working']
    ];
    function drawSetup(u) {
      const x = sx;
      const g = x.createLinearGradient(0, 0, SW, SH); g.addColorStop(0, '#0d1b2a'); g.addColorStop(1, '#14324a');
      x.fillStyle = g; x.fillRect(0, 0, SW, SH);
      x.fillStyle = 'rgba(255,255,255,.06)'; x.beginPath(); x.arc(SW * 0.86, SH * 1.05, SH * 0.75, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#e8f1f2'; x.font = `600 ${U * 3.6}px ${FONT}`; x.textBaseline = 'alphabetic';
      x.fillText('Setting up a new device', U * 8, U * 11);
      x.fillStyle = 'rgba(232,241,242,.6)'; x.font = `400 ${U * 1.8}px ${FONT}`;
      x.fillText('Managed by IT · Do not turn off your computer', U * 8, U * 14.6);
      const done = u * STEPS.length;
      STEPS.forEach(([t, s], i) => {
        const y = U * 22 + i * U * 7, k = clamp(done - i), cx = U * 9.6, cy = y + U * 1.3;
        x.lineWidth = U * 0.28;
        if (k >= 1) {
          x.fillStyle = i === STEPS.length - 1 ? '#4cc97f' : '#3cc2bf'; x.beginPath(); x.arc(cx, cy, U * 1.5, 0, Math.PI * 2); x.fill();
          x.strokeStyle = '#06201f'; x.beginPath(); x.moveTo(cx - U * 0.7, cy); x.lineTo(cx - U * 0.15, cy + U * 0.6); x.lineTo(cx + U * 0.8, cy - U * 0.6); x.stroke();
        } else if (k > 0) {
          x.strokeStyle = 'rgba(95,227,218,.25)'; x.beginPath(); x.arc(cx, cy, U * 1.4, 0, Math.PI * 2); x.stroke();
          x.strokeStyle = '#5fe3da'; x.beginPath(); x.arc(cx, cy, U * 1.4, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); x.stroke();
        } else {
          x.strokeStyle = 'rgba(232,241,242,.25)'; x.beginPath(); x.arc(cx, cy, U * 1.4, 0, Math.PI * 2); x.stroke();
        }
        x.fillStyle = k > 0 ? '#e8f1f2' : 'rgba(232,241,242,.4)'; x.font = `600 ${U * 2.2}px ${FONT}`; x.fillText(t, U * 13, y + U * 1);
        x.fillStyle = k > 0 ? 'rgba(232,241,242,.66)' : 'rgba(232,241,242,.28)'; x.font = `400 ${U * 1.6}px ${FONT}`; x.fillText(s, U * 13, y + U * 3.6);
      });
      // progress bar
      x.fillStyle = 'rgba(255,255,255,.1)'; rr(x, U * 8, SH - U * 8, U * 50, U * 0.8, U * 0.4); x.fill();
      x.fillStyle = u >= 1 ? '#4cc97f' : '#5fe3da'; rr(x, U * 8, SH - U * 8, U * 50 * clamp(u), U * 0.8, U * 0.4); x.fill();
      x.fillStyle = 'rgba(232,241,242,.6)'; x.font = `500 ${U * 1.5}px ${MONO}`;
      x.fillText(u >= 1 ? 'Compliant · ready' : `${Math.round(clamp(u) * 100)}%`, U * 60, SH - U * 7.2);
      // the final welcome card on the right
      const w = smooth(span(u, [0.82, 1]));
      if (w > 0) {
        x.globalAlpha = w;
        x.fillStyle = 'rgba(255,255,255,.08)'; rr(x, U * 60, U * 20, U * 32, U * 26, U * 1.4); x.fill();
        x.fillStyle = '#4cc97f'; x.beginPath(); x.arc(U * 76, U * 29, U * 4, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#06201f'; x.lineWidth = U * 0.7; x.beginPath(); x.moveTo(U * 74, U * 29); x.lineTo(U * 75.6, U * 30.6); x.lineTo(U * 78.4, U * 27.6); x.stroke();
        x.fillStyle = '#e8f1f2'; x.font = `600 ${U * 2.4}px ${FONT}`; x.textAlign = 'center'; x.fillText('Welcome aboard', U * 76, U * 38);
        x.fillStyle = 'rgba(232,241,242,.66)'; x.font = `400 ${U * 1.6}px ${FONT}`; x.fillText('Your device is secure and ready.', U * 76, U * 41.6);
        x.textAlign = 'left'; x.globalAlpha = 1;
      }
    }
    function drawConsole(open, fixed) {
      const x = sx;
      x.fillStyle = '#0e1418'; x.fillRect(0, 0, SW, SH);
      x.fillStyle = '#151d22'; x.fillRect(0, 0, SW, U * 7);
      x.fillStyle = '#e8f1f2'; x.font = `600 ${U * 2.2}px ${FONT}`; x.fillText('Service desk', U * 4, U * 4.5);
      x.fillStyle = '#5fe3da'; x.font = `500 ${U * 1.6}px ${MONO}`;
      x.fillText(`${Math.max(0, open - fixed)} open · ${fixed} resolved today`, U * 60, U * 4.5);
      TICKETS.forEach((t, i) => {
        const y = U * 11 + i * U * 8.6, seen = i < open, ok = i < fixed;
        x.globalAlpha = seen ? 1 : 0.18;
        x.fillStyle = '#151d22'; rr(x, U * 4, y, U * 92, U * 7, U); x.fill();
        x.fillStyle = ok ? '#4cc97f' : '#ff5d5d'; x.beginPath(); x.arc(U * 7.5, y + U * 3.5, U * 1, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#e8f1f2'; x.font = `600 ${U * 2}px ${FONT}`; x.fillText(t.text, U * 10.5, y + U * 4.2);
        x.fillStyle = 'rgba(232,241,242,.55)'; x.font = `500 ${U * 1.5}px ${MONO}`;
        x.fillText(`INC-${2041 + i}`, U * 44, y + U * 4.2);
        x.fillStyle = ok ? '#4cc97f' : 'rgba(232,241,242,.55)';
        x.fillText(ok ? 'Resolved · ' + t.fix : 'Remote session…', U * 60, y + U * 4.2);
      });
      x.globalAlpha = 1;
    }
    function drawHeroScreen(p) {
      let k;
      if (p < 0.2) { const u = span(p, [0.078, 0.162]); k = 's' + Math.round(u * 120); if (k !== screenKey) drawSetup(u); }
      else {
        const open = TICKETS.filter(t => p >= t.open).length, fixed = TICKETS.filter(t => p >= t.fixAt).length;
        k = 'c' + open + '.' + fixed; if (k !== screenKey) drawConsole(open, fixed);
      }
      if (k !== screenKey) { screenKey = k; mb.screenTex.needsUpdate = true; }
    }

    // ---------- camera: keyframed shots, eased with monotone cubics ----------
    let aspect = 1, portrait = false, track = null;
    function shot(name) {
      const P_ = portrait, f = P_ ? Math.pow(clamp(1.45 / aspect, 1, 4), 0.55) : Math.pow(clamp(1.6 / aspect, 1, 3), 0.5);
      const S_ = (look, dirv, dist, fov, sx_, sy_, sxP, syP) => ({ look: V(...look), dir: V(...dirv).normalize(), dist: dist * f, fov, sx: P_ ? sxP : sx_, sy: P_ ? syP : sy_ });
      switch (name) {
        case 'hero': return S_([0, 0.75, -0.3], [-0.42, 0.36, 0.83], 10.5, 30, 0.3, -0.02, 0, -0.32);
        case 'setup': return S_([0, 1.05, -1.3], [-0.16, 0.26, 0.95], 7.2, 30, 0.28, 0, 0, -0.3);
        case 'setupEnd': return S_([0, 1.05, -1.3], [-0.06, 0.24, 0.97], 6.4, 30, 0.27, 0, 0, -0.3);
        case 'reveal': return S_([0, -1, -24], [-0.3, 0.42, 0.86], 118, 34, 0.2, -0.02, 0, -0.2);
        case 'net': return S_([20, FLOOR, -27], [-0.28, 0.9, 0.34], 165, 34, 0.18, 0, 0, -0.18);
        case 'net2': return S_([24, FLOOR, -24], [-0.1, 0.92, 0.38], 150, 34, 0.18, 0, 0, -0.18);
        case 'desk': return S_([4, -1, -22], [0.34, 0.5, 0.8], 118, 34, 0.2, 0, 0, -0.2);
        case 'desk2': return S_([4, -1, -22], [0.5, 0.52, 0.69], 112, 34, 0.2, 0, 0, -0.2);
        case 'shield': return S_([8, 20, -27], [-0.46, 0.3, 0.84], 360, 34, 0.17, 0, 0, -0.1);
        case 'shield2': return S_([8, 20, -27], [-0.2, 0.36, 0.91], 345, 34, 0.17, 0, 0, -0.1);
        case 'patch': return S_([24, -2, -27], [0.12, 0.72, 0.68], 160, 34, 0.2, 0, 0, -0.2);
        case 'patch2': return S_([30, -2, -27], [-0.06, 0.74, 0.67], 150, 34, 0.2, 0, 0, -0.2);
        case 'calm': return S_([8, 6, -27], [-0.62, 0.38, 0.69], 300, 30, 0.3, 0, 0, -0.08);
        case 'calm2': return S_([8, 6, -27], [-0.7, 0.42, 0.58], 290, 30, 0.3, 0, 0, -0.08);
      }
    }
    const KEYS = [[0, 'hero'], [0.045, 'hero'], [0.095, 'setup'], [0.165, 'setupEnd'], [0.26, 'reveal'], [0.315, 'net'], [0.42, 'net2'],
      [0.475, 'desk'], [0.56, 'desk2'], [0.625, 'shield'], [0.71, 'shield2'], [0.765, 'patch'], [0.845, 'patch2'], [0.915, 'calm'], [1, 'calm2']];
    function buildTrack() {
      const xs = KEYS.map(k => k[0]), shots = KEYS.map(k => shot(k[1])), c = fn => pchip(xs, shots.map(fn));
      track = { lx: c(s => s.look.x), ly: c(s => s.look.y), lz: c(s => s.look.z), dx: c(s => s.dir.x), dy: c(s => s.dir.y), dz: c(s => s.dir.z),
        ld: c(s => Math.log(s.dist)), fov: c(s => s.fov), sx: c(s => s.sx), sy: c(s => s.sy) };
    }
    const look = V(), dir = V(), par = { x: 0, y: 0, tx: 0, ty: 0 };
    function placeCamera(p, time) {
      look.set(track.lx(p), track.ly(p), track.lz(p));
      dir.set(track.dx(p), track.dy(p), track.dz(p)).normalize();
      const dist = Math.exp(track.ld(p));
      dir.applyAxisAngle(V(0, 1, 0), par.x * 0.04 + (reduced ? 0 : Math.sin(time * 0.1) * 0.015));
      camera.fov = track.fov(p);
      camera.position.copy(look).addScaledVector(dir, dist);
      camera.lookAt(look);
      camera.near = Math.max(0.03, dist * 0.02); camera.far = dist * 6 + 600;
      camera.updateProjectionMatrix();
      const e = camera.projectionMatrix.elements; e[8] = -track.sx(p); e[9] = -track.sy(p);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld(true);
      return dist;
    }

    // ---------- theme ----------
    const bgDay = new THREE.Color(), bgNight = new THREE.Color(COL.night), bgNow = new THREE.Color();
    function applyTheme() {
      const d = isDark();
      if (d !== dark) {
        dark = d; env.dispose(); env = buildEnv(THREE, renderer, softbox, dark); scene.environment = env;
        scene.traverse(o => [].concat(o.material || []).forEach(m => { if (m.envMap) { m.envMap = env; m.needsUpdate = true; } }));
      }
      bgDay.set(opts.pageBg ? opts.pageBg() : (dark ? '#101315' : '#F5F6F4'));
      deskDay.copy(lin(dark ? 0x3a3e42 : 0xe6e3dd));
      fill.groundColor = lin(dark ? 0x2a2e31 : 0xc9c2b6);
      requestFrame();
    }

    // ---------- per-frame world ----------
    const cTmp = new THREE.Color(), cOff = new THREE.Color(0x000000);
    const deskDay = lin(0xe6e3dd), deskNight = lin(0x23282d), chairDay = lin(0x22272c), chairNight = lin(0x101418);
    const C = { cyan: lin(COL.cyan), green: lin(COL.green), red: lin(COL.red), amber: lin(COL.amber), violet: lin(COL.violet), white: lin(COL.white), dim: lin(0x7fa2b0) };
    const scrCol = new THREE.Color(), deskState = new Array(N);
    const FAULT = 1 * COLS + 6;
    const wake = new Float32Array(N);
    let phishHit = false;
    desks.forEach((d, i) => { const dd = Math.hypot(d.x, d.z); wake[i] = 0.19 + clamp(dd / 110) * 0.07 + ((i * 37) % 11) / 600; });

    function update(p, time) {
      const night = smooth(span(p, [0.175, 0.255]));
      // background and haze: the daylight studio gives way to the office at night
      bgNow.copy(bgDay).lerp(bgNight, night);
      scene.background = bgNow; fog.color.copy(bgNow);
      const dist = placeCamera(p, time);
      fog.near = mix(dist + 0.5, 400, smooth(night)); fog.far = mix(dist + 6, 1400, smooth(night));
      chairs.forEach(m => { m.visible = night > 0.02; });
      key.intensity = mix(1.2, 0.08, night); fill.intensity = mix(0.3, 0.16, night); rim.intensity = mix(0.55, 0.2, night);
      fill.color.copy(lin(0xf4f2ee)).lerp(lin(0x6f8fa8), night);
      moon.intensity = night * 0.22;
      grid.material.opacity = night * 0.5;
      deskMat.color.copy(deskDay).lerp(deskNight, night); chairMat.color.copy(chairDay).lerp(chairNight, night);

      // hero laptop screen
      const heroOn = smooth(span(p, [0.04, 0.075]));
      mb.screenMat.emissiveIntensity = heroOn * 1.05;
      drawHeroScreen(p);

      // desk states
      const netFault = bump(p, 0.335, 0.345, 0.392, 0.402);
      const patchFront = mix(-80, 110, span(p, [0.728, 0.815]));
      const backup = bump(p, 0.785, 0.8, 0.86, 0.88);
      let k = 0;
      for (let i = 0; i < N; i++) {
        const d = desks[i];
        const on = smooth(clamp((p - wake[i]) / 0.02));
        scrCol.copy(C.white).multiplyScalar(0.92);
        if (i === FAULT && netFault > 0) scrCol.lerp(C.red, netFault);
        const tk = TICKETS.find(t => t.desk === i);
        if (tk) { const bad = bump(p, tk.open - 0.004, tk.open, tk.fixAt, tk.fixAt + 0.006), good = bump(p, tk.fixAt, tk.fixAt + 0.004, 0.6, 0.62); scrCol.lerp(C.red, bad).lerp(C.green, good * 0.85); }
        const dp = patchFront - d.x;
        if (p > 0.72 && p < 0.85) { const upd = clamp(dp / 4) * (1 - clamp((dp - 22) / 8)); scrCol.lerp(C.amber, upd * 0.9); }
        deskState[i] = scrCol.clone();
        if (i !== HERO) { cTmp.copy(cOff).lerp(scrCol, on); screens.setColorAt(k++, cTmp); }
        const spillC = i === HERO ? cTmp.copy(C.cyan).multiplyScalar(0.55 * heroOn) : cTmp.copy(scrCol).lerp(C.cyan, 0.6).multiplyScalar(on * 0.22);
        spill.setColorAt(i, spillC.multiplyScalar(mix(0.15, 1, night)));
      }
      screens.instanceColor.needsUpdate = true; spill.instanceColor.needsUpdate = true;

      // cables and packets
      const netVis = smooth(span(p, [0.285, 0.32])) * (1 - 0.65 * smooth(span(p, [0.43, 0.47]))) * (1 - smooth(span(p, [0.6, 0.63])) * 0.7)
        + backup * 0.7 + smooth(span(p, [0.88, 0.95])) * 0.2;
      const trace = span(p, [0.364, 0.392]);
      for (let i = 0; i < N; i++) {
        const L = links[i];
        let c = cTmp.copy(C.cyan), a = netVis * 0.5;
        if (i === FAULT) {
          const red = bump(p, 0.335, 0.343, 0.39, 0.396), ok = bump(p, 0.39, 0.396, 0.43, 0.45);
          c.lerp(C.red, red).lerp(C.green, ok); a = Math.max(a, (red + ok) * 0.9);
        }
        if (backup > 0) c.lerp(C.violet, backup * 0.6);
        L.mat.color.copy(c); L.mat.opacity = clamp(a);
        L.mesh.visible = a > 0.005;
      }
      const flow = netVis + backup;
      pkMat.opacity = clamp(flow);
      for (let i = 0; i < N; i++) {
        const L = links[i];
        for (let j = 0; j < PK; j++) {
          const o = (i * PK + j) * 3;
          let u = ((time * (14 / L.len)) * (backup > 0.5 ? -1.6 : 1) + j / PK + i * 0.137) % 1; if (u < 0) u += 1;
          let pt;
          if (i === FAULT && p > 0.335 && p < 0.392) { pt = L.path.getPointAt(1 - (j === 0 ? trace : 0)); }
          else pt = L.path.getPointAt(u);
          pkPos[o] = pt.x; pkPos[o + 1] = pt.y + 0.3; pkPos[o + 2] = pt.z;
          const col = i === FAULT && p > 0.335 && p < 0.392 ? (j === 0 && trace > 0 ? C.white : C.red) : backup > 0.5 ? C.violet : C.cyan;
          const hide = i === FAULT && p > 0.335 && p < 0.392 && j > 0 ? 0 : 1;
          pkCol[o] = col.r * hide; pkCol[o + 1] = col.g * hide; pkCol[o + 2] = col.b * hide;
        }
      }
      pkGeo.attributes.position.needsUpdate = true; pkGeo.attributes.color.needsUpdate = true;

      // rack
      rackGlow.material.opacity = night * (0.12 + backup * 0.25);
      rackGlow.material.color.copy(C.cyan).lerp(C.violet, backup);
      for (let j = 0; j < LEDS; j++) {
        const blink = reduced ? 1 : (Math.sin(time * (3 + (j % 7)) + j * 1.7) > -0.2 ? 1 : 0.25);
        const base = j % 8 === 7 ? C.green : C.cyan;
        leds.setColorAt(j, cTmp.copy(base).multiplyScalar(night * blink * 1.4));
      }
      leds.instanceColor.needsUpdate = true;

      // help-desk arcs
      TICKETS.forEach((t, i) => {
        const grow = span(p, [t.fixAt - 0.014, t.fixAt]), fade = 1 - smooth(span(p, [t.fixAt + 0.01, t.fixAt + 0.03]));
        t.mesh.geometry.setDrawRange(0, Math.floor(t.idx * grow / 3) * 3);
        t.mat.opacity = grow > 0 ? fade * 0.9 : 0; t.mat.color.copy(grow >= 1 ? C.green : C.cyan);
        t.mesh.visible = t.mat.opacity > 0.01;
        const vis = bump(p, t.open, t.open + 0.006, 0.585, 0.605), ok = p >= t.fixAt;
        pin(tagTickets[i], V(desks[t.desk].x, 4.6, desks[t.desk].z - 1.2), vis, ok ? t.fix : t.text, ok ? 'ok' : 'bad');
      });

      // shield and attacks
      const shield = smooth(span(p, [0.585, 0.63])) * (1 - 0.75 * smooth(span(p, [0.72, 0.76]))) + smooth(span(p, [0.9, 0.97])) * 0.2;
      domeMat.uniforms.uOpacity.value = shield; domeMat.uniforms.uTime.value = time;
      latticeMat.opacity = shield * 0.13;
      dome.visible = lattice.visible = shield > 0.005;
      const attack = bump(p, 0.6, 0.635, 0.71, 0.74);
      thMat.opacity = attack; thHeads.material.opacity = attack;
      for (let i = 0; i < THREATS; i++) {
        const t = threats[i], ph = (time + t.off) / t.period, cyc = Math.floor(ph), f = ph - cyc;
        const travel = clamp(f / 0.7), head = CENTER.clone().addScaledVector(t.dir, mix(R * 3.4, R, travel * travel));
        const tail = head.clone().addScaledVector(t.dir, 26 * (travel < 1 ? 1 : 0));
        const o = i * 6, a = travel < 1 ? 1 : 0;
        thPos.set([head.x, head.y, head.z, tail.x, tail.y, tail.z], o);
        thCol.set([C.red.r * a, C.red.g * a, C.red.b * a, 0, 0, 0], o);
        thHeadPos.set(a ? [head.x, head.y, head.z] : [0, -9999, 0], i * 3);
        if (travel >= 1 && t.lastCycle !== cyc && attack > 0.2) { t.lastCycle = cyc; hits[t.slot].set(t.dir.x, t.dir.y, t.dir.z, time); }
      }
      thGeo.attributes.position.needsUpdate = true; thGeo.attributes.color.needsUpdate = true; thHeads.geometry.attributes.position.needsUpdate = true;
      const pu = span(p, [0.618, 0.66]), caught = p >= 0.66;
      const pv = bump(p, 0.615, 0.625, 0.715, 0.735);
      phish.position.copy(phishFar).lerp(phishStop, smooth(pu));
      phish.material.opacity = pv; phish.material.color.copy(caught ? C.red : C.amber);
      phishTrail.set([phish.position.x, phish.position.y, phish.position.z, ...phish.position.clone().addScaledVector(PHISH_DIR, 30 * (1 - pu)).toArray()]);
      phishTrailGeo.attributes.position.needsUpdate = true; phishLine.material.opacity = pv * (1 - pu) * 0.8;
      if (caught && pv > 0.05) { if (!phishHit) { phishHit = true; hits[7].set(PHISH_DIR.x, PHISH_DIR.y, PHISH_DIR.z, time); } } else if (!caught) phishHit = false;
      pin(tagPhish, phish.position, pv, caught ? 'Phishing email · quarantined' : 'Incoming email · inspecting', caught ? 'bad' : 'warn');

      // network fault label
      const fd = desks[FAULT];
      pin(tagFault, V(fd.x, 4.6, fd.z - 1.2), bump(p, 0.335, 0.343, 0.43, 0.445), p < 0.364 ? 'Link down' : p < 0.392 ? 'Tracing the fault…' : 'Restored', p < 0.364 ? 'bad' : p < 0.392 ? 'warn' : 'ok');
      // backup label
      pin(tagBackup, V(RACK.x, FLOOR + 24, RACK.z), bump(p, 0.8, 0.81, 0.875, 0.89), p < 0.845 ? 'Backing up…' : 'Backup verified', p < 0.845 ? 'warn' : 'ok');
    }

    // ---------- loop ----------
    let p = 0, target = 0, raf = 0, visible = true, last = 0, clock = 0;
    function resize() {
      const w = cw(), h = ch();
      renderer.setSize(w, h, false);
      aspect = w / h; portrait = aspect < 0.82; camera.aspect = aspect;
      buildTrack(); requestFrame();
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (!reduced) clock += dt;
      p += (target - p) * (reduced ? 1 : 1 - Math.pow(0.0009, dt));
      if (Math.abs(target - p) < 1e-5) p = target;
      par.x += (par.tx - par.x) * Math.min(1, dt * 3);
      update(p, clock);
      renderer.render(scene, camera);
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function requestFrame() { if (!raf && visible) raf = requestAnimationFrame(frame); }
    addEventListener('pointermove', e => { if (e.pointerType === 'mouse') par.tx = (e.clientX / innerWidth - 0.5) * 2; }, { passive: true });
    document.addEventListener('visibilitychange', () => { last = 0; requestFrame(); });

    resize(); applyTheme();
    update(0, 0);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    addEventListener('resize', resize);
    requestFrame();

    return {
      setProgress(v, instant) { target = clamp(v); if (instant) p = target; requestFrame(); },
      setVisible(v) { visible = v; if (v) { last = 0; requestFrame(); } },
      theme: applyTheme,
      get progress() { return p; }
    };
  };
})();
