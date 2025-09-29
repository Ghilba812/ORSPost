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
const genBtn        = document.getElementById('genBtn'); // optional tombol Generate

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
  map.addLayer({ id: 'billboards-selected', type: 'circle', source: 'billboards',
    paint: {'circle-radius': 6, 'circle-color': '#FFD12A', 'circle-stroke-width': 1,'circle-stroke-color': '#000000ff'},
    filter: ['in', ['get', 'id'], ['literal', []]]     // awalnya tidak ada yang terpilih
  });

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
      .map(it=>`${esc(it.category)}: ${Number(it.count).toLocaleString()}`)
      .join('<br/>');
    return `
      <div style="margin:6px 0;">
        <div><b>${esc(g.group)}</b> — <span class="muted"><b>${Number(g.total).toLocaleString()}</b></span></div>
        <div style="margin-left:10px">${items}</div>
      </div>`;
  }).join('');
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

  // sorot kuning titik yang dipilih
  highlightBillboard(selectedBillboard.id);

  map.flyTo({ center: selectedBillboard.coords, zoom: Math.max(map.getZoom(), 15) });
  renderOverview(selectedBillboard);

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
const anlNearestBtn= document.getElementById('anl-nearest');
const anlResultsEl = document.getElementById('anl-results');
const anlAddrInput = document.getElementById('anl-address');
const anlGeocodeBtn = document.getElementById('anl-geocode');

// Geocode 
anlGeocodeBtn?.addEventListener('click', async () => {
  const q = anlAddrInput.value.trim();
  if (!q) return;
  anlResultsEl.innerHTML = 'Geocoding…';

  try {
    const resp = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${import.meta.env.VITE_ORS_KEY}&text=${encodeURIComponent(q)}`);
    const data = await resp.json();
    if (!data.features || !data.features.length) {
      anlResultsEl.innerHTML = '<span class="bad">Alamat tidak ditemukan.</span>';
      return;
    }

    const [lon, lat] = data.features[0].geometry.coordinates;
    setAnalysisPoint(lon, lat);

    // tambahkan marker
    if (analysisMarker) analysisMarker.remove();
    analysisMarker = new maplibregl.Marker({ color: '#10B981' })
      .setLngLat([lon, lat])
      .addTo(map);

    map.flyTo({ center:[lon,lat], zoom:14 });
    anlResultsEl.innerHTML = `Hasil geocode: [${lat.toFixed(5)}, ${lon.toFixed(5)}]`;
  } catch(err){
    console.error(err);
    anlResultsEl.innerHTML = '<span class="bad">Gagal geocoding.</span>';
  }
});

let pickMode  = false;     // sedang mode pick point?
let analysisPoint   = null;      // {lon,lat}
let analysisMarker = null;

// Helper: set/clear titik analisis
function setAnalysisPoint(lon, lat) {
  analysisPoint = {lon, lat};
  anlPtLabel.textContent = `[${lat.toFixed(5)}, ${lon.toFixed(5)}]`;

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
  if (analysisMarker) { analysisMarker.remove(); analysisMarker = null; }
}

// Aktifkan mode pick: klik peta = set titik
anlPickBtn?.addEventListener('click', () => {
  pickMode = true;
  anlPtLabel.textContent = 'Click on map…';
  anlResultsEl.innerHTML = '<span class="muted">Klik peta untuk memilih titik acuan.</span>';
  map.getCanvas().style.cursor = 'crosshair';
});

// Nonaktifkan & hapus point
anlClearBtn?.addEventListener('click', () => {
  clearAnalysisPoint();
  setSelectedBillboards([]);  // hapus highlight
});

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


// Panggil API nearest
anlNearestBtn?.addEventListener('click', async () => {
  try {
    if (!analysisPoint) {
      anlResultsEl.innerHTML = '<span class="bad">Tentukan titik dulu (Pick point).</span>';
      return;
    }
    const limit = Math.max(1, Math.min(50, Number(anlLimitInp.value) || 10));
    anlResultsEl.innerHTML = 'Mencari…';

    const url = new URL(`${API_BASE}/api/analysis/nearest`);
    url.searchParams.set('lon', analysisPoint.lon);
    url.searchParams.set('lat', analysisPoint.lat);
    url.searchParams.set('limit', limit);

    const rows = await fetch(url).then(r => r.json());

    if (!Array.isArray(rows) || rows.length === 0) {
      anlResultsEl.innerHTML = '<i>Tidak ada hasil.</i>';
      return;
    }

    // Render list hasil + interaksi klik untuk fly & highlight
    const html = rows.map(r => {
      const km = (Number(r.dist_m)/1000).toFixed(2);
      return `
        <div class="anl-item" data-id="${r.id}" data-lon="${r.lon}" data-lat="${r.lat}">
          <div><b>#${r.id}</b> — ${esc(r.address) || '<i>(no address)</i>'}</div>
          <div class="muted">${km} km</div>
        </div>
      `;
    }).join('');
    anlResultsEl.innerHTML = html;

    // Sorot SEMUA hasil nearest dengan warna kuning
    setSelectedBillboards(rows.map(r => r.id));

    // pasang click handler untuk tiap item
    anlResultsEl.querySelectorAll('.anl-item').forEach(div => {
      div.addEventListener('click', () => {
        const id  = Number(div.dataset.id);
        const lon = Number(div.dataset.lon);
        const lat = Number(div.dataset.lat);

        // sorot marker billboard (pakai fungsi highlight yang sudah ada)
        setSelectedBillboards([id]);

        map.flyTo({ center:[lon,lat], zoom: Math.max(map.getZoom(), 13) });
      });
    });

  } catch (err) {
    console.error(err);
    anlResultsEl.innerHTML = '<span class="bad">Gagal mencari nearest.</span>';
  }
});

