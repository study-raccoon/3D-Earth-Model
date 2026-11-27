const LAT_SEG = 128, LON_SEG = 256;
const TILT = 23.44;
const EARTH_KM = 6371;
const DAY_MS = 86400000;

function lonLatToDir(lon, lat) {
  const a = radians(lon), b = radians(lat);
  return [Math.cos(b) * Math.cos(a), Math.sin(b), -Math.cos(b) * Math.sin(a)];
}

function buildMesh(terrain, exag) {
  const n = (LAT_SEG + 1) * (LON_SEG + 1);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), tex = new Float32Array(n * 2), water = new Float32Array(n);
  for (let j = 0; j <= LAT_SEG; j++) {
    const lat = 90 - 180 * j / LAT_SEG;
    for (let i = 0; i <= LON_SEG; i++) {
      const lon = -180 + 360 * i / LON_SEG, v = j * (LON_SEG + 1) + i;
      const h = Math.max(0, sample(terrain.elev, lon, lat));
      const r = 1 + exag * h / EARTH_KM;
      const d = lonLatToDir(lon, lat);
      pos.set([d[0] * r, d[1] * r, d[2] * r], v * 3);
      tex.set([i / LON_SEG, 1 - j / LAT_SEG], v * 2);
      water[v] = sample(terrain.land, lon, lat) > 0.5 ? 0 : 1;
    }
  }
  const index = new Uint16Array(LAT_SEG * LON_SEG * 6);
  let k = 0;
  for (let j = 0; j < LAT_SEG; j++)
    for (let i = 0; i < LON_SEG; i++) {
      const a = j * (LON_SEG + 1) + i, b = a + LON_SEG + 1;
      index.set([a, b, a + 1, a + 1, b, b + 1], k);
      k += 6;
    }
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3];
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const w = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const f = cross(u, w);
    for (const p of [a, b, c]) { nor[p] += f[0]; nor[p + 1] += f[1]; nor[p + 2] += f[2]; }
  }
  for (let j = 0; j <= LAT_SEG; j++) {
    const a = j * (LON_SEG + 1) * 3, b = a + LON_SEG * 3;
    for (let q = 0; q < 3; q++) { const s = nor[a + q] + nor[b + q]; nor[a + q] = s; nor[b + q] = s; }
  }
  for (let v = 0; v < n; v++) {
    const p = v * 3, len = Math.hypot(nor[p], nor[p + 1], nor[p + 2]);
    let m = len > 1e-12 ? [nor[p] / len, nor[p + 1] / len, nor[p + 2] / len] : normalize([pos[p], pos[p + 1], pos[p + 2]]);
    if (m[0] * pos[p] + m[1] * pos[p + 1] + m[2] * pos[p + 2] < 0) m = m.map(x => -x);
    nor.set(m, p);
  }
  return { pos, nor, tex, water, index };
}

function colorCanvas(terrain, grid) {
  const c = document.createElement('canvas');
  c.width = GRID_W;
  c.height = GRID_H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(GRID_W, GRID_H);
  for (let j = 0; j < GRID_H; j++) {
    const lat = 90 - (j + 0.5) * 180 / GRID_H;
    for (let i = 0; i < GRID_W; i++) {
      const k = j * GRID_W + i, col = colorAt(terrain, k, lat);
      img.data.set([col[0], col[1], col[2], 255], k * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  if (grid) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    for (let lon = -150; lon < 180; lon += 30) { const x = (lon + 180) / 360 * GRID_W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GRID_H); ctx.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * GRID_H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GRID_W, y); ctx.stroke(); }
  }
  return c;
}

function sunState(ms) {
  const d = new Date(ms);
  const dayOfYear = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS;
  const orbit = 360 * (dayOfYear - 171) / 365.25;
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const subLon = ((-15 * (hours - 12)) % 360 + 540) % 360 - 180;
  return {
    sunWorld: [Math.cos(radians(orbit)), 0, Math.sin(radians(orbit))],
    spin: 15 * (hours - 12) - orbit,
    declination: TILT * Math.cos(radians(orbit)),
    subLon,
  };
}

function compile(gl) {
  const program = gl.createProgram();
  for (const [id, type] of [['vertex-shader', gl.VERTEX_SHADER], ['fragment-shader', gl.FRAGMENT_SHADER]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, document.getElementById(id).text);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(program, s);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}

function createEarth(canvas) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) return null;
  const program = compile(gl);
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  const loc = name => gl.getUniformLocation(program, name);
  const u = {
    mv: loc('modelViewMatrix'), proj: loc('projectionMatrix'), sun: loc('sunDir'),
    ambient: loc('ambient'), diffuse: loc('useDiffuse'), specular: loc('useSpecular'),
  };
  const buffers = {};
  for (const [name, size] of [['vPosition', 3], ['vNormal', 3], ['vTexCoord', 2], ['vWater', 1]]) {
    buffers[name] = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
    const a = gl.getAttribLocation(program, name);
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a);
  }
  const indexBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(loc('texture'), 0);

  let terrain = null, exag = 40, grid = false, count = 0;
  let light = { ambient: 0.1, diffuse: true, specular: true };
  let cam = { yaw: 0, pitch: 15, dist: 3.2 };
  let time = Date.now();

  function uploadMesh() {
    const m = buildMesh(terrain, exag);
    for (const [name, data] of [['vPosition', m.pos], ['vNormal', m.nor], ['vTexCoord', m.tex], ['vWater', m.water]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.index, gl.STATIC_DRAW);
    count = m.index.length;
  }

  function uploadTexture() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, colorCanvas(terrain, grid));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function frame() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && count) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const s = sunState(time);
      const model = mult(rotate(-TILT, [0, 0, 1]), rotate(s.spin, [0, 1, 0]));
      const p = radians(cam.pitch), y = radians(cam.yaw);
      const eye = [cam.dist * Math.cos(p) * Math.sin(y), cam.dist * Math.sin(p), cam.dist * Math.cos(p) * Math.cos(y)];
      const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
      gl.uniformMatrix4fv(u.mv, false, flatten(mult(view, model)));
      gl.uniformMatrix4fv(u.proj, false, flatten(perspective(45, w / h, 0.05, 50)));
      const sw = s.sunWorld;
      gl.uniform3fv(u.sun, [0, 1, 2].map(r => view[r][0] * sw[0] + view[r][1] * sw[1] + view[r][2] * sw[2]));
      gl.uniform1f(u.ambient, light.ambient);
      gl.uniform1f(u.diffuse, light.diffuse ? 1 : 0);
      gl.uniform1f(u.specular, light.specular ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.3;
    cam.pitch = Math.max(-80, Math.min(80, cam.pitch + (e.clientY - drag.y) * 0.3));
    drag = { x: e.clientX, y: e.clientY };
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { drag = null; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.dist = Math.max(1.4, Math.min(8, cam.dist * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });

  return {
    setTerrain(t) { terrain = t; uploadMesh(); uploadTexture(); },
    setExaggeration(k) { exag = k; if (terrain) uploadMesh(); },
    setGrid(on) { grid = on; if (terrain) uploadTexture(); },
    setLight(l) { light = { ...light, ...l }; },
    setCamera(c) { cam = { ...cam, ...c }; },
    setTime(ms) { time = ms; },
  };
}
