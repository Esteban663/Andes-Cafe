/** Escapa texto para insertarlo de forma segura con innerHTML. */
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const money = (n) => cop.format(Number(n) || 0);
export const num = (n) => new Intl.NumberFormat('es-CO').format(Number(n) || 0);

const dt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
export const dateTime = (iso) => (iso ? dt.format(new Date(iso)) : '');
export const dateOnly = (d) =>
  d ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(`${d}T00:00:00`)) : '';

/** Notificación flotante. type: ok | error */
export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200);
}

/** Traduce errores de PostgreSQL / PostgREST a mensajes entendibles. */
export function friendlyError(err) {
  const code = err?.code;
  const msg = err?.message ?? String(err);
  if (code === '23503') return 'No se puede completar: el registro está relacionado con otros datos (llave foránea).';
  if (code === '23505') return 'Ya existe un registro con ese valor único (SKU, email o NIT repetido).';
  if (code === '23514') return 'Algún valor no cumple las reglas de validación (negativos, estados no permitidos…).';
  if (code === '23502') return 'Falta un campo obligatorio.';
  if (code === 'P0001') return msg; // RAISE EXCEPTION de nuestras funciones (stock insuficiente, etc.)
  if (code === '42501') return 'Permiso denegado por las políticas de seguridad (RLS).';
  return msg;
}

export const badge = (text, kind = 'neutral') => `<span class="badge ${kind}">${esc(text)}</span>`;
