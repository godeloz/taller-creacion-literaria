// Estado global de la sesión.
import { hoyISO } from './ui.js';

export const estado = {
  api: null,
  yo: null,
  dinamicas: [],
  perfiles: [],
  grupos: [],
  sesionClase: null,
};

export const esTutor = () => estado.yo?.rol === 'tutor';

// Modo de participación: participante (ve y lo ven), observador (ve; lo suyo
// solo lo ve el tutor) o privado (no ve a nadie; lo suyo solo lo ve el tutor).
export const miModo = () => (esTutor() ? 'participante' : estado.yo?.modo || 'participante');
export const soyVisible = () => miModo() === 'participante';

export const MODOS = {
  participante: { nombre: 'Participante', corto: 'Ve al grupo y el grupo lo ve', ico: 'usuarios' },
  observador: { nombre: 'Observador', corto: 'Ve al grupo; lo suyo solo lo ve el tutor', ico: 'ojo' },
  privado: { nombre: 'Privado', corto: 'No ve a nadie; lo suyo solo lo ve el tutor', ico: 'candado' },
};
export const ROLES = { creador: 'Creador', invitado: 'Invitado', tutor: 'Tutor' };

// Aviso antes de publicar, según quién podrá leer el texto.
export function avisoPublicar(que = 'su texto', lo = 'lo', verbo = 'leer') {
  return soyVisible()
    ? `Al publicar, el grupo podrá ${verbo} ${que}. Después podrá editar${lo}, pero no borrar${lo}.`
    : `Al publicar, solo el tutor podrá ${verbo} ${que}. Después podrá editar${lo}, pero no borrar${lo}.`;
}

export function grupo(id) {
  return estado.grupos.find(g => g.id === id);
}

// ¿La actividad de esta persona la ve solo el tutor?
export function soloTutor(p) {
  return !!p && p.rol !== 'tutor' && p.modo && p.modo !== 'participante';
}

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
  const [dinamicas, perfiles, grupos] = await Promise.all([
    estado.api.dinamicas(), estado.api.perfiles(), estado.api.grupos().catch(() => []),
  ]);
  estado.dinamicas = dinamicas;
  estado.perfiles = perfiles;
  estado.grupos = grupos;
}

// Sesión de clase activa y vigente (para mi grupo).
export function claseActiva() {
  const s = estado.sesionClase;
  return s && s.activa ? s : null;
}
