import './styles.css';
import { configured } from './supabase.js';
import { esc } from './ui.js';
import { renderHome } from './pages/home.js';
import { renderVentas } from './pages/ventas.js';
import { renderAuditoria } from './pages/auditoria.js';
import { renderProductos, renderClientes, renderProveedores, renderCompras } from './pages/catalogos.js';

const routes = {
  '': renderHome,
  ventas: renderVentas,
  productos: renderProductos,
  clientes: renderClientes,
  proveedores: renderProveedores,
  compras: renderCompras,
  auditoria: renderAuditoria,
};

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const menuBtn = document.getElementById('menuBtn');

function setupScreen() {
  app.innerHTML = `
    <section class="card pad">
      <h1>Falta configurar Supabase</h1>
      <p>La aplicación necesita las variables de entorno de tu proyecto. Crea un archivo <code>.env</code> en la raíz:</p>
      <pre>VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
VITE_LOOKER_EMBED_URL=https://lookerstudio.google.com/embed/reporting/…</pre>
      <p class="muted">Luego reinicia <code>npm run dev</code>. Detalles en el README.</p>
    </section>`;
}

async function router() {
  const key = location.hash.replace(/^#\/?/, '').split('?')[0];
  const page = routes[key] ?? routes[''];
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.route === (routes[key] ? key : '')));
  nav.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0 });

  if (!configured) return setupScreen();

  // Cada navegación tiene su propio contenedor. Si el usuario cambia de página
  // mientras una anterior carga, el contenedor viejo sale del DOM y su render
  // tardío no pisa a la página nueva. Las páginas pueden re-renderizarse a sí
  // mismas (p. ej. ventas tras registrar) porque su contenedor sigue adjunto.
  const view = document.createElement('div');
  view.innerHTML = '<p class="muted loading">Cargando…</p>';
  app.replaceChildren(view);
  try {
    await page(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<section class="card pad"><h1>No se pudo cargar la página</h1>
      <p>${esc(err?.message ?? err)}</p>
      <p class="muted">Verifica que ejecutaste <code>schema.sql</code> y <code>seed.sql</code> en Supabase y que las variables de entorno son correctas.</p></section>`;
  }
}

menuBtn.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
window.addEventListener('hashchange', router);
router();
