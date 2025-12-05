// ─────────────────────────────────────────────────────────────
// Imports & style
// ─────────────────────────────────────────────────────────────
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import RulerControl from '@mapbox-controls/ruler';
import '@mapbox-controls/ruler/src/index.css';
import './style.css';

// ─────────────────────────────────────────────────────────────
// Konfigurasi environment
// ─────────────────────────────────────────────────────────────
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const API_BASE     = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000';
const SUITABILITY_KEYS = ['youth','mass','premium','family','commuter'];
const SUITABILITY_SEGMENTS = {
  youth:    'Youth & Entertainment',
  mass:     'Mass Market / FMCG',
  premium:  'Premium & Lifestyle',
  family:   'Family & Household',
  commuter: 'Commuter & Business'
};

// ─────────────────────────────────────────────────────────────
// State global (tab, billboard terpilih, dll.)
// ─────────────────────────────────────────────────────────────
let activeTab = 'overview'; // 'overview' | 'isochrone' | 'analysis'
let selectedBillboard = null; // { id, address, coords:[lon,lat] }
let rulerActive = false;
let suitCategory = 'all'; // 'all' | youth | mass | premium | family | commuter
let suitLayerVisible = false;
let suitFilterOnly = false;
let analysisResults = [];
let analysisSegment = 'youth';
let activeBillboardPopup = null;

// ─────────────────────────────────────────────────────────────
// Referensi DOM (SESUAIKAN ID DI index.html)
// ─────────────────────────────────────────────────────────────
// Global
const apiStatusEl = document.getElementById('apiStatus');

// Overview tab
const bbInfoEl    = document.getElementById('bb-info');
const streetBtn   = document.getElementById('btn-streetview');

// Isochrone tab (form & output)
const modeSel       = document.getElementById('mode');
const minutesInput  = document.getElementById('minutes');
const distanceInput = document.getElementById('distance_km');
const lblMin        = document.getElementById('lbl-min');
const lblDist       = document.getElementById('lbl-dist');
const profileSel    = document.getElementById('profile');
const trafficSel    = document.getElementById('traffic');
const avoidCb       = document.getElementById('avoidHighways');
const nocacheCb     = document.getElementById('nocache');
const isoInsightEl  = document.getElementById('iso-insight'); // container hasil isochrone
const clearBtn      = document.getElementById('clearBtn');
const genBtn        = document.getElementById('genBtn'); // optional tombol Generate

// Layer toggles (opsional)
const chkBB  = document.getElementById('ly-billboards');
const chkIso = document.getElementById('ly-iso');
const chkPoi = document.getElementById('ly-poi'); // kalau ada layer POI
const suitToggle    = document.getElementById('suit-toggle');
const suitCategorySel = document.getElementById('suit-category');
const suitFilterCb    = document.getElementById('suit-filter');
const suitStatusEl   = document.getElementById('suit-status');
const suitLegend     = document.getElementById('suit-legend');
let suitProgressTimer = null;

// ─────────────────────────────────────────────────────────────
// Inisialisasi map
// ─────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  center: [107.6098, -6.9147], // Bandung
  zoom: 12
});

// Untuk beberapa lib pihak ketiga yang refer ke mapboxgl
window.mapboxgl = maplibregl;

