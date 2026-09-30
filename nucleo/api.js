// Elige la conexión: Supabase (real) o demostración (datos en este navegador).
// La demostración se activa con ?demo en la dirección, o si no hay configuración.
import { CONFIG } from '../config.js';

export function esDemo() {
  const p = new URLSearchParams(location.search);
  return p.has('demo') || !CONFIG.supabaseUrl || !CONFIG.supabaseKey;
}

export async function crearApi() {
  if (esDemo()) {
    const { crearApiDemo } = await import('./api-demo.js');
    return crearApiDemo();
  }
  const { crearApiSupabase } = await import('./api-supabase.js');
  return crearApiSupabase(CONFIG);
}
