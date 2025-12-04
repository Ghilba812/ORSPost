const loader = document.getElementById('map-loader')
const statusEl = document.getElementById('map-loader__status')

function setStatus(message, tone = 'info') {
  if (!statusEl) return
  statusEl.textContent = message
  statusEl.dataset.tone = tone
}

async function loadMapModule() {
  setStatus('Memuat peta interaktif…')
  try {
    await import('./app.js')
    if (loader) loader.remove()
  } catch (err) {
    console.error('Gagal memuat modul peta', err)
    setStatus('Gagal memuat peta. Muat ulang halaman untuk mencoba lagi.', 'error')
    if (loader) loader.classList.add('error')
  }
}

function scheduleLoad() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadMapModule)
  } else {
    setTimeout(loadMapModule, 0)
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  scheduleLoad()
} else {
  document.addEventListener('DOMContentLoaded', scheduleLoad, { once: true })
}