// ─────────────────────────────────────────────────────────────
// Saat map siap: tambah kontrol, sumber, layer, dan data
// ─────────────────────────────────────────────────────────────
map.on('load', async () => {
  // Kontrol navigasi & penggaris/ruler
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  const ruler = new RulerControl({ units: 'kilometers' });
  map.addControl(ruler, 'bottom-right');
  map.on('ruler.on',  () => { rulerActive = true;  });
  map.on('ruler.off', () => { rulerActive = false; });

  // Sumber & layer Isochrone (kosong dulu)
  map.addSource('iso', { type:'geojson', data:{ type:'FeatureCollection', features:[] }});
  map.addLayer({ id:'iso-fill', type:'fill', source:'iso',
    paint:{ 'fill-color':'#4b61d1', 'fill-opacity':0.28 }});
  map.addLayer({ id:'iso-outline', type:'line', source:'iso',
    paint:{ 'line-color':'#2f3e8f', 'line-width':1 }});

  // Sumber & layer hex suitability (awalnya hidden)
  map.addSource('hex-suitability', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
  map.addLayer({ id:'hex-suitability-fill', type:'fill', source:'hex-suitability',
    layout:{ visibility:'none' },
    paint:{
      'fill-color': ['interpolate', ['linear'], ['to-number', ['get','score'], 0],
        0,    '#440154',
        0.2,  '#46327e',
        0.4,  '#365c8d',
        0.6,  '#1fa088',
        0.8,  '#6ece58',
        1,    '#fde725'
      ],
      'fill-opacity': 0.65
    }
  });
  map.addLayer({ id:'hex-suitability-outline', type:'line', source:'hex-suitability',
    layout:{ visibility:'none' },
    paint:{ 'line-color':'#0f172a', 'line-width':1, 'line-opacity':0.45 }
  });
  // Keep hex layer just beneath billboards
  if (map.getLayer('billboards')) {
    map.moveLayer('hex-suitability-fill', 'billboards');
    map.moveLayer('hex-suitability-outline', 'billboards');
  }

  // Sumber & layer titik billboard
  map.addSource('billboards', { type:'geojson', data:{ type:'FeatureCollection', features:[] }});
  map.addLayer({ id:'billboards', type:'circle', source:'billboards',
    paint:{ 'circle-radius':4, 'circle-color':'#e4572e', 'circle-stroke-width':1, 'circle-stroke-color':'#fff', 'circle-opacity':0.9 }});
  map.addLayer({ id: 'billboards-selected', type: 'circle', source: 'billboards',
    paint: {'circle-radius': 6, 'circle-color': '#FFD12A', 'circle-stroke-width': 1,'circle-stroke-color': '#000000ff'},
    filter: ['in', ['get', 'id'], ['literal', []]]     // awalnya tidak ada yang terpilih
  });

  // Layer hasil analysis (highlight & label ranking)
  map.addSource('analysis-results', { type:'geojson', data:{ type:'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'analysis-results-circle',
    type: 'circle',
    source: 'analysis-results',
    paint: {
      'circle-radius': 10,
      'circle-color': '#0ea5e9',
      'circle-opacity': 0.7,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0f172a'
    }
  });
  map.addLayer({
    id: 'analysis-results-label',
    type: 'symbol',
    source: 'analysis-results',
    layout: {
      'text-field': ['to-string', ['get','rank']],
      'text-size': 12,
      'text-offset': [0, 0.6],
      'text-anchor': 'top'
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#e0f2fe',
      'text-halo-width': 1.2
    }
  });

  // Ambil data billboard
  const pts = await fetch(`${API_BASE}/api/billboards`).then(r => r.json());
  map.getSource('billboards').setData({
    type:'FeatureCollection',
    features: pts.map(b => ({
      type:'Feature',
      geometry:{ type:'Point', coordinates:[+b.lon, +b.lat] },
      properties:{
        id: b.id,
        title: b.title || '',
        address: b.address || '',
        size_width_m: b.size_width_m,
        size_height_m: b.size_height_m,
        view_distance_max_m: b.view_distance_max_m,
        best_segment: b.best_segment,
        best_score: b.best_score,
        score_youth: b.score_youth,
        score_mass: b.score_mass,
        score_premium: b.score_premium,
        score_family: b.score_family,
        score_commuter: b.score_commuter
      }
    }))
  });
  applyBillboardStyle();

  // UX pointer
  map.on('mouseenter','billboards',() => map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','billboards',() => map.getCanvas().style.cursor='');

  // Klik billboard: pisah perilaku berdasarkan tab aktif
  map.on('click','billboards', (e) => {
    if (rulerActive) return; // lagi ukur jarak → jangan trigger klik billboard
    onBillboardClick(e);
  });

  // Toggle visibility (kalau checkbox ada)
  function setVisibility(layerId, visible) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  }
  if (chkBB)  chkBB.onchange  = () => setVisibility('billboards', chkBB.checked);
  if (chkIso) chkIso.onchange = () => { setVisibility('iso-fill', chkIso.checked); setVisibility('iso-outline', chkIso.checked); };
  if (chkPoi) chkPoi.onchange = () => setVisibility('poi-layer-id', chkPoi.checked); // ganti sesuai id layer POI milikmu

  // Suitability controls
  if (suitCategorySel) suitCategorySel.value = suitCategory;
  if (suitToggle) suitToggle.checked = suitLayerVisible;
  if (suitFilterCb) suitFilterCb.checked = suitFilterOnly;

  if (suitToggle) suitToggle.addEventListener('change', () => {
    if (suitToggle.checked && suitCategory === 'all') {
      suitCategory = 'youth';
      if (suitCategorySel) suitCategorySel.value = 'youth';
    }
    suitLayerVisible = !!suitToggle.checked;
    updateSuitabilityVisibility();
    if (suitLayerVisible) {
      refreshSuitability();
    } else {
      stopSuitProgress();
      setSuitStatus('Suitability off');
    }
  });
  if (suitCategorySel) suitCategorySel.addEventListener('change', () => {
    suitCategory = suitCategorySel.value || 'all';
    if (suitCategory === 'all') {
      suitLayerVisible = false;
      if (suitToggle) suitToggle.checked = false;
      updateSuitabilityVisibility();
      map.getSource('hex-suitability')?.setData({ type:'FeatureCollection', features: [] });
      suitFilterOnly = false;
      if (suitFilterCb) suitFilterCb.checked = false;
      applyBillboardStyle();
      setSuitStatus('Select a category, then toggle show.');
      return;
    }
    if (suitLayerVisible) refreshSuitability();
    applyBillboardStyle();
  });
  if (suitFilterCb) suitFilterCb.addEventListener('change', () => {
    suitFilterOnly = !!suitFilterCb.checked;
    applyBillboardStyle();
  });

  updateSuitabilityVisibility();
  setSuitStatus('Select a category, then toggle show.');
});

// ─────────────────────────────────────────────────────────────
// Healthcheck API (tampilkan OK / OFFLINE)
// ─────────────────────────────────────────────────────────────
fetch(`${API_BASE}/healthz`)
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(() => { if (apiStatusEl){ apiStatusEl.textContent='OK'; apiStatusEl.className='ok'; }})
  .catch(() => { if (apiStatusEl){ apiStatusEl.textContent='OFFLINE'; apiStatusEl.className='bad'; }});

// ─────────────────────────────────────────────────────────────
// Util & helper
// ─────────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function numOrNull(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(x, digits = 2){
  if (!Number.isFinite(x)) return null;
  return Number(x).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtDistance(m){
  const n = Number(m);
  if (!Number.isFinite(n)) return '-';
  if (n >= 1000) return `${(n/1000).toFixed(2)} km`;
  return `${Math.round(n)} m`;
}

function renderPoiGroups(groups){
  if (!Array.isArray(groups) || !groups.length) return '<i>No POI found</i>';
  return `
    <div class="poi-grid">
      ${groups.map(g => {
        const items = (g.items || [])
          .map(it => `
            <div class="poi-item">
              <span class="poi-bullet" aria-hidden="true"></span>
              <span class="poi-name">${esc(it.category)}</span>
              <span class="poi-count">${Number(it.count).toLocaleString()}</span>
            </div>
          `).join('') || '<div class="poi-item muted">No items</div>';
        const badge = (g.group || 'POI').slice(0, 1).toUpperCase();
        return `
          <article class="poi-card">
            <div class="poi-card__top">
              <div class="poi-card__badge">${esc(badge)}</div>
              <div class="poi-card__meta">
                <div class="poi-title">${esc(g.group || 'POI')}</div>
                <div class="poi-total">Total: ${Number(g.total || 0).toLocaleString()}</div>
              </div>
            </div>
            <div class="poi-items">
              ${items}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

// Sorot banyak billboard sekaligus (array of number), atau kosongkan dengan [].
function setSelectedBillboards(ids = []) {
  if (!map.getLayer('billboards-selected')) return;
  // pastikan angka
  const clean = (Array.isArray(ids) ? ids : [ids])
    .map(n => Number(n))
    .filter(n => Number.isFinite(n));
  map.setFilter('billboards-selected', ['in', ['get', 'id'], ['literal', clean]]);
}

// (opsional) alias lama biar kode lain tetap jalan
function highlightBillboard(id){
  setSelectedBillboards([id]);
}

function getSegmentLabel() {
  return SUITABILITY_SEGMENTS[suitCategory] || '';
}

function getSegmentLabelByKey(key) {
  return SUITABILITY_SEGMENTS[key] || '';
}

function applyBillboardStyle(){
  if (!map.getLayer('billboards')) return;
  const segLabel = suitCategory === 'all' ? '' : getSegmentLabel();

  if (!segLabel) {
    // default style: show all equally
    map.setPaintProperty('billboards', 'circle-color', '#e4572e');
    map.setPaintProperty('billboards', 'circle-radius', 4);
    map.setPaintProperty('billboards', 'circle-opacity', 0.9);
    map.setPaintProperty('billboards', 'circle-stroke-width', 1);
    map.setPaintProperty('billboards', 'circle-stroke-color', '#ffffff');
    map.setFilter('billboards', ['all']);
    return;
  }

  const matchExpr = ['==', ['coalesce', ['get','best_segment'], ''], segLabel];

  map.setPaintProperty('billboards', 'circle-color', ['case', matchExpr, '#ffb703', '#9ca3af']);
  map.setPaintProperty('billboards', 'circle-radius', ['case', matchExpr, 6, 4]);
  map.setPaintProperty('billboards', 'circle-opacity', ['case', matchExpr, 0.95, 0.4]);
  map.setPaintProperty('billboards', 'circle-stroke-width', ['case', matchExpr, 1.3, 1]);
  map.setPaintProperty('billboards', 'circle-stroke-color', ['case', matchExpr, '#111827', '#ffffff']);

  if (suitFilterOnly && segLabel) {
    map.setFilter('billboards', ['==', ['coalesce', ['get','best_segment'], ''], segLabel]);
  } else {
    map.setFilter('billboards', ['all']);
  }
}

function updateSuitabilityVisibility(){
  ['hex-suitability-fill','hex-suitability-outline'].forEach(id => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', suitLayerVisible ? 'visible' : 'none');
    }
  });
  if (suitLegend) {
    suitLegend.style.display = suitLayerVisible ? 'block' : 'none';
  }
}

function setSuitStatus(msg){
  if (suitStatusEl) suitStatusEl.textContent = msg;
}

function stopSuitProgress(){
  if (suitProgressTimer){
    clearInterval(suitProgressTimer);
    suitProgressTimer = null;
  }
}

async function refreshSuitability(){
  if (!suitLayerVisible || !map.getSource('hex-suitability')) return;
  const category = suitCategory || 'youth';
  if (category === 'all') {
    map.getSource('hex-suitability').setData({ type:'FeatureCollection', features: [] });
    setSuitStatus('Suitability off (choose category)');
    return;
  }
  const url = new URL(`${API_BASE}/api/hex-suitability`);
  url.searchParams.set('category', category);
  stopSuitProgress();
  let progress = 0;
  setSuitStatus(`Loading suitability... ${progress}%`);
  suitProgressTimer = setInterval(() => {
    progress = Math.min(90, progress + 10);
    setSuitStatus(`Loading suitability... ${progress}%`);
  }, 180);
  try {
    const gj = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    stopSuitProgress();
    const count = Array.isArray(gj?.features) ? gj.features.length : 0;
    setSuitStatus(`Loaded suitability ${category} • 100% (${count} hex)`);
    map.getSource('hex-suitability').setData(gj || { type:'FeatureCollection', features: [] });
    updateSuitabilityVisibility();
  } catch (err) {
    console.error('Failed to load suitability hexes', err);
    stopSuitProgress();
    setSuitStatus('Failed to load suitability');
    map.getSource('hex-suitability').setData({ type:'FeatureCollection', features: [] });
  }
}

// ── Snapping menit (5–30, kelipatan 5)
const ALLOWED_MINUTES = [5,10,15,20,25,30];
function snapMinutes(){
  if (!minutesInput) return;
  let v = Number(minutesInput.value) || 10;
  if (v < 5)  v = 5;
  if (v > 30) v = 30;
  v = ALLOWED_MINUTES.reduce((p,c)=>Math.abs(c-v)<Math.abs(p-v)?c:p, ALLOWED_MINUTES[0]);
  minutesInput.value = v;
}
if (minutesInput) minutesInput.addEventListener('change', snapMinutes);

// ── Tampilkan/sembunyikan kontrol isochrone sesuai mode/profil
function updateUIVisibility(){
  if (!modeSel || !profileSel) return;
  const isTime = modeSel.value === 'time';
  const isFoot = profileSel.value === 'foot-walking';

  if (minutesInput)  minutesInput.style.display = isTime ? '' : 'none';
  if (lblMin)        lblMin.style.display     = isTime ? '' : 'none';
  if (distanceInput) distanceInput.style.display = isTime ? 'none' : '';
  if (lblDist)       lblDist.style.display    = isTime ? 'none' : '';

  const rowTraffic = document.getElementById('row-traffic');
  const rowAvoid   = document.getElementById('row-avoid');
  if (rowTraffic) rowTraffic.style.display = (!isTime || isFoot) ? 'none' : '';
  if (rowAvoid)   rowAvoid.style.display   = (!isTime || isFoot) ? 'none' : '';

  const rowProfile = document.getElementById('row-profile');
  if (rowProfile) rowProfile.style.display = isTime ? '' : 'none';

  if (isTime) snapMinutes();
}
if (modeSel)    modeSel.addEventListener('change', updateUIVisibility);
if (profileSel) profileSel.addEventListener('change', updateUIVisibility);
updateUIVisibility();

// ─────────────────────────────────────────────────────────────
// Tab switching (Overview / Isochrone / Analysis)
// ─────────────────────────────────────────────────────────────
function setTab(name){
  activeTab = name;
  document.querySelectorAll('#sidebar .pane').forEach(p=>p.classList.remove('active'));
  const pane = document.getElementById(`tab-${name}`);
  if (pane) pane.classList.add('active');

  // (opsional) saat pindah dari isochrone ke overview, kosongkan poligon
  if (name !== 'isochrone' && map.getSource('iso')) {
    map.getSource('iso').setData({ type:'FeatureCollection', features:[] });
  }
}
// pasang listener di tombol tab
document.querySelectorAll('#sidebar .tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#sidebar .tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    setTab(btn.dataset.tab); // data-tab="overview" | "isochrone" | "analysis"
  });
});

