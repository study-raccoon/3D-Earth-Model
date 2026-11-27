
function mat4() {
  const m = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  m.matrix = true;
  return m;
}

function mult(a, b) {
  const r = mat4();
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] + a[i][3] * b[3][j];
  return r;
}

function radians(deg) { return deg * Math.PI / 180; }
function subtract(u, v) { return u.map((x, i) => x - v[i]); }
function dot(u, v) { return u.reduce((s, x, i) => s + x * v[i], 0); }
function cross(u, v) { return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
function normalize(u) { const len = Math.hypot(...u); return u.map(x => x / len); }

function translate(x, y, z) { const m = mat4(); m[0][3] = x; m[1][3] = y; m[2][3] = z; return m; }
function scalem(x, y, z) { const m = mat4(); m[0][0] = x; m[1][1] = y; m[2][2] = z; return m; }

function rotate(angle, axis) {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(radians(angle)), s = Math.sin(radians(angle)), o = 1 - c;
  const m = mat4();
  m[0] = [x * x * o + c, x * y * o - z * s, x * z * o + y * s, 0];
  m[1] = [x * y * o + z * s, y * y * o + c, y * z * o - x * s, 0];
  m[2] = [x * z * o - y * s, y * z * o + x * s, z * z * o + c, 0];
  return m;
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(radians(fovy) / 2), d = far - near, m = mat4();
  m[0][0] = f / aspect;
  m[1][1] = f;
  m[2][2] = -(near + far) / d;
  m[2][3] = -2 * near * far / d;
  m[3][2] = -1;
  m[3][3] = 0;
  return m;
}

function lookAt(eye, at, up) {
  const v = normalize(subtract(at, eye));
  const n = normalize(cross(v, up));
  const u = cross(n, v);
  const m = mat4();
  m[0] = [...n, -dot(n, eye)];
  m[1] = [...u, -dot(u, eye)];
  m[2] = [-v[0], -v[1], -v[2], dot(v, eye)];
  return m;
}

function flatten(v) {
  if (!v.matrix) return new Float32Array(v.flat());
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) out[j * 4 + i] = v[i][j];
  return out;
}
