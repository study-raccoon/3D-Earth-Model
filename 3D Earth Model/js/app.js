const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pad2 = n => String(n).padStart(2, '0');

let simMs = params.has('t') ? Date.parse(params.get('t')) : Date.now();
let playing = params.get('paused') !== '1';
let builtTerrain = null;

let earth = null;
try { earth = createEarth($('gl-canvas')); } catch (err) { console.error(err); }
if (!earth) { $('stage-error').hidden = false; $('loading').hidden = true; }

function fmtLon(lon) { return `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`; }
function fmtLat(lat) { return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`; }

function showTime() {
  const d = new Date(simMs), s = sunState(simMs);
  $('r-time').textContent = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  $('r-decl').textContent = fmtLat(s.declination);
  $('r-noon').textContent = fmtLon(s.subLon);
  $('r-season').textContent = s.declination > 15 ? '여름 무렵' : s.declination < -15 ? '겨울 무렵' : '춘분·추분 무렵';
  if (document.activeElement !== $('date')) $('date').value = d.toISOString().slice(0, 10);
  if (document.activeElement !== $('hour')) $('hour').value = d.getUTCHours() * 60 + d.getUTCMinutes();
  $('hour-out').textContent = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function setTimeFromInputs() {
  const [y, m, day] = $('date').value.split('-').map(Number);
  if (!y) return;
  simMs = Date.UTC(y, m - 1, day) + Number($('hour').value) * 60000;
  showTime();
}

let last = performance.now(), lastText = 0;
function tick(now) {
  if (playing) simMs += (now - last) / 1000 * Number($('speed').value) * 1000;
  last = now;
  earth?.setTime(simMs);
  if (now - lastText > 150) { showTime(); lastText = now; }
  requestAnimationFrame(tick);
}

function setPlaying(on) {
  playing = on;
  $('play-btn').textContent = on ? '일시정지' : '재생';
}

function updateExag() {
  const k = Number($('exag').value);
  $('exag-out').textContent = `×${k}`;
  $('exag-note').textContent = `실제 비율로는 지형이 거의 보이지 않아 높이만 ${k}배로 키웠습니다. 에베레스트가 지구 반지름의 ${(k * 8.8 / EARTH_KM * 100).toFixed(1)}%로 보입니다.`;
  earth?.setExaggeration(k);
}

function updateLight() {
  $('ambient-out').textContent = Number($('ambient').value).toFixed(2);
  earth?.setLight({ ambient: Number($('ambient').value), diffuse: $('use-diffuse').checked, specular: $('use-specular').checked });
}

async function loadHeightImage() {
  const file = $('height-file').files[0];
  if (!file) return;
  try {
    const img = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = GRID_W;
    c.height = GRID_H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, GRID_W, GRID_H);
    earth?.setTerrain(terrainFromPixels(ctx.getImageData(0, 0, GRID_W, GRID_H).data, Number($('height-max').value) || 8848));
    $('source-error').textContent = img.width !== img.height * 2 ? '가로:세로가 2:1이 아니어서 늘려 맞췄습니다. 지형 위치가 어긋날 수 있습니다.' : '';
  } catch {
    $('source-error').textContent = '이미지를 읽지 못했습니다. 다른 파일을 골라 주세요.';
  }
}

for (const r of document.querySelectorAll('input[name="source"]')) {
  r.addEventListener('change', () => {
    const image = r.value === 'image' && r.checked;
    $('image-fields').hidden = !image;
    $('source-error').textContent = '';
    if (!image) earth?.setTerrain(builtTerrain);
    else loadHeightImage();
  });
}
$('height-file').addEventListener('change', loadHeightImage);
$('height-max').addEventListener('change', loadHeightImage);

$('play-btn').addEventListener('click', () => setPlaying(!playing));
$('now-btn').addEventListener('click', () => { simMs = Date.now(); showTime(); });
$('date').addEventListener('change', setTimeFromInputs);
$('hour').addEventListener('input', setTimeFromInputs);
$('exag').addEventListener('input', updateExag);
$('grid').addEventListener('change', () => earth?.setGrid($('grid').checked));
for (const id of ['ambient', 'use-diffuse', 'use-specular']) $(id).addEventListener('input', updateLight);

if (params.has('exag')) $('exag').value = params.get('exag');
if (params.get('grid') === '1') $('grid').checked = true;
if (params.has('speed')) $('speed').value = params.get('speed');
if (params.has('light')) {
  $('use-diffuse').checked = params.get('light').includes('d');
  $('use-specular').checked = params.get('light').includes('s');
}
if (earth) earth.setCamera(Object.fromEntries(['yaw', 'pitch', 'dist'].filter(k => params.has(k)).map(k => [k, Number(params.get(k))])));
setPlaying(playing);
updateLight();
showTime();
requestAnimationFrame(tick);

setTimeout(() => {
  if (!earth) return;
  builtTerrain = buildTerrain();
  updateExag();
  earth.setGrid($('grid').checked);
  earth.setTerrain(builtTerrain);
  $('loading').hidden = true;
  document.body.dataset.ready = '1';
}, 30);