// ─────────────────────────────────────────────────────────────
// Handler klik billboard
//  - Simpan pilihan & render info overview
//  - HANYA generate isochrone jika tab aktif = "isochrone"
// ─────────────────────────────────────────────────────────────
function showBillboardPopup(feature) {
  if (!feature?.geometry?.coordinates) return;
  if (activeBillboardPopup) activeBillboardPopup.remove();
  const props = feature.properties || {};
  const coords = feature.geometry.coordinates;
  const bestScore = fmtNum(numOrNull(props.best_score), 2);
  const title = props.title || props.address || `Billboard #${props.id}`;
  const bestSeg = props.best_segment ? esc(props.best_segment) : '-';
  const address = props.address ? esc(props.address) : '<i>no address</i>';

  const html = `
    <div><b>${esc(title)}</b></div>
    <div class="muted">${address}</div>
    <div class="muted">Best: ${bestSeg}${bestScore ? ` (score ${bestScore})` : ''}</div>
  `;

  activeBillboardPopup = new maplibregl.Popup({ offset: 12, closeOnMove: true })
    .setLngLat(coords)
    .setHTML(html)
    .addTo(map);
}

function onBillboardClick(e){
  if (pickMode) return;
  const f = e.features[0];
  selectedBillboard = {
    id: Number(f.properties.id),
    address: f.properties.address || '',
    size_width_m: numOrNull(f.properties.size_width_m),
    size_height_m: numOrNull(f.properties.size_height_m),
    view_distance_max_m: numOrNull(f.properties.view_distance_max_m),
    best_segment: f.properties.best_segment || '',
    best_score: numOrNull(f.properties.best_score),
    title: f.properties.title || '',
    coords: f.geometry.coordinates
  };

  // sorot kuning titik yang dipilih
  highlightBillboard(selectedBillboard.id);

  map.flyTo({ center: selectedBillboard.coords, zoom: Math.max(map.getZoom(), 15) });
  renderOverview(selectedBillboard);
  showBillboardPopup(f);

  if (isoInsightEl) {
    isoInsightEl.innerHTML = '<span class="muted">Klik <b>Generate</b> untuk menghitung isochrone & insight.</span>';
  }
}

