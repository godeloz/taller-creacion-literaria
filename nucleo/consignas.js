// Consignas de escritura: utilidades compartidas por la sección, el inicio,
// el muro y el panel del tutor.
import { estado } from './estado.js';
import { esc, hoyISO, sumarDias } from './ui.js';
import { icono } from './iconos.js';

const TZ = 'America/Bogota';
export const ACENTO_CONSIGNA = '#C6F24E';

// ---------- texto con formato mínimo ----------
// Párrafos separados por una línea en blanco; «1.» para pasos; «-» para viñetas;
// **negrita**, *cursiva*; los enlaces se activan solos. Todo se escapa primero.
function enLinea(t) {
  const enlaces = [];
  let h = esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)»])/g, m => { enlaces.push(m); return `\u0000${enlaces.length - 1}\u0000`; });
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*(?!\w)/g, '$1<em>$2</em>');
  return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<a href="${enlaces[i]}" target="_blank" rel="noopener noreferrer">${enlaces[i]}</a>`);
}
export function formato(texto) {
  const salida = [];
  for (const bloque of String(texto || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lineas = bloque.split('\n').map(l => l.trim()).filter(Boolean);
    let lista = null, parrafo = [];
    const cerrarParrafo = () => { if (parrafo.length) salida.push(`<p>${parrafo.map(enLinea).join('<br>')}</p>`); parrafo = []; };
    const cerrarLista = () => { if (lista) salida.push(`<${lista.tipo}>${lista.items.map(i => `<li>${enLinea(i)}</li>`).join('')}</${lista.tipo}>`); lista = null; };
    for (const l of lineas) {
      const num = l.match(/^\d+[.)]\s+(.*)$/);
      const vin = l.match(/^[-•]\s+(.*)$/);
      const tipo = num ? 'ol' : vin ? 'ul' : null;
      if (tipo) {
        cerrarParrafo();
        if (lista && lista.tipo !== tipo) cerrarLista();
        if (!lista) lista = { tipo, items: [] };
        lista.items.push((num || vin)[1]);
      } else {
        cerrarLista();
        parrafo.push(l);
      }
    }
    cerrarParrafo(); cerrarLista();
  }
  return salida.join('');
}
export function textoPlano(texto) {
  return String(texto || '').replace(/\*\*?/g, '').replace(/^\s*(\d+[.)]|[-•])\s+/gm, '').replace(/\s+/g, ' ').trim();
}

// ---------- fechas (hora de Bogotá) ----------
export function fechaHoraLarga(iso) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
export function fechaCortaHora(iso) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
function hora(iso) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
// «cierra hoy a las 11:59 p. m.», «cierra mañana», «cierra en 5 días»
export function cuandoCierra(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'cerrada';
  const dia = hoyISO(new Date(iso)), hoy = hoyISO();
  if (dia === hoy) return `cierra hoy a las ${hora(iso)}`;
  if (dia === sumarDias(hoy, 1)) return `cierra mañana a las ${hora(iso)}`;
  const n = Math.round((new Date(dia + 'T12:00:00Z') - new Date(hoy + 'T12:00:00Z')) / 864e5);
  return `cierra en ${n} días`;
}
// Para los campos datetime-local: siempre en hora de Colombia (UTC−5, sin horario de verano).
export function aCampo(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function deCampo(v) {
  if (!v) return null;
  const d = new Date(`${v.length === 16 ? v + ':00' : v}-05:00`);
  return isNaN(d) ? null : d.toISOString();
}

// ---------- estado de una consigna para un grupo ----------
// «oculta» la pone el tutor; los demás estados salen de las fechas.
export function estadoPorFechas(a, ahora = new Date().toISOString()) {
  if (!a) return 'sin';
  if (a.apertura > ahora) return 'programada';
  if (a.cierre <= ahora) return 'cerrada';
  return 'abierta';
}
export function estadoDe(a, ahora = new Date().toISOString()) {
  if (!a) return 'sin';
  if (a.oculta) return 'oculta';
  if (a.apertura > ahora) return 'programada';
  if (a.cierre <= ahora) return 'cerrada';
  return 'abierta';
}
export function miAsignacion(c) {
  return (c.grupos || []).find(g => g.grupo_id === estado.yo.grupo_id) || null;
}
export const ETIQUETA_ESTADO = { abierta: 'Abierta', cerrada: 'Cerrada', programada: 'Programada', oculta: 'Oculta', sin: 'Sin asignar' };

// ---------- panel de la consigna (junto al editor y en la vista previa) ----------
export function anexosConsigna(c) {
  const ejemplos = (c.ejemplos || []).filter(e => e.titulo || e.texto || e.enlace);
  const referentes = String(c.referentes || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!ejemplos.length && !referentes.length) return '';
  return `<div class="consigna-anexos">
    ${ejemplos.length ? `<div class="rotulo">${ejemplos.length === 1 ? 'Ejemplo' : 'Ejemplos'}</div>
      ${ejemplos.map(e => `<details class="consigna-ejemplo">
        <summary>${icono('libro', 16)}<span><b>${esc(e.titulo || 'Ejemplo')}</b>${e.autor ? `<span class="tenue"> · ${esc(e.autor)}</span>` : ''}</span></summary>
        ${e.texto ? `<div class="ejemplo-texto">${formato(e.texto)}</div>` : ''}
        ${e.enlace ? `<a class="ejemplo-enlace" href="${esc(e.enlace)}" target="_blank" rel="noopener noreferrer">${icono('derecha', 14)}Abrir el enlace</a>` : ''}
      </details>`).join('')}` : ''}
    ${referentes.length ? `<div class="rotulo" style="margin-top:${ejemplos.length ? 18 : 0}px">Referentes</div>
      <ul class="consigna-referentes">${referentes.map(r => `<li>${formato(r).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : ''}
  </div>`;
}

export function panelConsigna(c, { asignacion = null, extra = '' } = {}) {
  const cierre = asignacion ? cuandoCierra(asignacion.cierre) : '';
  return `
    <span class="rotulo">Consigna de escritura${cierre && cierre !== 'cerrada' ? ` · ${esc(cierre)}` : ''}</span>
    <h1>${esc(c.titulo)}</h1>
    <div class="consigna-texto">${formato(c.instrucciones)}</div>
    <div class="consigna-extra">
      ${c.limite_palabras ? `<span class="linea-ico">${icono('pagina', 16)}Máximo ${c.limite_palabras} palabras.</span>` : ''}
      ${asignacion ? `<span class="linea-ico">${icono('calendario', 16)}Cierra el ${esc(fechaHoraLarga(asignacion.cierre).replace(/\.$/, ''))}.</span>` : ''}
      ${extra}
    </div>
    ${anexosConsigna(c)}`;
}
