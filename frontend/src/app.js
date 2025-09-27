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

// ─────────────────────────────────────────────────────────────
// State global (tab, billboard terpilih, dll.)
// ─────────────────────────────────────────────────────────────
let activeTab = 'overview'; // 'overview' | 'isochrone' | 'analysis'
let selectedBillboard = null; // { id, address, coords:[lon,lat] }
let rulerActive = false;

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
const genBtn        = document.getElementById('btn-generate'); // optional tombol Generate

// Layer toggles (opsional)
const chkBB  = document.getElementById('ly-billboards');
const chkIso = document.getElementById('ly-iso');
const chkPoi = document.getElementById('ly-poi'); // kalau ada layer POI

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

  // Sumber & layer titik billboard
  map.addSource('billboards', { type:'geojson', data:{ type:'FeatureCollection', features:[] }});
  map.addLayer({ id:'billboards', type:'circle', source:'billboards',
    paint:{ 'circle-radius':5, 'circle-color':'#e4572e', 'circle-stroke-width':1, 'circle-stroke-color':'#fff' }});

  // Ambil data billboard
  const pts = await fetch(`${API_BASE}/api/billboards`).then(r => r.json());
  map.getSource('billboards').setData({
    type:'FeatureCollection',
    features: pts.map(b => ({
      type:'Feature',
      geometry:{ type:'Point', coordinates:[+b.lon, +b.lat] },
      properties:{ id:b.id, address:b.address || '' }
    }))
  });

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

function renderPoiGroups(groups){
  if (!Array.isArray(groups) || !groups.length) return '<i>No POI found</i>';
  return groups.map(g=>{
    const items = (g.items||[])
      .map(it=>`${esc(it.category)}: <b>${Number(it.count).toLocaleString()}</b>`)
      .join('<br/>');
    return `
      <div style="margin:6px 0;">
        <div><b>${esc(g.group)}</b> — <span class="muted">${Number(g.total).toLocaleString()}</span></div>
        <div style="margin-left:10px">${items}</div>
      </div>`;
  }).join('');
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
function onBillboardClick(e){
  const f = e.features[0];
  selectedBillboard = {
    id: Number(f.properties.id),
    address: f.properties.address || '',
    coords: f.geometry.coordinates
  };

  map.flyTo({ center: selectedBillboard.coords, zoom: Math.max(map.getZoom(), 12) });
  renderOverview(selectedBillboard);

  if (activeTab === 'isochrone') {
    runIsochrone();     // jalankan perhitungan
  } else {
    // tampilkan hint di panel isochrone
    if (isoInsightEl) {
      isoInsightEl.innerHTML = '<span class="muted">Buka tab <b>Isochrone</b> untuk menghitung jangkauan.</span>';
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Render informasi billboard pada tab Overview
// ─────────────────────────────────────────────────────────────
function renderOverview(bb){
  if (!bbInfoEl) return;
  bbInfoEl.classList.remove('muted');
  bbInfoEl.innerHTML = `
    <div><b>Billboard #${bb.id}</b></div>
    <div class="muted">${esc(bb.address) || '<i>no address</i>'}</div>
    <div class="muted">Lon/Lat: ${bb.coords[0].toFixed(6)}, ${bb.coords[1].toFixed(6)}</div>
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

  if (isoInsightEl) isoInsightEl.innerHTML = 'Menghitung…';

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
if (genBtn)  genBtn.addEventListener('click', () => { if (activeTab==='isochrone') runIsochrone(); });
if (clearBtn) clearBtn.addEventListener('click', () => {
  if (map.getSource('iso')) {
    map.getSource('iso').setData({ type:'FeatureCollection', features:[] });
  }
  if (isoInsightEl) isoInsightEl.innerHTML = 'Klik billboard lalu tekan <b>Generate</b>.';
});