// ─────────────────────────────────────────────────────────────
// Render informasi billboard pada tab Overview
// ─────────────────────────────────────────────────────────────
function renderOverview(bb){
  if (!bbInfoEl) return;
  bbInfoEl.classList.remove('muted');

  const sizeW = fmtNum(bb.size_width_m);
  const sizeH = fmtNum(bb.size_height_m);
  let sizeText = '-';
  if (sizeW && sizeH) sizeText = `${sizeW} m × ${sizeH} m`;
  else if (sizeW) sizeText = `${sizeW} m`;
  else if (sizeH) sizeText = `${sizeH} m`;

  const viewDist = fmtNum(bb.view_distance_max_m);
  const bestSegment = esc(bb.best_segment || '-');
  const bestScore = fmtNum(bb.best_score, 2);
  const title = bb.title ? esc(bb.title) : `Billboard #${bb.id}`;

  bbInfoEl.innerHTML = `
    <div><b>${title}</b> <span class="muted">#${bb.id}</span></div>
    <div class="muted">${esc(bb.address) || '<i>no address</i>'}</div>
    <div class="muted">Lon/Lat: ${bb.coords[0].toFixed(6)}, ${bb.coords[1].toFixed(6)}</div>
    <div>Ukuran: <b>${sizeText}</b></div>
    <div>Jarak pandang maks: <b>${viewDist ? `${viewDist} m` : '-'}</b></div>
    <div>Best segment: <b>${bestSegment}</b>${bestScore ? ` (score ${bestScore})` : ''}</div>
  `;
  if (streetBtn) {
    streetBtn.disabled = false;
    streetBtn.onclick = () => openStreetView(bb.coords[1], bb.coords[0]); // lat, lon
  }
}

