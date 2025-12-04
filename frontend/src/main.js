import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="page">
    <header class="hero">
      <div class="hero__content">
        <p class="eyebrow">ORS Post • WebGIS periklanan luar ruang</p>
        <h1>Temukan titik billboard terbaik dengan peta interaktif</h1>
        <p class="subtitle">
          Cek jangkauan isochrone, cari titik terdekat, dan ambil keputusan cepat untuk lokasi iklan luar ruang.
        </p>
        <div class="hero__actions">
          <a class="btn primary" href="/home.html">Buka peta sekarang</a>
          <a class="btn ghost" href="#features">Lihat fitur</a>
        </div>
        <div class="hero__meta">
          <div>
            <span class="dot"></span>
            Backend ORS siap pakai & data billboard terhubung.
          </div>
          <div>
            <span class="dot"></span>
            Didukung MapLibre & OpenRouteService untuk analisis rute.
          </div>
        </div>
      </div>
      <div class="hero__card">
        <div class="glow"></div>
        <div class="card__content">
          <p class="card__label">Pratinjau insight</p>
          <h3>Isi peta dengan data real-time</h3>
          <ul>
            <li>Hitung jangkauan 10 menit berkendara</li>
            <li>Pilih titik billboard langsung di peta</li>
            <li>Gunakan traffic preset untuk simulasi macet</li>
          </ul>
          <a class="btn secondary" href="/home.html">Mulai dari peta</a>
        </div>
      </div>
    </header>

    <section id="features" class="section features">
      <div class="section__header">
        <p class="eyebrow">Fitur utama</p>
        <h2>Semua alat yang Anda butuhkan dalam satu layar</h2>
        <p class="subtitle">Jelajahi, analisis, dan bagikan temuan Anda tanpa harus berpindah tab.</p>
      </div>
      <div class="feature-grid">
        <article class="feature-card">
          <div class="icon">🗺️</div>
          <h3>Peta interaktif</h3>
          <p>MapLibre dengan layer billboard, isochrone, dan highlight untuk memudahkan navigasi.</p>
        </article>
        <article class="feature-card">
          <div class="icon">⏱️</div>
          <h3>Analisis jangkauan</h3>
          <p>Hitung radius waktu atau jarak, lengkap dengan opsi traffic dan hindari tol.</p>
        </article>
        <article class="feature-card">
          <div class="icon">📍</div>
          <h3>Nearest search</h3>
          <p>Temukan billboard terdekat dari titik pilihan, lalu sorot dan terbangkan kamera.</p>
        </article>
        <article class="feature-card">
          <div class="icon">⚙️</div>
          <h3>Terintegrasi API</h3>
          <p>Terhubung dengan ORS backend dan endpoint data billboard untuk otomatisasi.</p>
        </article>
      </div>
    </section>

    <section class="section cta" id="gunakan">
      <div class="cta__text">
        <p class="eyebrow">Gunakan sekarang</p>
        <h2>Buka halaman peta dan mulai eksplorasi</h2>
        <p class="subtitle">Masuk ke halaman peta untuk mengukur jangkauan, menguji skenario rute, dan memilih lokasi billboard prioritas.</p>
        <div class="cta__actions">
          <a class="btn primary" href="/home.html">Pergi ke peta</a>
          <a class="link" href="/home.html">Lihat mode isochrone & nearest →</a>
        </div>
      </div>
      <div class="steps">
        <div class="step">
          <span class="step__number">1</span>
          <div>
            <h4>Pilih titik billboard</h4>
            <p>Klik salah satu titik di peta untuk memunculkan insight jangkauan.</p>
          </div>
        </div>
        <div class="step">
          <span class="step__number">2</span>
          <div>
            <h4>Atur skenario</h4>
            <p>Ganti mode waktu/jarak, profil kendaraan, dan tingkat kemacetan.</p>
          </div>
        </div>
        <div class="step">
          <span class="step__number">3</span>
          <div>
            <h4>Ambil keputusan</h4>
            <p>Gunakan hasil area jangkauan untuk memilih lokasi iklan terbaik.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section about">
      <div class="section__header">
        <p class="eyebrow">Tentang proyek</p>
        <h2>Didukung data terbuka dan workflow produksi</h2>
        <p class="subtitle">Kami membangun ORS Post untuk mempermudah tim pemasaran dan GIS dalam menguji efektivitas titik billboard menggunakan data OpenStreetMap.</p>
      </div>
      <div class="about__grid">
        <div class="quote">
          <p class="quote__text">“Dashboard ini memotong waktu analisis lapangan kami hingga 50%. Tim bisa melihat alternatif lokasi iklan tanpa harus turun ke jalan terlebih dahulu.”</p>
          <p class="quote__author">— Mira, Lead Marketing Planner</p>
        </div>
        <div class="stats">
          <div class="stat">
            <span class="stat__value">500+</span>
            <span class="stat__label">Titik billboard siap dianalisis</span>
          </div>
          <div class="stat">
            <span class="stat__value">3x</span>
            <span class="stat__label">Lebih cepat menemukan lokasi potensial</span>
          </div>
          <div class="stat">
            <span class="stat__value">24/7</span>
            <span class="stat__label">API & peta selalu tersedia</span>
          </div>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div class="footer__brand">
        <h3>ORS Post</h3>
        <p>Platform analitik billboard berbasis peta dan API OpenRouteService.</p>
      </div>
      <div class="footer__links">
        <div>
          <h4>Dokumentasi</h4>
          <a href="https://openrouteservice.org/dev/#/" target="_blank" rel="noreferrer">OpenRouteService API</a>
          <a href="https://maplibre.org/" target="_blank" rel="noreferrer">MapLibre GL</a>
        </div>
        <div>
          <h4>Kontak</h4>
          <a href="mailto:team@orspost.test">team@orspost.test</a>
          <a href="https://wa.me/6281234567890" target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
        <div>
          <h4>Social</h4>
          <a href="https://www.linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
      <p class="footer__note">Siap digunakan: buka peta, pilih billboard, dan dapatkan insight jangkauan.</p>
    </footer>
  </div>
`
