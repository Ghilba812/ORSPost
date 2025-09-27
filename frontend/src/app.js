import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import RulerControl from '@mapbox-controls/ruler';
import '@mapbox-controls/ruler/src/index.css';
import './style.css';


// ====== CONFIG ======
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000';

// ====== MAP ======
const map = new maplibregl.Map({
  container: 'map',
  style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  center: [107.6098, -6.9147], // Bandung
  zoom: 12
});

window.mapboxgl = maplibregl;
map.on('load', async () => {
  // controls (safe to add here)
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  const ruler = new RulerControl({ units: 'kilometers' });
  map.addControl(ruler, 'bottom-right');

  // watch ruler state to avoid click conflicts
  let rulerActive = false;
  map.on('ruler.on',  () => { rulerActive = true;  console.log('Ruler aktif'); });
  map.on('ruler.off', () => { rulerActive = false; console.log('Ruler nonaktif'); });

  // ... your sources/layers/load billboards (keep existing code) ...

  // guard: don't fire billboard clicks while measuring
  map.on('click','billboards', (e) => {
    if (rulerActive) return;
    onBillboardClick(e);
  });
});

// health check
const apiStatusEl = document.getElementById('apiStatus');
fetch(`${API_BASE}/healthz`).then(r => r.ok ? r.json() : Promise.reject())
  .then(() => { apiStatusEl.textContent = 'OK'; apiStatusEl.className = 'ok'; })
  .catch(() => { apiStatusEl.textContent = 'OFFLINE'; apiStatusEl.className = 'bad'; });

// inputs
const modeSel = document.getElementById('mode');
const minutesInput = document.getElementById('minutes');
const distanceInput = document.getElementById('distance_km');
const lblMin = document.getElementById('lbl-min');
const lblDist = document.getElementById('lbl-dist');
const profileSel = document.getElementById('profile');
const trafficSel = document.getElementById('traffic');
const avoidCb = document.getElementById('avoidHighways');
const nocacheCb = document.getElementById('nocache');
const insightEl = document.getElementById('insight');
const rowProfile = document.getElementById('row-profile');

const ALLOWED_MINUTES = [5, 10, 15, 20, 25, 30];

function snapMinutes() {
  let v = Number(minutesInput.value) || 10;
  if (v < 5) v = 5;
  if (v > 30) v = 30;
  // snap ke nilai terdekat di ALLOWED_MINUTES
  v = ALLOWED_MINUTES.reduce((p, c) =>
    Math.abs(c - v) < Math.abs(p - v) ? c : p
  , ALLOWED_MINUTES[0]);
  minutesInput.value = v;
}
minutesInput.addEventListener('change', snapMinutes);
modeSel.addEventListener('change', () => {
  if (modeSel.value === 'time') snapMinutes();
});


function updateUIVisibility() {
  const isTime = modeSel.value === 'time';
  const isFoot = profileSel.value === 'foot-walking';

  // time vs distance inputs
  minutesInput.style.display = isTime ? '' : 'none';
  lblMin.style.display = isTime ? '' : 'none';
  distanceInput.style.display = isTime ? 'none' : '';
  lblDist.style.display = isTime ? 'none' : '';

  // traffic
  document.getElementById('row-traffic').style.display = (!isTime || isFoot) ? 'none' : '';

  // avoid highways
  document.getElementById('row-avoid').style.display = (!isTime || isFoot) ? 'none' : '';

  // profile hidden on distance
  rowProfile.style.display = isTime ? '' : 'none';
}
modeSel.addEventListener('change', updateUIVisibility);
profileSel.addEventListener('change', updateUIVisibility);
updateUIVisibility();

// ====== SOURCES / LAYERS ======
map.on('load', async () => {
  // isochrone layers
  map.addSource('iso', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'iso-fill', type: 'fill', source: 'iso',
    paint: { 'fill-color': '#4b61d1', 'fill-opacity': 0.28 }
  });
  map.addLayer({
    id: 'iso-outline', type: 'line', source: 'iso',
    paint: { 'line-color': '#2f3e8f', 'line-width': 1 }
  });

  // billboards
  map.addSource('billboards', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'billboards', type: 'circle', source: 'billboards',
    paint: { 'circle-radius': 5, 'circle-color': '#e4572e', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }
  });

  // load billboard points
  const pts = await fetch(`${API_BASE}/api/billboards`).then(r => r.json());
  map.getSource('billboards').setData({
    type: 'FeatureCollection',
    features: pts.map(b => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+b.lon, +b.lat] },
      properties: { id: b.id, address: b.address || '' }
    }))
  });

  map.on('mouseenter', 'billboards', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'billboards', () => map.getCanvas().style.cursor = '');
  map.on('click', 'billboards', onBillboardClick);
});