// ─────────────────────────────────────────────────────────────
// Buka Google Street View pada titik billboard
// ─────────────────────────────────────────────────────────────
function openStreetView(lat, lon){
  const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
  window.open(url, '_blank');
}

// ─────────────────────────────────────────────────────────────
// Jalankan isochrone + insights untuk billboard terpilih
//   - Baca input dari form isochrone
//   - Panggil /api/isochrone & /api/iso-insights
//   - Gambar poligon & tampilkan ringkasan
// ─────────────────────────────────────────────────────────────
async function runIsochrone(){
  if (!selectedBillboard) {
    if (isoInsightEl) isoInsightEl.innerHTML = '<span class="bad">Pilih billboard dulu.</span>';
    return;
  }
  if (!modeSel) return; // form belum ada

  const mode         = modeSel.value;
  const minutes      = Number(minutesInput?.value || 10);
  const distance_km  = Number(distanceInput?.value || 2);
  const profile      = profileSel?.value || 'driving-car';
  const traffic      = trafficSel?.value || 'normal';
  const avoidHighways= !!(avoidCb?.checked);
  const nocache      = nocacheCb?.checked ? '?nocache=1' : '';

  if (isoInsightEl) isoInsightEl.innerHTML = 'Menghitung...';

  try {
    // Geometry
    const iso = await fetch(`${API_BASE}/api/isochrone${nocache}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        billboard_id: selectedBillboard.id,
        mode, minutes, distance_km, profile, traffic, avoidHighways
      })
    }).then(r=>r.json());

    if (iso?.feature?.geometry && map.getSource('iso')) {
      map.getSource('iso').setData({ type:'FeatureCollection', features:[iso.feature] });
    } else if (map.getSource('iso')) {
      map.getSource('iso').setData({ type:'FeatureCollection', features:[] });
    }

    // Insights (pop + POI)
    const out = await fetch(`${API_BASE}/api/iso-insights`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        billboard_id: selectedBillboard.id,
        mode, minutes, distance_km, profile, traffic, avoidHighways
      })
    }).then(r=>r.json());

    if (isoInsightEl) {
      isoInsightEl.innerHTML = `
        <div style="margin-top:6px"><b>Billboard #${selectedBillboard.id}</b><br>
          <span class="muted">${esc(selectedBillboard.address) || '<i>no address</i>'}</span>
        </div>
        <div class="muted">Mode: <b>${mode}</b> — ${mode==='time' ? `${minutes} min` : `${distance_km} km`}</div>
        <div>Profile: <code>${profile}</code></div>
        <div>Traffic: <code>${traffic}</code></div>
        <div style="margin-top:6px;">Population: <b>${Number(out?.population||0).toLocaleString()}</b></div>
        <div style="margin-top:6px;"><b>POI</b>:</div>
        ${renderPoiGroups(out?.poi_groups || [])}
      `;
    }
  } catch (err) {
    console.error(err);
    if (isoInsightEl) isoInsightEl.innerHTML = '<span class="bad">Gagal menghitung isochrone.</span>';
  }
}

// ─────────────────────────────────────────────────────────────
// Tombol "Generate" & "Clear" pada tab Isochrone
// ─────────────────────────────────────────────────────────────
if (genBtn) genBtn.addEventListener('click', () => { 
    if (!selectedBillboard) {
    isoInsightEl.innerHTML = '<span class="bad">Pilih billboard dulu.</span>';
    return;
  }
  runIsochrone();
});
if (clearBtn) clearBtn.addEventListener('click', () => {
  if (map.getSource('iso')) {
    map.getSource('iso').setData({ type:'FeatureCollection', features:[] });
  }
  setSelectedBillboards([]);
  if (isoInsightEl) isoInsightEl.innerHTML = 'Klik billboard lalu tekan <b>Generate</b>.';
});

// ===== Analysis tab DOM =====
const anlPickBtn   = document.getElementById('anl-pickpoint');
const anlClearBtn  = document.getElementById('anl-clearpoint');
const anlPtLabel   = document.getElementById('anl-pointlabel');
const anlLimitInp  = document.getElementById('anl-limit');
const anlRunBtn    = document.getElementById('anl-run');
const anlResultsEl = document.getElementById('anl-results');
const anlAddrInput = document.getElementById('anl-address');
const anlGeocodeBtn = document.getElementById('anl-geocode');
const anlSegmentSel = document.getElementById('anl-segment');
const anlStatusEl = document.getElementById('anl-status');
const anlSummaryEl = document.getElementById('anl-summary');

// Geocode 
anlGeocodeBtn?.addEventListener('click', async () => {
  const q = anlAddrInput.value.trim();
  if (!q) return;
  updateAnalysisStatus('Geocoding...');

  try {
    const resp = await fetch(`${API_BASE}/api/geocode?text=${encodeURIComponent(q)}`);
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();

    if (!data.features?.length) {
      updateAnalysisStatus('Alamat tidak ditemukan.', 'bad');
      return;
    }

    const [lon, lat] = data.features[0].geometry.coordinates;
    setAnalysisPoint(lon, lat);

    // Pasang/update marker hijau
    if (analysisMarker) analysisMarker.remove();
    analysisMarker = new maplibregl.Marker({ color: '#10B981' })
      .setLngLat([lon, lat])
      .addTo(map);

    map.flyTo({ center: [lon, lat], zoom: 14 });
    updateAnalysisStatus(`Hasil geocode: [${lat.toFixed(5)}, ${lon.toFixed(5)}]`);
  } catch (err) {
    console.error(err);
    updateAnalysisStatus('Gagal geocoding.', 'bad');
  }
});


let pickMode  = false;     // sedang mode pick point?
let analysisPoint   = null;      // {lon,lat}
let analysisMarker = null;
analysisSegment = anlSegmentSel?.value || 'youth';

function updateAnalysisStatus(msg, tone = 'muted') {
  if (!anlStatusEl) return;
  anlStatusEl.textContent = msg;
  anlStatusEl.className = tone;
}

if (anlSegmentSel) {
  anlSegmentSel.addEventListener('change', () => {
    analysisSegment = anlSegmentSel.value || 'youth';
  });
}

updateAnalysisStatus('Pick a location and run analysis.');

// Helper: set/clear titik analisis
function setAnalysisPoint(lon, lat) {
  analysisPoint = {lon, lat};
  anlPtLabel.textContent = `[${lat.toFixed(5)}, ${lon.toFixed(5)}]`;
  updateAnalysisStatus('Point selected. Pilih segment lalu jalankan analisis.');
  clearAnalysisResults();
  ensureBillboardsVisible();

  // Pakai marker
  if (analysisMarker) analysisMarker.remove();
  analysisMarker = new maplibregl.Marker({ color: '#10B981' })
      .setLngLat([lon, lat])
      .addTo(map);
}

function clearAnalysisPoint(){
  analysisPoint = null;
  anlPtLabel.textContent = 'no point';
  anlResultsEl.textContent = 'belum ada hasil';
  clearAnalysisResults();
  updateAnalysisStatus('Pick a location and run analysis.');
  if (analysisMarker) { analysisMarker.remove(); analysisMarker = null; }
}

// Aktifkan mode pick: klik peta = set titik
anlPickBtn?.addEventListener('click', () => {
  pickMode = true;
  clearAnalysisResults();
  anlPtLabel.textContent = 'Click on map...';
  updateAnalysisStatus('Klik peta untuk memilih titik acuan.');
  map.getCanvas().style.cursor = 'crosshair';
});

// Nonaktifkan & hapus point
// Tangkap klik peta khusus saat mode pick aktif
map.on('click', (e) => {
  if (!pickMode) return;
  const lon = e.lngLat.lng;
  const lat = e.lngLat.lat;
  setAnalysisPoint(lon, lat);

  anlPtLabel.textContent = `Picked [${analysisPoint.lat.toFixed(5)}, ${analysisPoint.lon.toFixed(5)}]`;

  pickMode = false;
  map.getCanvas().style.cursor = '';
});

// -- (PENTING) Saat pick mode aktif, jangan jalankan klik billboard
map.on('click', 'billboards', (e) => {
  if (pickMode) return;           // cegah konflik
  onBillboardClick(e);
});

function clearAnalysisResults(){
  analysisResults = [];
  if (map.getSource('analysis-results')) {
    map.getSource('analysis-results').setData({ type:'FeatureCollection', features: [] });
  }
  setSelectedBillboards([]);
  if (anlResultsEl) {
    anlResultsEl.innerHTML = 'No analysis yet.';
    anlResultsEl.classList.add('muted');
  }
  if (anlSummaryEl) anlSummaryEl.textContent = 'No results yet.';
}

function handleAnalysisFeatureClick(feature){
  if (!feature) return;
  const coords = feature.geometry?.coordinates;
  const props = feature.properties || {};
  if (activeTab !== 'analysis') setTab('analysis');
  setSelectedBillboards([props.id]);
  if (coords) {
    map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 13) });
  }
  // gunakan data billboard asli jika tersedia untuk melengkapi detail popup
  const rendered = map.queryRenderedFeatures({ layers: ['billboards'], filter: ['==', ['get','id'], props.id] })?.[0];
  const targetFeature = rendered || feature;
  onBillboardClick({ features: [targetFeature] });
}

function renderAnalysisResults(fc, segmentKey){
  const features = (fc?.features || []).map((f, idx) => ({
    ...f,
    properties: { ...(f.properties || {}), rank: idx + 1, segment: segmentKey }
  }));
  analysisResults = features;

  if (map.getSource('analysis-results')) {
    map.getSource('analysis-results').setData({ type:'FeatureCollection', features });
  }

  const segLabel = getSegmentLabelByKey(segmentKey);
  if (!features.length) {
    if (anlResultsEl) anlResultsEl.innerHTML = '<i>No billboards found.</i>';
    if (anlSummaryEl) anlSummaryEl.textContent = `0 results for ${segLabel || segmentKey}.`;
    return;
  }

  if (anlSummaryEl) {
    anlSummaryEl.textContent = `${features.length} billboards for ${segLabel || segmentKey}`;
  }

  if (anlResultsEl) {
    anlResultsEl.classList.remove('muted');
    anlResultsEl.innerHTML = features.map(f => {
      const p = f.properties || {};
      const scoreKey = `score_${segmentKey}`;
      const segScore = fmtNum(numOrNull(p[scoreKey]), 2);
      const bestScore = fmtNum(numOrNull(p.best_score), 2);
      const distance = fmtDistance(p.distance_m);
      const title = esc(p.title || p.address || `Billboard #${p.id}`);
      const addr = esc(p.address || '');
      return `
        <article class="analysis-card" data-id="${p.id}">
          <div class="analysis-card__top">
            <span class="analysis-rank">${p.rank}</span>
            <div class="analysis-distance">${distance}</div>
          </div>
          <div><b>${title}</b></div>
          <div class="muted">${addr || '<i>no address</i>'}</div>
          <div class="muted">Best: ${esc(p.best_segment || '-')}${bestScore ? ` (score ${bestScore})` : ''}</div>
          <div class="score-chip">Segment score: ${segScore ?? '-'}</div>
        </article>
      `;
    }).join('');

    anlResultsEl.querySelectorAll('.analysis-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        const feature = analysisResults.find(f => Number(f.properties?.id) === id);
        if (feature) handleAnalysisFeatureClick(feature);
      });
    });
  }

  setSelectedBillboards(features.map(f => f.properties?.id).filter(Boolean));
}

