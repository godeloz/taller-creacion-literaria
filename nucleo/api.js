// Elige la conexión: Supabase (real) o demostración (datos en este navegador).
// La demostración se activa con ?demo en la dirección, o si no hay configuración.
import { CONFIG } from '../config.js';

export function esDemo() {
  const p = new URLSearchParams(location.search);
  return p.has('demo') || !CONFIG.supabaseUrl || !CONFIG.supabaseKey;
}

// La librería de Supabase va en un solo archivo, con la versión en el nombre. index.html la empieza a pedir
// desde el primer instante (window.supabaseListo); si no lo hizo (por ejemplo, un index.html viejo en caché),
// se pide aquí. Para actualizarla: archivo nuevo en vendor/ y el mismo nombre aquí y en index.html.
const SUPABASE = 'vendor/supabase-2.118.0.js';

function cargarSupabase() {
  if (window.supabase?.createClient) return Promise.resolve();
  if (!window.supabaseListo) {
    window.supabaseListo = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = SUPABASE;
      s.onload = ok;
      s.onerror = () => mal(new Error('No se pudo cargar la conexión con el taller. Revise su internet e intente de nuevo.'));
      document.head.appendChild(s);
    });
  }
  return window.supabaseListo;
}

export async function crearApi() {
  if (esDemo()) {
    const { crearApiDemo } = await import('./api-demo.js');
    return crearApiDemo();
  }
  const [{ crearApiSupabase }] = await Promise.all([import('./api-supabase.js'), cargarSupabase()]);
  return crearApiSupabase(CONFIG);
}
