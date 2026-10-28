/* Connect experience · a 13.6-inch MacBook Air-class laptop built from published dimensions.
   Units: 1 = 10 cm. Footprint 30.4 × 21.5 cm, uniform 7.5 mm base, 4.2 mm lid, 13.6" display. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});

  const D = NS.MACBOOK = {
    W: 3.04, DEPTH: 2.15, H: 0.075, FEET: 0.008, R: 0.11, BEVEL: 0.016,
    LID_T: 0.042, LID_D: 2.12, HINGE_Z: -1.075 + 0.04, OPEN_DEG: 106,
    PORT: { w: 0.089, h: 0.032 }                         // USB-C receptacle, 8.9 × 3.2 mm
  };

  NS.buildMacBook = function (THREE, opts) {
    const { grain, env, legendRes = 2048 } = opts;
    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const group = new THREE.Group();
    const top = D.FEET + D.H;

    // Space Grey anodised aluminium: reflective metal, fine bead-blast grain, no visible brushing
    const alu = new THREE.MeshStandardMaterial({
      color: lin(0xb7b9bd), metalness: 1, roughness: 0.3, roughnessMap: grain.roughnessMap,
      bumpMap: grain.bumpMap, bumpScale: 0.00008, envMap: env, envMapIntensity: 1
    });
    [grain.roughnessMap, grain.bumpMap].forEach(t => t.repeat.set(6, 6));
    const aluPad = alu.clone(); aluPad.roughness = 0.36; aluPad.bumpMap = null; aluPad.color = lin(0xadb0b4);
    const well = new THREE.MeshStandardMaterial({ color: lin(0x0c0d0e), roughness: 0.92, metalness: 0, envMap: env, envMapIntensity: 0.5 });
    const keyMat = new THREE.MeshStandardMaterial({ color: lin(0x17181a), roughness: 0.66, metalness: 0, envMap: env, envMapIntensity: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: lin(0x2a2c30), roughness: 0.55, metalness: 0.5, envMap: env });
    const feetMat = new THREE.MeshStandardMaterial({ color: lin(0x1a1a1b), roughness: 0.9, metalness: 0 });

    // ---- base ----
    const base = new THREE.Mesh(NS.slab(THREE, D.W, D.DEPTH, D.H, D.R, D.BEVEL, 6), alu);
    base.position.y = D.FEET; base.castShadow = base.receiveShadow = true;
    group.add(base);

    const footGeo = new THREE.CylinderGeometry(0.06, 0.065, D.FEET, 28);
    [[-1.25, -0.82], [1.25, -0.82], [-1.25, 0.86], [1.25, 0.86]].forEach(([x, z]) => {
      const f = new THREE.Mesh(footGeo, feetMat); f.position.set(x, D.FEET / 2, z); group.add(f);
    });

    // ---- keyboard: six full-height rows in a dark well ----
    const KB_W = 2.66, P = KB_W / 14.5, GAP = 0.026, KZ0 = -0.975, KH = P - GAP;
    const rows = [
      { keys: [['esc', 1.5]].concat(Array.from({ length: 12 }, (_, i) => ['F' + (i + 1), 1]), [['', 1]]) },
      { keys: [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['delete', 1.5]] },
      { keys: [['tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1]] },
      { keys: [['caps lock', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['return', 1.75]] },
      { keys: [['shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['shift', 2.25]] },
      { keys: [['fn', 1], ['control', 1], ['option', 1], ['command', 1.25], ['', 5], ['command', 1.25], ['option', 1], ['◀', 1, 'half'], ['▲▼', 1, 'stack'], ['▶', 1, 'half']] }
    ];
    const kbDepth = rows.length * P - GAP;
    const wellGeo = new THREE.ShapeGeometry(NS.roundedRect(THREE, KB_W + 0.05, kbDepth + 0.05, 0.03), 8);
    wellGeo.rotateX(-Math.PI / 2);
    const wellMesh = new THREE.Mesh(wellGeo, well);
    wellMesh.position.set(0, top + 0.0004, KZ0 + kbDepth / 2);
    wellMesh.receiveShadow = true;
    group.add(wellMesh);

    const placements = new Map(), legends = [];
    const place = (w, d, x, zc, label) => {
      const k = w.toFixed(3) + 'x' + d.toFixed(3);
      if (!placements.has(k)) placements.set(k, { w, d, list: [] });
      placements.get(k).list.push([x, zc]);
      legends.push({ x, z: zc, w, d, label });
    };
    rows.forEach((r, ri) => {
      let x = -KB_W / 2;
      const zc = KZ0 + ri * P + KH / 2;
      r.keys.forEach(([label, u, kind]) => {
        const w = u * P - GAP, cx = x + w / 2;
        if (kind === 'half') place(w, KH / 2 - 0.004, cx, zc + KH / 4, label);
        else if (kind === 'stack') { place(w, KH / 2 - 0.004, cx, zc - KH / 4, '▲'); place(w, KH / 2 - 0.004, cx, zc + KH / 4, '▼'); }
        else place(w, KH, cx, zc, label);
        x += u * P;
      });
    });
    const keyGeos = new Map(), m4 = new THREE.Matrix4(), keyY = top - 0.003;
    placements.forEach(({ w, d, list }) => {
      const k = w.toFixed(3) + 'x' + d.toFixed(3);
      if (!keyGeos.has(k)) keyGeos.set(k, NS.slab(THREE, w, d, 0.011, 0.02, 0.003, 3));
      const im = new THREE.InstancedMesh(keyGeos.get(k), keyMat, list.length);
      list.forEach(([x, zc], i) => { m4.makeTranslation(x, keyY, zc); im.setMatrixAt(i, m4); });
      im.castShadow = true; im.receiveShadow = true;
      group.add(im);
    });

    // printed legends: one transparent decal resting on the key tops
    const lc = document.createElement('canvas');
    lc.width = legendRes; lc.height = Math.round(legendRes * kbDepth / KB_W);
    const lx = lc.getContext('2d'), sx = lc.width / KB_W;
    lx.fillStyle = 'rgba(214,218,222,0.9)';
    legends.forEach(({ x, z: zc, w, d, label }) => {
      if (!label) return;
      const cx = (x + KB_W / 2) * sx, cy = (zc - KZ0) * sx, kw = w * sx, kd = d * sx, big = label.length <= 2;
      lx.font = `${big ? 500 : 400} ${Math.round((big ? 0.034 : 0.017) * sx)}px "Hanken Grotesk", "Helvetica Neue", Arial, sans-serif`;
      if (big) { lx.textAlign = 'center'; lx.textBaseline = 'middle'; lx.fillText(label, cx, cy); }
      else { lx.textAlign = 'left'; lx.textBaseline = 'alphabetic'; lx.fillText(label, cx - kw / 2 + kd * 0.12, cy + kd / 2 - kd * 0.14); }
    });
    const tid = legends.find(l => l.label === '' && Math.abs(l.z - (KZ0 + KH / 2)) < 0.001);
    if (tid) { lx.strokeStyle = 'rgba(150,156,162,0.45)'; lx.lineWidth = sx * 0.003; lx.beginPath(); lx.arc((tid.x + KB_W / 2) * sx, (tid.z - KZ0) * sx, tid.d * sx * 0.32, 0, Math.PI * 2); lx.stroke(); }
    const legendTex = new THREE.CanvasTexture(lc); legendTex.encoding = THREE.sRGBEncoding; legendTex.anisotropy = opts.aniso || 4;
    const legendGeo = new THREE.PlaneGeometry(KB_W, kbDepth); legendGeo.rotateX(-Math.PI / 2);
    const legendMesh = new THREE.Mesh(legendGeo, new THREE.MeshStandardMaterial({ map: legendTex, transparent: true, roughness: 0.7, metalness: 0, depthWrite: false, envMap: env, envMapIntensity: 0.5 }));
    legendMesh.position.set(0, keyY + 0.0112, KZ0 + kbDepth / 2);
    legendMesh.renderOrder = 2;
    group.add(legendMesh);

    // ---- trackpad, inset with a hairline gap, 1.5 cm clear of the keyboard and the front edge ----
    const tpW = 1.22, tpD = 0.74, tpZ = 0.955 - tpD / 2;
    const gapGeo = new THREE.ShapeGeometry(NS.roundedRect(THREE, tpW + 0.01, tpD + 0.01, 0.065), 10); gapGeo.rotateX(-Math.PI / 2);
    const gap = new THREE.Mesh(gapGeo, new THREE.MeshStandardMaterial({ color: lin(0x3a3d41), roughness: 0.7, metalness: 0.4, envMap: env }));
    gap.position.set(0, top + 0.0002, tpZ); group.add(gap);
    const pad = new THREE.Mesh(NS.slab(THREE, tpW, tpD, 0.004, 0.06, 0.0012, 2), aluPad);
    pad.position.set(0, top - 0.0035, tpZ); pad.receiveShadow = true; group.add(pad);

    // ---- hinge band ----
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, D.W - 0.64, 32), dark);
    hinge.rotation.z = Math.PI / 2; hinge.position.set(0, top - 0.006, D.HINGE_Z); hinge.castShadow = true;
    group.add(hinge);

    // ---- lid on the hinge axis ----
    const lid = new THREE.Group();
    lid.position.set(0, top, D.HINGE_Z);
    group.add(lid);
    const lidMesh = new THREE.Mesh(NS.slab(THREE, D.W, D.LID_D, D.LID_T, D.R, 0.012, 4), alu);
    lidMesh.position.z = D.LID_D / 2 - 0.005; lidMesh.castShadow = lidMesh.receiveShadow = true;
    lid.add(lidMesh);

    const glassMat = new THREE.MeshPhysicalMaterial({ color: lin(0x080b0f), roughness: 0.19, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.055, envMap: env, envMapIntensity: 0.85 });
    const glassGeo = new THREE.PlaneGeometry(D.W - 0.04, D.LID_D - 0.04); glassGeo.rotateX(Math.PI / 2);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, -0.0007, D.LID_D / 2 - 0.005); lid.add(glass);

    const sr = opts.screenRes || 2048, sc = document.createElement('canvas'); sc.width = sr; sc.height = Math.round(sr * 1.88 / 2.89);
    const screenTex = new THREE.CanvasTexture(sc); screenTex.encoding = THREE.sRGBEncoding; screenTex.anisotropy = opts.aniso || 4;
    const screenMat = new THREE.MeshPhysicalMaterial({ color: lin(0x05070a), roughness: 0.19, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.055, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0, envMap: env, envMapIntensity: 0.85 });
    const screenGeo = new THREE.PlaneGeometry(2.89, 1.88); screenGeo.rotateX(Math.PI / 2);
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, -0.0011, D.LID_D / 2 + 0.035); lid.add(screen);

    // A real display has a camera assembly, not an uninterrupted black rectangle.
    const notchMat = new THREE.MeshStandardMaterial({ color: lin(0x08090a), roughness: 0.5 });
    const notchGeo = new THREE.ShapeGeometry(NS.roundedRect(THREE, 0.23, 0.065, 0.013), 12);
    notchGeo.rotateX(Math.PI / 2);
    const notch = new THREE.Mesh(notchGeo, notchMat);
    notch.position.set(0, -0.0015, 2.015); lid.add(notch);
    const lensMat = new THREE.MeshPhysicalMaterial({ color: lin(0x102333), roughness: 0.08, metalness: 0.2, clearcoat: 1, envMap: env });
    const lensGeo = new THREE.CircleGeometry(0.006, 24); lensGeo.rotateX(Math.PI / 2);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, -0.0017, 2.018); lid.add(lens);

    // The case seam follows the front and side walls just above the bottom bevel.
    const seamMat = new THREE.MeshStandardMaterial({ color: lin(0x65676b), roughness: 0.5, metalness: 0.7, envMap: env });
    const seam = new THREE.Mesh(NS.slab(THREE, D.W + 0.0006, D.DEPTH + 0.0006, 0.0012, D.R, 0.0003, 2), seamMat);
    seam.position.y = D.FEET + 0.018; group.add(seam);

    lid.rotation.x = -D.OPEN_DEG * Math.PI / 180;

    // ---- left-side ports: MagSafe, then two USB-C; recessed decals with a lit rim ----
    const sideX = -D.W / 2 - 0.0005, portY = D.FEET + D.H / 2;
    const portTextures = [];
    const portAt = (zc, w, h, kind) => {
      const t = NS.portTexture(THREE, w, h, kind); portTextures.push(t);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(t.userData.width, t.userData.height),
        new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, metalness: 0, envMap: env, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.y = -Math.PI / 2; m.position.set(sideX, portY, zc); group.add(m);
    };
    portAt(-0.80, 0.14, 0.036, 'magsafe');
    portAt(-0.58, D.PORT.w, D.PORT.h, 'usbc');
    portAt(-0.40, D.PORT.w, D.PORT.h, 'usbc');

    const baseBox = new THREE.Box3(new THREE.Vector3(-D.W / 2, 0, -D.DEPTH / 2), new THREE.Vector3(D.W / 2, top, D.DEPTH / 2));
    const lidBox = new THREE.Box3(new THREE.Vector3(-D.W / 2, -0.004, -0.02), new THREE.Vector3(D.W / 2, D.LID_T, D.LID_D));

    return {
      group, lid, screen, screenMat, screenCanvas: sc, screenTex, baseBox, lidBox,
      port: { center: new THREE.Vector3(-D.W / 2, portY, -0.40), out: new THREE.Vector3(-1, 0, 0) },
      materials: [alu, aluPad, well, keyMat, dark, feetMat, legendMesh.material, glassMat, screenMat, gap.material, notchMat, lensMat, seamMat],
      textures: [legendTex, screenTex].concat(portTextures)
    };
  };
})();
