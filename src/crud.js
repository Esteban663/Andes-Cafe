import { supabase, must } from './supabase.js';
import { esc, toast, friendlyError } from './ui.js';

/**
 * Genera una página CRUD completa (listar, buscar, crear, editar, eliminar)
 * sobre una tabla de Supabase a partir de una configuración declarativa.
 *
 * cfg = {
 *   table, title, subtitle,
 *   select:  '*, categorias(nombre)',          // columnas + joins (PostgREST)
 *   orderBy: 'id', desc: false,
 *   columns: [{ label, get: row => valor, fmt?: valor => htmlSeguro }],
 *   fields:  [{ name, label, type, required, min, step, options, optional... }],
 *   rowLabel: row => 'texto para el confirm de borrado'
 * }
 * Tipos de campo: text | email | number | date | checkbox | select
 * select.options: [['valor','Etiqueta'], ...]  o  { table, value, label, order, filter }
 */
export function crudPage(cfg) {
  return async function render(root) {
    root.innerHTML = `
      <section class="page-head">
        <div>
          <h1>${esc(cfg.title)}</h1>
          <p class="muted">${esc(cfg.subtitle ?? '')}</p>
        </div>
        <div class="actions">
          <input type="search" class="search" placeholder="Buscar…" aria-label="Buscar en ${esc(cfg.title)}" />
          <button class="btn primary" data-act="new">+ Nuevo</button>
        </div>
      </section>
      <div class="card table-wrap">
        <table class="table">
          <thead><tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th class="right">Acciones</th></tr></thead>
          <tbody><tr><td colspan="${cfg.columns.length + 1}" class="muted">Cargando…</td></tr></tbody>
        </table>
      </div>
      <p class="muted count"></p>
      <dialog class="modal"><form class="form"></form></dialog>`;

    const tbody = root.querySelector('tbody');
    const count = root.querySelector('.count');
    const search = root.querySelector('.search');
    const dialog = root.querySelector('dialog');
    const form = dialog.querySelector('form');
    let rows = [];
    const optionCache = {};

    // ---------- opciones de los <select> (una sola carga por render)
    await Promise.all(
      cfg.fields
        .filter((f) => f.type === 'select')
        .map(async (f) => {
          if (Array.isArray(f.options)) {
            optionCache[f.name] = f.options.map(([value, label]) => ({ value, label }));
            return;
          }
          const o = f.options;
          let q = supabase.from(o.table).select(`${o.value}, ${o.label}`).order(o.order ?? o.label);
          if (o.filter) q = q.eq(o.filter[0], o.filter[1]);
          const data = await must(q);
          optionCache[f.name] = data.map((r) => ({ value: r[o.value], label: r[o.label] }));
        }),
    );

    // ---------- lectura
    async function load() {
      const data = await must(
        supabase
          .from(cfg.table)
          .select(cfg.select ?? '*')
          .order(cfg.orderBy ?? 'id', { ascending: !cfg.desc })
          .limit(1000),
      );
      rows = data;
      paint();
    }

    function paint() {
      const term = search.value.trim().toLowerCase();
      const cells = rows.map((r) => ({ r, vals: cfg.columns.map((c) => c.get(r)) }));
      const visible = term ? cells.filter((x) => x.vals.join(' ').toLowerCase().includes(term)) : cells;
      tbody.innerHTML = visible.length
        ? visible
            .map(
              ({ r, vals }) => `<tr>
                ${vals.map((v, i) => `<td data-label="${esc(cfg.columns[i].label)}">${cfg.columns[i].fmt ? cfg.columns[i].fmt(v, r) : esc(v)}</td>`).join('')}
                <td class="right nowrap">
                  <button class="btn small" data-act="edit" data-id="${r.id}">Editar</button>
                  <button class="btn small danger" data-act="del" data-id="${r.id}">Eliminar</button>
                </td></tr>`,
            )
            .join('')
        : `<tr><td colspan="${cfg.columns.length + 1}" class="muted">Sin resultados.</td></tr>`;
      count.textContent = `${visible.length} de ${rows.length} registros`;
    }

    // ---------- formulario crear / editar
    function openForm(row) {
      const editing = Boolean(row);
      form.innerHTML = `
        <h2>${editing ? 'Editar' : 'Nuevo'} · ${esc(cfg.title)}</h2>
        <div class="grid">
          ${cfg.fields.map((f) => fieldHtml(f, row?.[f.name], editing)).join('')}
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-act="cancel">Cancelar</button>
          <button type="submit" class="btn primary">${editing ? 'Guardar cambios' : 'Crear'}</button>
        </div>`;
      form.onsubmit = (e) => onSubmit(e, row);
      form.querySelector('[data-act=cancel]').onclick = () => dialog.close();
      dialog.showModal();
    }

    function fieldHtml(f, value, editing) {
      const id = `f_${cfg.table}_${f.name}`;
      const req = f.required ? 'required' : '';
      const label = `<label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>`;
      if (f.type === 'checkbox') {
        const checked = editing ? value : f.default ?? true;
        return `<div class="field check"><input id="${id}" name="${f.name}" type="checkbox" ${checked ? 'checked' : ''} />${label}</div>`;
      }
      if (f.type === 'select') {
        const sel = value ?? f.default ?? '';
        const opts = (optionCache[f.name] ?? [])
          .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(sel) ? 'selected' : ''}>${esc(o.label)}</option>`)
          .join('');
        return `<div class="field">${label}<select id="${id}" name="${f.name}" ${req}>${f.required ? '' : '<option value="">— ninguno —</option>'}${f.required && !sel ? '<option value="" disabled selected>Selecciona…</option>' : ''}${opts}</select></div>`;
      }
      const v = value ?? (editing ? '' : f.default ?? '');
      const extra = [f.min != null ? `min="${f.min}"` : '', f.step ? `step="${f.step}"` : ''].join(' ');
      return `<div class="field">${label}<input id="${id}" name="${f.name}" type="${f.type ?? 'text'}" value="${esc(v)}" ${req} ${extra} /></div>`;
    }

    function readForm() {
      const out = {};
      for (const f of cfg.fields) {
        const el = form.elements[f.name];
        if (f.type === 'checkbox') out[f.name] = el.checked;
        else {
          const v = el.value.trim();
          out[f.name] = v === '' ? null : f.type === 'number' || (f.type === 'select' && f.numeric !== false && f.options?.table) ? Number(v) : v;
        }
      }
      return out;
    }

    async function onSubmit(e, row) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const payload = readForm();
        if (row) await must(supabase.from(cfg.table).update(payload).eq('id', row.id));
        else await must(supabase.from(cfg.table).insert(payload));
        dialog.close();
        toast(row ? 'Cambios guardados en Supabase' : 'Registro creado en Supabase');
        await load();
      } catch (err) {
        toast(friendlyError(err), 'error');
      } finally {
        btn.disabled = false;
      }
    }

    // ---------- eventos
    search.addEventListener('input', paint);
    root.querySelector('[data-act=new]').onclick = () => openForm(null);
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const row = rows.find((r) => String(r.id) === btn.dataset.id);
      if (!row) return;
      if (btn.dataset.act === 'edit') openForm(row);
      if (btn.dataset.act === 'del') {
        const label = cfg.rowLabel ? cfg.rowLabel(row) : `#${row.id}`;
        if (!confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
        try {
          await must(supabase.from(cfg.table).delete().eq('id', row.id));
          toast('Registro eliminado');
          await load();
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      }
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(); // clic en el fondo
    });

    await load();
  };
}
