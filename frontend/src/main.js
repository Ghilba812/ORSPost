import './style.css'

const MAP_ROUTE = '/map/'

const heroContent = {
  eyebrow: 'ORS Post • WebGIS periklanan luar ruang',
  title: 'Temukan titik billboard terbaik dengan peta interaktif',
  subtitle:
    'Cek jangkauan isochrone, cari titik terdekat, dan ambil keputusan cepat untuk lokasi iklan luar ruang.',
  highlights: [
    'Backend ORS siap pakai & data billboard terhubung.',
    'Didukung MapLibre & OpenRouteService untuk analisis rute.',
  ],
}

const featureCards = [
  {
    icon: '🗺️',
    title: 'Peta interaktif',
    desc: 'MapLibre dengan layer billboard, isochrone, dan highlight untuk navigasi cepat.',
  },
  {
    icon: '⏱️',
    title: 'Analisis jangkauan',
    desc: 'Hitung radius waktu atau jarak, lengkap dengan opsi traffic dan hindari tol.',
  },
  {
    icon: '📍',
    title: 'Nearest search',
    desc: 'Temukan billboard terdekat dari titik pilihan, lalu sorot dan terbangkan kamera.',
  },
  {
    icon: '⚙️',
    title: 'Terintegrasi API',
    desc: 'Terhubung dengan ORS backend dan endpoint data billboard untuk otomatisasi.',
  },
]

const steps = [
  {
    title: 'Pilih titik billboard',
    desc: 'Klik salah satu titik di peta untuk memunculkan insight jangkauan.',
  },
  {
    title: 'Atur skenario',
    desc: 'Ganti mode waktu/jarak, profil kendaraan, tingkat kemacetan, atau hindari tol.',
  },
  {
    title: 'Ambil keputusan',
    desc: 'Gunakan area jangkauan untuk memilih lokasi iklan terbaik dan siap dikirim ke klien.',
  },
]

const footerLinks = [
  {
    title: 'Dokumentasi',
    links: [
      { label: 'OpenRouteService API', href: 'https://openrouteservice.org/dev/#/' },
      { label: 'MapLibre GL', href: 'https://maplibre.org/' },
    ],
  },
  {
    title: 'Produk',
    links: [
      { label: 'Buka peta', href: MAP_ROUTE },
      { label: 'Checklist data billboard', href: '#features' },
    ],
  },
  {
    title: 'Kontak',
    links: [
      { label: 'team@orspost.test', href: 'mailto:team@orspost.test' },
      { label: 'WhatsApp', href: 'https://wa.me/6281234567890' },
    ],
  },
]

const navLinks = [
  { label: 'Peta', href: MAP_ROUTE, aria: 'Buka peta billboard' },
  { label: 'Data', href: '#features', aria: 'Lihat ringkasan data billboard' },
  { label: 'Tentang', href: '#about', aria: 'Pelajari workflow ORS Post' },
]

const Navbar = () => `
  <header class="navbar">
    <a href="/" class="navbar__brand" aria-label="Kembali ke halaman utama ORS Post">ORS Post</a>
    <nav aria-label="Menu utama">
      <ul class="navbar__links">
        ${navLinks
          .map(
            (link) =>
              `<li><a href="${link.href}" aria-label="${link.aria}">${link.label}</a></li>`,
          )
          .join('')}
      </ul>
    </nav>
    <div class="navbar__cta">
      <a class="btn primary" href="${MAP_ROUTE}" aria-label="Mulai dari peta interaktif">Buka peta</a>
    </div>
  </header>
`

const Hero = () => `
  <header class="hero">
    <div class="hero__content">
      <p class="eyebrow">${heroContent.eyebrow}</p>
      <h1>${heroContent.title}</h1>
      <p class="subtitle">${heroContent.subtitle}</p>
      <div class="hero__actions">
        <a class="btn primary" href="${MAP_ROUTE}" aria-label="Buka peta interaktif ORS Post">Buka peta sekarang</a>
        <a class="btn ghost" href="#features" aria-label="Lihat fitur utama ORS Post">Lihat fitur</a>
      </div>
      <div class="hero__meta">
        ${heroContent.highlights
          .map((text) => `<div><span class="dot"></span>${text}</div>`)
          .join('')}
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
        <a class="btn secondary" href="${MAP_ROUTE}" aria-label="Mulai eksplorasi dari peta">Mulai dari peta</a>
      </div>
    </div>
  </header>
`

const FeatureGrid = () => `
  <section id="features" class="section features">
    <div class="section__header">
      <p class="eyebrow">Fitur utama</p>
      <h2>Semua alat yang Anda butuhkan dalam satu layar</h2>
      <p class="subtitle">Jelajahi, analisis, dan bagikan temuan Anda tanpa harus berpindah tab.</p>
    </div>
    <div class="feature-grid">
      ${featureCards
        .map(
          (card) => `
            <article class="feature-card">
              <div class="icon">${card.icon}</div>
              <h3>${card.title}</h3>
              <p>${card.desc}</p>
            </article>
          `,
        )
        .join('')}
    </div>
  </section>
`

const HowItWorks = () => `
  <section class="section cta" id="about">
    <div class="cta__text">
      <p class="eyebrow">Cara kerja</p>
      <h2>Pilih titik, atur skenario, dapatkan insight</h2>
      <p class="subtitle">
        Landing page ini langsung terhubung ke rute peta. Dalam beberapa klik Anda bisa melihat coverage,
        nearest billboard, serta statistik titik yang relevan.
      </p>
      <div class="cta__actions">
        <a class="btn primary" href="${MAP_ROUTE}" aria-label="Buka peta untuk mulai analisis">Buka peta</a>
        <a class="link" href="${MAP_ROUTE}" aria-label="Lihat contoh rute peta">Lihat rute map →</a>
      </div>
    </div>
    <div class="steps">
      ${steps
        .map(
          (step, idx) => `
            <div class="step">
              <span class="step__number">${idx + 1}</span>
              <div>
                <h4>${step.title}</h4>
                <p>${step.desc}</p>
              </div>
            </div>
          `,
        )
        .join('')}
    </div>
  </section>
`

const AboutSection = () => `
  <section class="section about">
    <div class="section__header">
      <p class="eyebrow">Tentang ORS Post</p>
      <h2>Didukung data terbuka dan workflow produksi</h2>
      <p class="subtitle">
        Kami membangun ORS Post untuk mempermudah tim pemasaran dan GIS dalam menguji efektivitas titik billboard
        menggunakan data OpenStreetMap.
      </p>
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
`

const Footer = () => `
  <footer class="footer">
    <div class="footer__brand">
      <h3>ORS Post</h3>
      <p>Platform analitik billboard berbasis peta dan API OpenRouteService.</p>
    </div>
    <div class="footer__links">
      ${footerLinks
        .map(
          (group) => `
            <div>
              <h4>${group.title}</h4>
              ${group.links
                .map(
                  (link) =>
                    `<a href="${link.href}" ${link.href.startsWith('http') ? 'target="_blank" rel="noreferrer"' : ''}>${link.label}</a>`,
                )
                .join('')}
            </div>
          `,
        )
        .join('')}
    </div>
    <p class="footer__note">Siap digunakan: buka peta, pilih billboard, dan dapatkan insight jangkauan.</p>
  </footer>
`

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="page">
    ${Navbar()}
    ${Hero()}
    ${FeatureGrid()}
    ${HowItWorks()}
    ${AboutSection()}
    ${Footer()}
  </div>
`