map.on('click','analysis-results-circle', (e) => {
  if (e.features?.[0]) handleAnalysisFeatureClick(e.features[0]);
});
map.on('click','analysis-results-label', (e) => {
  if (e.features?.[0]) handleAnalysisFeatureClick(e.features[0]);
});

function ensureBillboardsVisible(){
  if (chkBB) {
    chkBB.checked = true;
    chkBB.onchange?.();
  }
  if (map.getLayer('billboards')) {
    map.setLayoutProperty('billboards','visibility','visible');
  }
}

async function runAnalysis(){
  try {
    if (!analysisPoint) {
      if (anlResultsEl) anlResultsEl.innerHTML = '<span class="bad">Tentukan titik dulu.</span>';
      updateAnalysisStatus('Tentukan titik dulu.', 'bad');
      return;
    }
    const limit = Math.max(1, Math.min(50, Number(anlLimitInp?.value) || 10));
    const segmentKey = analysisSegment || 'youth';
    updateAnalysisStatus('Running analysis...');
    ensureBillboardsVisible();
    clearAnalysisResults();

    const url = new URL(`${API_BASE}/api/analysis/nearest-billboards`);
    url.searchParams.set('lon', analysisPoint.lon);
    url.searchParams.set('lat', analysisPoint.lat);
    url.searchParams.set('limit', limit);
    url.searchParams.set('segment', segmentKey);

    const fc = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

    if (!fc?.features?.length) {
      updateAnalysisStatus('Tidak ada hasil untuk titik ini.');
      renderAnalysisResults({ features: [] }, segmentKey);
      return;
    }

    updateAnalysisStatus(`Menemukan ${fc.features.length} billboard terdekat.`);
    renderAnalysisResults(fc, segmentKey);
  } catch (err) {
    console.error(err);
    updateAnalysisStatus('Gagal menjalankan analisis.', 'bad');
  }
}

if (anlRunBtn) anlRunBtn.addEventListener('click', runAnalysis);
if (anlClearBtn) anlClearBtn.addEventListener('click', () => {
  clearAnalysisPoint();
  clearAnalysisResults();
  updateAnalysisStatus('Pick a location and run analysis.');
});
