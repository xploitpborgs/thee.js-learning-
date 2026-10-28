/* Connect experience · scene, lighting, interaction state and the connected sequence.
   Mounted by the page with NS.mount({...}); returns null if WebGL is unavailable.
   opts.still (default true) renders one composed product shot with every interaction,
   simulation and animation switched off. Set still: false to restore the interactive version. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  /* One studio, used for both the lights and the reflections: a large softbox above and to the left,
     a gradient card front-right that the display glass reflects, a faint rim strip behind, and a
     desk that bounces light back up into the aluminium. Rebuilt when the page theme changes. */
  function buildEnv(THREE, renderer, softbox, dark, deep) {
    const s = new THREE.Scene(), trash = [];
    const add = (geo, mat, pos, look) => { const m = new THREE.Mesh(geo, mat); m.position.copy(pos); if (look) m.lookAt(look); s.add(m); trash.push(geo, mat); return m; };
    const lit = (hex, k, map) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), map: map || null, side: THREE.DoubleSide });
    const O = new THREE.Vector3(0, 0, 0);
    add(new THREE.BoxGeometry(34, 18, 34), new THREE.MeshBasicMaterial({ color: new THREE.Color(dark ? 0x060708 : 0x111213), side: THREE.BackSide }), new THREE.Vector3(0, 7, 0));
    add(new THREE.PlaneGeometry(14, 10), lit(0xfff7ee, 2.5, softbox), new THREE.Vector3(-7, 12, 4), O);     // key softbox
    add(new THREE.PlaneGeometry(1.8, 9), lit(0xf2f4f5, 1.5, softbox), new THREE.Vector3(5.6, 2.2, 10.6), O); // strip softbox: one soft band in the glass
    add(new THREE.PlaneGeometry(10, 1.3), lit(0xffffff, 1.6), new THREE.Vector3(6, 5, -10), O);            // rim strip
    add(new THREE.PlaneGeometry(9, 6), lit(0xfbfaf8, 0.48, softbox), new THREE.Vector3(11, 8, -5), O);       // overhead-rear panel: the deck's highlight falls off right to left
    add(new THREE.PlaneGeometry(22, 9), lit(0xf6f6f4, 0.85, softbox), new THREE.Vector3(0, 4, -15), O);     // rear panel: unseen from the front; a laptop spun round catches it on its lid
    // desk bounce. `deep` drops it below the capture's near plane (0.1) so steep downward reflections, such as
    // the back of a lid spun round, find the desk instead of the dark box; the laptop uses that version
    const fy = deep ? -0.5 : -0.05;
    add(new THREE.PlaneGeometry(deep ? 160 : 60, deep ? 160 : 60), lit(dark ? 0x1a1d1f : 0xece8e1, dark ? 0.35 : 0.9), new THREE.Vector3(0, fy, 0), new THREE.Vector3(0, 10, fy)); // desk bounce
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(s, 0.02).texture;
    pm.dispose(); trash.forEach(d => d.dispose());
    return tex;
  }

  /* Contact shadow rendered from underneath: every surface within `height` of the desk darkens it,
     more strongly the closer it is, then two blur passes soften it. Matches the objects' real shape. */
  function bakeContactShadow(THREE, renderer, scene, { cx, cz, w, d, res, height, darkness, blur, opacity }) {
    const rt = new THREE.WebGLRenderTarget(res, res), rtB = new THREE.WebGLRenderTarget(res, res);
    rt.texture.generateMipmaps = rtB.texture.generateMipmaps = false;
    const group = new THREE.Group(); group.position.set(cx, 0.0006, cz);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity, depthWrite: false }));
    plane.scale.y = -1; plane.renderOrder = 1;
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0, height);
    cam.rotation.x = Math.PI / 2;
    group.add(plane, cam);
    const depthMat = new THREE.MeshDepthMaterial();
    depthMat.userData.darkness = { value: darkness };
    depthMat.onBeforeCompile = sh => {
      sh.uniforms.darkness = depthMat.userData.darkness;
      sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
    };
    const blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;\nvoid main(){\n vec4 s = texture2D(tDiffuse, vUv) * 0.1633;\n s += (texture2D(tDiffuse, vUv - dir) + texture2D(tDiffuse, vUv + dir)) * 0.1531;\n s += (texture2D(tDiffuse, vUv - 2.0 * dir) + texture2D(tDiffuse, vUv + 2.0 * dir)) * 0.12245;\n s += (texture2D(tDiffuse, vUv - 3.0 * dir) + texture2D(tDiffuse, vUv + 3.0 * dir)) * 0.0918;\n s += (texture2D(tDiffuse, vUv - 4.0 * dir) + texture2D(tDiffuse, vUv + 4.0 * dir)) * 0.051;\n gl_FragColor = s;\n}',
      depthTest: false, depthWrite: false
    });
    const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat); quadScene.add(quad);
    const pass = (src, dst, dx, dy) => { blurMat.uniforms.tDiffuse.value = src.texture; blurMat.uniforms.dir.value.set(dx, dy); renderer.setRenderTarget(dst); renderer.render(quadScene, quadCam); };

    function bake(only, passes) {
      const hide = scene.children.filter(o => !o.isLight && only.indexOf(o) < 0);
      hide.forEach(o => { o.userData._v = o.visible; o.visible = false; });
      scene.add(group); group.updateMatrixWorld(true);
      plane.visible = false;
      const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha(), bg = scene.background;
      scene.background = null; scene.overrideMaterial = depthMat;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
      scene.overrideMaterial = null; scene.background = bg;
      for (const k of passes || [blur, blur * 0.4]) { pass(rt, rtB, k / res, 0); pass(rtB, rt, 0, k / res); }
      renderer.setRenderTarget(null); renderer.setClearColor(clearColor, clearAlpha);
      plane.visible = true;
      hide.forEach(o => { o.visible = o.userData._v; });
    }
    return {
      group, plane, bake,
      dispose() { rt.dispose(); rtB.dispose(); depthMat.dispose(); blurMat.dispose(); quad.geometry.dispose(); plane.geometry.dispose(); plane.material.dispose(); }
    };
  }

  NS.mount = function (opts) {
    const THREE = window.THREE;
    const { wrap, canvas, handle, reduced } = opts;
    const STILL = opts.still !== false;
    const D = NS.MACBOOK, PLUG = NS.PLUG;
    let renderer;
    try {
      if (!THREE || !NS.Cable || !NS.buildMacBook) throw new Error('scene modules missing');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    } catch (err) { return null; }

    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const small = Math.min(innerWidth, screen.width || innerWidth) < 760;
    const lowPower = small || (navigator.hardwareConcurrency || 8) <= 4;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.5 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    const softbox = NS.softboxTexture(THREE);
    let env = buildEnv(THREE, renderer, softbox, opts.isDark());
    scene.environment = env;
    const grain = NS.grainTextures(THREE, lowPower ? 256 : 512, aniso);
    const braid = NS.braidTextures(THREE, lowPower ? 256 : 512, aniso);

    // ---- lights match the studio: key from the softbox above-left, warm desk bounce, faint rim ----
    const key = new THREE.DirectionalLight(lin(0xfff6ec), 1.2);
    key.position.set(-7, 12, 4); key.target.position.set(-0.5, 0, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.006;
    Object.assign(key.shadow.camera, { left: -4.8, right: 4.8, top: 4.8, bottom: -4.8, near: 3, far: 20 });
    scene.add(key, key.target);
    const fill = new THREE.HemisphereLight(lin(0xf4f2ee), lin(0xc9c2b6), 0.3);
    const rim = new THREE.DirectionalLight(lin(0xeef2ff), 0.55); rim.position.set(4.5, 3.6, -5);
    scene.add(fill, rim);

    // ---- desk: shadows land on the page itself, so the surface is continuous with the portfolio ----
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.16, depthWrite: false });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), shadowMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.renderOrder = 3;
    scene.add(ground);

    // ---- the MacBook ----
    const mb = NS.buildMacBook(THREE, { grain, env, legendRes: lowPower ? 1024 : 2048, aniso });
    scene.add(mb.group);
    mb.group.updateMatrixWorld(true);
    const lidInv = new THREE.Matrix4().copy(mb.lid.matrixWorld).invert();
    const lidMat = mb.lid.matrixWorld.clone();

    const PORT = mb.port.center.clone(), OUT = mb.port.out.clone();
    const PRE = PORT.clone().addScaledVector(OUT, 0.05);
    const IN = PORT.clone().addScaledVector(OUT, -PLUG.SHELL);
    const IN_BACK = IN.clone().addScaledVector(OUT, PLUG.LEN);

    // When the display wakes it lights the keys and deck in front of it. A rectangular area light the
    // size of the panel, lying on the glass, gives that soft spill without a point reflection in the glass.
    const screenNormal = new THREE.Vector3(0, -1, 0).applyQuaternion(mb.lid.getWorldQuaternion(new THREE.Quaternion()));
    let screenGlow = null;
    if (THREE.RectAreaLight && THREE.RectAreaLightUniformsLib) {
      THREE.RectAreaLightUniformsLib.init();
      screenGlow = new THREE.RectAreaLight(lin(0xcdeeed), 0, 2.89, 1.88);
      mb.screen.getWorldPosition(screenGlow.position).addScaledVector(screenNormal, 0.012);
      screenGlow.lookAt(screenGlow.position.clone().add(screenNormal));
      scene.add(screenGlow);
    }
    const setGlow = k => { if (screenGlow) screenGlow.intensity = k * 1.3; };

    // ---- collisions (interactive mode) ----
    let state = 'free';
    const tmp = new THREE.Vector3();
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
    function collide(x, y, z, r, isTip) {
      if (isTip && (state === 'snapping' || state === 'connected' || state === 'unplugging')) return null;
      let res = pushBox(x, y, z, r, mb.baseBox, false);
      if (res) { x = res[0]; y = res[1]; z = res[2]; }
      tmp.set(x, y, z).applyMatrix4(lidInv);
      const l = pushBox(tmp.x, tmp.y, tmp.z, r, mb.lidBox, true);
      if (l) { tmp.set(l[0], l[1], l[2]).applyMatrix4(lidMat); return [tmp.x, tmp.y, tmp.z]; }
      return res;
    }

    // ---- the cable ----
    const R = 0.026, HOUSING_Y = PLUG.HH / 2 + 0.0005;
    // Composed rest pose, set down by hand. The connector lies flat on the desk, aimed at the front
    // USB-C port with a 1.4 cm gap; the cable leaves it straight, lifts off the housing height, then
    // makes one broad, uneven sweep forward across the foreground to its anchor beyond the frame.
    // The physics only runs once someone picks the cable up, so the first frame is exactly this pose.
    const GAP = 0.14, tipX = -D.W / 2 - GAP, backX = tipX - PLUG.LEN;
    const route = new THREE.CatmullRomCurve3([
      [2.1, R, 4.05], [0.75, R, 3.2], [-0.7, R, 2.84], [-1.95, R, 2.32], [-2.62, R, 1.5], [-2.78, R, 0.62],
      [-2.62, R + 0.001, -0.12], [backX - 0.36, R + 0.003, -0.4], [backX - 0.16, HOUSING_Y - 0.002, -0.4], [backX, HOUSING_Y, -0.4]
    ].map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal', 0.5);
    const routeLen = route.getLength();
    const cableMat = new THREE.MeshStandardMaterial({ map: braid.map, normalMap: braid.normalMap, normalScale: new THREE.Vector2(0.34, 0.34), roughnessMap: braid.roughnessMap, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    const tile = (2 * Math.PI * R) / 4;
    [braid.map, braid.normalMap, braid.roughnessMap].forEach(t => t.repeat.set(routeLen / tile, 4));
    const cable = new NS.Cable(THREE, {
      segments: lowPower ? 64 : 96, length: routeLen, radius: R, gravity: -80, collide,
      radial: lowPower ? 14 : 20, perSeg: 3, material: cableMat, plugOpts: { env, grain }
    });
    cable.layout(t => route.getPoint(t));
    cable.asleep = true;
    cable.updateMesh();
    scene.add(cable.mesh, cable.plug);

    // Contact shadows rendered from beneath the real objects.
    // The laptop never moves, so its broad, soft shadow is baked once; the cable's tight shadow is
    // re-rendered whenever the cable moves, at a resolution sized for that.
    const shadowRes = lowPower ? 512 : 1024;
    const contactShadow = bakeContactShadow(THREE, renderer, scene, { cx: 0, cz: -0.1, w: 4.6, d: 3.8, res: shadowRes, height: 0.45, darkness: 1.25, opacity: 0.5 });
    contactShadow.bake([mb.group], shadowRes === 1024 ? [9, 5, 2.5, 1.2] : [4.5, 2.5, 1.2]);
    const cableShadow = bakeContactShadow(THREE, renderer, scene, { cx: -0.6, cz: 1.0, w: 8.4, d: 7.6, res: STILL ? (lowPower ? 1024 : 2048) : shadowRes, height: 0.14, darkness: 2.2, opacity: 0.55 });
    const CABLE_SHADOW_PASSES = STILL ? (lowPower ? [2.2, 1] : [4.4, 2, 0.8]) : (lowPower ? [1.1, 0.5] : [2.2, 1, 0.4]);
    const bakeCableShadow = () => cableShadow.bake([cable.mesh, cable.plug], CABLE_SHADOW_PASSES);
    bakeCableShadow();

    const rest = cable.snapshot();
    const anchor = cable.get(0);
    const reach = (cable.length + PLUG.LEN) * 0.92;

    // ---- camera: three-quarter view from the front left, fitted to the subject in either direction ----
    const FRAME = { center: [-0.5, 0.73, 0.25], dir: [-0.68, 0.54, 0.72], fov: 30 };
    const lookAt = new THREE.Vector3(), camDir = new THREE.Vector3();
    // Fit projected bounds, rather than a sphere that wastes space in a wide hero.
    // The far end of the cable deliberately exits the photograph at the foreground edge.
    const framePoints = [];
    // Fit each part in world space. A single bounding box adds imaginary corners
    // above the foreground cable and makes the laptop unnecessarily small.
    for (const object of [mb.group, cable.plug]) {
      object.updateMatrixWorld(true);
      object.traverse(part => {
        if (!part.geometry || part.isInstancedMesh) return;
        part.geometry.computeBoundingBox();
        const bounds = part.geometry.boundingBox;
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
              framePoints.push(new THREE.Vector3(x, y, z).applyMatrix4(part.matrixWorld));
      });
    }
    framePoints.push(new THREE.Vector3(-2.85, 0, 1.5));
    function frameCamera(aspect) {
      camera.aspect = aspect; camera.fov = FRAME.fov;
      const tanV = Math.tan(THREE.MathUtils.degToRad(FRAME.fov) / 2), tanH = tanV * aspect;
      lookAt.fromArray(FRAME.center); camDir.fromArray(FRAME.dir).normalize();
      const right = new THREE.Vector3().crossVectors(camera.up, camDir).normalize();
      const up = new THREE.Vector3().crossVectors(camDir, right).normalize();
      let distance = 0;
      for (const point of framePoints) {
        const offset = point.clone().sub(lookAt), depth = offset.dot(camDir);
        distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / (tanH * 0.87), depth + Math.abs(offset.dot(up)) / (tanV * 0.86));
      }
      camera.position.copy(lookAt).addScaledVector(camDir, distance);
      camera.lookAt(lookAt);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    }
    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      frameCamera(w / h);
      requestFrame();
    }

    // ---- theme ----
    const accent = new THREE.Color();
    function applyTheme() {
      const dark = opts.isDark();
      env.dispose(); env = buildEnv(THREE, renderer, softbox, dark); scene.environment = env;
      scene.traverse(o => { if (o.material && o.material.envMap) { o.material.envMap = env; o.material.needsUpdate = true; } });
      renderer.toneMappingExposure = dark ? 0.95 : 1.0;
      fill.groundColor = lin(dark ? 0x2a2e31 : 0xc9c2b6);
      shadowMat.opacity = dark ? 0.42 : 0.26;
      if (contactShadow) contactShadow.plane.material.opacity = dark ? 0.68 : 0.5;
      if (cableShadow) cableShadow.plane.material.opacity = dark ? 0.72 : 0.55;
      if (cable.contactMat) cable.contactMat.uniforms.uOpacity.value = dark ? 0.75 : 0.5;
      accent.set(opts.accent());
      requestFrame();
    }

    // ---- display (asleep in the still shot) ----
    const sctx = mb.screenCanvas.getContext('2d'), SW = mb.screenCanvas.width, SH = mb.screenCanvas.height;
    const ROWS = [
      ['Jamf', 'Apple device management', 'Rebuilt a bank’s Mac fleet on Jamf Pro · 159 apps'],
      ['Microsoft 365', 'Workplace services', 'Intune, Entra ID, Exchange · 650+ users migrated'],
      ['Azure', 'Cloud infrastructure', 'Azure Monitor fleet telemetry · AZ-900']
    ];
    const ROW_AT = reduced ? [0.15, 0.15, 0.15] : [0.7, 1.15, 1.6], WAKE = reduced ? 0.25 : 0.6, SEQ_END = reduced ? 0.6 : 2.3;
    function drawScreen(t) {
      sctx.globalAlpha = 1; sctx.fillStyle = '#000'; sctx.fillRect(0, 0, SW, SH);
      if (t >= 0) {
        const g = sctx.createLinearGradient(0, 0, SW, SH);
        g.addColorStop(0, '#103a3b'); g.addColorStop(0.55, '#0a1f21'); g.addColorStop(1, '#05090a');
        sctx.fillStyle = g; sctx.fillRect(0, 0, SW, SH);
        sctx.textBaseline = 'alphabetic';
        sctx.font = '500 19px "IBM Plex Mono", monospace';
        sctx.fillStyle = '#4CC97F'; sctx.textAlign = 'left'; sctx.fillText('● Connected', 56, 62);
        sctx.fillStyle = 'rgba(207,224,224,0.6)'; sctx.textAlign = 'right'; sctx.fillText(window.HERO_NAME || 'Oluwasola A.', SW - 56, 62);
        sctx.textAlign = 'left'; sctx.fillStyle = '#EAF2F2';
        sctx.font = '300 50px "Hanken Grotesk", sans-serif'; sctx.fillText('Connecting people,', 56, 150);
        sctx.font = '700 50px "Hanken Grotesk", sans-serif'; sctx.fillText('devices and cloud.', 56, 206);
        ROWS.forEach(([name, sub, proof], i) => {
          const a = clamp((t - ROW_AT[i]) / 0.4), y = 300 + i * 112 + (1 - easeOut(a)) * 14;
          if (a <= 0) return;
          sctx.globalAlpha = a;
          sctx.fillStyle = 'rgba(207,224,224,0.16)'; sctx.fillRect(56, y - 46, SW - 112, 1.5);
          sctx.fillStyle = '#EAF2F2'; sctx.font = '700 32px "Hanken Grotesk", sans-serif'; sctx.fillText(name, 56, y);
          sctx.fillStyle = 'rgba(207,224,224,0.7)'; sctx.font = '400 22px "Hanken Grotesk", sans-serif'; sctx.fillText(sub, 56, y + 32);
          sctx.fillStyle = '#7fdcd8'; sctx.font = '500 18px "IBM Plex Mono", monospace'; sctx.textAlign = 'right'; sctx.fillText(proof, SW - 56, y + 2);
          sctx.textAlign = 'left';
        });
        sctx.globalAlpha = 1;
      }
      sctx.fillStyle = '#000'; NS.rrPath(sctx, SW / 2 - 78, -14, 156, 40, 12); sctx.fill();
      mb.screenTex.needsUpdate = true;
    }
    drawScreen(-1);

    // ---- interaction state (interactive mode only) ----
    let tween = null, seqT0 = -1, seqDone = true, hover = 0, hoverTarget = 0, sleepScreen = -1;
    const V = () => new THREE.Vector3();
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const planeA = new THREE.Plane(), planeB = new THREE.Plane(), hitA = V(), hitB = V(), target = V(), prePx = V(), tmpTip = V();
    const CAPTURE = 0.055;
    let dragInfo = null;

    function setStatus(text, on) { opts.onStatus(text, on); }
    function project(v, out) {
      out.copy(v).project(camera);
      const r = canvas.getBoundingClientRect();
      out.x = (out.x * 0.5 + 0.5) * r.width; out.y = (-out.y * 0.5 + 0.5) * r.height;
      return out;
    }
    function setPlanes() {
      const n = V().subVectors(camera.position, cable.tipPosition(V())); n.y = 0; n.normalize();
      planeA.setFromNormalAndCoplanarPoint(n, cable.tipPosition(V()));
      planeB.setFromNormalAndCoplanarPoint(n, PRE);
    }
    function pointer(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function updateDrag(e) {
      const px = pointer(e);
      if (!ray.ray.intersectPlane(planeA, hitA)) return;
      if (!ray.ray.intersectPlane(planeB, hitB)) hitB.copy(hitA);
      project(PRE, prePx);
      const sd = Math.hypot(px.x - prePx.x, px.y - prePx.y);
      const w = clamp(1 - (sd - 30) / 170);
      target.copy(hitA).lerp(hitB, w);
      target.y = Math.max(0.035, target.y);
      const off = V().subVectors(target, anchor);
      if (off.length() > reach) target.copy(anchor).addScaledVector(off.normalize(), reach);
      cable.drag = { x: target.x, y: target.y, z: target.z };
      cable.align = w > 0 ? { ox: OUT.x, oy: OUT.y, oz: OUT.z, k: w * w } : null;
      if (Math.hypot(e.clientX - dragInfo.x0, e.clientY - dragInfo.y0) > 6) dragInfo.moved = true;
      // The connector rests about 9 mm from the capture point, so capture only once it is
      // carried deliberately into the last few millimetres in front of the port.
      if (dragInfo.moved && cable.tipPosition(tmpTip).distanceTo(PRE) < CAPTURE) startSnap();
      requestFrame();
    }
    function release() { cable.drag = null; cable.align = null; state = 'free'; opts.onGrab(false); requestFrame(); }
    function startSnap() {
      if (state === 'snapping' || state === 'connected') return;
      state = 'snapping'; dragInfo = null; opts.onGrab(false);
      setStatus('Connecting…', false);
      const from = cable.tipPosition(V());
      tween = { t0: performance.now(), dur: reduced ? 0 : 170, path: t => from.clone().lerp(PRE, easeOut(t)), align: t => 0.6 + 0.4 * t, next: insert };
      requestFrame();
    }
    function insert() { tween = { t0: performance.now(), dur: reduced ? 0 : 140, path: t => PRE.clone().lerp(IN, easeOut(t)), align: () => 1, next: seat }; }
    function seat() {
      tween = null; cable.drag = null; cable.align = null;
      cable.lock = { tip: [IN.x, IN.y, IN.z], back: [IN_BACK.x, IN_BACK.y, IN_BACK.z] };
      state = 'connected'; seqT0 = performance.now(); seqDone = false; sleepScreen = -1;
      setStatus('Connected', true); opts.onConnected(); requestFrame();
    }
    function connect() {
      if (STILL || state === 'connected' || state === 'snapping') return;
      if (state === 'dragging') release();
      cable.wake();
      if (reduced) {
        cable.lock = { tip: [IN.x, IN.y, IN.z], back: [IN_BACK.x, IN_BACK.y, IN_BACK.z] };
        state = 'snapping';
        for (let i = 0; i < 360; i++) cable.step(1 / 120);
        seat(); return;
      }
      state = 'snapping'; setStatus('Connecting…', false);
      // lift the connector off the desk, square it up to the port and bring it in; the arc and
      // the timing scale with how far away it starts
      const from = cable.tipPosition(V()), d = clamp(from.distanceTo(PRE) / 1.5), mid = from.clone().lerp(PRE, 0.5);
      mid.y += 0.2 + 0.45 * d; mid.addScaledVector(OUT, 0.12 + 0.23 * d);
      tween = { t0: performance.now(), dur: 620 + 380 * d, path: t => { const e = easeInOut(t), a = from.clone().lerp(mid, e), b = mid.clone().lerp(PRE, e); return a.lerp(b, e); }, align: t => clamp((t - 0.35) / 0.55), next: insert };
      requestFrame();
    }
    function unplug(then) {
      if (state !== 'connected') return;
      seqDone = true; seqT0 = -1; sleepScreen = performance.now();
      setStatus('Not connected', false); opts.onDisconnected();
      cable.lock = null; cable.wake();
      if (reduced) {
        cable.restore(rest); state = 'free'; sleepScreen = -1; drawScreen(-1); mb.screenMat.emissiveIntensity = 0; setGlow(0);
        requestFrame(); if (then) then(); return;
      }
      state = 'unplugging';
      const away = PRE.clone().addScaledVector(OUT, 0.32); away.y += 0.12;
      tween = { t0: performance.now(), dur: 260, path: t => IN.clone().lerp(away, easeOut(t)), align: t => 1 - t, next: () => { tween = null; cable.drag = null; cable.align = null; state = 'free'; if (then) setTimeout(then, 900); } };
      requestFrame();
    }
    function replay() { unplug(connect); }

    if (!STILL) {
      handle.addEventListener('pointerdown', e => {
        if (state !== 'free' || reduced) return;
        e.preventDefault();
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        state = 'dragging'; dragInfo = { x0: e.clientX, y0: e.clientY, moved: false };
        cable.wake(); setPlanes(); opts.onGrab(true); updateDrag(e);
      });
      handle.addEventListener('pointermove', e => { if (state === 'dragging') updateDrag(e); });
      const end = e => {
        if (state !== 'dragging') return;
        const tap = dragInfo && !dragInfo.moved && e.type === 'pointerup';
        release();
        if (tap) connect();
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
      handle.addEventListener('click', () => { if (state === 'connected') unplug(); else if (reduced && state === 'free') connect(); });
      handle.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (state === 'connected') unplug(); else connect();
      });
      ['pointerenter', 'focus'].forEach(ev => handle.addEventListener(ev, () => { hoverTarget = 1; requestFrame(); }));
      ['pointerleave', 'blur'].forEach(ev => handle.addEventListener(ev, () => { hoverTarget = 0; requestFrame(); }));
    }

    // ---- loop: renders on demand; in still mode a single frame per resize or theme change ----
    let raf = 0, last = 0, acc = 0, visible = true;
    const STEP = 1 / 120;
    function requestFrame() {
      if (raf || !visible || document.hidden) return;
      last = performance.now(); raf = requestAnimationFrame(loop);
    }
    function loop(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let busy = false;
      if (!STILL) {
        if (tween) {
          const t = tween.dur ? clamp((now - tween.t0) / tween.dur) : 1, p = tween.path(t);
          cable.drag = { x: p.x, y: p.y, z: p.z };
          const k = tween.align(t);
          cable.align = k > 0 ? { ox: OUT.x, oy: OUT.y, oz: OUT.z, k } : null;
          if (t >= 1) { const n = tween.next; tween = null; n && n(); }
        }
        busy = !!tween || state === 'dragging';
        let moved = false;
        if (!cable.asleep || busy) {
          acc += dt; let n = 0;
          while (acc >= STEP && n < 6) { cable.step(STEP); acc -= STEP; n++; }
          if (n === 6) acc = 0;
          moved = n > 0;
        }
        cable.updateMesh();
        if (moved) bakeCableShadow();
        if (seqT0 >= 0) {
          const t = (now - seqT0) / 1000, k = easeInOut(clamp(t / WAKE));
          mb.screenMat.emissiveIntensity = k * 1.05; setGlow(k);
          drawScreen(t);
          if (!seqDone && t >= SEQ_END) { seqDone = true; opts.onSequenceDone(); }
          if (t < SEQ_END + 0.1) busy = true;
        } else if (sleepScreen >= 0) {
          const k = 1 - clamp((now - sleepScreen) / 380);
          mb.screenMat.emissiveIntensity = k * 1.05; setGlow(k);
          if (k <= 0) { sleepScreen = -1; drawScreen(-1); } else busy = true;
        }
        hover += (hoverTarget - hover) * 0.2;
        if (Math.abs(hoverTarget - hover) > 0.01) busy = true;
        cable.plug.userData.housing.emissive.copy(accent).multiplyScalar(hover * 0.16);
        positionHandle();
      }
      renderer.render(scene, camera);
      if (!opts.ready) { opts.ready = true; opts.onReady(); }
      if (!STILL && (busy || !cable.asleep)) requestFrame();
    }
    const hp = V();
    function positionHandle() {
      project(cable.plugCenter(hp), hp);
      const inside = hp.x > -20 && hp.y > -20 && hp.x < wrap.clientWidth + 20 && hp.y < wrap.clientHeight + 20;
      handle.style.transform = `translate(${hp.x.toFixed(1)}px, ${hp.y.toFixed(1)}px)`;
      handle.hidden = !inside;
    }

    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) requestFrame(); });
    io.observe(wrap);
    const onVis = () => { if (!document.hidden) requestFrame(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const onTheme = () => setTimeout(applyTheme, 30);
    addEventListener('themechange', onTheme);
    if (document.fonts) document.fonts.ready.then(() => { if (seqT0 >= 0) drawScreen((performance.now() - seqT0) / 1000); requestFrame(); });

    applyTheme();
    resize();

    const api = {
      still: STILL, connect, unplug: () => unplug(), replay,
      get state() { return state; },
      destroy() {
        cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis); removeEventListener('themechange', onTheme);
        cable.dispose(); mb.materials.forEach(m => m.dispose()); mb.textures.forEach(t => t.dispose());
        if (contactShadow) contactShadow.dispose();
        if (cableShadow) cableShadow.dispose();
        [braid.map, braid.normalMap, braid.roughnessMap, grain.bumpMap, grain.roughnessMap, softbox, env].forEach(t => t.dispose());
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        renderer.dispose();
      }
    };
    if (/connect-debug/.test(location.search)) window.__connect = {
      THREE, scene, camera, renderer, cable, mb, api, PRE, IN, FRAME, frameCamera, route, rest, key, fill, rim, contactShadow, cableShadow, ground,
      render: () => { if (!STILL) { cable.updateMesh(); bakeCableShadow(); positionHandle(); } renderer.render(scene, camera); },
      step: n => { for (let i = 0; i < n; i++) cable.step(STEP); }
    };
    return api;
  };
  NS.buildEnv = buildEnv;
  NS.bakeContactShadow = bakeContactShadow;
})();
