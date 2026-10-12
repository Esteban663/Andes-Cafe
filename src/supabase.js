import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si faltan las variables de entorno la app muestra una pantalla de configuración
// en vez de romperse.
export const configured = Boolean(url && key && !url.includes('TU-PROYECTO'));

export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;

/** Espera una consulta de supabase-js y lanza el error si lo hay. */
export async function must(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
