import { supabase, must } from '../supabase.js';
import { esc, dateTime, badge } from '../ui.js';

export async function renderAuditoria(root) {
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>Auditoría</h1>
        <p class="muted">Cada alta, cambio o baja en Productos y Clientes se registra automáticamente con un trigger de PostgreSQL. Solo lectura.</p>
      </div>
      <div class="actions"><button class="btn" id="reload">Actualizar</button></div>
    </section>
    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>Fecha</th><th>Tabla</th><th>Operación</th><th>Registro</th><th>Usuario</th><th>Detalle</th></tr></thead>
        <tbody><tr><td colspan="6" class="muted">Cargando…</td></tr></tbody>
      </table>
    </div>`;

  async function load() {
    const logs = await must(supabase.from('auditoria_logs').select('*').order('id', { ascending: false }).limit(200));
    const kind = { INSERT: 'ok', UPDATE: 'warn', DELETE: 'danger' };
    root.querySelector('tbody').innerHTML = logs.length
      ? logs
          .map(
            (l) => `<tr>
              <td data-label="Fecha">${esc(dateTime(l.created_at))}</td>
              <td data-label="Tabla">${esc(l.tabla)}</td>
              <td data-label="Operación">${badge(l.operacion, kind[l.operacion])}</td>
              <td data-label="Registro">#${esc(l.registro_id)}</td>
              <td data-label="Usuario">${esc(l.usuario)}</td>
              <td data-label="Detalle"><details><summary>Ver JSON</summary>
                <pre>${esc(JSON.stringify({ antes: l.datos_anteriores, despues: l.datos_nuevos }, null, 2))}</pre></details></td>
            </tr>`,
          )
          .join('')
      : `<tr><td colspan="6" class="muted">Sin registros de auditoría.</td></tr>`;
  }

  root.querySelector('#reload').onclick = load;
  await load();
}
