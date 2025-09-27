// server.js
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ override: true });

/* ============ App & DB ============ */
const app = express();
app.use(express.json());
app.use(cors());

const pool = new pg.Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

process.on('unhandledRejection', e => console.error('UNHANDLED REJECTION:', e));
process.on('uncaughtException', e => console.error('UNCAUGHT EXCEPTION:', e));

/* ============ Helpers ============ */
const TRAFFIC_FACTOR = { normal: 1.0, light: 0.75, moderate: 0.5, heavy: 0.25 };

function toBool(x, fallback = false) {
  if (typeof x === 'boolean') return x;
  if (x === 'true' || x === '1') return true;
  if (x === 'false' || x === '0') return false;
  return fallback;
}

async function getBillboardLonLat(id) {
  const sql = `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat FROM webgis.billboard WHERE id=$1`;
  const { rows } = await pool.query(sql, [id]);
  if (!rows.length) throw new Error('Billboard not found');
  return rows[0]; // { lon, lat }
}

const ALLOWED_MINUTES = [5,10,15,20,25,30];
function clampMinutes(m) {
  let v = Number(m);
  if (!Number.isFinite(v)) v = 10;
  if (v < 5) v = 5;
  if (v > 30) v = 30;
  return ALLOWED_MINUTES.reduce((p, c) =>
    Math.abs(c - v) < Math.abs(p - v) ? c : p
  , ALLOWED_MINUTES[0]);
}

/* ============ Routes ============ */

