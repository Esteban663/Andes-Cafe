import { supabase, must } from '../supabase.js';
import { esc, money, num } from '../ui.js';

/**
 * Normaliza la URL de Looker Studio a su forma "embed".
 * Acepta tanto la URL del informe (…/reporting/ID/page/X) como la de incrustación (…/embed/reporting/…).
 * Devuelve '' si no es un dominio de Looker Studio (evita iframes arbitrarios).
 */
export function lookerEmbedUrl(raw) {
  const url = (raw ?? '').trim();
  if (!url) return '';
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const okHost = u.protocol === 'https:' && ['lookerstudio.google.com', 'datastudio.google.com'].includes(u.hostname);
  if (!okHost || !/\/reporting\//.test(u.pathname)) return '';
  if (!u.pathname.startsWith('/embed/')) u.pathname = u.pathname.replace(/^(\/u\/\d+)?\/reporting\//, '/embed/reporting/');
  return u.toString();
}

export async function renderHome(root) {
  const embed = lookerEmbedUrl(import.meta.env.VITE_LOOKER_EMBED_URL);

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p class="muted">Resumen en vivo desde Supabase y analítica interactiva de Looker Studio.</p>
      </div>
    </section>

    <section class="kpis" id="kpis" aria-label="Indicadores clave">
      ${['Ventas completadas', 'Ingresos', 'Ticket promedio', 'Clientes', 'Productos con stock bajo']
        .map((l) => `<article class="kpi"><span class="kpi-label">${l}</span><strong class="kpi-value">…</strong></article>`)
        .join('')}
    </section>

    <section class="card pad">
      <div class="embed-head">
        <h2>Analítica de ventas</h2>
        ${embed ? `<a class="btn small" href="${esc(embed.replace('/embed/reporting/', '/reporting/'))}" target="_blank" rel="noopener noreferrer">Abrir en Looker Studio ↗</a>` : ''}
      </div>
      ${
        embed
          ? `<div class="embed" id="embedBox">
               <iframe title="Dashboard de ventas en Looker Studio" src="${esc(embed)}" loading="lazy"
                 allowfullscreen referrerpolicy="no-referrer-when-downgrade"
                 sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
             </div>
             <p class="muted small-note">Usa los filtros del informe (rango de fechas, categoría, estado…). Los datos provienen de las vistas de Supabase; los registros nuevos aparecen al actualizar los datos del informe.</p>`
          : `<div class="empty">
               <p><strong>El dashboard aún no está configurado.</strong></p>
               <p>Publica tu informe de Looker Studio (<em>Archivo → Insertar informe → Habilitar incrustación</em>), copia la URL del <code>src</code> y guárdala en la variable <code>VITE_LOOKER_EMBED_URL</code>. Consulta el README, sección 5.</p>
             </div>`
      }
    </section>`;

  try {
    const k = await must(supabase.rpc('resumen_kpis'));
    const vals = [num(k.ventas_completadas), money(k.ingresos), money(k.ticket_promedio), num(k.clientes), num(k.productos_bajo_stock)];
    root.querySelectorAll('.kpi-value').forEach((el, i) => (el.textContent = vals[i]));
    if (k.productos_bajo_stock > 0) root.querySelectorAll('.kpi')[4].classList.add('warn');
  } catch (err) {
    root.querySelectorAll('.kpi-value').forEach((el) => (el.textContent = '—'));
    console.error('No se pudieron cargar los KPIs', err);
  }
}
