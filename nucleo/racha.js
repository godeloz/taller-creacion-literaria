// Cálculo de racha con comodín semanal (misma regla que la base de datos;
// se usa en el modo de demostración).
import { sumarDias } from './ui.js';

function lunesDe(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return sumarDias(iso, -dow);
}

export function calcularRacha(fechasHechas, hoy) {
  const hechas = new Set(fechasHechas);
  const lista = [...hechas].sort();
  const lunesActual = lunesDe(hoy);
  const mapa = {};
  let cur = 0, mejor = 0, comodinEn = null;
  if (lista.length) {
    for (let d = lista[0]; d <= hoy; d = sumarDias(d, 1)) {
      let est;
      if (hechas.has(d)) { cur++; est = 'hecho'; }
      else if (d === hoy) est = 'hoy';
      else if (cur > 0 && comodinEn !== lunesDe(d)) { comodinEn = lunesDe(d); est = 'comodin'; }
      else { cur = 0; est = 'perdido'; }
      if (cur > mejor) mejor = cur;
      if (d >= lunesActual) mapa[d] = est;
    }
  }
  const semana = [];
  for (let i = 0; i < 7; i++) {
    const d = sumarDias(lunesActual, i);
    semana.push({ fecha: d, estado: mapa[d] || (d > hoy ? 'futuro' : d === hoy ? 'hoy' : 'vacio') });
  }
  return {
    actual: cur,
    mejor,
    hoy_hecho: hechas.has(hoy),
    comodin_disponible: comodinEn !== lunesActual,
    semana,
  };
}