// 0) health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// 1) billboard points
app.get('/api/billboards', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, "address" AS address, ST_X(geom) AS lon, ST_Y(geom) AS lat
      FROM webgis.billboard
      ORDER BY id
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/billboards:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2) Isochrone/Radius (time OR distance) — traffic-aware + cache-aware
app.post('/api/isochrone', async (req, res) => {
  try {
    const {
      billboard_id,
      mode = 'time',                 // 'time' | 'distance'
      minutes = 10,                  // time minutes
      distance_km = 2,               // distance kilometers
      profile = 'driving-car',
      smoothing = 0.5,
      traffic = 'normal',            // normal | light | moderate | heavy
      avoidHighways = toBool(req.body?.avoidHighways, false),
    } = req.body;

    if (!billboard_id) throw new Error('billboard_id is required');

    const minutesClamped = clampMinutes(minutes);

    const factor = TRAFFIC_FACTOR[traffic] ?? 1.0;
    const base_s = Math.max(1, Math.round(Number(minutesClamped) * 60));
    const range_s = (mode === 'time') ? Math.max(1, Math.round(base_s * factor)) : 0;
    const range_m = (mode === 'distance') ? Math.max(1, Math.round(Number(distance_km) * 1000)) : 0;

    const noCache = req.query?.nocache === '1' || req.query?.nocache === 'true';

    // 2.1 check cache (key includes avoidHighways & traffic)
    if (!noCache) {
      const qCache = `
        SELECT ST_AsGeoJSON(geom) AS gj
        FROM webgis.iso_cache
        WHERE billboard_id=$1 AND profile=$2 AND rtype=$3
          AND COALESCE(range_s,0)=$4 AND COALESCE(range_m,0)=$5
          AND COALESCE(opts->>'avoidHighways','false')=$6
          AND COALESCE(opts->>'traffic','normal')=$7
        LIMIT 1
      `;
      const rCache = await pool.query(qCache, [
        billboard_id, profile, mode, range_s, range_m, String(avoidHighways), traffic
      ]);
      if (rCache.rows[0]?.gj) {
        return res.json({
          from: 'cache',
          feature: {
            type: 'Feature',
            properties: {
              billboard_id, mode, profile, avoidHighways, traffic,
              minutes: minutesClamped, distance_km: range_m / 1000
            },
            geometry: JSON.parse(rCache.rows[0].gj)
          }
        });
      }
    }

    // 2.2 build geometry
    let geomJSON; // GeoJSON string (geometry only)
    if (mode === 'distance') {
      // buffer (geodesic) via PostGIS
      const qCircle = `
        WITH pt AS ( SELECT geom FROM webgis.billboard WHERE id=$1 )
        SELECT ST_AsGeoJSON( ST_Buffer((SELECT geom FROM pt)::geography, $2)::geometry ) AS gj
      `;
      const rCircle = await pool.query(qCircle, [billboard_id, range_m]);
      geomJSON = rCircle.rows[0]?.gj;
      if (!geomJSON) throw new Error('Failed to build distance buffer');
    } else {
      // time isochrone via ORS v9 (tidak mendukung congestion param)
      const { lon, lat } = await getBillboardLonLat(billboard_id);
      const url = `https://api.openrouteservice.org/v2/isochrones/${profile}`;
      const body = {
        locations: [[Number(lon), Number(lat)]],
        range: [range_s],
        range_type: 'time',
        smoothing,
        ...(avoidHighways ? { options: { avoid_features: ['highways'] } } : {})
      };
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': process.env.ORS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error(`ORS ${resp.status}: ${await resp.text()}`);
      const gj = await resp.json();
      if (!gj.features?.length) throw new Error('Empty ORS result');
      geomJSON = JSON.stringify(gj.features[0].geometry);
    }

    // 2.3 upsert cache — key includes avoidHighways & traffic
    const qUpsert = `
      INSERT INTO webgis.iso_cache (billboard_id, profile, rtype, range_s, range_m, geom, opts)
      VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_GeomFromGeoJSON($6),4326), $7::jsonb)
      ON CONFLICT (billboard_id, profile, rtype,
                   COALESCE(range_s,0), COALESCE(range_m,0),
                   (COALESCE(opts->>'avoidHighways','false')),
                   (COALESCE(opts->>'traffic','normal')))
      DO UPDATE SET geom = EXCLUDED.geom, opts = EXCLUDED.opts
      RETURNING ST_AsGeoJSON(geom) AS gj
    `;
    const rSave = await pool.query(qUpsert, [
      billboard_id, profile, mode,
      (mode === 'time' ? range_s : null),
      (mode === 'distance' ? range_m : null),
      geomJSON,
      JSON.stringify({ avoidHighways, traffic })
    ]);

    const outGeom = JSON.parse(rSave.rows[0].gj);

    res.json({
      from: (mode === 'time' ? 'ors' : 'postgis'),
      feature: {
        type: 'Feature',
        properties: {
          billboard_id, mode, profile, avoidHighways, traffic,
          minutes: minutesClamped, distance_km: range_m / 1000
        },
        geometry: outGeom
      }
    });
  } catch (err) {
    console.error('POST /api/isochrone error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3) Insights (pakai geom dari cache yang match traffic & avoidHighways)
app.post('/api/iso-insights', async (req, res) => {
  try {
    const {
      billboard_id,
      mode = 'time',
      minutes = 10,
      distance_km = 2,
      profile = 'driving-car',
      traffic = 'normal',
      avoidHighways = true,
      categories // optional: array text
    } = req.body;

    if (!billboard_id) throw new Error('billboard_id is required');

    const minutesClamped = clampMinutes(minutes);

    const factor = TRAFFIC_FACTOR[traffic] ?? 1.0;
    const range_s = (mode === 'time') ? Math.max(1, Math.round(Number(minutesClamped) * 60 * factor)) : 0;
    const range_m = (mode === 'distance') ? Math.max(1, Math.round(Number(distance_km) * 1000)) : 0;

    const gq = `
      SELECT ST_AsGeoJSON(geom) AS gj
      FROM webgis.iso_cache
      WHERE billboard_id=$1 AND profile=$2 AND rtype=$3
        AND COALESCE(range_s,0)=$4 AND COALESCE(range_m,0)=$5
        AND COALESCE(opts->>'avoidHighways','false')=$6
        AND COALESCE(opts->>'traffic','normal')=$7
      LIMIT 1
    `;
    const gr = await pool.query(gq, [
      billboard_id, profile, mode,
      range_s, range_m, String(avoidHighways), traffic
    ]);
    if (!gr.rows[0]?.gj) {
      return res.json({ population: 0, categories: [], isochrone: null });
    }

    const isoGeom = gr.rows[0].gj; // GeoJSON string

    // Population (area-weighted)
    const popSql = `
      WITH iso AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography AS g
      ), inter AS (
        SELECT s.jumlah_penduduk,
               ST_Area(s.geom::geography) AS area_desa,
               ST_Area(ST_Intersection(s.geom, (SELECT g::geometry FROM iso))::geography) AS area_int
        FROM webgis.ses_area s
        WHERE ST_Intersects(s.geom, (SELECT g::geometry FROM iso))
      )
      SELECT COALESCE(SUM(jumlah_penduduk * (area_int/NULLIF(area_desa,0))),0)::bigint AS population
      FROM inter WHERE area_int > 0
    `;
    const popRes = await pool.query(popSql, [isoGeom]);
    const population = Number(popRes.rows[0]?.population || 0);

    // POI breakdown
    const poiSql = `
      WITH iso AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS g)
      SELECT
        COALESCE(p.category_group, 'Other') AS g,
        COALESCE(p.category, 'Unknown') AS c,
        COUNT(*)::bigint AS cnt
      FROM webgis.poi2 p, iso
      WHERE ST_Within(p.geom, iso.g)
        ${Array.isArray(categories) && categories.length ? 'AND p.category_group = ANY($2)' : ''}
      GROUP BY 1, 2
      ORDER BY g ASC, cnt DESC
    `;

    const poiRows = Array.isArray(categories) && categories.length
      ? await pool.query(poiSql, [isoGeom, categories])
      : await pool.query(poiSql, [isoGeom]);

    // Bentuk nested: [{ group:'Medical', total: 120, items:[{category:'Hospital', count:40}, ...] }, ...]
    const groupsMap = new Map();
    for (const r of poiRows.rows) {
      const g = r.g;
      const c = r.c;
      const n = Number(r.cnt);
      if (!groupsMap.has(g)) groupsMap.set(g, { group: g, total: 0, items: [] });
      const bucket = groupsMap.get(g);
      bucket.total += n;
      bucket.items.push({ category: c, count: n });
    }

    // sort items di tiap group (desc) dan group-nya juga (desc by total)
    const poiGrouped = Array.from(groupsMap.values())
      .map(g => ({ ...g, items: g.items.sort((a, b) => b.count - a.count) }))
      .sort((a, b) => b.total - a.total);

    res.json({
      population,
      categories: poiRows.rows.map(r => ({ category: r.c, count: Number(r.cnt) })),
      poi_groups: poiGrouped,
      isochrone: JSON.parse(isoGeom)
    });
  } catch (err) {
    console.error('POST /api/iso-insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ============ Start server ============ */
const port = Number(process.env.PORT || 3000);
app.listen(port, '127.0.0.1', () => {
  console.log(`API running on http://127.0.0.1:${port}`);
});
