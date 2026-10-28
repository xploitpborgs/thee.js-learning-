/* Film · the whole scroll is one camera move through one world.
   A single laptop on a desk is plugged in, revealed as one of three thousand, wired to one identity
   ring, lifted into a globe, and finally handed back to the visitor.
   NS.film(opts) draws it on a fixed, full-viewport canvas and the page feeds it the scroll position
   with setProgress(p), p in 0..1. Everything on screen is a function of p and the clock, so scrolling
   back plays the film in reverse. Returns null when WebGL is unavailable. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const span = (x, r) => clamp((x - r[0]) / (r[1] - r[0]));
  const smooth = t => t * t * (3 - 2 * t);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const backOut = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
  const mix = (a, b, t) => a + (b - a) * t;
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

  // Shared timeline. The page reads the same ranges to time its captions.
  const T = NS.FILM_T = {
    title: [0.02, 0.05], plug: [0.05, 0.118], wake: [0.118, 0.142], rows: [0.132, 0.185],
    night: [0.205, 0.30], appear: [0.212, 0.392], wave: [0.405, 0.475], ring: [0.478, 0.52],
    arcs: [0.492, 0.565], arcsOut: [0.632, 0.66], morph: [0.645, 0.785], drift: [0.80, 0.875],
    mirror: [0.835, 0.89], dive: [0.905, 1], blank: [0.955, 0.99]
  };

  // Camera stops. Repeated names are holds; a name between two others is flown through.
  const KEYS = [
    [0, 'hero'], [0.04, 'hero'], [0.078, 'port'], [0.118, 'port'], [0.152, 'screen'], [0.196, 'screen'],
    [0.255, 'rise'], [0.338, 'fleet'], [0.395, 'fleet'], [0.432, 'wave'], [0.474, 'wave'],
    [0.53, 'ring'], [0.625, 'ring'], [0.705, 'globe'], [0.80, 'globe'], [0.872, 'back'], [0.905, 'back'], [1, 'dive']
  ];

  const COL = {
    teal: 0x8fe8de, amber: 0xffb04a, white: 0xffffff, ring: 0x5fe3da, up: 0x67e8de, down: 0xf2fffd, blocked: 0xff5d5d,
    nightBg: 0x06080a
  };

  /* Monotone cubic interpolation: holds stay perfectly still, fly-throughs keep their speed,
     and nothing overshoots the keys. */
  function pchip(xs, ys) {
    const n = xs.length, h = [], d = [], m = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
    }
    return x => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }

  function canvasTex(THREE, w, h, draw, srgb) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* One low-poly laptop for the fleet, in the hero's proportions: body (case, keyboard well and black
     glass, all in one draw) and the display panel as its own mesh so it can glow per device. */
  function fleetGeometry(THREE) {
    const D = NS.MACBOOK, top = D.FEET + D.H;
    const lidM = new THREE.Matrix4().makeTranslation(0, top, D.HINGE_Z).multiply(new THREE.Matrix4().makeRotationX(-D.OPEN_DEG * Math.PI / 180));
    const parts = [];
    const add = (geo, rgb, glow) => { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); parts.push({ g, rgb, glow }); };
    const slab = (w, d, h, r) => { const g = new THREE.ExtrudeGeometry(NS.roundedRect(THREE, w, d, r), { depth: h, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2); return g; };
    const base = slab(D.W, D.DEPTH, D.H, D.R); base.translate(0, D.FEET, 0);
    add(base, [1, 1, 1], () => 0);
    const well = new THREE.PlaneGeometry(2.71, 1.16, 1, 4); well.rotateX(-Math.PI / 2); well.translate(0, top + 0.002, -0.4);
    add(well, [0.035, 0.037, 0.04], (x, y, z) => mix(1, 0.3, clamp((z + 0.98) / 1.16)));
    const lid = slab(D.W, D.LID_D, D.LID_T, D.R); lid.translate(0, 0, D.LID_D / 2 - 0.005); lid.applyMatrix4(lidM);
    add(lid, [1, 1, 1], () => 0);
    const glass = new THREE.PlaneGeometry(D.W - 0.04, D.LID_D - 0.04); glass.rotateX(Math.PI / 2); glass.translate(0, -0.0009, D.LID_D / 2 - 0.005); glass.applyMatrix4(lidM);
    add(glass, [0.012, 0.014, 0.018], () => 0);

    let count = 0; parts.forEach(p => { count += p.g.attributes.position.count; });
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), glow = new Float32Array(count);
    let o = 0;
    for (const p of parts) {
      const pa = p.g.attributes.position.array, na = p.g.attributes.normal.array, n = p.g.attributes.position.count;
      pos.set(pa, o * 3); nor.set(na, o * 3);
      for (let i = 0; i < n; i++) {
        col.set(p.rgb, (o + i) * 3);
        glow[o + i] = p.glow(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]);
      }
      o += n; p.g.dispose();
    }
    const body = new THREE.BufferGeometry();
    body.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    body.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
    body.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));

    const screen = new THREE.PlaneGeometry(2.89, 1.88); screen.rotateX(Math.PI / 2); screen.translate(0, -0.003, D.LID_D / 2 + 0.035); screen.applyMatrix4(lidM);
    const screenCenter = new THREE.Vector3(0, -0.003, D.LID_D / 2 + 0.035).applyMatrix4(lidM);
    const screenNormal = new THREE.Vector3(0, -1, 0).transformDirection(lidM);
    const pad = new THREE.PlaneGeometry(4.2, 3.4); pad.rotateX(-Math.PI / 2); pad.translate(0, 0.004, 1.15);   // light pool in front
    const blob = new THREE.PlaneGeometry(3.7, 2.9); blob.rotateX(-Math.PI / 2); blob.translate(0, 0.003, -0.12); // contact shadow
    return { body, screen, pad, blob, screenCenter, screenNormal };
  }

  NS.film = function (opts) {
    const THREE = window.THREE;
    const { canvas, reduced } = opts;
    const D = NS.MACBOOK, PLUG = NS.PLUG;
    let renderer;
    try {
      if (!THREE || !NS.Cable || !NS.buildMacBook || !NS.buildEnv || !NS.drawHeroWake || !NS.drawVisitorLogin) throw new Error('film modules missing');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (err) { return null; }
    // Asking for each program's error log straight after linking makes every shader compile wait for the
    // one before it (about five seconds on integrated graphics). Programs compile in parallel instead, and
    // the first frame waits for them below; logs are still checked in review mode.
    renderer.debug.checkShaderErrors = /film-debug/.test(location.search);
    // The canvas fills the large viewport, which on phones (and in in-app browsers) is taller than the visible
    // window while toolbars show: every conversion between the scene and the screen uses the canvas's size.
    const cw = () => canvas.clientWidth || innerWidth, ch = () => canvas.clientHeight || innerHeight;

    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const small = Math.min(innerWidth, screen.width || innerWidth) < 760;
    const lite = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;   // genuinely weak hardware
    const lowPower = small || lite;   // fewer devices, arcs and cable segments; no glow pass
    // Every frame renders at the screen's own pixel density (up to 3x), so a phone or a retina/4K display
    // gets a 1:1 image. Only if the wide fleet shots cannot hold the frame rate do they step down, and
    // never below 60% of full density or the display's own pixels.
    const pinPR = /film-debug/.test(location.search) && parseFloat((location.search.match(/film-pr=([\d.]+)/) || [])[1]);   // review: hold one density
    const PR_MAX = pinPR || Math.min(devicePixelRatio || 1, lite ? 1.5 : 3), PR_MIN = pinPR || (lite ? Math.min(PR_MAX, 0.75) : Math.min(PR_MAX, Math.max(1, PR_MAX * 0.6)));
    const hiRes = !lite && innerWidth * PR_MAX > 2600;   // big, dense displays get larger screen and keyboard images
    let prNow = PR_MAX, prFleet = PR_MAX, slow = 0, fast = 0, prAt = 0;
    renderer.setPixelRatio(PR_MAX);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 1600);
    const softbox = NS.softboxTexture(THREE);
    const isDark = () => !!(opts.isDark && opts.isDark());
    let dark = isDark();
    let env = NS.buildEnv(THREE, renderer, softbox, dark), lapEnv = NS.buildEnv(THREE, renderer, softbox, dark, true), envDark = dark;   // the laptop's own: see buildEnv
    scene.environment = env;
    const grain = NS.grainTextures(THREE, lite ? 256 : hiRes ? 1024 : 512, aniso);
    const braid = NS.braidTextures(THREE, lite ? 256 : hiRes ? 1024 : 512, aniso);
    const fog = new THREE.Fog(0xffffff, 1000, 2000);
    scene.fog = fog;

    // ---- studio lights (the approved still), dimmed to a moonlit rim when night falls ----
    const key = new THREE.DirectionalLight(lin(0xfff6ec), 1.2);
    key.position.set(-7, 12, 4); key.target.position.set(-0.5, 0, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.006;
    Object.assign(key.shadow.camera, { left: -4.8, right: 4.8, top: 4.8, bottom: -4.8, near: 3, far: 20 });
    scene.add(key, key.target);
    const fill = new THREE.HemisphereLight(lin(0xf4f2ee), lin(0xc9c2b6), 0.3);
    const rim = new THREE.DirectionalLight(lin(0xeef2ff), 0.55); rim.position.set(4.5, 3.6, -5);
    const rimDay = lin(0xeef2ff), rimNight = lin(0x9fc7ff);
    scene.add(fill, rim);

    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.26, depthWrite: false });
    shadowMat.fog = false;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), shadowMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.renderOrder = 3;
    scene.add(ground);

    // ---- the hero laptop and its cable, exactly as the approved still ----
    const mb = NS.buildMacBook(THREE, { grain, env: lapEnv, legendRes: lite ? 1024 : hiRes ? 4096 : 2048, screenRes: lite ? 1024 : hiRes ? 3072 : 2048, aniso });
    scene.add(mb.group);
    mb.group.updateMatrixWorld(true);
    // When the laptop is spun its studio turns with it, so every side catches the softboxes the way the
    // front does. r128 cannot rotate an environment map, so the laptop's reflection lookups turn instead.
    const envTurn = { value: new THREE.Matrix3() };
    const ENV_TURNED = THREE.ShaderChunk.envmap_physical_pars_fragment
      .replace('vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );', 'vec3 worldNormal = uEnvTurn * inverseTransformDirection( geometry.normal, viewMatrix );')
      .replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', 'reflectVec = uEnvTurn * inverseTransformDirection( reflectVec, viewMatrix );');
    const turnEnv = sh => { sh.uniforms.uEnvTurn = envTurn; sh.fragmentShader = 'uniform mat3 uEnvTurn;' + String.fromCharCode(10) + sh.fragmentShader.replace('#include <envmap_physical_pars_fragment>', ENV_TURNED); };
    if (ENV_TURNED.split('uEnvTurn').length === 3) {
      const done = new Set();
      mb.group.traverse(o => [].concat(o.material || []).forEach(m => { if (m.isMeshStandardMaterial && !done.has(m)) { done.add(m); m.onBeforeCompile = turnEnv; m.needsUpdate = true; } }));
    }
    const turnM4 = new THREE.Matrix4();
    const lidInv = new THREE.Matrix4(), lidMat = new THREE.Matrix4(), gMat = new THREE.Matrix4(), gInv = new THREE.Matrix4();
    function syncDesk() {
      mb.group.updateMatrixWorld(true);
      gMat.copy(mb.group.matrixWorld); gInv.copy(gMat).invert();
      lidMat.copy(mb.lid.matrixWorld); lidInv.copy(lidMat).invert();
    }
    syncDesk();
    const PORT = mb.port.center.clone(), OUT = mb.port.out.clone();
    const PRE = PORT.clone().addScaledVector(OUT, 0.05);
    const IN = PORT.clone().addScaledVector(OUT, -PLUG.SHELL);
    const IN_BACK = IN.clone().addScaledVector(OUT, PLUG.LEN);
    const SCREEN_C = mb.screen.getWorldPosition(V());
    const SCREEN_N = V(0, -1, 0).applyQuaternion(mb.lid.getWorldQuaternion(new THREE.Quaternion()));

    let screenGlow = null;
    if (THREE.RectAreaLight && THREE.RectAreaLightUniformsLib && !/film-norect/.test(location.search)) {
      THREE.RectAreaLightUniformsLib.init();
      screenGlow = new THREE.RectAreaLight(lin(0xeef3ff), 0, 2.89, 1.88);
      screenGlow.position.copy(SCREEN_C).addScaledVector(SCREEN_N, 0.012);
      screenGlow.lookAt(screenGlow.position.clone().add(SCREEN_N));
      scene.add(screenGlow);
    }

    let plugState = 'rest';
    const tmp = V();
    function pushBox(x, y, z, r, box, allowDown) {
      const mn = box.min, mx = box.max;
      if (x <= mn.x - r || x >= mx.x + r || y <= mn.y - r || y >= mx.y + r || z <= mn.z - r || z >= mx.z + r) return null;
      const o = [[mn.x - r - x, 0], [mx.x + r - x, 0], [mx.y + r - y, 1], [mn.z - r - z, 2], [mx.z + r - z, 2]];
      if (allowDown) o.push([mn.y - r - y, 1]);
      let best = o[0];
      for (const c of o) if (Math.abs(c[0]) < Math.abs(best[0])) best = c;
      const out = [x, y, z]; out[best[1]] += best[0];
      return out;
    }
    // Collisions run in the laptop's own space (it can be moved) and the lid's (it can be closed).
    function collide(x, y, z, r, isTip) {
      if (isTip && plugState !== 'rest' && plugState !== 'settling' && plugState !== 'free') return null;
      let hitAny = false;
      tmp.set(x, y, z).applyMatrix4(gInv);
      const b = pushBox(tmp.x, tmp.y, tmp.z, r, mb.baseBox, false);
      if (b) { tmp.set(b[0], b[1], b[2]); hitAny = true; }
      tmp.applyMatrix4(gMat).applyMatrix4(lidInv);
      const l = pushBox(tmp.x, tmp.y, tmp.z, r, mb.lidBox, true);
      if (l) { tmp.set(l[0], l[1], l[2]); hitAny = true; }
      if (!hitAny) return null;
      tmp.applyMatrix4(lidMat);
      return [tmp.x, tmp.y, tmp.z];
    }

    const R = 0.026, HOUSING_Y = PLUG.HH / 2 + 0.0005;
    const GAP = 0.14, tipX = -D.W / 2 - GAP, backX = tipX - PLUG.LEN;
    const route = new THREE.CatmullRomCurve3([
      [2.1, R, 4.05], [0.75, R, 3.2], [-0.7, R, 2.84], [-1.95, R, 2.32], [-2.62, R, 1.5], [-2.78, R, 0.62],
      [-2.62, R + 0.001, -0.12], [backX - 0.36, R + 0.003, -0.4], [backX - 0.16, HOUSING_Y - 0.002, -0.4], [backX, HOUSING_Y, -0.4]
    ].map(p => V(p[0], p[1], p[2])), false, 'centripetal', 0.5);
    const routeLen = route.getLength();
    const cableMat = new THREE.MeshStandardMaterial({ map: braid.map, normalMap: braid.normalMap, normalScale: new THREE.Vector2(0.34, 0.34), roughnessMap: braid.roughnessMap, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    const tile = (2 * Math.PI * R) / 4;
    [braid.map, braid.normalMap, braid.roughnessMap].forEach(t => t.repeat.set(routeLen / tile, 4));
    const cable = new NS.Cable(THREE, {
      segments: lite ? 64 : 96, length: routeLen, radius: R, gravity: -80, collide,
      radial: lite ? 14 : 20, perSeg: 3, material: cableMat, plugOpts: { env, grain }
    });
    cable.layout(t => route.getPoint(t));
    cable.asleep = true;
    cable.updateMesh();
    scene.add(cable.mesh, cable.plug);
    // Beyond the hero frame the cable runs off down the aisle between two rows of the fleet, so the
    // wide shots never find a loose end. It joins the anchored end with the same direction.
    const tails = [];
    const tailPiece = (curve, segs) => {
      const len = curve.getLength(), mat = cableMat.clone();
      ['map', 'normalMap', 'roughnessMap'].forEach(k => { mat[k] = braid[k].clone(); mat[k].needsUpdate = true; mat[k].repeat.set(len / tile, 4); });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, R, lite ? 10 : 14, false), mat);
      mesh.castShadow = false; scene.add(mesh); tails.push(mesh);
    };
    tailPiece(new THREE.CatmullRomCurve3([[14, R, 6.8], [9, R, 6.8], [6.4, R, 6.72], [4.3, R, 5.55], [3.0, R, 4.62], [2.1, R, 4.05]].map(p => V(p[0], p[1], p[2])), false, 'centripetal', 0.5), 64);
    tailPiece(new THREE.LineCurve3(V(320, R, 6.8), V(14, R, 6.8)), 1);
    const rest = cable.snapshot();
    const REST_TIP = cable.tipPosition(V());
    const OPEN = D.OPEN_DEG, desk = { x: 0, z: 0, lid: OPEN, tx: 0, tz: 0, tlid: OPEN, ry: 0, tRy: 0, spin: 0, moved: false };

    const shadowRes = lite ? 512 : 1024;
    const contactShadow = NS.bakeContactShadow(THREE, renderer, scene, { cx: 0, cz: -0.1, w: 4.6, d: 3.8, res: shadowRes, height: 0.45, darkness: 1.25, opacity: 0.5 });
    contactShadow.bake([mb.group], shadowRes === 1024 ? [9, 5, 2.5, 1.2] : [4.5, 2.5, 1.2]);
    const bakeDesk = () => contactShadow.bake([mb.group], shadowRes === 1024 ? [9, 5, 2.5, 1.2] : [4.5, 2.5, 1.2]);
    function applyDesk() {
      mb.group.position.set(desk.x, 0, desk.z); mb.group.rotation.y = desk.ry;
      envTurn.value.setFromMatrix4(turnM4.makeRotationY(-desk.ry));
      mb.lid.rotation.x = -desk.lid * Math.PI / 180;
      mb.lid.position.y = D.FEET + D.H + 0.0095 * (1 - smooth(clamp(desk.lid / 18)));   // closed, it clears the keys
      contactShadow.group.position.set(desk.x - 0.1 * Math.sin(desk.ry), 0.0006, desk.z - 0.1 * Math.cos(desk.ry)); contactShadow.group.rotation.y = desk.ry;
      syncDesk(); renderer.shadowMap.needsUpdate = true;
      if (screenGlow) {
        const nrm = V(0, -1, 0).applyQuaternion(mb.lid.getWorldQuaternion(new THREE.Quaternion()));
        mb.screen.getWorldPosition(screenGlow.position).addScaledVector(nrm, 0.012);
        screenGlow.lookAt(screenGlow.position.clone().add(nrm));
      }
    }
    const cableShadow = NS.bakeContactShadow(THREE, renderer, scene, { cx: -0.6, cz: 1.0, w: 8.4, d: 7.6, res: lite ? 1024 : 2048, height: 0.14, darkness: 2.2, opacity: 0.55 });
    const CABLE_PASSES_STILL = lowPower ? [2.2, 1] : [4.4, 2, 0.8], CABLE_PASSES_LIVE = lowPower ? [1.1, 0.5] : [2.2, 1, 0.4];
    const bakeCableShadow = live => cableShadow.bake([cable.mesh, cable.plug], live ? CABLE_PASSES_LIVE : CABLE_PASSES_STILL);
    [contactShadow.plane, cableShadow.plane].forEach(p => { p.material.fog = false; });
    if (cable.contactMat) cable.contactMat.fog = false;

    // Materials whose reflections fade with the daylight.
    const envMats = [];
    scene.traverse(o => { if (o.material && o.material.envMapIntensity !== undefined && envMats.indexOf(o.material) < 0) envMats.push(o.material); });
    envMats.forEach(m => { m.userData.env0 = m.envMapIntensity; });

    // ---- the fleet ----
    const G = lowPower ? 41 : 55, SX = 4.5, SZ = 4.7, HC = (G - 1) / 2;
    const geo = fleetGeometry(THREE);
    const cells = [];
    const rand = rng(7);
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const dc = c - HC, dr = r - HC;
      if ((dc === 0 && dr === 0) || (dr === 1 && (dc === 0 || dc === 1))) continue; // the hero's desk and the cable's run stay clear
      cells.push([dc * SX + (rand() - 0.5) * 0.5, dr * SZ + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.12, dc, dr]);
    }
    const N = cells.length;
    const F = {
      gx: new Float32Array(N), gz: new Float32Array(N), yaw: new Float32Array(N), d: new Float32Array(N),
      dc: new Int16Array(N), dr: new Int16Array(N), ok: new Uint8Array(N), r1: new Float32Array(N), r2: new Float32Array(N), lon: new Float32Array(N), lat: new Float32Array(N), delay: new Float32Array(N), lift: new Float32Array(N)
    };
    cells.forEach(([x, z, yaw, dc, dr], i) => {
      F.gx[i] = x; F.gz[i] = z; F.yaw[i] = yaw; F.d[i] = Math.hypot(x, z); F.dc[i] = dc; F.dr[i] = dr;
      F.ok[i] = rand() < 0.9 ? 1 : 0; F.r1[i] = rand(); F.r2[i] = rand();
      F.lon[i] = Math.atan2(z, x);
    });
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => F.d[a] - F.d[b]);
    const DMAX = F.d[order[N - 1]];
    order.forEach((i, rank) => {
      F.lat[i] = 1 - 2 * (rank + 0.5) / N;                          // inner devices roll to the north pole
      F.delay[i] = (rank / N) * 0.78 + F.r1[i] * 0.22;
      F.lift[i] = 18 + F.r2[i] * 26;
    });

    // A matcap rather than lit PBR: three thousand bodies cannot afford the studio's lighting maths per
    // pixel. It is painted as the same anodised aluminium (soft key above-left, dark desk below), and
    // dimmed by hand as night falls.
    const matcap = canvasTex(THREE, 256, 256, (x, w) => {
      const g = x.createRadialGradient(w * 0.36, w * 0.3, w * 0.02, w * 0.5, w * 0.52, w * 0.56);
      g.addColorStop(0, '#fbfbfc'); g.addColorStop(0.35, '#d9dbde'); g.addColorStop(0.72, '#9a9ea4'); g.addColorStop(1, '#4b4e53');
      x.fillStyle = '#000'; x.fillRect(0, 0, w, w);
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); x.fill();
      const b = x.createLinearGradient(0, w * 0.55, 0, w);
      b.addColorStop(0, 'rgba(40,42,46,0)'); b.addColorStop(1, 'rgba(40,42,46,0.55)');
      x.fillStyle = b; x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); x.fill();
    }, true);
    const bodyMat = new THREE.MeshMatcapMaterial({ matcap, vertexColors: true, color: 0xffffff });
    const glowU = { value: new THREE.Color(0, 0, 0) };
    // The globe has one light: a cool key from the upper right of its shot. How much of it each device
    // catches comes from where it sits on the sphere (worked out per frame), so spinning the globe carries
    // devices through day and night: lit aluminium on one side, screens glowing like city lights on the other.
    const SUN = V(0.32, 0.68, 0.66).normalize(), sunU = { value: lin(0xdcecff).multiplyScalar(2.2) };
    // where the light reflects off screen glass towards the globe shot's camera
    const GLINT = V(-0.55, 0.25, 0.8).normalize().add(SUN).normalize();
    const sunArr = new Float32Array(N), sunAttr = new THREE.InstancedBufferAttribute(sunArr, 1).setUsage(THREE.DynamicDrawUsage);
    geo.body.setAttribute('aSun', sunAttr);
    bodyMat.onBeforeCompile = sh => {
      sh.uniforms.uGlow = glowU; sh.uniforms.uSun = sunU;
      sh.vertexShader = 'attribute float aGlow;\nattribute float aSun;\nvarying float vGlow;\nvarying float vSun;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow; vSun = aSun;');
      sh.fragmentShader = 'uniform vec3 uGlow;\nuniform vec3 uSun;\nvarying float vGlow;\nvarying float vSun;\n' + sh.fragmentShader.replace('vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;', 'vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb + uGlow * vGlow * (1.0 - 0.6 * vSun) + uSun * vSun * matcapColor.rgb * vColor;');
    };
    const body = new THREE.InstancedMesh(geo.body, bodyMat, N);
    const tints = [0xc9cbce, 0x8f9297, 0x5b5f66, 0xd8d3c9, 0x3a3c41].map(lin);
    for (let i = 0; i < N; i++) body.setColorAt(i, tints[Math.floor(F.r2[i] * 997) % tints.length]);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // The fleet waits at its login screens: Windows 11 sign-in and the macOS login window (screens.js).
    const TW = 256, TH = 168, TILES = NS.FLEET_TILES;
    const nowText = () => { const d = new Date(); return { time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), date: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }; };
    const AS = lite ? 1 : 2;   // atlas drawn at AS x its 256 x 168 layout per screen
    const uiTex = canvasTex(THREE, TW * 3 * AS, TH * 2 * AS, x => { x.setTransform(AS, 0, 0, AS, 0, 0); const n = nowText(); NS.drawFleetAtlas(x, TW, TH, n.time, n.date); }, true);
    uiTex.anisotropy = aniso;
    const tileAttr = new Float32Array(N);
    for (let i = 0; i < N; i++) tileAttr[i] = Math.floor(F.r1[i] * 997 + F.r2[i] * 13) % TILES;
    geo.screen.setAttribute('aTile', new THREE.InstancedBufferAttribute(tileAttr, 1));
    const screenMat = new THREE.MeshBasicMaterial({ map: uiTex, toneMapped: false });
    screenMat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float aTile;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vUv = vUv * vec2(0.3313, 0.495) + vec2(0.001, 0.0025) + vec2(mod(aTile, 3.0) / 3.0, 0.5 - floor(aTile / 3.0) * 0.5);');
    };
    const screens = new THREE.InstancedMesh(geo.screen, screenMat, N);
    screens.instanceMatrix = body.instanceMatrix;
    screens.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    screens.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // custom shaders write display colours; with the glow pass on they must write linear ones instead
    const linU = { value: 0 };
    const LINZ = 'uniform float uLin; vec3 linz(vec3 c){ return mix(c, pow(max(c, 0.0), vec3(2.2)), uLin); }\n';
    const radialTex = NS.radial(THREE, 0.0);
    const padMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: radialTex }, uK: { value: 0 }, uLin: linU },
      vertexShader: 'varying vec2 vUv; varying vec3 vC;\nvoid main(){ vUv = uv; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: LINZ + 'uniform sampler2D uMap; uniform float uK; varying vec2 vUv; varying vec3 vC;\nvoid main(){ float a = texture2D(uMap, vUv).r; a *= a; gl_FragColor = vec4(linz(vC * a * uK), 1.0); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    const pads = new THREE.InstancedMesh(geo.pad, padMat, N);
    pads.instanceMatrix = body.instanceMatrix;
    pads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    pads.instanceColor.setUsage(THREE.DynamicDrawUsage);

    const blobMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: radialTex }, uK: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; varying float vA;\nvoid main(){ vUv = uv; vA = instanceColor.r; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D uMap; uniform float uK; varying vec2 vUv; varying float vA;\nvoid main(){ float a = texture2D(uMap, vUv).r; gl_FragColor = vec4(vec3(1.0 - a * uK * vA), 1.0); }',
      blending: THREE.MultiplyBlending, transparent: true, depthWrite: false
    });
    const blobs = new THREE.InstancedMesh(geo.blob, blobMat, N);
    blobs.instanceMatrix = body.instanceMatrix;
    blobs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    blobs.instanceColor.setUsage(THREE.DynamicDrawUsage);
    blobs.renderOrder = 1;

    // Halo over every display: a soft additive point, sized in world units.
    const dotTex = canvasTex(THREE, 64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      for (let i = 0; i <= 8; i++) { const r = i / 8; g.addColorStop(r, `rgba(255,255,255,${Math.exp(-r * r * 9).toFixed(3)})`); }
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    glowGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const pointScale = { value: 1 };
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dotTex }, uScale: pointScale, uSize: { value: 3.0 }, uK: { value: 0 }, uFar: { value: 600 }, uLin: linU },
      vertexShader: 'attribute vec3 aColor; uniform float uScale, uSize, uFar; varying vec3 vC; varying float vF;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float z = max(0.5, -mv.z); gl_PointSize = dot(aColor, vec3(1.0)) < 0.002 ? 0.0 : min(160.0, uSize * uScale / z); vF = (1.0 - smoothstep(uFar * 0.3, uFar * 0.85, z)) * smoothstep(30.0, 130.0, z); vC = aColor; }',
      fragmentShader: LINZ + 'uniform sampler2D uMap; uniform float uK; varying vec3 vC; varying float vF;\nvoid main(){ float a = texture2D(uMap, gl_PointCoord).r; gl_FragColor = vec4(linz(vC * a * uK * vF), 1.0); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    const glows = new THREE.Points(glowGeo, glowMat);
    [body, screens, pads, blobs, glows].forEach(o => { o.frustumCulled = false; });
    const fleet = new THREE.Group(); fleet.add(blobs, body, screens, pads, glows);
    scene.add(fleet);

    // ---- identity ring (Entra ID), later the globe's equator ----
    const GC0 = V(0, 70, 0), GC1 = V(0, 44, -175), GC = GC0.clone();
    const RG = 50, GS = 0.72, RR = 60;
    const ring = new THREE.Group(); ring.position.copy(GC0); scene.add(ring);
    const ringCol = lin(COL.ring);
    // The globe's atmosphere: a thin limb of light just outside the devices, brightest where the key light
    // grazes the edge and fading to a faint teal on the night side. A camera-facing disc, sized in globe radii.
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uL: { value: new THREE.Vector2() }, uC: { value: ringCol }, uW: { value: lin(0xe8fffc) }, uLin: linU },
      vertexShader: 'varying vec2 vP;\nvoid main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: LINZ + 'uniform float uK; uniform vec2 uL; uniform vec3 uC, uW; varying vec2 vP;\nvoid main(){ float r = length(vP); vec2 u = vP / max(r, 1e-4); float lit = clamp(dot(u, uL) * 0.9 + 0.25, 0.0, 1.0); float limb = exp(-pow((r - 1.04) / 0.045, 2.0)); float haze = r > 1.04 ? exp(-(r - 1.04) / 0.15) : smoothstep(0.62, 1.04, r) * 0.3; float a = (limb * 1.15 + haze * 0.5) * (0.1 + 0.9 * lit) * uK; gl_FragColor = vec4(linz(mix(uC, uW, limb * lit * 0.6) * a), 1.0); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    const atmo = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), atmoMat);
    atmo.renderOrder = 3; atmo.frustumCulled = false; atmo.visible = false; scene.add(atmo);
    const atR = V(), atU = V();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(RR, 0.2, 6, 360).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: ringCol.clone().multiplyScalar(2.2), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: ringCol }, uK: { value: 0 }, uR: { value: RR }, uLin: linU },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: LINZ + 'uniform vec3 uC; uniform float uK, uR; varying vec3 vP;\nvoid main(){ float r = length(vP.xz); float a = exp(-pow((r - uR) / 2.6, 2.0)) * 0.55 + exp(-pow((r - uR) / 0.7, 2.0)) * 0.6; gl_FragColor = vec4(linz(uC * a * uK), 1.0); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const halo = new THREE.Mesh(new THREE.RingGeometry(RR - 9, RR + 9, 360, 1).rotateX(-Math.PI / 2), haloMat);
    const tickPos = [];
    for (let i = 0; i < 360; i += 2) {
      const a = i * Math.PI / 180, long = i % 30 === 0, r0 = RR - (long ? 4.5 : 2.2), r1 = RR - 0.9;
      tickPos.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
    }
    const tickGeo = new THREE.BufferGeometry(); tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPos, 3));
    const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: ringCol, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    ring.add(halo, torus, ticks);
    ring.children.forEach(o => { o.frustumCulled = false; });

    // Arcs from devices to the ring, and the sign-ins travelling along them.
    const arcN = lowPower ? 150 : 300, ARC_SEG = 28;
    const arcPos = [], arcT = [], arcSeed = [];
    const pk = { a0: [], a1: [], a2: [], phase: [], kind: [] };
    const arand = rng(31);
    const pickable = [];
    for (let i = 0; i < N; i++) if (F.d[i] > 8 && F.d[i] < 112) pickable.push(i);
    for (let k = 0; k < arcN && pickable.length; k++) {
      const i = pickable.splice(Math.floor(arand() * pickable.length), 1)[0];
      const s = V(F.gx[i], 2.05, F.gz[i] - 1.55);
      const th = Math.atan2(s.z - GC0.z, s.x - GC0.x);
      const e = V(GC0.x + Math.cos(th) * RR, GC0.y, GC0.z + Math.sin(th) * RR);
      const c = s.clone().lerp(e, 0.5); c.y += 16 + arand() * 14;
      const seed = arand();
      for (let j = 0; j < ARC_SEG; j++) {
        for (const t of [j / ARC_SEG, (j + 1) / ARC_SEG]) {
          const u = 1 - t;
          arcPos.push(u * u * s.x + 2 * u * t * c.x + t * t * e.x, u * u * s.y + 2 * u * t * c.y + t * t * e.y, u * u * s.z + 2 * u * t * c.z + t * t * e.z);
          arcT.push(t); arcSeed.push(seed);
        }
      }
      for (let q = 0; q < 2; q++) {
        const r = arand();
        pk.a0.push(s.x, s.y, s.z); pk.a1.push(c.x, c.y, c.z); pk.a2.push(e.x, e.y, e.z);
        pk.phase.push(arand()); pk.kind.push(r < 0.78 ? 0 : r < 0.96 ? 1 : 2);
      }
    }
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcPos, 3));
    arcGeo.setAttribute('aT', new THREE.Float32BufferAttribute(arcT, 1));
    arcGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(arcSeed, 1));
    const arcMat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: ringCol }, uGrow: { value: 0 }, uK: { value: 0 }, uTime: { value: 0 }, uLin: linU },
      vertexShader: 'attribute float aT, aSeed; varying float vT, vS; void main(){ vT = aT; vS = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: LINZ + 'uniform vec3 uC; uniform float uGrow, uK, uTime; varying float vT, vS;\nvoid main(){ float head = uGrow * 1.45 - vS * 0.45; if (vT > head) discard; float pulse = pow(1.0 - fract(vT * 1.6 - uTime * 0.32 + vS * 7.0), 6.0); float tip = smoothstep(head - 0.08, head, vT); gl_FragColor = vec4(linz(uC * (0.3 + 1.1 * pulse + 1.4 * tip) * uK), 1.0); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    const arcs = new THREE.LineSegments(arcGeo, arcMat); arcs.frustumCulled = false;
    scene.add(arcs);

    const pkGeo = new THREE.BufferGeometry();
    pkGeo.setAttribute('position', new THREE.Float32BufferAttribute(pk.a0, 3));
    pkGeo.setAttribute('a1', new THREE.Float32BufferAttribute(pk.a1, 3));
    pkGeo.setAttribute('a2', new THREE.Float32BufferAttribute(pk.a2, 3));
    pkGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(pk.phase, 1));
    pkGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(pk.kind, 1));
    const pkMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dotTex }, uScale: pointScale, uTime: { value: 0 }, uK: { value: 0 }, uGrow: { value: 0 },
        uUp: { value: lin(COL.up) }, uDown: { value: lin(COL.down) }, uBlocked: { value: lin(COL.blocked) }, uLin: linU },
      vertexShader: [
        'attribute vec3 a1, a2; attribute float aPhase, aKind; uniform float uScale, uTime, uGrow; uniform vec3 uUp, uDown, uBlocked;',
        'varying vec3 vC; varying float vA;',
        'void main(){',
        '  float t = fract(uTime * (aKind > 1.5 ? 0.16 : 0.12) + aPhase);',
        '  float a = smoothstep(0.0, 0.06, t);',
        '  if (aKind > 0.5 && aKind < 1.5) t = 1.0 - t;',
        '  if (aKind > 1.5) { a *= 1.0 - smoothstep(0.86, 0.93, t); t = min(t, 0.9); }',
        '  a *= 1.0 - smoothstep(0.93, 1.0, aKind > 0.5 && aKind < 1.5 ? 1.0 - t : t) * (aKind > 1.5 ? 0.0 : 1.0);',
        '  float u = 1.0 - t; vec3 p = u * u * position + 2.0 * u * t * a1 + t * t * a2;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;',
        '  float z = max(0.5, -mv.z); gl_PointSize = min(26.0, (aKind > 1.5 ? 1.5 : 1.05) * uScale / z);',
        '  vC = aKind > 1.5 ? uBlocked : (aKind > 0.5 ? uDown : uUp); vA = a * step(aPhase * 0.4, uGrow);',
        '}'].join('\n'),
      fragmentShader: LINZ + 'uniform sampler2D uMap; uniform float uK; varying vec3 vC; varying float vA;\nvoid main(){ float a = texture2D(uMap, gl_PointCoord).r; gl_FragColor = vec4(linz(vC * a * vA * uK * 1.6), 1.0); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    const packets = new THREE.Points(pkGeo, pkMat); packets.frustumCulled = false;
    scene.add(packets);

    // ---- the hero display ----
    // The display canvas is drawn at 2x for sharpness; everything below works in 1024 × 666 units.
    const sctx = mb.screenCanvas.getContext('2d'), SS = mb.screenCanvas.width / 1024, SW = 1024, SH = Math.round(mb.screenCanvas.height / SS);
    const visitor = opts.visitor || { rows: [], id: '3,001' };
    let pageBg = '#F5F6F4';
    function drawScreen(mode, k) {
      sctx.setTransform(SS, 0, 0, SS, 0, 0); sctx.globalAlpha = 1;
      if (mode === 'off') { sctx.fillStyle = '#000'; sctx.fillRect(0, 0, SW, SH); }
      else if (mode === 'rows') { const n = nowText(); NS.drawHeroWake(sctx, SW, SH, k, n.time, n.date); }
      else { const n = nowText(); NS.drawVisitorLogin(sctx, SW, SH, visitor.os, n.time, n.date); }
      if (mode === 'mirror' && k > 1) { sctx.globalAlpha = clamp(k - 1); sctx.fillStyle = pageBg; sctx.fillRect(0, 0, SW, SH); sctx.globalAlpha = 1; }
      sctx.fillStyle = '#000'; NS.rrPath(sctx, SW / 2 - 78, -14, 156, 40, 12); sctx.fill();
      mb.screenTex.needsUpdate = true;
    }
    let screenKey = '';
    drawScreen('off', 0);

    // ---- camera ----
    const FRAME = { center: [-0.5, 0.73, 0.25], dir: [-0.68, 0.54, 0.72] };
    const framePoints = [], laptopPoints = [];
    for (const object of [mb.group, cable.plug]) {
      object.updateMatrixWorld(true);
      object.traverse(part => {
        if (!part.geometry || part.isInstancedMesh) return;
        part.geometry.computeBoundingBox();
        const b = part.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z])
          { const v = V(x, y, z).applyMatrix4(part.matrixWorld); framePoints.push(v); if (object === mb.group) laptopPoints.push(v); }
      });
    }
    framePoints.push(V(-2.85, 0, 1.5));
    let aspect = 1, portrait = false, track = null;
    function fitHero(fov, sx, sy) {
      // On a phone the page reports the strip left free between the hero text and the scroll cue, and the
      // laptop is centred and sized into it, so a short screen shrinks the laptop instead of hiding it.
      const band = portrait && opts.heroBand ? opts.heroBand() : null, t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
      let half = 1 - Math.abs(sy), margin = 0.86, wide = 0.86, points = framePoints;
      if (band && band.bottom - band.top > 90) {
        const H = canvas.clientHeight || innerHeight, yTop = 1 - 2 * band.top / H, yBot = 1 - 2 * band.bottom / H;
        sy = (yTop + yBot) / 2; half = (yTop - yBot) / 2; margin = 1; wide = 1.08; points = laptopPoints;
      }
      const tanV = t * half * margin, tanH = t * wide * (1 - Math.abs(sx)) * aspect;
      const look = V().fromArray(FRAME.center), dir = V().fromArray(FRAME.dir).normalize();
      const right = V().crossVectors(V(0, 1, 0), dir).normalize(), up = V().crossVectors(dir, right).normalize();
      let dist = 0;
      for (const p of points) {
        const off = p.clone().sub(look), depth = off.dot(dir);
        dist = Math.max(dist, depth + Math.abs(off.dot(right)) / (tanH * 0.9), depth + Math.abs(off.dot(up)) / tanV);
      }
      return { look, dir, dist, fov, sx, sy };
    }
    function shot(name) {
      const P = portrait, f = P ? Math.pow(clamp(1.45 / aspect, 1, 4), 0.55) : Math.pow(clamp(1.6 / aspect, 1, 3), 0.5);
      const S = (look, dir, dist, fov, sx, sy, sxP, syP) => ({ look: V(...look), dir: V(...dir).normalize(), dist: dist * f, fov, sx: P ? sxP : sx, sy: P ? syP : sy });
      // on a phone the ring and the globe are fitted into the strip left free under their captions
      const fit = (name, s) => { const band = P && opts.capBand ? opts.capBand(name) : null; return band && band.bottom - band.top > 120 ? fitBand(s, band, SUBJECT[name]) : s; };
      switch (name) {
        case 'hero': return P ? fitHero(32, 0, -0.3) : fitHero(30, 0.3, -0.02);
        case 'port': return S([-1.7, 0.04, -0.4], [-0.52, 0.42, 0.74], 2.7, 30, 0.24, 0, 0, -0.42);
        case 'screen': return S([0, 1.02, -1.28], [-0.2, 0.28, 0.94], 7.6, 30, 0.27, 0, 0, -0.24);
        case 'rise': return S([0, 0.4, -3], [-0.42, 0.5, 0.76], 32, 32, 0.14, 0, 0, -0.12);
        case 'fleet': return S([0, 0, -34], [-0.32, 0.27, 0.91], 122, 34, 0.2, -0.04, 0, -0.12);
        case 'wave': return S([-6, 0, -42], [0.22, 0.17, 0.96], 98, 34, 0.2, -0.06, 0, -0.12);
        case 'ring': return fit('ring', S([0, 50, 0], [-0.43, -0.14, 0.89], 208, 36, 0.17, 0.02, 0, -0.06));
        case 'globe': return fit('globe', S([0, 70, 0], [-0.55, 0.25, 0.8], 285, 30, 0.32, 0, 0, -0.1));
        case 'back': return S([0, 1.25, -1.3], [-0.08, 0.13, 0.99], 7.4, 32, 0.25, -0.2, 0, -0.18);
        case 'dive': return { look: SCREEN_C.clone(), dir: SCREEN_N.clone(), dist: 0.75, fov: 32, sx: 0, sy: 0 };
      }
    }
    // What has to fit on screen for the ring (its circle and where its arcs land) and the globe (sphere and equator).
    const SUBJECT = { ring: [], globe: [] };
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      SUBJECT.ring.push(V(c * RR, GC0.y, sn * RR), V(c * RR, 0, sn * RR));
      SUBJECT.globe.push(V(c * (RR + 1), GC0.y, sn * (RR + 1)));
      for (let l = -75; l <= 75; l += 25) { const r = Math.cos(l * Math.PI / 180) * (RG + 2); SUBJECT.globe.push(V(c * r, GC0.y + Math.sin(l * Math.PI / 180) * (RG + 2), sn * r)); }
    }
    SUBJECT.globe.push(V(0, GC0.y + RG + 2, 0), V(0, GC0.y - RG - 2, 0));
    // Moves the camera in or out and shifts the lens so the subject spans the band and stays within the width.
    function fitBand(s, band, pts) {
      const H = ch(), yTop = 1 - 2 * band.top / H, yBot = 1 - 2 * band.bottom / H, want = (yTop - yBot) / 2, mid = (yTop + yBot) / 2;
      const cam = new THREE.PerspectiveCamera(s.fov, aspect, 0.5, 5000), v = V();
      let dist = s.dist, c = 0;
      for (let it = 0; it < 4; it++) {
        cam.position.copy(s.look).addScaledVector(s.dir, dist); cam.lookAt(s.look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        let lo = Infinity, hi = -Infinity, xm = 0;
        for (const q of pts) { v.copy(q).project(cam); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); xm = Math.max(xm, Math.abs(v.x)); }
        c = (hi + lo) / 2;
        if (it < 3) dist *= clamp(Math.max((hi - lo) / 2 / want, xm / 0.98), 0.6, 1.8);
      }
      return Object.assign({}, s, { dist, sy: mid - c });
    }
    function buildTrack() {
      const xs = KEYS.map(k => k[0]), shots = KEYS.map(k => shot(k[1]));
      const ch = f => pchip(xs, shots.map(f));
      track = {
        lx: ch(s => s.look.x), ly: ch(s => s.look.y), lz: ch(s => s.look.z),
        dx: ch(s => s.dir.x), dy: ch(s => s.dir.y), dz: ch(s => s.dir.z),
        ld: ch(s => Math.log(s.dist)), fov: ch(s => s.fov), sx: ch(s => s.sx), sy: ch(s => s.sy)
      };
    }
    const look = V(), dir = V(), par = { x: 0, y: 0, tx: 0, ty: 0 };
    let camDist = 10;
    function placeCamera(p, time, anim) {
      look.set(track.lx(p), track.ly(p), track.lz(p));
      dir.set(track.dx(p), track.dy(p), track.dz(p)).normalize();
      camDist = Math.exp(track.ld(p));
      let fov = track.fov(p), sx = track.sx(p), sy = track.sy(p);
      const g = easeInOut(game.k);
      if (g > 0) {
        look.lerp(GSHOT.look, g); dir.lerp(GSHOT.dir, g).normalize();
        camDist = Math.exp(mix(Math.log(camDist), Math.log(GSHOT.dist), g));
        fov = mix(fov, GSHOT.fov, g); sx = mix(sx, GSHOT.sx, g); sy = mix(sy, GSHOT.sy, g);
      }
      const yaw = (par.x * 0.05 + (anim ? Math.sin(time * 0.11) * 0.018 : 0)) * (1 - g), pitch = par.y * 0.03 * (1 - g);
      dir.applyAxisAngle(V(0, 1, 0), yaw);
      const right = V().crossVectors(V(0, 1, 0), dir).normalize();
      dir.applyAxisAngle(right, -pitch).normalize();
      camera.fov = fov;
      camera.position.copy(look).addScaledVector(dir, camDist);
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      camera.near = Math.max(0.03, camDist * 0.02); camera.far = Math.max(60, camDist * 6 + 400);
      camera.updateProjectionMatrix();
      const e = camera.projectionMatrix.elements;
      e[8] = -sx; e[9] = -sy;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld(true);
      // Haze scales with the shot; for the return it opens up so the globe hangs behind the laptop.
      const open = smooth(span(p, [0.8, 0.86]));
      fog.near = mix(camDist * 0.55 + 10, 150, open); fog.far = mix(camDist * 1.9 + 60, 560, open);
      pointScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }

    // ---- theme: the daylight page colour, and night ----
    const bgDay = new THREE.Color(), bgNight = new THREE.Color(COL.nightBg), bgNow = new THREE.Color();
    function applyTheme() {
      dark = isDark();
      if (dark !== envDark) {
        envDark = dark;
        env.dispose(); env = NS.buildEnv(THREE, renderer, softbox, dark); scene.environment = env;
        lapEnv.dispose(); lapEnv = NS.buildEnv(THREE, renderer, softbox, dark, true);
        scene.traverse(o => { if (o.material && o.material.envMap) { o.material.envMap = env; o.material.needsUpdate = true; } });
        mb.group.traverse(o => [].concat(o.material || []).forEach(m => { if (m.envMap) m.envMap = lapEnv; }));
      }
      pageBg = opts.pageBg ? opts.pageBg() : (dark ? '#101315' : '#F5F6F4');
      bgDay.set(pageBg);
      fill.groundColor = lin(dark ? 0x2a2e31 : 0xc9c2b6);
      screenKey = '';
      requestFrame();
    }

    // ---- per-frame world state ----
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), S3 = V(), P3 = V(), P0 = V(), P1 = V(), P2 = V();
    const UP = V(0, 1, 0), basis = new THREE.Matrix4(), nrm = V(), tN = V(), tE = V();
    const cTeal = lin(COL.teal), cAmber = lin(COL.amber), cTmp = new THREE.Color();
    const SC_LOCAL = geo.screenCenter, SN_LOCAL = geo.screenNormal;
    const pulses = [];
    let spin = 0, spinVel = 0, hover = null, hoverK = 0;
    const waveDir = V(0.18, 0, -1).normalize();   // rolls from the far rows towards the camera
    const stats = { count: 0 };
    let lastFleetKey = '';

    // ---- Outbreak: a game played on the fleet ----
    // Malware spreads laptop to laptop across the part of the fleet in view. Isolate infected devices
    // before too many fall; a policy push cleans everything around the cursor every few seconds.
    // Difficulty follows the score, not the clock: it starts gently and each level (by points) spreads
    // faster, seeds faster, and from level 3 lands a phishing wave as it arrives.
    const OK_ = 0, INF = 1, ISO = 2, CLN = 3;
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const cellOf = new Map();
    for (let i = 0; i < N; i++) cellOf.set(F.dc[i] * 1000 + F.dr[i], i);
    const game = {
      on: false, k: 0, over: false, paused: false, started: false, t: 0, dur: 60, score: 0, combo: 1, lastHit: -9, waves: 0,
      isolated: 0, cleaned: 0, peak: 0, limit: 0, arena: new Uint8Array(N), arenaList: [], st: new Uint8Array(N),
      at: new Float32Array(N), next: new Float32Array(N), infected: [], clean: [], nextSpawn: 0, cd: 0, CD: 9, aim: null, rnd: rng(1), iso: [], level: 1
    };
    const LEVELS = [0, 400, 1000, 2000, 3500, 5500];                // points needed for levels 1-6
    const levelOf = score => { let l = 1; for (let k = 1; k < LEVELS.length; k++) if (score >= LEVELS[k]) l = k + 1; return l; };
    const hard = () => (game.level - 1) / (LEVELS.length - 1);       // 0 at level 1, 1 at level 6
    const cGame = { red: lin(0xff2a2a), amber: lin(0xffb04a), iso: lin(0x5b9dff) };
    let GSHOT = null;
    const gameShot = () => portrait
      ? { look: V(0, 0, 5), dir: V(0, 0.9, 0.44).normalize(), dist: 92, fov: 40, sx: 0, sy: 0 }
      : { look: V(0, 0, -1), dir: V(-0.04, 0.84, 0.54).normalize(), dist: 104, fov: 34, sx: 0, sy: -0.02 };
    const emit = ev => { if (opts.onGame) opts.onGame(ev); };
    function pickArena() {
      const s = GSHOT, cam = new THREE.PerspectiveCamera(s.fov, aspect, 1, 2000), v = V();
      cam.position.copy(s.look).addScaledVector(s.dir, s.dist); cam.lookAt(s.look);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      game.arenaList = [];
      for (let i = 0; i < N; i++) {
        v.set(F.gx[i], 1.1, F.gz[i] - 1.3).project(cam);
        const inside = Math.abs(v.x) < 0.9 && v.y > -0.7 && v.y < 0.68;
        game.arena[i] = inside ? 1 : 0;
        if (inside) game.arenaList.push(i);
      }
      game.limit = Math.max(8, Math.round(game.arenaList.length * 0.09));   // a phone sees fewer laptops: never fewer than 8 to lose
    }
    const spreadGap = () => mix(2.8, 0.95, hard());
    function infect(i) {
      game.st[i] = INF; game.at[i] = game.t; game.infected.push(i);
      game.next[i] = game.t + spreadGap() * (0.7 + 0.7 * game.rnd());
    }
    function spawn() {
      const L = game.arenaList;
      for (let tries = 0; tries < 30; tries++) { const i = L[Math.floor(game.rnd() * L.length)]; if (game.st[i] === OK_) { infect(i); return; } }
    }
    function screenPx(i) {
      const v = V(F.gx[i], 1.2, F.gz[i] - 1.3).project(camera);
      return { x: (v.x * 0.5 + 0.5) * cw(), y: (-v.y * 0.5 + 0.5) * ch() };
    }
    function endGame(won) {
      game.over = true;
      const healthy = game.arenaList.length - game.infected.length, pct = Math.round(healthy / game.arenaList.length * 1000) / 10;
      if (won) game.score += Math.round(pct * 20);
      emit({ type: 'end', won, score: game.score, isolated: game.isolated, cleaned: game.cleaned, peak: game.peak, healthy: pct, time: Math.min(game.t, game.dur) });
    }
    function stepGame(dt) {
      if (!game.on || game.over || game.paused) return;
      game.t += dt;
      if (game.t < 0) return;                                   // countdown while the camera settles
      if (!game.started) { game.started = true; spawn(); spawn(); game.nextSpawn = 3.5; }
      // a new level speeds everything up; from level 3 it arrives with a phishing wave
      // one level at a time, at least 8 seconds apart, so the climb stays steady however fast points come
      const lv = Math.min(levelOf(game.score), game.level + 1);
      if (lv > game.level && game.t - (game.levelAt || 0) >= 8 && game.t < game.dur - 2) {
        game.level = lv; game.levelAt = game.t;
        // a wave is sized to the screen: a phone, which loses at fewer infections, gets a smaller one
        if (lv >= 3) { game.waves++; for (let w = 0, n = Math.min(lv - 1, Math.max(2, Math.round(game.limit * 0.25))); w < n; w++) spawn(); }
        emit({ type: 'hit', kind: lv >= 3 ? 'wave' : 'level', x: innerWidth / 2, y: innerHeight * 0.3, text: lv >= 3 ? `Level ${lv} · Phishing wave!` : `Level ${lv} · spreading faster` });
      }
      game.cd = Math.max(0, game.cd - dt);
      if (game.t >= game.nextSpawn) { spawn(); game.nextSpawn = game.t + mix(4.5, 1.6, hard()) * (0.8 + 0.4 * game.rnd()); }
      const list = game.infected;
      for (let k = list.length - 1; k >= 0; k--) {
        const i = list[k];
        if (game.st[i] !== INF) { list.splice(k, 1); continue; }
        if (game.t < game.next[i]) continue;
        game.next[i] = game.t + spreadGap() * (0.7 + 0.7 * game.rnd());
        const free = [];
        for (const [a, b] of NB) { const j = cellOf.get((F.dc[i] + a) * 1000 + F.dr[i] + b); if (j !== undefined && game.arena[j] && game.st[j] === OK_) free.push(j); }
        if (free.length) infect(free[Math.floor(game.rnd() * free.length)]);
      }
      for (let k = game.clean.length - 1; k >= 0; k--) { const i = game.clean[k]; if (game.t - game.at[i] > 0.9) { game.st[i] = OK_; game.clean.splice(k, 1); } }
      // isolation is temporary: a remediated laptop rejoins the fleet, and can be infected again
      for (let k = game.iso.length - 1; k >= 0; k--) { const i = game.iso[k]; if (game.st[i] !== ISO) game.iso.splice(k, 1); else if (game.t - game.at[i] > 14) { game.st[i] = OK_; game.iso.splice(k, 1); } }
      game.peak = Math.max(game.peak, game.infected.length);
      if (game.infected.length >= game.limit) endGame(false);
      else if (game.t >= game.dur) endGame(true);
    }
    const gPlane = new THREE.Plane(V(0, 1, 0), -1.1);
    function gamePick(e, finger) {
      ndc.set(e.clientX / cw() * 2 - 1, -(e.clientY / ch()) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(gPlane, hit)) return -1;
      const x = hit.x, z = hit.z + 1.3, c0 = Math.round(x / SX), r0 = Math.round(z / SZ);
      // Measured on screen: the nearest red laptop within reach of a fingertip (or a cursor) is the target;
      // otherwise the healthy laptop right under it, if there is one.
      const reachRed = finger ? 48 : 28, reachAny = finger ? 22 : 18;
      let red = -1, rd = reachRed, any = -1, ad = reachAny;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const j = cellOf.get((c0 + a) * 1000 + r0 + b);
        if (j === undefined || !game.arena[j]) continue;
        const s = screenPx(j), d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
        if (game.st[j] === INF && d < rd) { rd = d; red = j; }
        if (d < ad) { ad = d; any = j; }
      }
      return red >= 0 ? red : any;
    }
    function gameClick(e) {
      if (game.over || game.paused || game.t < 0) return;
      const i = gamePick(e, e.pointerType === 'touch');
      if (i < 0) return;
      game.aim = { x: F.gx[i], z: F.gz[i] };
      const at = screenPx(i);
      if (game.st[i] === INF) {
        game.combo = game.t - game.lastHit < 1.1 ? Math.min(8, game.combo + 1) : 1; game.lastHit = game.t;
        const pts = 100 * game.combo;
        game.score += pts; game.isolated++; game.st[i] = ISO; game.at[i] = game.t; game.iso.push(i);
        emit({ type: 'hit', kind: 'iso', x: at.x, y: at.y, text: '+' + pts + (game.combo > 1 ? ' ×' + game.combo : '') });
      } else if (game.st[i] === OK_) {
        game.combo = 1; game.score = Math.max(0, game.score - 50);
        emit({ type: 'hit', kind: 'miss', x: at.x, y: at.y, text: 'Healthy −50' });
      }
    }
    function gamePolicy() {
      if (!game.on || game.over || game.paused || game.t < 0 || game.cd > 0) return false;
      const c = game.aim || { x: GSHOT.look.x, z: GSHOT.look.z + 2 };
      let n = 0;
      for (const i of game.infected.slice()) if (Math.hypot(F.gx[i] - c.x, F.gz[i] - c.z) < 12) { game.st[i] = CLN; game.at[i] = game.t; game.clean.push(i); n++; }
      game.CD = Math.round(mix(9, 14, hard())); game.cleaned += n; game.score += n * 50; game.cd = game.CD;
      pulses.push({ x: c.x, z: c.z, t0: clock });
      const v = V(c.x, 1.2, c.z - 1.3).project(camera);
      emit({ type: 'hit', kind: 'policy', x: (v.x * 0.5 + 0.5) * cw(), y: (-v.y * 0.5 + 0.5) * ch(), text: n ? `Policy pushed · ${n} cleaned` : 'Policy pushed' });
      return true;
    }
    function resetGame() {
      game.st.fill(OK_); game.infected = []; game.clean = [];
      game.iso = [];
      Object.assign(game, { over: false, paused: false, started: false, waves: 0, t: -3, score: 0, combo: 1, lastHit: -9, isolated: 0, cleaned: 0, peak: 0, cd: 0, CD: 9, level: 1, levelAt: 0, aim: null, rnd: rng((Date.now() & 0xffff) + 3) });
    }

    function updateFleet(p, time, force) {
      const appear = span(p, T.appear), A = appear <= 0 ? -1 : 5 * Math.pow((DMAX + 24) / 5, appear);
      const wave = span(p, T.wave), W = mix(-150, 160, wave) * -1;
      const M = span(p, T.morph) * 1.42;
      const n = smooth(span(p, T.night));
      const gk = game.k;
      const key = [gk > 0 ? time.toFixed(3) + game.t.toFixed(3) : '', A.toFixed(2), W.toFixed(1), M.toFixed(4), (M > 0 ? spin : 0).toFixed(4), pulses.length, hoverK.toFixed(3), hover ? hover.x.toFixed(1) + hover.z.toFixed(1) : '', GC.y.toFixed(2), n.toFixed(3)].join('|');
      if (key === lastFleetKey && !force) return;
      lastFleetKey = key;
      const mat = body.instanceMatrix.array, sc = screens.instanceColor.array, pc = pads.instanceColor.array, bc = blobs.instanceColor.array;
      const gp = glowGeo.attributes.position.array, gc = glowGeo.attributes.aColor.array;
      const cosS = Math.cos(spin), sinS = Math.sin(spin);
      let count = 0;
      for (let i = 0; i < N; i++) {
        const d = F.d[i];
        const a = A < 0 ? 0 : clamp((A - d) / 9);
        if (a > 0.5) count++;
        const m = clamp((M - F.delay[i]) / 0.42), me = easeInOut(m);
        const s = a <= 0 ? 0 : backOut(a) * mix(1, GS, me);

        // Display: off, then on with a flash. Amber until the policy wave reaches it. The wave front
        // and any policy the visitor pushes lift each device as they pass, like a stadium wave.
        const on = clamp((a - 0.55) / 0.45);
        let flash = a > 0 && a < 1 ? (1 - Math.abs(a - 0.7) / 0.3) * 0.9 : 0, lift = 0;
        const s_ = F.gz[i] * waveDir.z + F.gx[i] * waveDir.x;
        const passed = s_ > W + 3, front = wave > 0 && wave < 1 ? clamp(1 - Math.abs(s_ - W) / 7) : 0;
        flash += front * 1.3; lift += smooth(front) * 1.1;
        for (let k = 0; k < pulses.length; k++) {
          const pu = pulses[k], r = (time - pu.t0) * 70, dd = Math.hypot(F.gx[i] - pu.x, F.gz[i] - pu.z);
          const w = clamp(1 - Math.abs(dd - r) / 6) * clamp(1 - r / 170);
          flash += w * 1.4; lift += smooth(w) * 0.9;
        }
        if (hover && hoverK > 0 && m < 1) { const dh = Math.hypot(F.gx[i] - hover.x, F.gz[i] - hover.z); const w = clamp(1 - dh / (gk > 0 ? 2.6 : 16)) * hoverK; flash += w * (gk > 0 ? 0.35 : 0.7); lift += smooth(w) * 0.35; }
        let gState = OK_, gAge = 0;
        if (gk > 0 && game.arena[i]) { gState = game.st[i]; gAge = game.t - game.at[i]; if (gState === INF) lift += 0.18 + Math.sin(time * 38 + i) * 0.08; }

        // grid pose
        P0.set(F.gx[i], (1 - a) * (1 - a) * 2.2 + lift * (1 - me), F.gz[i]);
        Q.setFromAxisAngle(UP, F.yaw[i]);
        let day = 0, sunK = 0, glint = 0;
        if (m > 0) {
          // sphere pose: screen facing out, upright to the globe's axis
          const lat = F.lat[i], rxz = Math.sqrt(1 - lat * lat), lon = F.lon[i];
          const cx = Math.cos(lon) * rxz, cz = Math.sin(lon) * rxz;
          nrm.set(cx * cosS - cz * sinS, lat, cx * sinS + cz * cosS);
          day = smooth(clamp((nrm.dot(SUN) + 0.2) / 0.8)); sunK = me * (1 - gk);
          const h = Math.max(0, nrm.dot(GLINT)); glint = (Math.pow(h, 28) + 0.22 * Math.pow(h, 6)) * sunK;
          tN.copy(UP).addScaledVector(nrm, -lat); if (tN.lengthSq() < 1e-4) tN.set(0, 0, -1); tN.normalize();
          tE.crossVectors(tN, nrm);
          basis.makeBasis(tE, tN, nrm); Q2.setFromRotationMatrix(basis);
          P2.copy(GC).addScaledVector(nrm, RG);
          P3.copy(SC_LOCAL).multiplyScalar(GS).applyQuaternion(Q2); P2.sub(P3);
          P1.copy(P0).lerp(P2, 0.5); P1.y += F.lift[i];
          const u = 1 - me;
          P0.set(u * u * P0.x + 2 * u * me * P1.x + me * me * P2.x, u * u * P0.y + 2 * u * me * P1.y + me * me * P2.y, u * u * P0.z + 2 * u * me * P1.z + me * me * P2.z);
          Q.slerp(Q2, me);
        }
        S3.set(s, s, s);
        M4.compose(P0, Q, S3);
        M4.toArray(mat, i * 16);

        let base = F.ok[i] || passed || m > 0 ? cTeal : cAmber, lum = on * (0.7 + 0.3 * F.r1[i]);
        // In the game, threats must read at a glance: pure pulsing red with a big halo, a clear shield
        // blue once isolated, and every healthy screen turned down so neither gets lost in the teal.
        let tint = base === cAmber ? 0.5 : 0.84, halo = base === cAmber ? 0.8 : 0.38;
        if (gk > 0) {
          if (!game.arena[i]) lum *= mix(1, 0.2, gk);
          else if (gState === INF) { base = gAge < 0.45 && Math.sin(gAge * 40) > 0 ? cGame.amber : cGame.red; lum = on * (1.15 + 0.45 * Math.sin(time * 9 + i)); tint = mix(tint, 0, gk); halo = mix(0.85, 3.2, gk); }
          else if (gState === ISO) { base = cGame.iso; lum = on * 0.95; tint = mix(tint, 0.12, gk); halo = mix(0.85, 1.3, gk); }
          else { lum *= mix(1, 0.6, gk); if (gState === CLN) flash += clamp(1 - gAge / 0.9) * 1.2; }
        }
        const fl = Math.min(flash, 1.6) * on;
        // the screen keeps its own picture, tinted by its status; the halo carries the status colour
        // on the globe the lit side's screens brighten and catch a glint off the glass; the night side dims
        const sl = mix(1, mix(0.4, 1.15, day), sunK), gl = glint * 1.6;
        const r = ((tint + (1 - tint) * base.r) * lum + fl) * sl + gl, g = ((tint + (1 - tint) * base.g) * lum + fl) * sl + gl, b = ((tint + (1 - tint) * base.b) * lum + fl) * sl + gl;
        sc[i * 3] = r; sc[i * 3 + 1] = g; sc[i * 3 + 2] = b;
        sunArr[i] = day * sunK;
        const pad = (1 - me) * n * 0.45;
        pc[i * 3] = (base.r * lum + fl) * pad; pc[i * 3 + 1] = (base.g * lum + fl) * pad; pc[i * 3 + 2] = (base.b * lum + fl) * pad;
        bc[i * 3] = a * (1 - me);
        // halo just in front of the display, so the glass never cuts it in half
        P3.copy(SC_LOCAL).addScaledVector(SN_LOCAL, 0.7).multiplyScalar(s).applyQuaternion(Q).add(P0);
        gp[i * 3] = P3.x; gp[i * 3 + 1] = P3.y; gp[i * 3 + 2] = P3.z;
        const fh = Math.min(fl, 1) * 0.55 + glint * 0.9, hl = mix(1, mix(1.15, 0.55, day), sunK);
        gc[i * 3] = base.r * lum * halo * hl + fh; gc[i * 3 + 1] = base.g * lum * halo * hl + fh; gc[i * 3 + 2] = base.b * lum * halo * hl + fh;
      }
      stats.count = count;
      body.instanceMatrix.needsUpdate = true; screens.instanceColor.needsUpdate = true; sunAttr.needsUpdate = true; pads.instanceColor.needsUpdate = true; blobs.instanceColor.needsUpdate = true;
      glowGeo.attributes.position.needsUpdate = true; glowGeo.attributes.aColor.needsUpdate = true;
      fleet.visible = A > 0;
      pads.visible = blobs.visible = M < 1.42;   // once every device is on the globe their floor glow and shadow are zero: skip drawing them
    }

    // ---- scroll-driven plug-in ----
    const tipPath = u => {
      if (u < 0.72) {
        const t = easeInOut(u / 0.72), mid = REST_TIP.clone().lerp(PRE, 0.5); mid.y += 0.05; mid.addScaledVector(OUT, 0.03);
        const a = REST_TIP.clone().lerp(mid, t), b = mid.clone().lerp(PRE, t);
        return a.lerp(b, t);
      }
      return PRE.clone().lerp(IN, easeOut((u - 0.72) / 0.28));
    };
    let lastU = 0, settleT = 0, seatedT = 0;
    function updatePlug(u, dt) {
      if (reduced) {
        const want = u >= 0.5;
        if (want && plugState !== 'seated') {
          cable.lock = { tip: [IN.x, IN.y, IN.z], back: [IN_BACK.x, IN_BACK.y, IN_BACK.z] }; plugState = 'seated'; cable.wake();
          for (let i = 0; i < 360; i++) cable.step(1 / 120);
          cable.updateMesh(); bakeCableShadow(false); renderer.shadowMap.needsUpdate = true;
        } else if (!want && plugState !== 'rest') {
          cable.lock = null; cable.drag = null; cable.align = null; cable.restore(rest); cable.asleep = true; plugState = 'rest';
          cable.updateMesh(); bakeCableShadow(false); renderer.shadowMap.needsUpdate = true;
        }
        return false;
      }
      let moving = false;
      if (u >= 1) {
        if (plugState !== 'seated') { cable.drag = null; cable.align = null; cable.lock = { tip: [IN.x, IN.y, IN.z], back: [IN_BACK.x, IN_BACK.y, IN_BACK.z] }; cable.wake(); plugState = 'seated'; seatedT = 0; sound('plug'); }
        // A seated cable keeps trembling by fractions of a millimetre under the lock; once it has
        // hung for a moment, freeze it so the rest of the film does not pay for physics or shadows.
        seatedT += dt;
        if (seatedT > 1.6 && !cable.asleep) cable.asleep = true;
      } else if (u > 0) {
        cable.lock = null;
        const p = tipPath(u);
        cable.drag = { x: p.x, y: p.y, z: p.z };
        const k = clamp((u - 0.15) / 0.5);
        cable.align = k > 0 ? { ox: OUT.x, oy: OUT.y, oz: OUT.z, k: 0.3 + 0.7 * k } : null;
        cable.wake(); plugState = 'moving';
      } else if (plugState === 'free' && heroPlay()) {
        return !cable.asleep || !!held;
      } else if (plugState !== 'rest') {
        if (plugState !== 'settling') { plugState = 'settling'; settleT = 0; cable.lock = null; cable.align = null; cable.grab = null; cable.wake(); }
        cable.drag = { x: REST_TIP.x, y: REST_TIP.y, z: REST_TIP.z };
        settleT += dt;
        const k = 1 - Math.exp(-dt * 5);
        const pos = cable.pos, prev = cable.prev, rp = rest.pos;
        let dev = 0;
        for (let i = 0; i < pos.length; i++) { pos[i] += (rp[i] - pos[i]) * k; prev[i] = pos[i]; dev = Math.max(dev, Math.abs(rp[i] - pos[i])); }
        if (dev < 2e-4 || settleT > 2.5) { cable.drag = null; cable.restore(rest); cable.asleep = true; plugState = 'rest'; cable.updateMesh(); bakeCableShadow(false); renderer.shadowMap.needsUpdate = true; return false; }
        moving = true;
      }
      lastU = u;
      return moving || !cable.asleep;
    }

    const sound = (name, v) => { if (opts.onSound) opts.onSound(name, v); };

    // ---- post: a soft glow on the night scenes ----
    // Only where it is cheap enough (WebGL 2 with float targets, not a phone); everything else, and the
    // daylight opening, renders straight to the screen exactly as before.
    const post = (() => {
      if (lowPower || /film-nopost/.test(location.search) || !renderer.capabilities.isWebGL2 || !THREE.WebGLMultisampleRenderTarget || !renderer.extensions.has('EXT_color_buffer_float')) return null;
      const sceneRT = new THREE.WebGLMultisampleRenderTarget(1, 1, { type: THREE.HalfFloatType, stencilBuffer: false });
      sceneRT.samples = 4;
      const mk = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
      const bA = mk(), bB = mk();
      const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      quad.frustumCulled = false; qScene.add(quad);
      const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      const sh = (u, f) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: f, depthTest: false, depthWrite: false });
      const bright = sh({ t: { value: null } }, 'uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(0.55, 1.1, l), 1.0); }');
      const blur = sh({ t: { value: null }, d: { value: new THREE.Vector2() } }, 'uniform sampler2D t; uniform vec2 d; varying vec2 vUv;\nvoid main(){ vec3 s = texture2D(t, vUv).rgb * 0.2270;\n s += (texture2D(t, vUv + d * 1.3846).rgb + texture2D(t, vUv - d * 1.3846).rgb) * 0.3162;\n s += (texture2D(t, vUv + d * 3.2308).rgb + texture2D(t, vUv - d * 3.2308).rgb) * 0.0703;\n gl_FragColor = vec4(s, 1.0); }');
      const comp = sh({ tS: { value: sceneRT.texture }, tB: { value: bA.texture }, uB: { value: 0 } },
        'uniform sampler2D tS, tB; uniform float uB; varying vec2 vUv;\n' +
        'vec3 enc(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }\n' +
        'void main(){ vec3 c = texture2D(tS, vUv).rgb + texture2D(tB, vUv).rgb * uB;\n float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;\n gl_FragColor = vec4(enc(c) + n / 255.0, 1.0); }');
      const v2 = new THREE.Vector2(), cc = new THREE.Color(), fc = new THREE.Color();
      function size() {
        renderer.getDrawingBufferSize(v2);
        sceneRT.setSize(v2.x, v2.y);
        bA.setSize(Math.max(1, v2.x >> 2), Math.max(1, v2.y >> 2)); bB.setSize(bA.width, bA.height);
      }
      function pass(m, out) { quad.material = m; renderer.setRenderTarget(out); renderer.render(qScene, qCam); }
      function soften(a, b, step) {
        blur.uniforms.t.value = a.texture; blur.uniforms.d.value.set(step / a.width, 0); pass(blur, b);
        blur.uniforms.t.value = b.texture; blur.uniforms.d.value.set(0, step / a.height); pass(blur, a);
      }
      return {
        size,
        render(bloom) {
          // the scene renders linear into a float target, so the clear colour and fog go linear too
          renderer.getClearColor(cc); fc.copy(fog.color);
          renderer.setClearColor(cc.clone().convertSRGBToLinear(), 1); fog.color.convertSRGBToLinear(); linU.value = 1;
          renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
          renderer.setClearColor(cc, 1); fog.color.copy(fc); linU.value = 0;
          if (bloom > 0) { bright.uniforms.t.value = sceneRT.texture; pass(bright, bA); soften(bA, bB, 1.2); soften(bA, bB, 2.8); }
          comp.uniforms.uB.value = bloom;
          pass(comp, null);
        },
        dispose() { [sceneRT, bA, bB].forEach(r => r.dispose()); [bright, blur, comp].forEach(m => m.dispose()); quad.geometry.dispose(); }
      };
    })();
    let postOff = false;
    function renderFrame(n, pp) {
      // the glow is for the wide night shots; in the final close-up it would haze the sign-in text
      const close = smooth(span(pp, [0.85, 0.872])) * (1 - smooth(span(pp, [0.93, 0.95])));
      const bloom = n * 0.95 * (1 - 0.8 * close);
      if (!post || postOff || bloom < 0.02) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      post.render(bloom);
    }

    // ---- hover life on the opening laptop: its display wakes faintly, the connector catches the light ----
    let deskHover = 0, deskHoverT = 0, cableHover = 0, cableHoverT = 0, wakeCue = false;

    // ---- loop ----
    let target = 0, p = 0, raf = 0, last = 0, acc = 0, visible = true, clock = 0, wasMoving = false;
    const STEP = 1 / 120;
    function requestFrame() { if (raf || !visible || document.hidden) return; last = performance.now(); raf = requestAnimationFrame(loop); }
    function loop(now) {
      raf = 0;
      if (warm.length) { warmStep(); last = now; raf = requestAnimationFrame(loop); return; }
      const raw = (now - last) / 1000, dt = clamp(raw, 0, 0.05); last = Math.max(last, now);
      const diff = target - p;
      p = reduced || Math.abs(diff) < 2e-5 ? target : p + diff * (1 - Math.exp(-dt * 5.5));
      const anim = p > 0.3 && p < 0.9;
      if (anim) clock += dt;
      par.x += (par.tx - par.x) * (1 - Math.exp(-dt * 4)); par.y += (par.ty - par.y) * (1 - Math.exp(-dt * 4));
      let busy = Math.abs(target - p) > 2e-5 || Math.abs(par.tx - par.x) > 1e-3 || Math.abs(par.ty - par.y) > 1e-3 || anim;

      // cable
      const u = span(p, T.plug);
      const physics = updatePlug(u, dt);
      if (physics) {
        acc += dt; let k = 0;
        while (acc >= STEP && k < 6) { cable.step(STEP); acc -= STEP; k++; }
        if (k === 6) acc = 0;
        cable.updateMesh(); bakeCableShadow(true); renderer.shadowMap.needsUpdate = true;
        busy = true; wasMoving = true;
      } else if (wasMoving) { wasMoving = false; cable.updateMesh(); bakeCableShadow(false); renderer.shadowMap.needsUpdate = true; }

      // the desk: playable at the start, tidied away as soon as the film begins
      if (!heroPlay()) {
        if (held) release();
        desk.tx = 0; desk.tz = 0; desk.tlid = OPEN; desk.spin = 0; desk.tRy = 0;
        if (Math.abs(desk.ry) > Math.PI) desk.ry -= Math.round(desk.ry / (Math.PI * 2)) * Math.PI * 2;   // home the short way round
      }
      if (Math.abs(desk.spin) > 0.03 && !(held && held.kind === 'laptop')) {
        desk.ry += desk.spin * dt; desk.tRy = desk.ry; desk.spin *= Math.exp(-dt * 1.6);
        applyDesk(); cable.wake(); busy = true; desk.moved = true;
      } else desk.spin = 0;
      if (!held || held.kind !== 'laptop') {
        const kk = reduced ? 1 : 1 - Math.exp(-dt * 7), kl = reduced ? 1 : 1 - Math.exp(-dt * 6);
        const dx = desk.tx - desk.x, dz = desk.tz - desk.z, dr = desk.tRy - desk.ry, dl = held && held.kind === 'lid' ? 0 : desk.tlid - desk.lid;
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dr) + Math.abs(dl) > 1e-4) {
          desk.x += dx * kk; desk.z += dz * kk; desk.ry += dr * kk; desk.lid += dl * kl;
          if (Math.abs(dx) + Math.abs(dz) + Math.abs(dr) + Math.abs(dl) < 2e-3) { desk.x = desk.tx; desk.z = desk.tz; desk.ry = desk.tRy; desk.lid = held && held.kind === 'lid' ? desk.lid : desk.tlid; }
          applyDesk(); cable.wake(); busy = true; desk.moved = true;
        } else if (desk.moved && !held) { desk.moved = false; bakeDesk(); }
      }

      // daylight → night
      const n = smooth(span(p, T.night));
      bgNow.copy(bgDay).lerp(bgNight, n);
      renderer.setClearColor(bgNow, 1);
      fog.color.copy(bgNow);
      key.intensity = 1.2 * (1 - n) + 0.04 * n;
      fill.intensity = 0.3 * (1 - n) + 0.05 * n;
      rim.intensity = 0.55 * (1 - n) + 0.28 * n; rim.color.copy(rimDay).lerp(rimNight, n);
      const envK = 1 - 0.86 * n;
      for (const m of envMats) m.envMapIntensity = m.userData.env0 * envK;
      bodyMat.color.setScalar(0.07 + 0.93 * (1 - n));
      contactShadow.plane.material.opacity = 0.5 * (1 - 0.4 * n);
      cableShadow.plane.material.opacity = 0.55 * (1 - 0.4 * n);
      blobMat.uniforms.uK.value = 0.55 * (1 - 0.7 * n);
      padMat.uniforms.uK.value = 1;
      glowU.value.setRGB(0.012, 0.05, 0.046).multiplyScalar(n);
      glowMat.uniforms.uK.value = 0.2 + 0.5 * n;
      glowMat.uniforms.uFar.value = fog.far;

      // hero display
      const wake = easeInOut(span(p, T.wake));
      const mirror = span(p, T.mirror), blank = span(p, T.blank);
      deskHover += ((heroPlay() ? deskHoverT : 0) - deskHover) * (1 - Math.exp(-dt * 6));
      cableHover += ((heroPlay() ? cableHoverT : 0) - cableHover) * (1 - Math.exp(-dt * 8));
      if (Math.abs(deskHover - deskHoverT) > 0.01 || Math.abs(cableHover - cableHoverT) > 0.01) busy = true;
      const peek = wake > 0 ? 0 : deskHover * clamp(desk.lid / 60);
      cable.plug.userData.housing.emissive.setRGB(0.04, 0.43, 0.44).multiplyScalar(cableHover * 0.35);
      if (wake > 0.05 && !wakeCue) { wakeCue = true; sound('wake'); } else if (wake <= 0) wakeCue = false;
      mb.screenMat.emissiveIntensity = Math.max(wake * 1.05, peek * 0.42);
      shadowMat.opacity = 0.26 * (1 - n) * (1 - 0.7 * wake);   // the lid's long cast shadow gives way to the display's own light
      if (screenGlow) screenGlow.intensity = wake * 1.3 * (1 + 0.6 * n);
      let mode = 'off', sk = 0;
      if (p >= T.mirror[0] - 0.01) { mode = 'mirror'; sk = mirror + blank; }
      else if (wake > 0) { mode = 'rows'; sk = span(p, T.rows) * 1.2; }
      else if (peek > 0.01) { mode = 'rows'; sk = 0; }
      const keyS = mode === 'rows' ? 'rows' + Math.round(Math.min(sk, 0.9) * 100) : mode === 'mirror' ? 'mirror' + Math.round(Math.max(0, sk - 1) * 120) : mode;
      if (keyS !== screenKey) { screenKey = keyS; drawScreen(mode, sk); }

      // globe position drifts back for the return shot
      GC.copy(GC0).lerp(GC1, easeInOut(span(p, T.drift)));
      ring.position.copy(GC);
      if (p > 0.6 && p < 0.92) { spin += dt * 0.05 + spinVel * dt; spinVel *= Math.exp(-dt * 1.4); }
      for (let i = pulses.length - 1; i >= 0; i--) if (clock - pulses[i].t0 > 3) pulses.splice(i, 1);
      if (pulses.length) busy = true;
      hoverK += ((hover ? 1 : 0) - hoverK) * (1 - Math.exp(-dt * 6));
      game.k = reduced ? (game.on ? 1 : 0) : clamp(game.k + (game.on ? dt : -dt) / 1.2);
      if (game.on || game.k > 0) {
        busy = true;
        stepGame(dt);
        if (game.on && !game.over) emit({ type: 'tick', t: game.t, dur: game.dur, score: game.score, combo: game.t - game.lastHit < 1.1 ? game.combo : 1, infected: game.infected.length, limit: game.limit, cd: game.cd, CD: game.CD, isolated: game.isolated, level: game.level });
      }
      updateFleet(p, clock, false);

      // ring, arcs, packets
      const ringK = smooth(span(p, T.ring)) * (1 - smooth(span(p, [0.875, 0.92])));
      ring.visible = ringK > 0;
      torus.material.opacity = ringK; haloMat.uniforms.uK.value = ringK * 0.8; ticks.material.opacity = ringK * 0.7;
      ring.rotation.y = clock * 0.03;
      ring.scale.setScalar(mix(0.9, 1, easeOut(span(p, T.ring))));
      const arcK = span(p, T.ring) * (1 - span(p, T.arcsOut));
      arcs.visible = packets.visible = arcK > 0;
      arcMat.uniforms.uGrow.value = span(p, T.arcs); arcMat.uniforms.uK.value = arcK; arcMat.uniforms.uTime.value = clock;
      pkMat.uniforms.uGrow.value = span(p, T.arcs); pkMat.uniforms.uK.value = arcK * span(p, T.arcs); pkMat.uniforms.uTime.value = clock;

      const wide = p > 0.205 && p < 0.875;
      if (wide && anim && raw > 0 && raw < 0.5) {
        slow = raw > 1 / 40 ? slow + 1 : Math.max(0, slow - 1);
        fast = raw < 1 / 56 ? fast + 1 : 0;
        if (slow > 24 && post && !postOff && !pinPR) { postOff = true; slow = fast = 0; prAt = now; }   // slow: the glow pass goes before any sharpness
        else if (slow > 24 && prFleet > PR_MIN && now - prAt > 1200) { prFleet = Math.max(PR_MIN, prFleet - 0.25); slow = fast = 0; prAt = now; }
        else if (fast > 240 && prFleet < PR_MAX && now - prAt > 4000) { prFleet = Math.min(PR_MAX, prFleet + 0.25); slow = fast = 0; prAt = now; }
      }
      const pr = wide ? prFleet : PR_MAX;
      if (pr !== prNow) { prNow = pr; renderer.setPixelRatio(pr); renderer.setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, false); if (post) post.size(); }
      placeCamera(p, clock, anim);
      const atmoK = smooth(span(p, [0.69, 0.78])) * (1 - 0.45 * smooth(span(p, T.drift))) * (1 - smooth(span(p, [0.9, 0.94]))) * (1 - game.k);
      atmo.visible = atmoK > 0.001;
      if (atmo.visible) {
        atmo.position.copy(GC); atmo.quaternion.copy(camera.quaternion); atmo.scale.setScalar(RG);
        atR.set(1, 0, 0).applyQuaternion(camera.quaternion); atU.set(0, 1, 0).applyQuaternion(camera.quaternion);
        atmoMat.uniforms.uL.value.set(SUN.dot(atR), SUN.dot(atU)); atmoMat.uniforms.uK.value = atmoK;
      }
      renderFrame(n, p);
      if (!opts.ready) { opts.ready = true; opts.onReady && opts.onReady(); }
      if (opts.onFrame) opts.onFrame(frameInfo(p));
      if (busy) requestFrame();
    }
    const fi = { p: 0, count: 0, ring: { x: 0, y: 0, k: 0 }, total: N };
    const rp = V();
    function frameInfo(pp) {
      fi.p = pp; fi.count = stats.count;
      rp.copy(camera.position).sub(GC); rp.y = 0; rp.normalize().multiplyScalar(RR).add(GC).project(camera);
      fi.ring.x = (rp.x * 0.5 + 0.5) * cw(); fi.ring.y = (-rp.y * 0.5 + 0.5) * ch(); fi.ring.k = ring.visible ? torus.material.opacity : 0;
      return fi;
    }

    function resize() {
      const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      if (post) post.size();
      aspect = w / h; portrait = aspect < 0.9;
      camera.aspect = aspect;
      buildTrack();
      GSHOT = gameShot();
      requestFrame();
    }

    // ---- input: parallax everywhere; in the fleet, click to push a policy and hover to light it up ----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(V(0, 1, 0), 0), hit = V();
    function groundAt(e) {
      ndc.set(e.clientX / cw() * 2 - 1, -(e.clientY / ch()) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(floor, hit) ? hit : null;
    }
    const fleetLive = () => p > 0.3 && p < 0.64;

    // Before the film starts the desk is a toy: grab the cable anywhere, drag the laptop, close the lid.
    const heroPlay = () => p < 0.02 && target < 0.02;
    const deskPlane = new THREE.Plane(V(0, 1, 0), 0), liftPlane = new THREE.Plane(V(0, 1, 0), -0.32), pv = V();
    let held = null;
    function aim(e) { ndc.set(e.clientX / cw() * 2 - 1, -(e.clientY / ch()) * 2 + 1); ray.setFromCamera(ndc, camera); }
    function pickDesk(e, finger) {
      aim(e);
      let best = -1, bd = finger ? 40 * 40 : 24 * 24;   // a fingertip gets a wider catch on the cable
      for (let i = 2; i <= cable.N; i++) {
        cable.get(i, pv).project(camera);
        const dx = (pv.x * 0.5 + 0.5) * cw() - e.clientX, dy = (-pv.y * 0.5 + 0.5) * ch() - e.clientY, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return { kind: best >= cable.N - 1 ? 'tip' : 'cable', i: best };
      const hits = ray.intersectObject(mb.group, true);
      if (!hits.length) return null;
      let o = hits[0].object; while (o && o !== mb.lid) o = o.parent;
      return { kind: o ? 'lid' : 'laptop', point: hits[0].point.clone() };
    }
    function holdCable(e) {
      aim(e);
      if (!ray.ray.intersectPlane(liftPlane, hit)) return;
      const anchor = cable.get(0, pv), reach = (held.kind === 'tip' ? cable.length + PLUG.LEN : held.i * cable.seg) * 0.97;
      const off = V().subVectors(hit, anchor);
      if (off.length() > reach) hit.copy(anchor).addScaledVector(off.normalize(), reach);
      const c = collide(hit.x, hit.y, hit.z, 0.04, false);
      if (c) hit.set(c[0], c[1], c[2]);
      if (held.kind === 'tip') { cable.drag = { x: hit.x, y: hit.y, z: hit.z }; cable.align = null; }
      else cable.grab = { i: held.i, x: hit.x, y: hit.y, z: hit.z };
      cable.wake();
    }
    function startHold(e, pick, finger) {
      held = Object.assign({ x0: e.clientX, y0: e.clientY, moved: false, finger: !!finger }, pick);
      if (pick.kind === 'tip' || pick.kind === 'cable') { if (plugState === 'rest' || plugState === 'settling') { plugState = 'free'; cable.lock = null; } holdCable(e); }
      else if (pick.kind === 'laptop') { held.ry0 = desk.ry; held.lx = e.clientX; held.lt = performance.now(); held.v = 0; desk.spin = 0; }
      else held.lid0 = desk.lid;
      canvas.style.cursor = pick.kind === 'lid' ? 'ns-resize' : 'grabbing';
      requestFrame();
    }
    function moveHold(e) {
      if (Math.hypot(e.clientX - held.x0, e.clientY - held.y0) > 5) held.moved = true;
      // a sideways drag on the lid spins the laptop too; an up-and-down one opens or closes it
      if (held.kind === 'lid' && !held.axis && held.moved) {
        held.axis = Math.abs(e.clientX - held.x0) > Math.abs(e.clientY - held.y0) * 1.2 ? 'x' : 'y';
        if (held.axis === 'x') Object.assign(held, { kind: 'laptop', ry0: desk.ry, lx: e.clientX, lt: performance.now(), v: 0 });
      }
      if (plugState === 'rest') plugState = 'free';           // anything that nudges the cable lets it go back home later
      if (held.kind === 'tip' || held.kind === 'cable') holdCable(e);
      else if (held.kind === 'laptop') {
        // a drag across about the width of the screen is one full turn
        const now = performance.now(), dtm = Math.max(1, now - held.lt), turn = Math.PI * 2 / Math.max(320, innerWidth * 0.85);
        held.v = held.v * 0.6 + (e.clientX - held.lx) / dtm * turn * 1000 * 0.4; held.lx = e.clientX; held.lt = now;
        desk.ry = desk.tRy = held.ry0 + (e.clientX - held.x0) * turn;
        applyDesk(); cable.wake(); desk.moved = true;
      } else {
        desk.lid = desk.tlid = clamp(held.lid0 - (e.clientY - held.y0) * 0.55, 0, 118);
        applyDesk(); cable.wake(); desk.moved = true;
      }
      requestFrame();
    }
    function release() {
      if (!held) return;
      const h = held; held = null;
      cable.grab = null; if (h.kind === 'tip') cable.drag = null;
      if (h.kind === 'laptop' && h.moved && performance.now() - h.lt < 120) desk.spin = clamp(h.v, -14, 14);
      if (h.kind === 'lid' || (h.kind === 'laptop' && h.finger && !h.moved)) { desk.tlid = !h.moved ? (desk.lid > 50 ? 0 : OPEN) : desk.lid < 14 ? 0 : desk.lid; sound(desk.tlid === 0 ? 'close' : 'open'); }
      canvas.style.cursor = '';
      cable.wake(); requestFrame();
    }
    // On a phone a finger on the laptop or the cable takes it at once, and that touch stops scrolling the page;
    // a swipe that starts anywhere else still scrolls. A tap on the laptop opens or closes the lid.
    canvas.addEventListener('touchstart', e => { const t = e.touches[0]; if (e.touches.length === 1 && t && heroPlay() && pickDesk(t, true)) e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', e => { if (held) e.preventDefault(); }, { passive: false });
    let drag = null;
    const onMove = e => {
      if (held) { moveHold(e); return; }
      if (e.pointerType === 'mouse') { par.tx = e.clientX / innerWidth * 2 - 1; par.ty = e.clientY / innerHeight * 2 - 1; }
      if (heroPlay() && e.pointerType === 'mouse' && e.target === canvas) {
        const k = pickDesk(e);
        canvas.style.cursor = k ? (k.kind === 'lid' ? 'ns-resize' : 'grab') : '';
        deskHoverT = k && (k.kind === 'laptop' || k.kind === 'lid') ? 1 : 0; cableHoverT = k && (k.kind === 'tip' || k.kind === 'cable') ? 1 : 0;
      } else { deskHoverT = 0; cableHoverT = 0; }
      if (drag) { spinVel += (e.clientX - drag.x) * 0.012; drag.x = e.clientX; }
      if (game.on && e.target === canvas) {
        const i = gamePick(e);
        hover = i >= 0 && e.pointerType === 'mouse' ? { x: F.gx[i], z: F.gz[i] } : null;
        if (i >= 0) game.aim = { x: F.gx[i], z: F.gz[i] };
      } else if (fleetLive() && e.pointerType === 'mouse' && e.target === canvas) { const h = groundAt(e); hover = h ? { x: h.x, z: h.z } : null; } else hover = null;
      requestFrame();
    };
    const onDown = e => {
      if (e.target !== canvas) return;
      if (game.on) { gameClick(e); requestFrame(); return; }
      if (heroPlay()) {
        const finger = e.pointerType === 'touch', k = pickDesk(e, finger);
        if (k) { startHold(e, k, finger); return; }
      }
      if (p > 0.66 && p < 0.86) { drag = { x: e.clientX }; return; }
      if (!fleetLive()) return;
      const h = groundAt(e);
      if (h && pulses.length < 8) { pulses.push({ x: h.x, z: h.z, t0: clock }); opts.onPulse && opts.onPulse(); requestFrame(); }
    };
    const onUp = () => { drag = null; release(); };
    addEventListener('pointercancel', release);
    const onLeave = () => { hover = null; par.tx = 0; par.ty = 0; requestFrame(); };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown);
    addEventListener('pointerup', onUp);
    document.addEventListener('pointerleave', onLeave);

    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); visible = false; cancelAnimationFrame(raf); raf = 0; if (opts.onLost) opts.onLost(); });
    const onVis = () => { if (!document.hidden) requestFrame(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    if (document.fonts) document.fonts.ready.then(() => { screenKey = ''; requestFrame(); });

    applyTheme();
    resize();
    bakeCableShadow(false);
    renderer.shadowMap.needsUpdate = true;
    // Shaders compile a few at a time between frames before the first one is drawn. On a first visit that
    // takes seconds on integrated graphics (a repeat visit is near-instant, from the browser's cache), so it
    // is spread out rather than done in one block: the page and the intro keep moving meanwhile.
    const gl = renderer.getContext(), warm = [];
    { const seenMat = new Set(); scene.traverse(o => [].concat(o.material || []).forEach(m => { if (!seenMat.has(m)) { seenMat.add(m); warm.push([o, m]); } })); }
    function warmStep() {
      const t0 = performance.now();
      while (warm.length && performance.now() - t0 < 12) {
        const [own, m] = warm.shift(), hold = [];
        scene.traverse(o => { if (o !== own && o.material) { hold.push([o, o.material]); o.material = null; } });
        const keep = own.material; own.material = m;
        try { renderer.compile(scene, camera); } finally { own.material = keep; hold.forEach(([o, mat]) => { o.material = mat; }); }
      }
    }

    const api = {
      setProgress(v, instant) { target = clamp(v); if (instant) { p = target; lastFleetKey = ''; } requestFrame(); },
      setVisible(v) { visible = v; if (v) requestFrame(); },
      gpu() { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL) || '') : ''; },
      refit() { buildTrack(); GSHOT = gameShot(); requestFrame(); },
      theme: applyTheme,
      refreshScreen() { screenKey = ''; requestFrame(); },
      game: {
        start() { pickArena(); resetGame(); game.on = true; lastFleetKey = ''; requestFrame(); },
        stop() { game.on = false; resetGame(); game.t = 0; hover = null; lastFleetKey = ''; requestFrame(); },
        policy: gamePolicy,
        pause(v) { game.paused = !!v; requestFrame(); },
        get on() { return game.on; }
      },
      push() { if (!fleetLive()) return false; pulses.push({ x: (Math.random() - 0.5) * 40, z: -20 - Math.random() * 30, t0: clock }); opts.onPulse && opts.onPulse(); requestFrame(); return true; },
      get progress() { return p; },
      total: N,
      destroy() {
        cancelAnimationFrame(raf); ro.disconnect();
        removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp);
        document.removeEventListener('pointerleave', onLeave); document.removeEventListener('visibilitychange', onVis);
        cable.dispose(); contactShadow.dispose(); cableShadow.dispose(); if (post) post.dispose();
        tails.forEach(t => ['map', 'normalMap', 'roughnessMap'].forEach(k => t.material[k].dispose()));
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
        atmo.geometry.dispose(); atmoMat.dispose();
        [braid.map, braid.normalMap, braid.roughnessMap, grain.bumpMap, grain.roughnessMap, softbox, env, lapEnv, uiTex, radialTex, dotTex, matcap].concat(mb.textures).forEach(t => t.dispose());
        renderer.dispose();
      }
    };
    if (/film-debug/.test(location.search)) window.__film = {
      THREE, scene, camera, renderer, api, cable, mb, F, T, KEYS, fleet, ring, arcs, packets, stats, game, desk, get held() { return held; },
      jump(v) { target = p = clamp(v); lastFleetKey = ''; requestFrame(); },
      frame(v, t) { target = p = clamp(v); if (t !== undefined) clock = t; lastFleetKey = ''; for (let i = 0; i < 3; i++) loop(performance.now()); },
      settle(v, secs) { target = clamp(v); const step = 1000 / 60; let now = performance.now(); for (let i = 0; i < secs * 60; i++) { now += step; last = now - step; loop(now); } last = performance.now(); }
    };
    return api;
  };
})();
