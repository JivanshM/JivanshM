/* ==========================================================================
   Jivansh Midha — portfolio
   No dependencies. Everything runs off a single requestAnimationFrame loop.
   ========================================================================== */

(() => {
  'use strict';

  /* ---------- content you might want to edit ---------- */

  // The toolkit is written in index.html (#stackList) so it also works without JS.
  const TECH = Array.from(document.querySelectorAll('#stackList li'), li => [li.textContent.trim(), +li.dataset.tier || 1]);

  // Points needed for each level. Levels are shown as pips and numerals, never words.
  const LEVELS = [0, 300, 1500, 4000, 9000];
  const NUMERALS = ['01', '02', '03', '04', '05'];

  /* ---------- helpers ---------- */

  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const ACCENT = '#c8ff2e';
  const VIOLET = '#7c5cff';
  const FG = '#f2efe9';
  const BG = '#07060b';
  const FONT = '"Archivo", "Helvetica Neue", Arial, sans-serif';
  const TAU = Math.PI * 2;

  const loop = new Set();
  const onVisible = (el, cb, opts) => {
    const io = new IntersectionObserver(entries => entries.forEach(e => cb(e)), opts);
    io.observe(el);
    return io;
  };

  /* ---------- pointer & scroll ---------- */

  const pointer = {
    x: innerWidth / 2, y: innerHeight / 2,
    sx: innerWidth / 2, sy: innerHeight / 2,
    active: false, travel: 0,
  };

  addEventListener('pointermove', e => {
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!pointer.active) {
      pointer.active = true;
      pointer.sx = pointer.x;
      pointer.sy = pointer.y;
      root.classList.add('cursor-on');
    }
    pointer.travel += Math.hypot(dx, dy);
    if (pointer.travel > 900) { pointer.travel = 0; Power.gain(1); }
  }, { passive: true });

  let idleTimer = 0;
  addEventListener('pointerdown', e => {
    clearTimeout(idleTimer);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!pointer.active || e.pointerType !== 'mouse') { pointer.sx = pointer.x; pointer.sy = pointer.y; }
    if (!pointer.active) { pointer.active = true; root.classList.add('cursor-on'); }
  }, { passive: true });
  const touchGone = e => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { pointer.active = false; }, 900);
  };
  addEventListener('pointerup', touchGone);
  addEventListener('pointercancel', touchGone);
  document.addEventListener('mouseleave', () => root.classList.add('cursor-out'));
  document.addEventListener('mouseenter', () => root.classList.remove('cursor-out'));

  const scroll = { y: scrollY, v: 0, dir: 1, travel: 0 };

  loop.add(dt => {
    pointer.sx = damp(pointer.sx, pointer.x, 14, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 14, dt);

    const y = scrollY, dy = y - scroll.y;
    scroll.v = damp(scroll.v, dy / Math.max(dt, 1e-3), 10, dt);
    if (dy) scroll.dir = Math.sign(dy);
    scroll.y = y;
    scroll.travel += Math.abs(dy);
    if (scroll.travel > 600) { scroll.travel = 0; Power.gain(2); }
  });

  /* ---------- fx layer ---------- */

  const FX = (() => {
    const layer = $('.fx');
    const spawn = (cls, x, y) => {
      const el = document.createElement('span');
      el.className = cls;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.addEventListener('animationend', () => el.remove(), { once: true });
      layer.append(el);
      return el;
    };
    return {
      wave(x, y, s) {
        const el = spawn('wave', x, y);
        el.style.setProperty('--size', `${80 + s * Math.max(innerWidth, innerHeight) * 1.4}px`);
      },
      pop(n, x, y) {
        const el = spawn(n >= 500 ? 'pop pop--big' : 'pop', x, y);
        el.textContent = `+${n}`;
        const star = document.createElement('small');
        star.textContent = '✦';
        el.append(star);
        const half = el.offsetWidth * 0.55 + 8;
        el.style.left = `${clamp(x, half, innerWidth - half)}px`;
        el.style.top = `${Math.max(y, el.offsetHeight * 1.9 + 12)}px`;
      },
      flash(x, y) {
        const el = document.createElement('span');
        el.className = 'flash';
        el.style.setProperty('--x', `${x}px`);
        el.style.setProperty('--y', `${y}px`);
        el.addEventListener('animationend', () => el.remove(), { once: true });
        layer.append(el);
      },
      levelUp(numeral, paint) {
        const el = $('.levelup');
        $('strong', el).textContent = numeral;
        paint($$('.levelup__pips i', el));
        el.classList.remove('is-on');
        void el.offsetWidth;
        el.classList.add('is-on');
      },
    };
  })();

  /* ---------- field shader (background) ---------- */

  const Bg = (() => {
    const canvas = $('.field');
    const api = { charge: 0, dim: 0, shake: 0, pulse() {} };
    let gl = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, powerPreference: 'high-performance',
      });
    } catch (_) { /* no webgl */ }
    if (!gl) { root.classList.add('no-webgl'); return api; }

    const vert = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const frag = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 uRes;
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uEnergy;
      uniform float uCharge;
      uniform vec3 uPulse;
      uniform float uPulseAmp;
      uniform float uDim;

      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
        return v;
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / uRes;
        float asp = uRes.x / uRes.y;
        vec2 p = (uv - 0.5) * vec2(asp, 1.0);
        vec2 m = (uMouse - 0.5) * vec2(asp, 1.0);
        float t = uTime * 0.05;

        // space bends around the cursor
        vec2 dm = p - m;
        float md = length(dm);
        p -= dm * exp(-md * 3.5) * (0.12 + uCharge * 0.5);

        // shockwave
        vec2 pp = (uPulse.xy - 0.5) * vec2(asp, 1.0);
        float pd = length(p - pp);
        float radius = uPulse.z * 1.5;
        float dd = (pd - radius) * 8.0;
        float wave = exp(-dd * dd) * uPulseAmp * exp(-uPulse.z * 1.4);
        p += normalize(p - pp + 1e-4) * wave * 0.05;

        // domain-warped aurora
        vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t)), fbm(p * 1.3 + vec2(5.2, -t)));
        vec2 r = vec2(fbm(p * 1.5 + 3.0 * q + vec2(1.7, 9.2) + t * 1.3),
                      fbm(p * 1.5 + 3.0 * q + vec2(8.3, 2.8) - t * 1.1));
        float f = fbm(p * 1.1 + 2.4 * r);

        vec3 base   = vec3(0.027, 0.024, 0.043);
        vec3 deep   = vec3(0.13, 0.05, 0.34);
        deep = mix(deep, vec3(0.22, 0.04, 0.30), uEnergy * 0.5);
        vec3 violet = vec3(0.40, 0.23, 1.0);
        vec3 cyan   = vec3(0.0, 0.72, 1.0);
        vec3 pink   = vec3(1.0, 0.28, 0.72);
        vec3 gold   = vec3(1.0, 0.74, 0.32);
        vec3 lime   = vec3(0.78, 1.0, 0.18);

        vec3 hot = mix(cyan, pink, smoothstep(0.2, 0.65, uEnergy));
        hot = mix(hot, gold, smoothstep(0.7, 1.0, uEnergy) * 0.75);

        vec3 col = base;
        col = mix(col, deep, smoothstep(0.15, 0.7, f));
        col = mix(col, violet, smoothstep(0.45, 0.95, f * length(q) * 1.3) * (0.72 + uEnergy * 0.28));
        col += hot * pow(clamp(r.y * f * 2.0 - 0.3 + uEnergy * 0.12, 0.0, 1.0), 1.6) * (0.95 + uEnergy * 0.9);

        // the glow that follows you
        float glow = exp(-md * md * (10.0 - uCharge * 6.0));
        col = mix(col, col * 0.4, glow * uCharge);
        col += violet * glow * (0.16 + uEnergy * 0.1) * (1.0 - uCharge);
        col += lime * glow * uCharge * (0.75 + 0.25 * sin(uTime * 9.0));

        // shockwave light
        col += mix(lime, vec3(1.0), 0.35) * wave * 0.45;

        // vignette + section dim
        float vig = 1.0 - smoothstep(0.2, 1.3, length((uv - 0.5) * vec2(asp * 0.8, 1.0)));
        col *= mix(0.42, 1.0, vig);
        col *= 1.0 - uDim * 0.5;

        gl_FragColor = vec4(col, 1.0);
      }`;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    let U = {};
    const init = () => {
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      U = {};
      ['uRes', 'uTime', 'uMouse', 'uEnergy', 'uCharge', 'uPulse', 'uPulseAmp', 'uDim']
        .forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    try {
      init();
    } catch (err) {
      console.warn('[field] shader disabled:', err);
      root.classList.add('no-webgl');
      return api;
    }

    // The aurora is soft, so render it at a fraction of the screen and let CSS upscale.
    const resize = () => {
      const scale = innerWidth < 768 ? 0.35 : 0.5;
      const w = Math.max(1, Math.round(innerWidth * scale));
      const h = Math.max(1, Math.round(innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    addEventListener('resize', resize);

    let lost = false;
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      lost = true;
      root.classList.add('no-webgl');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        init();
        lost = false;
        root.classList.remove('no-webgl');
      } catch (_) { /* stay on the CSS fallback */ }
    });

    const mouse = { x: 0.5, y: 0.5 };
    const pulse = { x: 0.5, y: 0.5, t: 99, amp: 0 };
    let time = Math.random() * 50, dim = 0;

    api.pulse = (x, y, amp) => {
      pulse.x = x / innerWidth;
      pulse.y = 1 - y / innerHeight;
      pulse.t = 0;
      pulse.amp = amp;
    };

    loop.add(dt => {
      if (lost) return;
      time += dt * (REDUCED ? 0.1 : 1) * (1 + api.charge * 3);
      pulse.t += dt;
      const aim = Charge.on && typeof Charge.id === 'string' ? Charge : pointer.active ? pointer : null;
      const tx = aim ? aim.x / innerWidth : 0.5 + Math.sin(time * 0.35) * 0.18;
      const ty = aim ? 1 - aim.y / innerHeight : 0.5 + Math.cos(time * 0.27) * 0.12;
      mouse.x = damp(mouse.x, tx, 3, dt);
      mouse.y = damp(mouse.y, ty, 3, dt);
      dim = damp(dim, api.dim, 2.5, dt);

      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform2f(U.uMouse, mouse.x, mouse.y);
      gl.uniform1f(U.uEnergy, Power.energy);
      gl.uniform1f(U.uCharge, api.charge);
      gl.uniform3f(U.uPulse, pulse.x, pulse.y, pulse.t);
      gl.uniform1f(U.uPulseAmp, pulse.amp);
      gl.uniform1f(U.uDim, dim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (api.shake > 0.01 && !REDUCED) {
        api.shake = damp(api.shake, 0, 5, dt);
        const a = api.shake * 26;
        canvas.style.transform = `translate3d(${(Math.random() - 0.5) * a}px, ${(Math.random() - 0.5) * a}px, 0) scale(1.06)`;
      } else if (canvas.style.transform) {
        api.shake = 0;
        canvas.style.transform = '';
      }
    });

    return api;
  })();

  /* ---------- power: the points you farm by interacting ---------- */

  const Power = (() => {
    const meter = $('.meter');
    const numEl = $('.meter__num');
    const pips = $$('.meter__pips i');
    const fill = $('.meter__fill');
    const live = $('#powerLive');
    const srVal = $('#meterVal');
    const KEY = 'jm-power';
    const C = TAU * 17;
    const levelFor = v => LEVELS.reduce((l, at, i) => (v >= at ? i : l), 0);

    let value = 0;
    try { value = Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0); } catch (_) { /* private mode */ }
    let level = levelFor(value);
    let shown = value, energy = 0, lastText = '', saveTimer = 0, upTimer = 0, dirty = false;

    const progress = () => {
      const cur = LEVELS[level], next = LEVELS[level + 1];
      return next == null ? 1 : clamp((value - cur) / (next - cur), 0, 1);
    };
    const format = n => (n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString('en-US'));
    const paintPips = list => list.forEach((el, i) => {
      el.classList.toggle('is-lit', i <= level);
      el.classList.toggle('is-now', i === level && list === pips);
    });
    paintPips(pips);
    energy = (level + progress()) / (LEVELS.length - 1);

    const save = () => {
      clearTimeout(saveTimer);
      if (!dirty) return;
      dirty = false;
      try {
        localStorage.setItem(KEY, String(Math.max(value, parseInt(localStorage.getItem(KEY), 10) || 0)));
      } catch (_) { /* ignore */ }
    };
    addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

    const levelUp = quiet => {
      live.textContent = `Level ${level + 1} of ${LEVELS.length}`;
      paintPips(pips);
      meter.classList.remove('is-up');
      void meter.offsetWidth;
      meter.classList.add('is-up');
      clearTimeout(upTimer);
      if (!quiet) upTimer = setTimeout(() => FX.levelUp(NUMERALS[level], el => paintPips(el)), 600);
      const r = meter.getBoundingClientRect();
      FX.flash(r.left + r.width / 2, r.top + r.height / 2);
      Bg.pulse(r.left + r.width / 2, r.top + r.height / 2, 1.2);
    };

    loop.add(dt => {
      shown = value - shown < 1 ? value : damp(shown, value, 5, dt);
      const text = format(Math.round(shown));
      if (text !== lastText) { numEl.textContent = text; lastText = text; }
      const label = `Points ${format(value)}`;
      if (srVal.textContent !== label) srVal.textContent = label;
      const prog = progress();
      fill.style.strokeDashoffset = (C * (1 - prog)).toFixed(2);
      fill.style.opacity = prog > 0.002 ? '1' : '0';
      energy = damp(energy, (level + progress()) / (LEVELS.length - 1), 1.2, dt);
    });

    return {
      get energy() { return clamp(energy, 0, 1); },
      gain(n, x, y, quiet) {
        value += n;
        dirty = true;
        const l = levelFor(value);
        if (l > level) {
          level = l;
          levelUp(quiet);
          if (quiet && x != null) FX.pop(n, x, y);
          save();
        } else {
          if (x != null) FX.pop(n, x, y);
          clearTimeout(saveTimer);
          saveTimer = setTimeout(save, 500);
        }
      },
    };
  })();

  /* ---------- cursor ---------- */

  const Cursor = (() => {
    const noop = { set() {} };
    if (!FINE) return noop;
    root.classList.add('has-cursor');
    const ring = $('.cursor-ring');
    const dot = $('.cursor-dot');
    const label = $('.cursor-ring__label');
    const arc = $('.cursor-ring circle');
    const ARC = TAU * 48;
    const LABELS = { view: '↗' };
    let rx = pointer.x, ry = pointer.y, state = '';

    const set = s => {
      if (s === state) return;
      state = s;
      if (s) root.dataset.cstate = s; else delete root.dataset.cstate;
      label.textContent = LABELS[s] || '';
    };

    document.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse' || e.target.closest('.stack__canvas')) return;
      const t = e.target.closest('[data-cursor], a, button');
      set(t ? (t.dataset.cursor || 'hover') : '');
    });

    loop.add(dt => {
      rx = damp(rx, pointer.x, 18, dt);
      ry = damp(ry, pointer.y, 18, dt);
      let ox = 0, oy = 0;
      if (Charge.on) {
        const a = Charge.level * 5;
        ox = (Math.random() - 0.5) * a;
        oy = (Math.random() - 0.5) * a;
      }
      ring.style.transform = `translate3d(${(rx + ox).toFixed(1)}px, ${(ry + oy).toFixed(1)}px, 0)`;
      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      arc.style.strokeDashoffset = (ARC * (1 - (Charge.on ? Charge.level : 0))).toFixed(1);
    });

    return { set };
  })();

  /* ---------- flexing type (variable font reacts to you) ---------- */

  const splitChars = el => {
    const out = [];
    const walk = node => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === Node.TEXT_NODE) {
          if (!n.textContent.trim()) return;
          const frag = document.createDocumentFragment();
          for (const ch of n.textContent) {
            if (ch === ' ') { frag.append(' '); continue; }
            const s = document.createElement('span');
            s.className = 'ch';
            s.setAttribute('aria-hidden', 'true');
            s.textContent = ch;
            s.style.setProperty('--i', out.length);
            out.push(s);
            frag.append(s);
          }
          n.replaceWith(frag);
        } else if (n.nodeType === Node.ELEMENT_NODE) {
          walk(n);
        }
      });
    };
    walk(el);
    return out;
  };

  const FlexType = (() => {
    const groups = $$('.flex-type').map(el => {
      const chars = splitChars(el);
      const zeros = () => chars.map(() => 0);
      const g = {
        el, chars, wt: zeros(), wd: zeros(), last: chars.map(() => ''),
        visible: true, fit: 1, ty: 0, avail: 0, hero: el.classList.contains('hero__name'),
      };
      onVisible(el, e => { g.visible = e.isIntersecting; });
      return g;
    });
    // Width available to each block of type, so a swelling word can never overflow.
    const measure = () => groups.forEach(g => {
      const box = g.el.parentElement, cs = getComputedStyle(box);
      g.avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    measure();
    addEventListener('resize', measure);
    let kick = 0;

    loop.add((dt, t) => {
      kick = damp(kick, 0, 1.8, dt);
      const radius = clamp(innerWidth * 0.3, 170, 520);
      const idle = REDUCED ? 0 : pointer.active ? 0.1 : 0.55;
      const charge = Charge.on && !REDUCED ? Charge.level : 0;
      groups.forEach(g => {
        if (!g.visible) return;
        const rects = g.chars.map(c => c.getBoundingClientRect());
        let left = Infinity, right = -Infinity;
        g.chars.forEach((c, i) => {
          const r = rects[i];
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
          let p = 0;
          if (pointer.active) {
            const dx = pointer.sx - (r.left + r.width / 2);
            const dy = (pointer.sy - (r.top + r.height / 2)) * 1.5;
            p = clamp(1 - Math.hypot(dx, dy) / radius, 0, 1);
            p = p * p * (3 - 2 * p);
          }
          const base = Math.max(p, idle * (0.5 + 0.5 * Math.sin(t * 1.5 - i * 0.65)));
          // charge and shockwaves mostly add weight; proximity adds weight and width
          const tw = clamp(base + charge * 0.5 + kick, 0, 1);
          const td = clamp(base + charge * 0.15 + kick * 0.45, 0, 1);
          const wt = g.wt[i] = REDUCED ? tw : damp(g.wt[i], tw, 7, dt);
          const wd = g.wd[i] = REDUCED ? td : damp(g.wd[i], td, 7, dt);
          const fvs = `"wght" ${Math.round(200 + wt * 700)}, "wdth" ${(75 + wd * 50).toFixed(1)}`;
          if (fvs === g.last[i]) return;
          g.last[i] = fvs;
          c.style.fontVariationSettings = fvs;
          c.style.setProperty('--p', wt.toFixed(3));
        });
        if (g.hero && !REDUCED) g.ty = scrollY <= innerHeight * 1.3 ? scrollY * 0.38 : g.ty;
        const natural = (right - left) / g.fit;
        const room = g.avail * 0.98;
        const fit = natural > room ? room / natural : 1;
        g.fit = REDUCED ? fit : damp(g.fit, fit, 14, dt);
        g.el.style.transform = `translate3d(0, ${g.ty.toFixed(1)}px, 0) scale(${g.fit.toFixed(4)})`;
      });
    });

    return { kick(s) { kick = Math.max(kick, s); } };
  })();

  /* ---------- charge: hold anywhere, release a shockwave ---------- */

  const Charge = (() => {
    const HOLD = 1.1; // seconds to full charge
    const st = { on: false, level: 0, t0: 0, x: 0, y: 0, full: false, first: true, id: -1 };
    const blocked = el => !!el.closest('a, button, input, textarea, select, label, .meter');
    const hint = $('.hint');

    const start = (x, y, id) => {
      Object.assign(st, { on: true, level: 0, t0: performance.now(), x, y, full: false, id });
      root.classList.add('is-charging');
    };
    const end = fire => {
      if (!st.on) return;
      const lvl = st.level;
      st.on = false;
      st.level = 0;
      Bg.charge = 0;
      root.classList.remove('is-charging', 'is-full');
      if (!fire) return;
      if (lvl < 0.12) {
        FX.wave(st.x, st.y, 0.06);
        Bg.pulse(st.x, st.y, 0.3);
        Power.gain(5);
        return;
      }
      Power.gain(lvl >= 1 ? 1000 : Math.round(lvl * 50) * 10, st.x, st.y);
      blast(st.x, st.y, lvl);
      if (lvl >= 1 && st.first) {
        st.first = false;
        hint.classList.add('is-done');
        $('.hint__text', hint).textContent = 'Again.';
      }
    };

    addEventListener('pointerdown', e => {
      if (e.button !== 0 || st.on || Stack.dragging || blocked(e.target)) return;
      start(e.clientX, e.clientY, e.pointerId);
    });
    addEventListener('pointermove', e => {
      if (st.on && e.pointerId === st.id) { st.x = e.clientX; st.y = e.clientY; }
    }, { passive: true });
    addEventListener('pointerup', e => { if (e.pointerId === st.id) end(true); });
    addEventListener('pointercancel', e => { if (e.pointerId === st.id) end(false); });

    // keyboard: hold Enter or Space on the meter
    const meterEl = $('.meter');
    const isKey = e => e.key === ' ' || e.key === 'Enter';
    meterEl.addEventListener('keydown', e => {
      if (!isKey(e)) return;
      e.preventDefault();
      if (!e.repeat && !st.on) start(pointer.active ? pointer.x : innerWidth / 2, pointer.active ? pointer.y : innerHeight / 2, 'key');
    });
    meterEl.addEventListener('keyup', e => { if (isKey(e) && st.id === 'key') end(true); });
    meterEl.addEventListener('blur', () => { if (st.id === 'key') end(false); });
    let clickTimer = 0;
    meterEl.addEventListener('click', () => {
      if (st.on) return;
      start(innerWidth / 2, innerHeight / 2, 'click');
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { if (st.on && st.id === 'click') { st.level = 1; end(true); } }, HOLD * 1000);
    });
    addEventListener('blur', () => end(false));
    addEventListener('contextmenu', e => { if (st.on) e.preventDefault(); });

    loop.add(() => {
      if (!st.on) return;
      st.level = clamp((performance.now() - st.t0) / 1000 / HOLD, 0, 1);
      Bg.charge = st.level;
      if (st.level >= 1 && !st.full) {
        st.full = true;
        root.classList.add('is-full');
        if (navigator.vibrate) navigator.vibrate(15);
      }
    });

    return st;
  })();

  function blast(x, y, s) {
    FX.wave(x, y, s);
    Bg.pulse(x, y, 0.5 + s);
    Bg.shake = Math.max(Bg.shake, s * s);
    Stack.blast(x, y, s);
    if (!REDUCED) FlexType.kick(s);
  }

  /* ---------- magnetic + scramble ---------- */

  if (FINE) {
    $$('[data-magnetic]').forEach(el => {
      const k = parseFloat(el.dataset.magnetic) || 0.3;
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * k;
        const y = (e.clientY - r.top - r.height / 2) * k;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
  $$('[data-scramble]').forEach(el => {
    const final = el.textContent;
    el.setAttribute('aria-label', final.replace(/\s*[↑↗]\s*$/, ''));
    let raf = 0;
    el.addEventListener('pointerenter', () => {
      if (REDUCED) return;
      let f = 0;
      cancelAnimationFrame(raf);
      const run = () => {
        let s = '';
        for (let i = 0; i < final.length; i++) {
          s += i < f / 2 || final[i] === ' ' ? final[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = s;
        if (f++ / 2 < final.length) raf = requestAnimationFrame(run);
        else el.textContent = final;
      };
      run();
    });
  });

  /* ---------- tapes ---------- */

  (() => {
    const tapes = $$('.tape').map((el, i) => ({
      el, track: $('.tape__track', el), group: $('.tape__group', el),
      x: 0, w: 0, base: i ? 70 : 55, sign: i ? -1 : 1, slow: 1, hover: false, visible: false,
    }));
    const measure = () => tapes.forEach(t => {
      t.w = t.group.offsetWidth;
      if (!t.w) return;
      const need = Math.ceil(t.el.clientWidth / t.w) + 1;
      while (t.track.children.length < need) t.track.append(t.group.cloneNode(true));
    });
    measure();
    addEventListener('resize', measure);
    if (document.fonts) document.fonts.ready.then(measure);

    tapes.forEach(t => {
      onVisible(t.el, e => { t.visible = e.isIntersecting; });
      t.el.addEventListener('pointerenter', () => { t.hover = true; });
      t.el.addEventListener('pointerleave', () => { t.hover = false; });
    });

    loop.add(dt => {
      const v = scroll.v;
      const skew = REDUCED ? 0 : clamp(v * -0.005, -9, 9);
      tapes.forEach(t => {
        if (!t.visible || !t.w) return;
        t.slow = damp(t.slow, t.hover ? 0.2 : 1, 4, dt);
        const speed = REDUCED ? 0 : (t.base + Math.abs(v) * 0.3) * t.slow;
        t.x += t.sign * scroll.dir * speed * dt;
        t.x = ((t.x % t.w) - t.w) % t.w;
        t.track.style.transform = `translate3d(${t.x.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
      });
    });
  })();

  /* ---------- generative card art ---------- */

  const SCENES = {
    // dot field that breathes and parts around you
    wave(ctx, st) {
      return {
        draw() {
          const { w, h, t } = st;
          ctx.fillStyle = '#0b0a12';
          ctx.fillRect(0, 0, w, h);
          const gap = Math.max(14, w / 34);
          const R = 120 + st.hoverT * 40;
          for (let j = 0, rows = Math.ceil(h / gap) + 1; j < rows; j++) {
            for (let i = 0, cols = Math.ceil(w / gap) + 1; i < cols; i++) {
              let x = i * gap, y = j * gap;
              const k = Math.sin(i * 0.33 + t * 1.5) * Math.cos(j * 0.28 - t * 1.1);
              y += k * gap * 0.5;
              const dx = x - st.mx, dy = y - st.my, d = Math.hypot(dx, dy);
              let lift = 0;
              if (d < R) {
                lift = 1 - d / R;
                x += (dx / (d || 1)) * lift * 26;
                y += (dy / (d || 1)) * lift * 26;
              }
              const s = Math.max(0.5, 1.1 + k * 0.9 + lift * 2.4);
              ctx.fillStyle = lift > 0.06
                ? ACCENT
                : k > 0.35 ? `rgba(165,147,255,${(0.35 + k * 0.5).toFixed(2)})` : `rgba(242,239,233,${(0.16 + (k + 1) * 0.12).toFixed(2)})`;
              ctx.beginPath();
              ctx.arc(x, y, s, 0, TAU);
              ctx.fill();
            }
          }
        },
      };
    },

    // drifting network that reaches for the cursor
    neural(ctx, st) {
      let nodes = [];
      return {
        init() {
          const n = Math.round(clamp((st.w * st.h) / 7000, 26, 70));
          nodes = Array.from({ length: n }, () => ({
            x: Math.random() * st.w, y: Math.random() * st.h,
            vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
            r: 1.4 + Math.random() * 2.4,
          }));
        },
        draw(dt) {
          const { w, h } = st;
          ctx.fillStyle = '#0b0a12';
          ctx.fillRect(0, 0, w, h);
          const LINK = 120, REACH = 170;
          for (const n of nodes) {
            const dx = st.mx - n.x, dy = st.my - n.y, d = Math.hypot(dx, dy);
            if (d > 1 && d < REACH && st.hoverT > 0.01) {
              n.vx += (dx / d) * 160 * st.hoverT * dt;
              n.vy += (dy / d) * 160 * st.hoverT * dt;
            }
            n.vx += (Math.random() - 0.5) * 30 * dt;
            n.vy += (Math.random() - 0.5) * 30 * dt;
            const sp = Math.hypot(n.vx, n.vy), max = 60 + st.hoverT * 60;
            if (sp > max) { n.vx *= max / sp; n.vy *= max / sp; }
            n.x += n.vx * dt;
            n.y += n.vy * dt;
            if (n.x < 0 || n.x > w) { n.vx *= -1; n.x = clamp(n.x, 0, w); }
            if (n.y < 0 || n.y > h) { n.vy *= -1; n.y = clamp(n.y, 0, h); }
          }
          ctx.lineWidth = 1;
          for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < nodes.length; j++) {
              const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
              if (d > LINK) continue;
              ctx.strokeStyle = `rgba(124,92,255,${((1 - d / LINK) * 0.55).toFixed(2)})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            const dm = Math.hypot(a.x - st.mx, a.y - st.my);
            if (dm < REACH) {
              ctx.strokeStyle = `rgba(200,255,46,${((1 - dm / REACH) * 0.8 * st.hoverT).toFixed(2)})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(st.mx, st.my);
              ctx.stroke();
            }
          }
          for (const n of nodes) {
            const near = Math.hypot(n.x - st.mx, n.y - st.my) < REACH * st.hoverT;
            ctx.fillStyle = near ? ACCENT : FG;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, TAU);
            ctx.fill();
          }
        },
      };
    },

    // three orbits around a glowing core; tilts with the cursor
    orbit(ctx, st) {
      let spin = 0;
      return {
        draw(dt) {
          const { w, h, t } = st;
          ctx.fillStyle = '#0b0a12';
          ctx.fillRect(0, 0, w, h);
          const cx = w / 2 + (st.hoverT ? (st.mx - w / 2) * 0.05 * st.hoverT : 0);
          const cy = h / 2 + (st.hoverT ? (st.my - h / 2) * 0.05 * st.hoverT : 0);
          const R = Math.min(w, h) * 0.38;
          ctx.lineWidth = 1;
          for (let k = 1; k <= 7; k++) {
            ctx.strokeStyle = `rgba(242,239,233,${(0.07 - k * 0.006).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, R * 0.2 * k, 0, TAU);
            ctx.stroke();
          }
          spin += dt * (0.9 + st.hoverT * 2.4);
          const tilt = clamp(0.34 + (st.hoverT ? ((st.my / h) - 0.5) * 0.35 * st.hoverT : 0), 0.12, 0.6);
          for (let e = 0; e < 3; e++) {
            const ang = (e * Math.PI) / 3 + t * 0.12;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(ang);
            ctx.strokeStyle = 'rgba(124,92,255,0.7)';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.ellipse(0, 0, R, R * tilt, 0, 0, TAU);
            ctx.stroke();
            const th = spin * (1 + e * 0.27) + e * 2.1;
            for (let s = 0; s < 14; s++) {
              const a = th - s * 0.06;
              ctx.fillStyle = s ? `rgba(200,255,46,${(0.5 * (1 - s / 14)).toFixed(2)})` : ACCENT;
              ctx.beginPath();
              ctx.arc(Math.cos(a) * R, Math.sin(a) * R * tilt, s ? 3 * (1 - s / 14) + 0.5 : 4.5, 0, TAU);
              ctx.fill();
            }
            ctx.restore();
          }
          const core = R * (0.16 + st.hoverT * 0.04);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 2.6);
          g.addColorStop(0, 'rgba(200,255,46,0.95)');
          g.addColorStop(0.3, 'rgba(124,92,255,0.45)');
          g.addColorStop(1, 'rgba(124,92,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, core * 2.6, 0, TAU);
          ctx.fill();
          ctx.fillStyle = BG;
          ctx.beginPath();
          ctx.arc(cx, cy, core * 0.45, 0, TAU);
          ctx.fill();
        },
      };
    },

    // a bubble sort that never stops sorting
    sort(ctx, st) {
      const N = 36;
      let arr = [], i = 0, j = 0, acc = 0, hold = 0, swapped = -1;
      const shuffle = () => {
        arr = Array.from({ length: N }, (_, k) => (k + 1) / N);
        for (let k = N - 1; k > 0; k--) {
          const r = (Math.random() * (k + 1)) | 0;
          [arr[k], arr[r]] = [arr[r], arr[k]];
        }
        i = 0; j = 0; hold = 0;
      };
      shuffle();
      const step = () => {
        if (i >= N - 1) return;
        swapped = -1;
        if (arr[j] > arr[j + 1]) { [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]; swapped = j; }
        j++;
        if (j >= N - 1 - i) { j = 0; i++; }
      };
      return {
        draw(dt) {
          const { w, h } = st;
          ctx.fillStyle = '#0b0a12';
          ctx.fillRect(0, 0, w, h);
          if (i >= N - 1) {
            hold += dt;
            if (hold > 1.6) shuffle();
          } else {
            acc += dt * (80 + st.hoverT * 320);
            while (acc >= 1) { step(); acc -= 1; }
          }
          const pad = w * 0.07, bw = (w - pad * 2) / N, base = h * 0.86, maxH = h * 0.72;
          const sweep = i >= N - 1 ? hold / 0.6 : -1;
          for (let k = 0; k < N; k++) {
            const bh = arr[k] * maxH;
            let c = 'rgba(242,239,233,0.22)';
            if (k >= N - i) c = 'rgba(124,92,255,0.85)';
            if (k === j || k === j + 1) c = ACCENT;
            if (swapped >= 0 && (k === swapped || k === swapped + 1)) c = ACCENT;
            if (sweep >= 0 && k / N < sweep) c = k / N > sweep - 0.12 ? ACCENT : 'rgba(124,92,255,0.85)';
            ctx.fillStyle = c;
            ctx.fillRect(pad + k * bw + bw * 0.18, base - bh, bw * 0.64, bh);
          }
          ctx.fillStyle = 'rgba(242,239,233,0.14)';
          ctx.fillRect(pad, base + 6, w - pad * 2, 1);
        },
      };
    },
  };

  /* ---------- work: horizontal scroll ---------- */

  (() => {
    const sec = $('.work');
    const sticky = $('.work__sticky');
    const track = $('.work__track');
    const bar = $('.work__progress span');
    const idxEl = $('#workIdx');
    const cards = $$('.card', track);
    let dist = 0, x = 0, lastIdx = '';

    const measure = () => {
      dist = Math.max(0, track.scrollWidth - sticky.clientWidth);
      sec.style.setProperty('--dist', `${dist}px`);
    };
    measure();
    addEventListener('resize', measure);
    if (document.fonts) document.fonts.ready.then(measure);

    loop.add(dt => {
      const r = sec.getBoundingClientRect();
      const total = r.height - sticky.clientHeight;
      const p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      const target = p * dist;
      const nx = REDUCED ? target : damp(x, target, 8, dt);
      const vx = (nx - x) / Math.max(dt, 1e-3);
      x = nx;
      if (r.bottom < 0 || r.top > innerHeight) return;
      track.style.transform = `translate3d(${(-x).toFixed(2)}px, 0, 0)`;
      track.style.setProperty('--vel', clamp(vx * -0.004, -8, 8).toFixed(2));
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
      const idx = String(Math.min(cards.length, Math.round(p * (cards.length - 1)) + 1)).padStart(2, '0');
      if (idx !== lastIdx) { idxEl.textContent = idx; lastIdx = idx; }
    });

    track.addEventListener('focusin', e => {
      const el = e.target.closest('.card, .work__all');
      if (!el || !dist || !el.matches(':focus-visible')) return;
      const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const top = sec.getBoundingClientRect().top + scrollY;
      scrollTo(0, top + clamp(el.offsetLeft - pad, 0, dist));
    });

    cards.forEach(card => {
      const canvas = $('canvas', card);
      const ctx = canvas.getContext('2d');
      const st = { w: 0, h: 0, t: Math.random() * 10, mx: -1e4, my: -1e4, hover: false, hoverT: 0, visible: false };
      const scene = SCENES[card.dataset.art](ctx, st);
      const resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        st.w = canvas.clientWidth;
        st.h = canvas.clientHeight;
        canvas.width = Math.round(st.w * dpr);
        canvas.height = Math.round(st.h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (scene.init) scene.init();
      };
      new ResizeObserver(resize).observe(canvas);
      onVisible(card, e => { st.visible = e.isIntersecting; });

      let first = true;
      card.addEventListener('pointerenter', e => {
        track(e);
        st.hover = true;
        if (FINE) card.classList.add('is-tilting');
        if (first) { first = false; Power.gain(100, e.clientX, e.clientY); }
      });
      card.addEventListener('focus', () => {
        if (!first) return;
        first = false;
        const r = card.getBoundingClientRect();
        Power.gain(100, r.left + r.width / 2, r.top + r.height / 2, true);
      });
      const track = e => {
        const cr = canvas.getBoundingClientRect();
        st.mx = ((e.clientX - cr.left) / cr.width) * st.w;
        st.my = ((e.clientY - cr.top) / cr.height) * st.h;
      };
      card.addEventListener('pointermove', e => {
        track(e);
        if (!FINE) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--rx', `${((0.5 - py) * 9).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${((px - 0.5) * 11).toFixed(2)}deg`);
        card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      });
      card.addEventListener('pointerleave', () => {
        st.hover = false;
        card.classList.remove('is-tilting');
        ['--rx', '--ry', '--gx', '--gy'].forEach(v => card.style.removeProperty(v));
      });

      loop.add(dt => {
        if (!st.visible) return;
        st.t += REDUCED ? dt * 0.15 : dt;
        st.hoverT = damp(st.hoverT, st.hover ? 1 : 0, 5, dt);
        if (!st.hover && st.hoverT < 0.02) { st.mx = -1e4; st.my = -1e4; }
        scene.draw(REDUCED ? dt * 0.15 : dt);
      });
    });
  })();

  /* ---------- stack: physics cluster ---------- */

  const Stack = (() => {
    const sec = $('.stack');
    const canvas = $('.stack__canvas');
    const ctx = canvas.getContext('2d');

    const SIZE = { 1: 1, 2: 1.45, 3: 2.1 };
    let w = 0, h = 0, dpr = 1, balls = [], started = false, visible = false;
    let hover = null, rect = canvas.getBoundingClientRect();
    const drag = { ball: null, ox: 0, oy: 0, id: -1 };
    const local = { x: -1e4, y: -1e4, inside: false };

    const build = () => {
      const mobile = w < 640 || h < 500;
      const items = mobile ? TECH.slice(0, 24) : TECH;
      const sumS2 = items.reduce((a, [, tier]) => a + SIZE[tier] ** 2, 0);
      const k = Math.sqrt(((mobile ? 0.34 : 0.27) * w * h) / (Math.PI * sumS2));
      const minFs = mobile ? 10 : 12;
      const prev = new Map(balls.map(b => [b.label, b]));
      balls = items.map(([label, tier]) => {
        const lines = label.split(' ');
        ctx.font = `600 100px ${FONT}`;
        const em = Math.max(...lines.map(l => ctx.measureText(l).width)) / 100;
        const r = Math.max(k * SIZE[tier], (em * minFs) / 1.5, lines.length * minFs * 0.9);
        const fs = Math.max(minFs, Math.min(r * (tier === 3 ? 0.36 : 0.33), (1.5 * r) / em, (1.25 * r) / (lines.length * 1.05)));
        const old = prev.get(label);
        return {
          label, lines, tier, r, fs, m: r * r, hot: 0, in: old ? old.in : false,
          x: old ? old.x : w / 2 + (Math.random() - 0.5) * w * 0.5,
          y: old ? old.y : -r - Math.random() * h * 0.9,
          vx: old ? old.vx : 0, vy: old ? old.vy : 300 + Math.random() * 300,
        };
      });
    };

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      const nw = canvas.clientWidth, nh = canvas.clientHeight;
      if (!nw || !nh) return;
      if (w && balls.length) balls.forEach(b => { b.x *= nw / w; b.y *= nh / h; });
      w = nw; h = nh;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      build();
    };
    new ResizeObserver(resize).observe(canvas);
    if (document.fonts) document.fonts.ready.then(() => { if (w) build(); });

    onVisible(sec, e => {
      visible = e.isIntersecting;
      if (e.intersectionRatio > 0.3) started = true;
    }, { threshold: [0, 0.3] });

    const pick = (x, y) => {
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) return b;
      }
      return null;
    };
    const toLocal = (cx, cy) => ({ x: cx - rect.left, y: cy - rect.top });

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || drag.ball) return;
      rect = canvas.getBoundingClientRect();
      const p = toLocal(e.clientX, e.clientY);
      const b = pick(p.x, p.y);
      if (!b) return;
      drag.ball = b;
      drag.id = e.pointerId;
      drag.ox = p.x - b.x;
      drag.oy = p.y - b.y;
      local.x = p.x; local.y = p.y;
      canvas.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
      Cursor.set('drag');
    });
    canvas.addEventListener('pointermove', e => {
      if (drag.ball && e.pointerId !== drag.id) return;
      const p = toLocal(e.clientX, e.clientY);
      local.x = p.x; local.y = p.y;
    });
    const release = (e, fling) => {
      const b = drag.ball;
      if (!b || e.pointerId !== drag.id) return;
      drag.ball = null;
      root.classList.remove('is-dragging');
      const sp = Math.hypot(b.vx, b.vy), max = 3200;
      if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
      if (fling && sp > 900) Power.gain(50, e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', e => release(e, true));
    canvas.addEventListener('pointercancel', e => release(e, false));
    canvas.addEventListener('lostpointercapture', e => release(e, false));
    // On touch, a quick swipe still scrolls the page; press and hold a bubble to grab it.
    let touchOnBall = false, touchT0 = 0;
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      rect = canvas.getBoundingClientRect();
      const p = toLocal(t.clientX, t.clientY);
      touchOnBall = !!pick(p.x, p.y);
      touchT0 = e.timeStamp;
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (touchOnBall && e.cancelable && e.timeStamp - touchT0 >= 120) e.preventDefault();
    }, { passive: false });

    const step = dt => {
      const cx = w / 2, cy = h * 0.55;
      const SUB = 3, hdt = dt / SUB;
      const fric = Math.exp(-2.6 * hdt);
      for (let s = 0; s < SUB; s++) {
        for (const b of balls) {
          if (b === drag.ball) {
            const tx = local.x - drag.ox, ty = local.y - drag.oy;
            const nx = lerp(b.x, tx, 0.45), ny = lerp(b.y, ty, 0.45);
            b.vx = (nx - b.x) / hdt;
            b.vy = (ny - b.y) / hdt;
            b.x = nx; b.y = ny;
            continue;
          }
          const dx = cx - b.x, dy = cy - b.y, d = Math.hypot(dx, dy) || 1;
          const pull = Math.min(d, 320) * 2.4;
          b.vx += (dx / d) * pull * hdt;
          b.vy += (dy / d) * pull * hdt;
          if (local.inside && !drag.ball) {
            const ex = b.x - local.x, ey = b.y - local.y, ed = Math.hypot(ex, ey) || 1, R = b.r + 80;
            if (ed < R) {
              const f = (1 - ed / R) * 2800;
              b.vx += (ex / ed) * f * hdt;
              b.vy += (ey / ed) * f * hdt;
            }
          }
          b.vx *= fric;
          b.vy *= fric;
          b.x += b.vx * hdt;
          b.y += b.vy * hdt;
        }
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          for (let j = i + 1; j < balls.length; j++) {
            const b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r + 3;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = min - d;
            const ia = a === drag.ball ? 0 : 1 / a.m, ib = b === drag.ball ? 0 : 1 / b.m, sum = ia + ib;
            if (!sum) continue;
            a.x -= nx * over * (ia / sum); a.y -= ny * over * (ia / sum);
            b.x += nx * over * (ib / sum); b.y += ny * over * (ib / sum);
            const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (vn < 0) {
              const imp = (-(1 + 0.4) * vn) / sum;
              a.vx -= imp * ia * nx; a.vy -= imp * ia * ny;
              b.vx += imp * ib * nx; b.vy += imp * ib * ny;
            }
          }
        }
        for (const b of balls) {
          if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
          if (b.x > w - b.r) { b.x = w - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
          if (b.y > h - b.r) { b.y = h - b.r; b.vy = -Math.abs(b.vy) * 0.5; }
          if (b.in) {
            if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
          } else if (b.y > b.r) {
            b.in = true;
          }
        }
      }
    };

    const draw = dt => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of balls) {
        b.hot = damp(b.hot, b === hover || b === drag.ball ? 1 : 0, 12, dt);
        const r = b.r * (1 + b.hot * 0.07);
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, TAU);
        if (b.tier === 3) {
          ctx.shadowColor = 'rgba(200,255,46,0.45)';
          ctx.shadowBlur = 40 + b.hot * 30;
          ctx.fillStyle = ACCENT;
        } else if (b.tier === 2) {
          ctx.shadowColor = 'rgba(124,92,255,0.5)';
          ctx.shadowBlur = b.hot * 30;
          ctx.fillStyle = VIOLET;
        } else {
          ctx.fillStyle = b.hot > 0.05 ? `rgba(242,239,233,${(0.08 + b.hot * 0.9).toFixed(2)})` : 'rgba(17,15,27,0.92)';
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        if (b.tier === 1 || b.hot > 0.05) {
          ctx.lineWidth = 1 + b.hot;
          ctx.strokeStyle = b.tier === 1 ? `rgba(242,239,233,${(0.22 + b.hot * 0.6).toFixed(2)})` : FG;
          ctx.stroke();
        }
        ctx.fillStyle = b.tier === 3 ? BG : b.tier === 2 ? '#fff' : b.hot > 0.5 ? BG : 'rgba(242,239,233,0.86)';
        ctx.font = `600 ${b.fs.toFixed(1)}px ${FONT}`;
        const lh = b.fs * 1.02;
        b.lines.forEach((l, i) => ctx.fillText(l, b.x, b.y + (i - (b.lines.length - 1) / 2) * lh + b.fs * 0.04));
      }
    };

    loop.add(dt => {
      if (!visible || !started) return;
      rect = canvas.getBoundingClientRect();
      const lp = toLocal(pointer.x, pointer.y);
      if (!drag.ball) { local.x = lp.x; local.y = lp.y; }
      local.inside = FINE && pointer.active && document.elementFromPoint(pointer.x, pointer.y) === canvas;
      hover = local.inside && !drag.ball ? pick(local.x, local.y) : null;
      if (local.inside || drag.ball) Cursor.set(drag.ball || hover ? 'drag' : '');
      step(REDUCED ? dt * 0.6 : dt);
      draw(dt);
    });

    return {
      get dragging() { return !!drag.ball; },
      blast(x, y, s) {
        if (!visible || !started) return;
        rect = canvas.getBoundingClientRect();
        const p = toLocal(x, y), reach = Math.max(w, h);
        for (const b of balls) {
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
          const f = s * 3400 * Math.max(0.15, 1 - d / reach);
          b.vx += (dx / d) * f;
          b.vy += (dy / d) * f;
        }
      },
    };
  })();

  /* ---------- section mood + hero parallax ---------- */

  (() => {
    const secs = $$('[data-dim]');
    const name = $('.hero__name');
    loop.add(() => {
      const mid = innerHeight / 2;
      for (const s of secs) {
        const r = s.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) { Bg.dim = parseFloat(s.dataset.dim) || 0; break; }
      }
      if (REDUCED) return;
      const y = scrollY;
      if (y > innerHeight * 1.3) return;
      name.style.opacity = clamp(1 - (y / innerHeight) * 1.1, 0, 1).toFixed(3);
    });
  })();

  /* ---------- clock ---------- */

  (() => {
    const el = $('#clock');
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const tick = () => { el.textContent = fmt.format(new Date()); };
    tick();
    setInterval(tick, 1000);
  })();

  /* ---------- boot: loader → intro ---------- */

  const fontsReady = document.fonts
    ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))])
    : Promise.resolve();

  const intro = () => {
    root.classList.add('is-ready');
    if (!REDUCED) FlexType.kick(1);
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: 0.15 });
    $$('[data-reveal]').forEach(el => io.observe(el));
  };

  const loader = $('.loader');
  if (REDUCED || !loader) {
    if (loader) loader.remove();
    fontsReady.then(intro);
  } else {
    const num = $('.loader__num', loader);
    const line = $('.loader__line', loader);
    const D = 1500, t0 = performance.now();
    const run = now => {
      const p = clamp((now - t0) / D, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      num.textContent = String(Math.round(e * 100)).padStart(3, '0');
      num.style.fontVariationSettings = `"wght" ${Math.round(200 + e * 700)}, "wdth" ${(75 + e * 50).toFixed(1)}`;
      line.style.transform = `scaleX(${e.toFixed(4)})`;
      if (p < 1) { requestAnimationFrame(run); return; }
      fontsReady.then(() => {
        loader.classList.add('is-done');
        setTimeout(intro, 250);
        setTimeout(() => loader.remove(), 1300);
      });
    };
    requestAnimationFrame(run);
  }

  const failed = new WeakSet();
  requestAnimationFrame(function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - (frame.last || now)) / 1000, 1 / 20);
    frame.last = now;
    const t = now / 1000;
    loop.forEach(fn => {
      try {
        fn(dt, t);
      } catch (err) {
        if (!failed.has(fn)) { failed.add(fn); console.error(err); }
      }
    });
  });

  window.__jmBoot = 1;
})();
