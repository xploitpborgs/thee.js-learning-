/* Connect experience · braided USB-C cable.
   A Verlet rope with fixed segment lengths, bending resistance, a heavier rigid connector,
   desk and laptop collisions, plus a tube mesh rebuilt in place every frame. Units: 1 = 10 cm. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});

  // Connector dimensions: rubber strain relief, aluminium housing, stainless USB-C shell (8.3 × 2.5 mm)
  const PLUG = NS.PLUG = { RELIEF: 0.10, HOUSING: 0.16, SHELL: 0.066, HW: 0.115, HH: 0.058, SW: 0.083, SH: 0.025 };
  PLUG.LEN = PLUG.RELIEF + PLUG.HOUSING + PLUG.SHELL;

  NS.buildPlug = function (THREE, { env, grain }) {
    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const g = new THREE.Group();
    const rubber = new THREE.MeshStandardMaterial({ color: lin(0x26282b), roughness: 0.8, metalness: 0, envMap: env, envMapIntensity: 0.7 });
    const housing = new THREE.MeshStandardMaterial({ color: lin(0x77797d), metalness: 1, roughness: 0.38, roughnessMap: grain.roughnessMap, envMap: env, envMapIntensity: 1, emissive: 0x000000 });
    const shell = new THREE.MeshStandardMaterial({ color: lin(0xd2d4d7), metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 1.1 });
    const mouthTex = NS.plugMouthTexture(THREE, PLUG.SW, PLUG.SH);
    const mouth = new THREE.MeshStandardMaterial({ map: mouthTex, transparent: true, roughness: 0.4, metalness: 0.6, envMap: env });

    // strain relief: lathe profile with fine ribs, revolved then turned to run along +z
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, ribs = t > 0.1 && t < 0.86 ? 0.0011 * Math.max(0, Math.sin(t * Math.PI * 11)) : 0;
      pts.push(new THREE.Vector2(0.0275 + 0.0062 * Math.pow(t, 1.7) + ribs, t * PLUG.RELIEF + 0.002));
    }
    pts.reverse();                          // outward-facing normals
    const reliefGeo = new THREE.LatheGeometry(pts, 32); reliefGeo.rotateX(Math.PI / 2);
    const relief = new THREE.Mesh(reliefGeo, rubber);

    const extrude = (shape, len, bevel, z0) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: len - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18 });
      geo.translate(0, 0, z0 + bevel);
      return NS.smoothNormals(THREE, geo);
    };
    const hb = 0.009;
    const housingMesh = new THREE.Mesh(extrude(NS.stadium(THREE, PLUG.HW - 2 * hb, PLUG.HH - 2 * hb), PLUG.HOUSING, hb, PLUG.RELIEF), housing);
    const sb = 0.0018;
    const shellMesh = new THREE.Mesh(extrude(NS.stadium(THREE, PLUG.SW - 2 * sb, PLUG.SH - 2 * sb), PLUG.SHELL + 0.01, sb, PLUG.RELIEF + PLUG.HOUSING - 0.01), shell);
    const mouthMesh = new THREE.Mesh(new THREE.PlaneGeometry(PLUG.SW - 0.002, PLUG.SH - 0.002), mouth);
    mouthMesh.position.z = PLUG.LEN + 0.0004;

    [relief, housingMesh, shellMesh].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    g.add(mouthMesh);
    g.userData = { housing, materials: [rubber, housing, shell, mouth], textures: [mouthTex] };
    return g;
  };

  class Cable {
    constructor(THREE, o) {
      this.T = THREE;
      this.N = o.segments;                 // cable particles, index 0 is the anchor
      this.M = this.N + 1;                 // + connector tip
      this.length = o.length;
      this.seg = o.length / (this.N - 1);
      this.r = o.radius;
      this.gravity = o.gravity;
      this.collide = o.collide;             // (x, y, z, radius, isTip) => [x, y, z] or null
      this.pos = new Float32Array(this.M * 3);
      this.prev = new Float32Array(this.M * 3);
      this.w = new Float32Array(this.M).fill(1);
      this.w[0] = this.w[1] = 0;            // anchored end
      this.tipW = 0.32;                     // the connector is heavier than the braid
      this.w[this.N] = this.tipW;
      this.drag = null;                     // { x, y, z } target for the tip while held
      this.align = null;                    // { x, y, z, ox, oy, oz, k } orient the connector towards a port
      this.lock = null;                     // { tip: [x,y,z], back: [x,y,z] } seated in the port
      this.still = 0;
      this.asleep = false;
      this.buildTube(o.radial, o.perSeg, o.material);
      this.plug = NS.buildPlug(THREE, o.plugOpts);
      this._x = new THREE.Vector3(1, 0, 0);
    }

    /* Lay the cable along a path p(t), t in [0,1], resampled by arc length. */
    layout(path) {
      const samples = 400, P = [], L = [0];
      for (let i = 0; i <= samples; i++) P.push(path(i / samples));
      for (let i = 1; i <= samples; i++) L.push(L[i - 1] + P[i].distanceTo(P[i - 1]));
      const total = L[samples];
      for (let i = 0; i < this.N; i++) {
        const s = Math.min(total, i * this.seg);
        let k = 1; while (k < samples && L[k] < s) k++;
        const f = (s - L[k - 1]) / ((L[k] - L[k - 1]) || 1), p = P[k - 1].clone().lerp(P[k], f);
        this.set(i, p.x, p.y, p.z);
      }
      // connector continues straight from the cable end
      const a = this.get(this.N - 2), b = this.get(this.N - 1), d = b.clone().sub(a).normalize();
      this.set(this.N, b.x + d.x * PLUG.LEN, b.y + d.y * PLUG.LEN, b.z + d.z * PLUG.LEN);
      this.prev.set(this.pos);
      this.asleep = false; this.still = 0;
      return total;
    }

    get(i, out) { const v = out || new this.T.Vector3(); return v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]); }
    set(i, x, y, z) { this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; }
    snapshot() { return { pos: this.pos.slice(), prev: this.prev.slice() }; }
    restore(s) { this.pos.set(s.pos); this.prev.set(s.prev); this.asleep = false; this.still = 0; }
    wake() { this.asleep = false; this.still = 0; }

    step(dt) {
      const p = this.pos, q = this.prev, w = this.w, M = this.M, N = this.N, g = this.gravity * dt * dt;
      const tip = N, back = N - 1;
      w[tip] = this.drag || this.lock ? 0 : this.tipW;
      w[back] = this.lock ? 0 : 1;
      // a hand holding the braid somewhere along its length pins that point while it is held
      const held = this.grab && this.grab.i > 1 && this.grab.i < back ? this.grab.i : -1;
      if (held >= 0) w[held] = 0;

      // integrate
      let moved = 0;
      for (let i = 0; i < M; i++) {
        if (w[i] === 0) continue;
        const o = i * 3;
        let vx = (p[o] - q[o]) * 0.996, vy = (p[o + 1] - q[o + 1]) * 0.996, vz = (p[o + 2] - q[o + 2]) * 0.996;
        const rad = i === tip || i === back ? 0.03 : this.r;
        if (p[o + 1] <= rad + 0.0015) { vx *= 0.8; vz *= 0.8; }   // friction on the desk
        q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2];
        p[o] += vx; p[o + 1] += vy + g; p[o + 2] += vz;
      }

      // held connector follows the pointer with a little lag
      if (this.drag) {
        const o = tip * 3, k = 0.35;
        p[o] += (this.drag.x - p[o]) * k; p[o + 1] += (this.drag.y - p[o + 1]) * k; p[o + 2] += (this.drag.z - p[o + 2]) * k;
      }
      if (this.lock) {
        p.set(this.lock.tip, tip * 3); p.set(this.lock.back, back * 3);
      }
      if (held >= 0) {
        const o = held * 3, k = 0.35, g = this.grab;
        p[o] += (g.x - p[o]) * k; p[o + 1] += (g.y - p[o + 1]) * k; p[o + 2] += (g.z - p[o + 2]) * k;
      }

      const iters = this.drag || held >= 0 ? 26 : 18;
      for (let it = 0; it < iters; it++) {
        // stretch: neighbours keep their length
        for (let i = 0; i < N - 1; i++) this.dist(i, i + 1, this.seg, 1);
        // the connector is rigid
        this.dist(back, tip, PLUG.LEN, 1);
        // bending: resist folding tighter than the braid allows
        for (let i = 0; i < N - 2; i++) this.minDist(i, i + 2, this.seg * 1.9, 0.12);
        // keep the strain relief straight with the cable
        this.dist(N - 2, tip, this.seg + PLUG.LEN * 0.995, 0.35);
        // line the connector up with the port when close
        if (this.align && !this.lock) {
          const a = this.align, o = back * 3, k = a.k * 0.5;
          const bx = p[tip * 3] + a.ox * PLUG.LEN, by = p[tip * 3 + 1] + a.oy * PLUG.LEN, bz = p[tip * 3 + 2] + a.oz * PLUG.LEN;
          p[o] += (bx - p[o]) * k; p[o + 1] += (by - p[o + 1]) * k; p[o + 2] += (bz - p[o + 2]) * k;
        }
        // self-collision: sections further apart along the cable may not pass through each other
        if (it % 3 === 0) this.selfCollide();
        // collisions
        for (let i = 2; i < M; i++) {
          if (w[i] === 0 && !(i === tip && this.drag)) continue;
          const o = i * 3, isPlug = i === tip || i === back, rad = isPlug ? 0.03 : this.r;
          if (p[o + 1] < rad) p[o + 1] = rad;
          const c = this.collide(p[o], p[o + 1], p[o + 2], rad, i === tip);
          if (c) { p[o] = c[0]; p[o + 1] = c[1]; p[o + 2] = c[2]; }
        }
        if (this.lock) { p.set(this.lock.tip, tip * 3); p.set(this.lock.back, back * 3); }
      }
      this.selfCollide();
      if (held >= 0) w[held] = 1;

      for (let i = 0; i < M * 3; i++) { const d = p[i] - q[i]; moved = Math.max(moved, d * d); }
      // asleep once nothing moves more than 0.002 mm per step for 45 steps
      if (!this.drag && held < 0 && moved < 4e-10) { if (++this.still > 45) this.asleep = true; } else { this.still = 0; this.asleep = false; }
    }

    dist(a, b, rest, k) {
      const p = this.pos, wa = this.w[a], wb = this.w[b], ws = wa + wb;
      if (ws === 0) return;
      const ia = a * 3, ib = b * 3, dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9, c = (d - rest) / d * k / ws;
      p[ia] += dx * c * wa; p[ia + 1] += dy * c * wa; p[ia + 2] += dz * c * wa;
      p[ib] -= dx * c * wb; p[ib + 1] -= dy * c * wb; p[ib + 2] -= dz * c * wb;
    }
    selfCollide() {
      const p = this.pos, w = this.w, N = this.N, min = this.r * 2.05, min2 = min * min;
      for (let i = 2; i < N; i++) {
        const ia = i * 3, ax = p[ia], ay = p[ia + 1], az = p[ia + 2];
        for (let j = i + 6; j < N; j++) {
          const ib = j * 3, dx = p[ib] - ax, dy = p[ib + 1] - ay, dz = p[ib + 2] - az, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= min2 || d2 < 1e-12) continue;
          const wa = w[i], wb = w[j], ws = wa + wb;
          if (!ws) continue;
          // Two sections crossing low on the desk can't slide through each other, so the upper one
          // rests on the lower: placed at exactly the contact height, with its vertical speed removed
          // so the correction doesn't turn into a bounce.
          const h2 = dx * dx + dz * dz;
          if (j - i >= 10 && ay < this.r * 3.2 && p[ib + 1] < this.r * 3.2 && h2 > dy * dy) {
            const topA = ay >= p[ib + 1], top = topA ? ia : ib, wt = topA ? wa : wb;
            if (wt) {
              const contact = (topA ? p[ib + 1] : ay) + Math.sqrt(Math.max(0, min2 - h2));
              if (p[top + 1] < contact) { p[top + 1] = contact; this.prev[top + 1] = contact; }
            }
            continue;
          }
          const d = Math.sqrt(d2), c = (d - min) / d / ws;
          p[ia] += dx * c * wa; p[ia + 1] += dy * c * wa; p[ia + 2] += dz * c * wa;
          p[ib] -= dx * c * wb; p[ib + 1] -= dy * c * wb; p[ib + 2] -= dz * c * wb;
        }
      }
    }
    minDist(a, b, min, k) {
      const p = this.pos, ia = a * 3, ib = b * 3;
      const dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
      if (dx * dx + dy * dy + dz * dz < min * min) this.dist(a, b, min, k);
    }

    /* ---------- rendering ---------- */
    buildTube(radial, perSeg, material) {
      const T = this.T, S = (this.N - 1) * perSeg + 1, R = radial;
      this.S = S; this.R = R; this.perSeg = perSeg;
      const vc = S * (R + 1);
      const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), idx = [];
      for (let s = 0; s < S; s++) for (let j = 0; j <= R; j++) { const v = s * (R + 1) + j; uv[v * 2] = s / (S - 1); uv[v * 2 + 1] = j / R; }
      for (let s = 0; s < S - 1; s++) for (let j = 0; j < R; j++) {
        const a = s * (R + 1) + j, b = a + R + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      this.mesh = new T.Mesh(geo, material);
      this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
      // Soft contact shadow: the same ring of vertices flattened onto the desk and widened,
      // darkest under the centre line, fading out as the cable lifts away.
      this.contactMat = new T.ShaderMaterial({
        uniforms: { uR: { value: this.r }, uOpacity: { value: 0.5 } },
        vertexShader: 'uniform float uR; varying float vA;\nvoid main(){\n  vec3 c = position - normal * uR;\n  float side = length(normal.xz);\n  vec3 p = vec3(c.x + normal.x * uR * 2.6, 0.0011, c.z + normal.z * uR * 2.6);\n  vA = (1.0 - smoothstep(0.0, 0.22, c.y - uR)) * (1.0 - side);\n  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);\n}',
        fragmentShader: 'uniform float uOpacity; varying float vA;\nvoid main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, vA * vA * uOpacity); }',
        transparent: true, depthWrite: false
      });
      this.contact = new T.Mesh(geo, this.contactMat);
      this.contact.frustumCulled = false; this.contact.renderOrder = 2;
      this.C = new Float32Array(S * 3); this.Tn = new Float32Array(S * 3);
    }

    updateMesh() {
      const p = this.pos, N = this.N, S = this.S, R = this.R, C = this.C, Tn = this.Tn, r = this.r;
      // Catmull-Rom through the cable particles (excluding the connector)
      for (let s = 0; s < S; s++) {
        const t = s / (S - 1) * (N - 1), i = Math.min(N - 2, Math.floor(t)), f = t - i;
        const i0 = Math.max(0, i - 1), i3 = Math.min(N - 1, i + 2), f2 = f * f, f3 = f2 * f;
        for (let k = 0; k < 3; k++) {
          const P0 = p[i0 * 3 + k], P1 = p[i * 3 + k], P2 = p[(i + 1) * 3 + k], P3 = p[i3 * 3 + k];
          C[s * 3 + k] = 0.5 * (2 * P1 + (-P0 + P2) * f + (2 * P0 - 5 * P1 + 4 * P2 - P3) * f2 + (-P0 + 3 * P1 - 3 * P2 + P3) * f3);
        }
      }
      for (let s = 0; s < S; s++) {
        const a = Math.max(0, s - 1), b = Math.min(S - 1, s + 1);
        let x = C[b * 3] - C[a * 3], y = C[b * 3 + 1] - C[a * 3 + 1], z = C[b * 3 + 2] - C[a * 3 + 2];
        const l = Math.hypot(x, y, z) || 1; Tn[s * 3] = x / l; Tn[s * 3 + 1] = y / l; Tn[s * 3 + 2] = z / l;
      }
      // parallel-transported frame, seeded from world up at the anchor end
      let nx, ny, nz;
      { const tx = Tn[0], ty = Tn[1], tz = Tn[2];
        let ux = 0, uy = 1, uz = 0; if (Math.abs(ty) > 0.95) { ux = 1; uy = 0; }
        nx = uy * tz - uz * ty; ny = uz * tx - ux * tz; nz = ux * ty - uy * tx;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; }
      const pos = this.mesh.geometry.attributes.position.array, nor = this.mesh.geometry.attributes.normal.array;
      for (let s = 0; s < S; s++) {
        const tx = Tn[s * 3], ty = Tn[s * 3 + 1], tz = Tn[s * 3 + 2];
        const dp = nx * tx + ny * ty + nz * tz;
        nx -= tx * dp; ny -= ty * dp; nz -= tz * dp;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        for (let j = 0; j <= R; j++) {
          const ang = j / R * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
          const dx = nx * c + bx * sn, dy = ny * c + by * sn, dz = nz * c + bz * sn, v = (s * (R + 1) + j) * 3;
          pos[v] = C[s * 3] + dx * r; pos[v + 1] = C[s * 3 + 1] + dy * r; pos[v + 2] = C[s * 3 + 2] + dz * r;
          nor[v] = dx; nor[v + 1] = dy; nor[v + 2] = dz;
        }
      }
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.normal.needsUpdate = true;

      // connector: origin at the cable end, +z towards the tip, wide side kept horizontal
      const T = this.T, b = this.get(N - 1, this._b || (this._b = new T.Vector3())), t = this.get(N, this._t || (this._t = new T.Vector3()));
      const f = (this._f || (this._f = new T.Vector3())).subVectors(t, b).normalize();
      const up = this._up || (this._up = new T.Vector3(0, 1, 0)), x = this._xa || (this._xa = new T.Vector3());
      x.crossVectors(up, f);
      if (x.lengthSq() < 1e-4) x.copy(this._x); else x.normalize();
      this._x.copy(x);
      const y = (this._y || (this._y = new T.Vector3())).crossVectors(f, x);
      const m = this._m || (this._m = new T.Matrix4());
      m.makeBasis(x, y, f);
      this.plug.position.copy(b);
      this.plug.quaternion.setFromRotationMatrix(m);
      if (this.plugShadow) {
        const c = this.plugCenter(this._ps || (this._ps = new T.Vector3()));
        this.plugShadow.position.set(c.x, 0.0012, c.z);
        this.plugShadow.rotation.set(-Math.PI / 2, 0, Math.atan2(-f.z, f.x));
        this.plugShadow.material.opacity = 0.55 * Math.max(0, 1 - (c.y - 0.03) / 0.3);
      }
    }

    tipPosition(out) { return this.get(this.N, out); }
    plugCenter(out) {
      const b = this.get(this.N - 1, out), t = this.get(this.N, this._pc || (this._pc = new this.T.Vector3()));
      return b.lerp(t, (PLUG.RELIEF + PLUG.HOUSING * 0.5) / PLUG.LEN);
    }

    dispose() {
      this.mesh.geometry.dispose(); this.contactMat.dispose();
      if (this.plugShadow) { this.plugShadow.geometry.dispose(); this.plugShadow.material.dispose(); }
      this.plug.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this.plug.userData.materials.forEach(m => m.dispose());
      this.plug.userData.textures.forEach(t => t.dispose());
    }
  }
  NS.Cable = Cable;
})();
