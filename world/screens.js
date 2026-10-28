/* Screens · what the laptops show. The fleet sits at its login screens (Windows 11 sign-in and the macOS
   login window), ready for people to start work. The hero wakes to its own login and signs in. The
   visitor's device ends in Company Portal. Everything is drawn in code; no logos. */
(function () {
  'use strict';
  const NS = (window.UIConnect = window.UIConnect || {});
  const SEG = '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  function rr(x, cx, cy, w, h, r) { x.beginPath(); x.moveTo(cx + r, cy); x.arcTo(cx + w, cy, cx + w, cy + h, r); x.arcTo(cx + w, cy + h, cx, cy + h, r); x.arcTo(cx, cy + h, cx, cy, r); x.arcTo(cx, cy, cx + w, cy, r); x.closePath(); }
  const box = (x, c, cx, cy, w, h, r = 0) => { x.fillStyle = c; if (r) { rr(x, cx, cy, w, h, r); x.fill(); } else x.fillRect(cx, cy, w, h); };

  /* ---------- login screens, drawn to any size (s = 1 is a 256-wide fleet tile) ---------- */
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  function avatar(x, cx, cy, r, name, col) {
    x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.font = `600 ${r * 0.78}px ${SEG}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(initials(name), cx, cy + r * 0.05); x.textAlign = 'left';
  }
  NS.drawWinSignIn = function (x, w, h, v, name) {
    const s = w / 256, cy = h * 0.36;
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, v.c0); g.addColorStop(1, v.c1); box(x, g, 0, 0, w, h);
    x.save(); x.translate(w * v.px, h * v.py);
    for (let k = 0; k < 6; k++) {
      x.rotate(Math.PI / 3);
      const pg = x.createLinearGradient(0, 0, 92 * s, 0); pg.addColorStop(0, v.petal[0]); pg.addColorStop(1, v.petal[1]);
      x.fillStyle = pg; x.beginPath(); x.ellipse(44 * s, 0, 50 * s, 20 * s, 0, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    box(x, 'rgba(0,0,0,0.3)', 0, 0, w, h);                       // the sign-in screen dims its wallpaper
    avatar(x, w / 2, cy, 19 * s, name, v.av);
    x.fillStyle = '#ffffff'; x.font = `600 ${11 * s}px ${SEG}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, w / 2, cy + 31 * s);
    box(x, 'rgba(255,255,255,0.9)', w / 2 - 47 * s, cy + 42 * s, 94 * s, 13 * s, 2 * s);
    box(x, '#3b3b3b', w / 2 - 47 * s, cy + 54 * s, 94 * s, 1 * s);
    x.fillStyle = '#6b6b6b'; x.font = `400 ${6.5 * s}px ${SEG}`; x.textAlign = 'left'; x.fillText('PIN', w / 2 - 43 * s, cy + 48.5 * s);
    x.fillStyle = 'rgba(255,255,255,0.88)'; x.textAlign = 'center'; x.font = `400 ${6 * s}px ${SEG}`; x.fillText('Sign-in options', w / 2, cy + 66 * s);
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.1 * s;
    for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(w - (14 + i * 14) * s, h - 10 * s, 3.4 * s, 0, Math.PI * 2); x.stroke(); }
    avatar(x, 14 * s, h - 12 * s, 5 * s, 'Other user', 'rgba(255,255,255,0.28)');
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.textAlign = 'left'; x.font = `400 ${5.5 * s}px ${SEG}`; x.fillText('Other user', 23 * s, h - 12 * s);
  };
  NS.drawMacLogin = function (x, w, h, v, name, dots, time, date) {
    const s = w / 256;
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, v.c0); g.addColorStop(0.55, v.c1); g.addColorStop(1, v.c2); box(x, g, 0, 0, w, h);
    x.fillStyle = v.hill; x.beginPath(); x.moveTo(0, h * 0.72); x.bezierCurveTo(w * 0.3, h * 0.55, w * 0.62, h * 0.92, w, h * 0.6); x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = `500 ${7.5 * s}px ${SEG}`; x.fillText(date, w / 2, 26 * s);
    x.font = `600 ${34 * s}px ${SEG}`; x.fillText(time, w / 2, 60 * s);
    avatar(x, w / 2, h - 52 * s, 12 * s, name, v.av);
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `600 ${7.5 * s}px ${SEG}`; x.fillText(name, w / 2, h - 33 * s);
    box(x, 'rgba(255,255,255,0.24)', w / 2 - 38 * s, h - 26 * s, 76 * s, 11 * s, 5.5 * s);
    if (dots > 0) { x.fillStyle = '#ffffff'; for (let i = 0; i < dots; i++) { x.beginPath(); x.arc(w / 2 - 31 * s + i * 5.6 * s, h - 20.5 * s, 1.5 * s, 0, Math.PI * 2); x.fill(); } }
    else { x.fillStyle = 'rgba(255,255,255,0.72)'; x.font = `400 ${5.5 * s}px ${SEG}`; x.fillText('Enter Password', w / 2, h - 20.5 * s); }
    x.fillStyle = 'rgba(255,255,255,0.66)'; x.font = `400 ${4.6 * s}px ${SEG}`; x.fillText('Touch ID or Enter Password', w / 2, h - 8 * s);
    x.textAlign = 'left';
  };

  /* ---------- the fleet: six login screens in a 3 × 2 atlas of 256 × 168 tiles ---------- */
  const WIN = [
    [{ c0: '#0b2a6b', c1: '#1c64d8', petal: ['rgba(140,205,255,0.95)', 'rgba(40,100,230,0.1)'], px: 0.5, py: 0.42, av: '#c2185b' }, 'Amara Okafor'],
    [{ c0: '#050b1f', c1: '#0b2350', petal: ['rgba(90,150,255,0.9)', 'rgba(20,40,120,0.1)'], px: 0.62, py: 0.5, av: '#2e7d32' }, 'James Wilson'],
    [{ c0: '#2a0f4f', c1: '#5b2bb5', petal: ['rgba(255,170,230,0.85)', 'rgba(120,60,200,0.1)'], px: 0.4, py: 0.45, av: '#ef6c00' }, 'Priya Shah'],
    [{ c0: '#6ea8f5', c1: '#d6e6fb', petal: ['rgba(40,110,235,0.9)', 'rgba(150,200,255,0.1)'], px: 0.55, py: 0.4, av: '#5b5fc7' }, 'Tom Fletcher']
  ];
  const MAC = [
    [{ c0: '#2c3e7a', c1: '#7b5cc4', c2: '#e9a6c9', hill: 'rgba(40,30,90,0.55)', av: '#0a84ff' }, 'Sofia Ruiz'],
    [{ c0: '#0f3b52', c1: '#2f7d8c', c2: '#f0c18b', hill: 'rgba(10,40,50,0.55)', av: '#ff9f0a' }, 'Daniel Mensah']
  ];
  NS.FLEET_TILES = 6;
  NS.drawFleetAtlas = function (x, TW, TH, time, date) {
    const tile = (i, draw) => { x.save(); x.translate((i % 3) * TW, Math.floor(i / 3) * TH); x.beginPath(); x.rect(0, 0, TW, TH); x.clip(); draw(); x.restore(); };
    WIN.forEach(([v, name], i) => tile(i, () => NS.drawWinSignIn(x, TW, TH, v, name)));
    MAC.forEach(([v, name], i) => tile(4 + i, () => NS.drawMacLogin(x, TW, TH, v, name, 0, time, date)));
  };

  /* ---------- the hero after it is plugged in: its own login screen, signing in ---------- */
  const HERO_MAC = { c0: '#1f3a75', c1: '#6a52b8', c2: '#e7a0c4', hill: 'rgba(30,24,80,0.5)', av: '#0b6e70' };
  NS.drawHeroWake = function (x, W, H, k, time, date) {
    NS.drawMacLogin(x, W, H, HERO_MAC, window.HERO_NAME || 'Oluwasola A', clamp(Math.floor((k - 0.06) / 0.3 * 11), 0, 11), time, date);
  };

  /* ---------- the visitor's device at the end: its own sign-in screen, in the style of its system ---------- */
  const VISITOR_WIN = { c0: '#06303a', c1: '#0b6e70', petal: ['rgba(140,245,235,0.9)', 'rgba(20,110,112,0.1)'], px: 0.5, py: 0.42, av: '#0b6e70' };
  const VISITOR_MAC = { c0: '#0c2f3a', c1: '#1f7a7c', c2: '#9fe3d6', hill: 'rgba(6,36,42,0.5)', av: '#0b6e70' };
  NS.drawVisitorLogin = function (x, W, H, os, time, date) {
    if (/^Windows/.test(os || '')) NS.drawWinSignIn(x, W, H, VISITOR_WIN, 'You');
    else NS.drawMacLogin(x, W, H, VISITOR_MAC, 'You', 0, time, date);
  };
})();
