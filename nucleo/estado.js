// Estado global de la sesión.
import { hoyISO } from './ui.js';

export const estado = {
  api: null,
  yo: null,
  dinamicas: [],
  perfiles: [],
  sesionClase: null,
};

export const esTutor = () => estado.yo?.rol === 'tutor';

export function dinamica(slug) {
  return estado.dinamicas.find(d => d.slug === slug);
}

export function estaAbierta(d) {
  if (!d) return false;
  return d.estado === 'abierta' || (d.estado === 'proximamente' && d.desbloqueo && d.desbloqueo <= hoyISO());
}

export function perfil(id) {
  return estado.perfiles.find(p => p.id === id);
}

export async function recargarBase() {
  const [dinamicas, perfiles] = await Promise.all([estado.api.dinamicas(), estado.api.perfiles()]);
  estado.dinamicas = dinamicas;
  estado.perfiles = perfiles;
}

// Sesión de clase activa y vigente (para mi grupo).
export function claseActiva() {
  const s = estado.sesionClase;
  return s && s.activa ? s : null;
}