async function onBillboardClick(e) {
  const f = e.features[0];
  const id = Number(f.properties.id);
  const address = f.properties.address || '';        // <— ambil address

  const mode = modeSel.value;
  const minutes = Number(minutesInput.value) || 10;
  const distance_km = Number(distanceInput.value) || 2;
  const profile = profileSel.value;
  const traffic = trafficSel.value;
  const avoidHighways = !!avoidCb.checked;
  const nocache = nocacheCb.checked ? '?nocache=1' : '';

  map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 12) });

  showInsight({ loading: true, id, mode, minutes, distance_km, profile, traffic });

  try {
    // build/fetch isochrone
    const iso = await fetch(`${API_BASE}/api/isochrone${nocache}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billboard_id: id, mode, minutes, distance_km, profile, traffic, avoidHighways })
    }).then(r => r.json());

    if (iso?.feature?.geometry) {
      map.getSource('iso').setData({ type: 'FeatureCollection', features: [iso.feature] });
    } else {
      map.getSource('iso').setData({ type: 'FeatureCollection', features: [] });
    }

    // insights
    const out = await fetch(`${API_BASE}/api/iso-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billboard_id: id, mode, minutes, distance_km, profile, traffic, avoidHighways })
    }).then(r => r.json());

    showInsight({
      loading: false, id, address, mode, minutes, distance_km, profile, traffic,
      population: out?.population ?? 0,
      poi_groups: out?.poi_groups ?? [],
      categories: out?.categories ?? []
    });
  } catch (err) {
    console.error(err);
    showInsight({ error: true });
  }
}
// =============== render helper ===============
function renderPoiGroups(poi_groups) {
  if (!Array.isArray(poi_groups) || poi_groups.length === 0) {
    return '<i>No POI found</i>';
  }
  return poi_groups.map(g => {
    const itemsHtml = g.items
      .map(it => `${esc(it.category)}: <b>${Number(it.count).toLocaleString()}</b>`)
      .join('<br/>');
    return `
      <div style="margin:6px 0;">
        <div><b>${esc(g.group)}</b> — <span class="muted">${Number(g.total).toLocaleString()}</span></div>
        <div style="margin-left:10px">${itemsHtml}</div>
      </div>
    `;
  }).join('');
}
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function showInsight(opts) {
  if (opts.loading) {
    insightEl.innerHTML = `
      <div><b>Billboard #${opts.id}</b><br>
        <span class="muted">${esc(opts.address) || '<i>no address</i>'}</span>
      </div>
      Generating <code>${opts.profile}</code> — ${opts.mode === 'time' ? `${opts.minutes} min` : `${opts.distance_km} km`
      } — traffic <code>${opts.traffic}</code>…
    `;
    return;
  }
  if (opts.error) {
    insightEl.innerHTML = `<span class="bad">Error fetching data.</span>`;
    return;
  }

  const poiHtml = renderPoiGroups(opts.poi_groups);

  insightEl.innerHTML = `
    <div><b>Billboard #${opts.id}</b><br>
      <span class="muted">${esc(opts.address) || '<i>no address</i>'}</span>
    </div>
    <div class="muted">Mode: <b>${opts.mode}</b> —
      ${opts.mode === 'time' ? `${opts.minutes} min` : `${opts.distance_km} km`}
    </div>
    <div>Profile: <code>${opts.profile}</code></div>
    <div>Traffic: <code>${opts.traffic}</code></div>
    <div style="margin-top:6px;">Population: <b>${Number(opts.population || 0).toLocaleString()}</b></div>
    <div style="margin-top:6px;"><b>POI</b>:</div>
    <div>${poiHtml}</div>
  `;
}

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
  if (map.getSource('iso')) {
    map.getSource('iso').setData({ type: 'FeatureCollection', features: [] });
  }
  insightEl.innerHTML = 'Klik titik billboard untuk melihat isochrone & insight.';
});
