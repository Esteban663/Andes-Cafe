import { supabase, must } from '../supabase.js';
import { esc, money, num, dateTime, toast, friendlyError, badge } from '../ui.js';

const estadoBadge = (e) => badge(e, e === 'completada' ? 'ok' : e === 'pendiente' ? 'warn' : 'danger');

export async function renderVentas(root) {
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h1>Ventas</h1>
        <p class="muted">Registra una venta: se guarda en Supabase, descuenta stock y aparece en el dashboard.</p>
      </div>
    </section>

    <section class="card pad">
      <h2>Nueva venta</h2>
      <form id="saleForm" class="form">
        <div class="grid three">
          <div class="field"><label for="s_cliente">Cliente *</label><select id="s_cliente" required></select></div>
          <div class="field"><label for="s_empleado">Vendedor</label><select id="s_empleado"></select></div>
          <div class="field"><label for="s_metodo">Método de pago *</label><select id="s_metodo" required></select></div>
        </div>
        <div class="items" id="items"></div>
        <div class="sale-footer">
          <button type="button" class="btn" id="addItem">+ Agregar producto</button>
          <div class="total">Total: <strong id="saleTotal">${money(0)}</strong></div>
          <button type="submit" class="btn primary" id="saveSale">Registrar venta</button>
        </div>
      </form>
    </section>

    <section class="page-head spaced"><h2>Últimas ventas</h2></section>
    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Pago</th><th>Estado</th><th class="right">Total</th><th class="right">Acciones</th></tr></thead>
        <tbody id="salesBody"><tr><td colspan="8" class="muted">Cargando…</td></tr></tbody>
      </table>
    </div>
    <dialog class="modal" id="detailDialog"><div class="form" id="detailBody"></div></dialog>`;

  const $ = (id) => root.querySelector(id);
  const [clientes, empleados, metodos, productos] = await Promise.all([
    must(supabase.from('clientes').select('id, nombre, tipo').order('nombre')),
    must(supabase.from('empleados').select('id, nombre').eq('activo', true).order('nombre')),
    must(supabase.from('metodos_pago').select('id, nombre').order('nombre')),
    must(supabase.from('productos').select('id, nombre, precio_venta, stock').eq('activo', true).order('nombre')),
  ]);

  const opts = (list, label) => list.map((x) => `<option value="${x.id}">${esc(label(x))}</option>`).join('');
  $('#s_cliente').innerHTML = `<option value="" disabled selected>Selecciona…</option>${opts(clientes, (c) => `${c.nombre} (${c.tipo})`)}`;
  $('#s_empleado').innerHTML = `<option value="">— sin asignar —</option>${opts(empleados, (e) => e.nombre)}`;
  $('#s_metodo').innerHTML = `<option value="" disabled selected>Selecciona…</option>${opts(metodos, (m) => m.nombre)}`;

  // ------------------------------------------------------------ líneas de la venta
  const itemsBox = $('#items');
  const byId = new Map(productos.map((p) => [String(p.id), p]));

  function addItem() {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <select class="i-prod" aria-label="Producto" required>
        <option value="" disabled selected>Producto…</option>
        ${productos.map((p) => `<option value="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>${esc(p.nombre)} — ${money(p.precio_venta)} (stock ${num(p.stock)})</option>`).join('')}
      </select>
      <input class="i-qty" type="number" min="1" step="1" value="1" aria-label="Cantidad" required />
      <span class="i-sub">${money(0)}</span>
      <button type="button" class="btn small danger i-del" aria-label="Quitar producto">✕</button>`;
    itemsBox.appendChild(row);
    recalc();
  }

  function lines() {
    // Une productos repetidos (la tabla detalle_venta tiene UNIQUE(venta_id, producto_id))
    const map = new Map();
    itemsBox.querySelectorAll('.item').forEach((row) => {
      const id = row.querySelector('.i-prod').value;
      const qty = parseInt(row.querySelector('.i-qty').value, 10);
      if (!id || !qty || qty < 1) return;
      map.set(id, (map.get(id) ?? 0) + qty);
    });
    return [...map].map(([producto_id, cantidad]) => ({ producto_id: Number(producto_id), cantidad }));
  }

  function recalc() {
    let total = 0;
    itemsBox.querySelectorAll('.item').forEach((row) => {
      const p = byId.get(row.querySelector('.i-prod').value);
      const qty = parseInt(row.querySelector('.i-qty').value, 10) || 0;
      const sub = p ? p.precio_venta * qty : 0;
      row.querySelector('.i-sub').textContent = money(sub);
      total += sub;
    });
    $('#saleTotal').textContent = money(total);
  }

  itemsBox.addEventListener('input', recalc);
  itemsBox.addEventListener('click', (e) => {
    if (e.target.closest('.i-del')) {
      if (itemsBox.children.length > 1) e.target.closest('.item').remove();
      recalc();
    }
  });
  $('#addItem').onclick = addItem;
  addItem();

  $('#saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    const items = lines();
    if (!items.length) return toast('Agrega al menos un producto', 'error');
    const btn = $('#saveSale');
    btn.disabled = true;
    try {
      const id = await must(
        supabase.rpc('registrar_venta', {
          p_cliente_id: Number($('#s_cliente').value),
          p_empleado_id: $('#s_empleado').value ? Number($('#s_empleado').value) : null,
          p_metodo_pago_id: Number($('#s_metodo').value),
          p_items: items,
          p_notas: null,
        }),
      );
      toast(`Venta #${id} registrada en Supabase`);
      await renderVentas(root); // recarga formulario (stock actualizado) y listado
    } catch (err) {
      toast(friendlyError(err), 'error');
      btn.disabled = false;
    }
  });

  // ------------------------------------------------------------ listado
  const body = $('#salesBody');
  const ventas = await must(
    supabase
      .from('ventas')
      .select('id, fecha, estado, total, clientes(nombre), empleados(nombre), metodos_pago(nombre)')
      .order('id', { ascending: false })
      .limit(50),
  );
  body.innerHTML = ventas.length
    ? ventas
        .map(
          (v) => `<tr>
            <td data-label="#">${v.id}</td>
            <td data-label="Fecha">${esc(dateTime(v.fecha))}</td>
            <td data-label="Cliente">${esc(v.clientes?.nombre)}</td>
            <td data-label="Vendedor">${esc(v.empleados?.nombre ?? '—')}</td>
            <td data-label="Pago">${esc(v.metodos_pago?.nombre)}</td>
            <td data-label="Estado">${estadoBadge(v.estado)}</td>
            <td data-label="Total" class="right"><strong>${money(v.total)}</strong></td>
            <td class="right nowrap">
              <button class="btn small" data-act="view" data-id="${v.id}">Ver</button>
              ${v.estado !== 'anulada' ? `<button class="btn small" data-act="void" data-id="${v.id}">Anular</button>` : ''}
              <button class="btn small danger" data-act="del" data-id="${v.id}">Eliminar</button>
            </td></tr>`,
        )
        .join('')
    : `<tr><td colspan="8" class="muted">Aún no hay ventas.</td></tr>`;

  const dialog = $('#detailDialog');
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    try {
      if (btn.dataset.act === 'view') {
        const det = await must(
          supabase.from('detalle_venta').select('cantidad, precio_unitario, subtotal, productos(nombre, sku)').eq('venta_id', id),
        );
        $('#detailBody').innerHTML = `
          <h2>Venta #${id}</h2>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Producto</th><th class="right">Cant.</th><th class="right">Precio</th><th class="right">Subtotal</th></tr></thead>
            <tbody>${det
              .map((d) => `<tr><td>${esc(d.productos?.nombre)} <span class="muted">${esc(d.productos?.sku)}</span></td><td class="right">${num(d.cantidad)}</td><td class="right">${money(d.precio_unitario)}</td><td class="right">${money(d.subtotal)}</td></tr>`)
              .join('')}</tbody>
          </table></div>
          <div class="form-actions"><button class="btn primary" id="closeDetail">Cerrar</button></div>`;
        $('#closeDetail').onclick = () => dialog.close();
        dialog.showModal();
      }
      if (btn.dataset.act === 'void') {
        if (!confirm(`¿Anular la venta #${id}? Se devolverá el stock de sus productos.`)) return;
        await must(supabase.rpc('anular_venta', { p_venta_id: id }));
        toast(`Venta #${id} anulada y stock restituido`);
        await renderVentas(root);
      }
      if (btn.dataset.act === 'del') {
        if (!confirm(`¿Eliminar definitivamente la venta #${id}? (No devuelve stock; usa "Anular" para eso.)`)) return;
        await must(supabase.from('ventas').delete().eq('id', id));
        toast(`Venta #${id} eliminada`);
        await renderVentas(root);
      }
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  });
}
