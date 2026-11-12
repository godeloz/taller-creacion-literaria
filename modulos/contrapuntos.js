// Módulo: Contrapuntos. Una voz habla y quien escribe le responde, parlamento por parlamento.
// La voz sale de un banco de parlamentos (en orden) y no se sabe quién es hasta el final.
//
// Tres fases:
//   1. Conversación: aparece un parlamento de la voz y se responde (o se guarda silencio).
//      Lo dicho, dicho: lo anterior no se corrige. Con MIN_RESP respuestas se puede terminar;
//      al responder el último parlamento del banco, la conversación termina sola.
//   2. Revelación: se dice con quién se conversó (el nombre no entra en el texto).
//   3. Versión preliminar (privada): la conversación se vuelve texto con raya; se agrega el título
//      y los párrafos narrativos, se corrige la puntuación con la guía y el revisor, y se publica.
//      No se vuelve a la conversación.
// En la escritura, las palabras de la voz se ven en otro color (como en Literatura definicional:
// el área de texto es transparente y debajo hay una capa con los colores). Lo que se cambia
// dentro de un parlamento de la voz pasa a ser escritura propia.
//
// Borrador (clave 'contrapuntos:<banco>'): { estado: E }
//   E = { v, banco: { id, titulo, voz, obra, anio, autor, traductor, revelacion }, fase: 'conversacion' | 'revelacion' | 'montaje',
//         turnos: [{ v: parlamento de la voz, r: respuesta | null (silencio) }], completo, titulo, texto, tramos }
//   tramos: [[inicio, fin, 'v' | 's']…] sobre texto: lo que viene de la voz ('v') y los silencios marcados ('s').
// Entrega: texto = historia + crédito · vista = la historia con los colores (.v-contrapuntos) + crédito
//   datos = { banco, turnos, completo, historia, tramos }. entrega.js pinta «La conversación» con datos.turnos.
// Se permiten varios contrapuntos con el mismo banco (uno en curso a la vez).
import { estado, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, debounce, contarPalabras, confirmar, aviso, errorAviso, hace, modal } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const SLUG = 'contrapuntos';
const ACENTO = '#6E8F1A';
const VERSION = '1.0';
const MIN_RESP = 8;          // respuestas (sin contar silencios) para poder terminar
const MIN_PARL = 8;          // parlamentos mínimos de un banco
const MAX_PARL = 300;
const MAX_LARGO = 1500;      // caracteres de un parlamento del banco
const MAX_RESP = 1500;       // caracteres de una respuesta
const SILENCIO = '[Silencio]';
const PAUSA = 650;           // ms antes de que la voz diga lo siguiente

// ---------------------------------------------------------------------
// Origen de cada carácter de la versión preliminar: 'v' (la voz), 's' (silencio marcado), 'p' (propio)
// ---------------------------------------------------------------------
const aTramos = org => {
  const t = [];
  for (let i = 0; i < org.length;) {
    let j = i + 1;
    while (j < org.length && org[j] === org[i]) j++;
    if (org[i] === 'v' || org[i] === 's') t.push([i, j, org[i]]);
    i = j;
  }
  return t;
};
const deTramos = (tramos, largo) => {
  const org = new Array(largo).fill('p');
  for (const x of Array.isArray(tramos) ? tramos : []) {
    if (!Array.isArray(x) || !(x[2] === 'v' || x[2] === 's')) continue;
    for (let i = Math.max(0, x[0] | 0); i < Math.min(largo, x[1] | 0); i++) org[i] = x[2];
  }
  return org;
};
// Limpia espacios y saltos (como al publicar) sin perder de dónde viene cada carácter.
function limpiarConOrigen(texto, org = []) {
  const t = String(texto ?? '');
  const c = [];
  const o = [];
  const ultimo = () => c[c.length - 1];
  for (let i = 0; i < t.length; i++) {
    let x = t[i];
    if (x === '\r') { if (t[i + 1] === '\n') continue; x = '\n'; }
    if (x === '\t') x = ' ';
    if (x === ' ') { if (!c.length || ultimo() === ' ' || ultimo() === '\n') continue; }
    else if (x === '\n') {
      while (ultimo() === ' ') { c.pop(); o.pop(); }
      if (!c.length || (ultimo() === '\n' && c[c.length - 2] === '\n')) continue;
    }
    c.push(x); o.push(org[i] || 'p');
  }
  while (ultimo() === ' ' || ultimo() === '\n') { c.pop(); o.pop(); }
  return { texto: c.join(''), org: o };
}

// Texto con sus colores. enParrafos: <p> por párrafo (vista publicada); si no, el texto tal cual (capa del editor).
function coloreadoOrg(texto, org, { enParrafos = true, clase = 'v-cp' } = {}) {
  let html = '';
  for (let i = 0; i < texto.length;) {
    let j = i + 1;
    while (j < texto.length && org[j] === org[i]) j++;
    const cl = org[i] === 'v' || org[i] === 's' ? `${clase}-${org[i]}` : '';
    let h = esc(texto.slice(i, j));
    if (enParrafos) h = h.replace(/\n{2,}/g, cl ? `</span></p><p><span class="${cl}">` : '</p><p>').replace(/\n/g, '<br>');
    html += cl ? `<span class="${cl}">${h}</span>` : h;
    i = j;
  }
  return enParrafos ? `<p>${html}</p>` : html;
}

const corto = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };
const enPalabras = n => `${n} ${n === 1 ? 'palabra' : 'palabras'}`;
const crecer = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
// Un parlamento o una respuesta, sin la raya o el guion con que pueda empezar y en una sola línea.
const sinRaya = t => String(t ?? '').replace(/\s+/g, ' ').trim().replace(/^[-–—‐‑]+\s*/, '').trim();
const respuestas = E => E.turnos.filter(t => t.r !== null).length;
const silencios = E => E.turnos.filter(t => t.r === null).length;
const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------
// La voz, el crédito y la conversación (también para entrega.js)
// ---------------------------------------------------------------------
const bancoDe = (id, d = {}) => ({
  id, titulo: String(d.titulo || ''), voz: String(d.voz || 'una voz'), obra: String(d.obra || ''),
  anio: d.anio ? String(d.anio) : '', autor: String(d.autor || ''), traductor: String(d.traductor || ''), revelacion: String(d.revelacion || ''),
});

export function creditoDe(b = {}) {
  return `Contrapunto a partir de parlamentos de ${b.voz || 'una voz'}${b.obra ? ` en ${b.obra}` : ''}${b.autor ? `, de ${b.autor}` : ''}${b.traductor ? ` (traducción de ${b.traductor})` : ''}.`;
}

// Quién es la voz, en una línea (para la revelación y la referencia de la entrega).
export function vozHTML(b = {}) {
  return `<strong>${esc(b.voz || 'una voz')}</strong>${b.obra ? `, de <em>${esc(b.obra)}</em>${b.anio ? ` (${esc(b.anio)})` : ''}` : ''}${b.autor ? `, de ${esc(b.autor)}` : ''}`;
}

// La conversación tal como se dio, sin rayas: la voz, las respuestas y los silencios.
export function conversacionHTML(turnos = []) {
  return `<div class="cp-conv">${(Array.isArray(turnos) ? turnos : []).map(t => `
    <p class="cp-conv-voz">${esc(t?.v || '')}</p>
    ${t?.r === null || t?.r === undefined ? '<p class="cp-conv-silencio">Silencio</p>' : `<p class="cp-conv-resp">${esc(t.r)}</p>`}`).join('')}</div>`;
}

function vistaHTML(d) {
  return `<div class="v-contrapuntos">${coloreadoOrg(d.historia, deTramos(d.tramos, d.historia.length))}</div><p class="v-credito">${esc(creditoDe(d.banco))}</p>`;
}

// La conversación vuelta texto: cada parlamento en su párrafo, con raya; los silencios, marcados.
function armarMontaje(turnos) {
  let texto = '';
  const org = [];
  const sumar = (t, o) => {
    if (texto) { texto += '\n\n'; org.push('p', 'p'); }
    texto += t;
    for (let i = 0; i < t.length; i++) org.push(o);
  };
  for (const t of turnos) {
    sumar(`—${sinRaya(t.v)}`, 'v');
    if (t.r === null) sumar(SILENCIO, 's');
    else sumar(`—${sinRaya(t.r)}`, 'p');
  }
  return { texto, tramos: aTramos(org) };
}

// ---------------------------------------------------------------------
// Revisor de convenciones del diálogo: avisa, no impide publicar
// ---------------------------------------------------------------------
const VERBOS = ['dijo', 'dije', 'dice', 'digo', 'decía', 'preguntó', 'pregunté', 'preguntaba', 'respondió', 'respondí', 'responde', 'respondía',
  'contestó', 'contesté', 'contesta', 'susurró', 'susurré', 'susurra', 'gritó', 'grité', 'grita', 'murmuró', 'murmuré', 'murmura',
  'exclamó', 'exclamé', 'exclama', 'añadió', 'añadí', 'añade', 'agregó', 'agregué', 'agrega', 'repitió', 'repetí', 'repite',
  'insistió', 'insistí', 'insiste', 'replicó', 'repliqué', 'replica', 'explicó', 'expliqué', 'explica', 'dijeron', 'preguntaron',
  'respondieron', 'contestaron', 'gritaron', 'murmuraron', 'susurraron'];
const RE_VERBO_MAYUS = new RegExp(`[.?!…]\\s*—\\s*(?:${VERBOS.map(v => v[0].toUpperCase() + v.slice(1)).join('|')})(?![\\p{L}\\p{M}])`, 'u');
const ANTES_DE_RAYA = { '.': 'El punto va', ',': 'La coma va', ';': 'El punto y coma va', ':': 'Los dos puntos van' };

export function revisar(texto) {
  const avisos = [];
  const re = /[^\n]+/g;
  let m;
  let n = 0;
  while ((m = re.exec(String(texto ?? '')))) {
    const p = m[0];
    if (!p.trim()) continue;
    n++;
    const a = m.index;
    const sumar = msg => avisos.push({ n, a, b: a + p.length, msg });
    if (/^\s*[-–‐‑]/.test(p)) sumar('Este parlamento empieza con guion (-). Use la raya (—).');
    else if (/^\s*—\s+/.test(p)) sumar('Sobra el espacio después de la raya.');
    const cuerpo = p.replace(/^\s*[-–—‐‑]+\s*/, '');
    if (/(^|\s)[-–](?=\s?[\p{L}])/u.test(cuerpo)) sumar('Use la raya (—), no el guion (-), para abrir el inciso.');
    const rp = /([.,;:])\s*—\s*(?=\p{Ll})/gu;
    let q;
    while ((q = rp.exec(p))) {
      if (q[1] === '.' && p.slice(Math.max(0, q.index - 2), q.index) === '..') continue;   // puntos suspensivos
      sumar(`${ANTES_DE_RAYA[q[1]]} después de la raya que cierra el inciso.`);
      break;
    }
    if (RE_VERBO_MAYUS.test(p)) sumar('Después de dijo, preguntó… el inciso va en minúscula.');
    if (/[^\s—(«"“¡¿]—(?=\p{Ll})/u.test(p.replace(/^\s*—/, ''))) sumar('Falta un espacio antes de la raya que abre el inciso.');
  }
  return avisos;
}

// ---------------------------------------------------------------------
// Textos de la dinámica
// ---------------------------------------------------------------------
const INTRO = [
  'Una voz le va a hablar y usted le responde. Cada vez que responda, la voz dirá otra cosa. No sabrá quién es hasta el final.',
  `Con ${MIN_RESP} respuestas o más puede terminar la conversación y convertirla en una historia.`,
];

const PASOS_CONVERSACION = [
  'Lea lo que dice la voz y respóndale con un parlamento.',
  'Responda como en una conversación: sin pensarlo demasiado. Lo dicho, dicho; las correcciones vienen después.',
  'Si prefiere no responder, guarde silencio.',
  n => `Con ${MIN_RESP} respuestas puede terminar. La voz tiene ${n} parlamentos.`,
];

const PASOS_MONTAJE = [
  'Póngale un título.',
  'Entre un parlamento y otro, agregue párrafos narrativos.',
  'Donde guardó silencio quedó un espacio marcado: escriba ahí o bórrelo.',
  'Puede cambiar, cortar o reordenar cualquier parlamento, también los de la voz.',
  'Revise la puntuación con la guía.',
];

// [regla, ejemplos]
const GUIA = [
  ['<b>Cada parlamento empieza con raya (—), en un párrafo propio.</b> La raya va pegada a la primera palabra.', ['—Llegó tarde otra vez.']],
  ['<b>Cuando cambia quien habla, se abre un párrafo nuevo.</b>', []],
  ['<b>El narrador entra entre rayas.</b> La raya que abre el inciso lleva un espacio antes; la que lo cierra va pegada a la última palabra.', ['—Llegó tarde —dijo ella— y no pidió perdón.']],
  ['<b>El punto, la coma y los dos puntos van después de la raya que cierra el inciso, nunca antes.</b>', ['—No vendrá —dijo—. Nunca viene.']],
  ['<b>Si el inciso termina el parlamento, no lleva raya de cierre.</b>', ['—Nunca viene —dijo.']],
  ['<b>Los signos de pregunta y de exclamación van antes de la raya.</b> Si el verbo es de decir (<i>decir, preguntar, responder, susurrar, gritar…</i>), el inciso empieza en minúscula.', ['—¿Por qué espera? —preguntó.', '—¡Váyase! —gritó.']],
  ['<b>Si el verbo no es de decir (<i>mirar, sonreír, levantarse…</i>), el parlamento cierra con su punto y el narrador empieza en mayúscula.</b>', ['—Ya es de noche. —Miró el camino.']],
  ['<b>Lo que alguien piensa va entre comillas, no con raya.</b>', ['«No vendrá», pensó.']],
  ['<b>La raya es larga (—), no el guion (-) ni la semirraya (–).</b> Use el botón <b>—</b> o escriba dos guiones seguidos (--), que se convierten solos en raya.', []],
];
const guiaHTML = () => `<ol class="cp-guia">${GUIA.map(([r, ej]) => `<li><span>${r}</span>${ej.map(e => `<span class="cp-ej">${esc(e)}</span>`).join('')}</li>`).join('')}</ol>`;

// ---------------------------------------------------------------------
// Estado y borradores
// ---------------------------------------------------------------------
const FASES = ['conversacion', 'revelacion', 'montaje'];

function limpiarEstado(e) {
  if (!e || !e.banco?.id || !FASES.includes(e.fase) || !Array.isArray(e.turnos)) return null;
  const turnos = e.turnos.filter(t => t && typeof t.v === 'string').map(t => ({ v: t.v, r: typeof t.r === 'string' ? t.r : null }));
  const texto = typeof e.texto === 'string' ? e.texto : '';
  const E = {
    v: 1, banco: bancoDe(e.banco.id, e.banco), fase: e.fase, turnos, completo: !!e.completo,
    titulo: String(e.titulo || ''), texto, tramos: aTramos(deTramos(e.tramos, texto.length)),
  };
  if (E.fase === 'montaje' && !texto) Object.assign(E, armarMontaje(turnos));
  return E;
}
const nuevoEstado = (id, d) => ({ v: 1, banco: bancoDe(id, d), fase: 'conversacion', turnos: [], completo: false, titulo: '', texto: '', tramos: [] });
const empezado = E => !!E && (E.turnos.length > 0 || E.fase !== 'conversacion');

function desdeEntrega(entrega) {
  const d = entrega.datos || {};
  if (typeof d.historia !== 'string' || !d.banco) return null;
  return limpiarEstado({
    banco: { ...d.banco, id: d.banco.id || entrega.item_id }, fase: 'montaje', turnos: d.turnos || [], completo: d.completo,
    titulo: entrega.titulo || '', texto: d.historia, tramos: d.tramos,
  });
}

async function leerBorrador(clave) {
  const loc = local(`borrador:${estado.yo.id}:${clave}`);
  let nube = null;
  try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
  return [loc, nube].filter(Boolean).sort((a, c) => (c._actualizado || '').localeCompare(a._actualizado || ''))[0] || null;
}
function quitarBorrador(clave) {
  local(`borrador:${estado.yo.id}:${clave}`, null);
  estado.api.borrarBorrador(clave).catch(() => {});
}

// ---------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------
export default {
  slug: SLUG,
  nombre: 'Contrapuntos',
  version: VERSION,

  async abrir(cont, ctx) {
    if (ctx.entrega) return trabajar(cont, ctx.entrega.item_id, { entrega: ctx.entrega });
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    if (!id) return portada(cont);
    return trabajar(cont, id, { fija: !ctx.item_id && !!ctx.sesion?.item_id });
  },

  paquete: {
    plantilla: 'plantillas/contrapuntos.json',
    // Sin el nombre de la voz: esta línea también la ven los estudiantes (franja de la clase en vivo).
    describir: d => `${d.titulo || 'Una voz'} · ${cuenta(d.parlamentos?.length || 0, 'parlamento', 'parlamentos')}`,
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json) ? json : Array.isArray(json?.bancos) ? json.bancos : null;
      if (!lista || !lista.length) return { items, errores: ['El archivo debe tener una lista "bancos": [ … ] con al menos un banco de parlamentos.'] };
      const vistos = new Set();
      const txt = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
      lista.forEach((b, i) => {
        const id = txt(b?.id);
        const n = `Banco ${i + 1}${id ? ` (${id})` : ''}`;
        if (!id) errores.push(`Banco ${i + 1}: falta "id".`);
        else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errores.push(`${n}: el id solo puede tener minúsculas sin tildes, números y guiones.`);
        else if (vistos.has(id)) errores.push(`${n}: el id está repetido.`);
        vistos.add(id);
        const voz = txt(b?.voz);
        if (!voz) errores.push(`${n}: falta "voz" (quién habla; se revela al final).`);
        if (!Array.isArray(b?.parlamentos)) { errores.push(`${n}: falta la lista "parlamentos".`); return; }
        const parlamentos = [];
        b.parlamentos.forEach((p, k) => {
          const t = sinRaya(typeof p === 'string' ? p : '');
          if (!t) { errores.push(`${n}, parlamento ${k + 1}: está vacío.`); return; }
          if (t.length > MAX_LARGO) errores.push(`${n}, parlamento ${k + 1}: tiene ${t.length} caracteres; el máximo es ${MAX_LARGO}.`);
          parlamentos.push(t);
        });
        if (parlamentos.length < MIN_PARL) errores.push(`${n}: tiene ${parlamentos.length} parlamentos; el mínimo es ${MIN_PARL}.`);
        if (parlamentos.length > MAX_PARL) errores.push(`${n}: tiene ${parlamentos.length} parlamentos; el máximo es ${MAX_PARL}.`);
        items.push({
          item_id: id,
          datos: {
            titulo: txt(b?.titulo) || `Voz ${i + 1}`, voz, obra: txt(b?.obra), anio: txt(b?.anio), autor: txt(b?.autor),
            traductor: txt(b?.traductor), revelacion: txt(b?.revelacion), parlamentos,
          },
        });
      });
      return { items, errores };
    },
    exportar(items) {
      return {
        bancos: items.map(({ item_id, datos: d }) => ({
          id: item_id, titulo: d.titulo, voz: d.voz,
          ...(d.obra ? { obra: d.obra } : {}), ...(d.anio ? { anio: d.anio } : {}), ...(d.autor ? { autor: d.autor } : {}),
          ...(d.traductor ? { traductor: d.traductor } : {}), ...(d.revelacion ? { revelacion: d.revelacion } : {}),
          parlamentos: d.parlamentos || [],
        })),
      };
    },
  },
};

// ---------------------------------------------------------------------
// Portada: la explicación y las voces
// ---------------------------------------------------------------------
async function portada(cont) {
  const yo = estado.yo.id;
  const [todos, mias] = await Promise.all([
    estado.api.contenidos(SLUG),
    estado.api.entregas({ dinamica: SLUG, autor: yo }).catch(() => []),
  ]);
  const bancos = todos.filter(c => !c.item_id.startsWith('_') && c.datos?.parlamentos?.length);
  const nubes = await Promise.all(bancos.map(c => estado.api.borrador(`${SLUG}:${c.item_id}`).catch(() => null)));
  const mis = mias.filter(e => e.autor === yo);
  const cuantas = id => mis.filter(e => e.item_id === id).length;
  const enCurso = (id, nube) => [local(`borrador:${yo}:${SLUG}:${id}`), nube].some(b => empezado(limpiarEstado(b?.estado)));
  const href = id => `#/d/${SLUG}/${encodeURIComponent(id)}`;

  const intro = `<section class="cp-intro">
      <span class="cp-sello">${icono('dialogo', 28)}</span>
      <div>
        <span class="rotulo">Contrapuntos</span>
        <h1 class="saludo">Una voz le va a hablar</h1>
        <div class="cp-intro-texto">${INTRO.map(p => `<p>${esc(p)}</p>`).join('')}</div>
        ${bancos.length === 1 ? (() => {
          const c = bancos[0];
          const n = cuantas(c.item_id);
          const curso = enCurso(c.item_id, nubes[0]);
          return `<div class="cp-intro-acciones">
            <a class="btn btn-primario" href="${href(c.item_id)}">${icono('dialogo', 18)}${curso ? 'Seguir el diálogo' : n ? 'Empezar otro diálogo' : 'Empezar el diálogo'}</a>
            ${n ? `<a class="btn btn-fantasma" href="#/muro?dinamica=${SLUG}&item=${encodeURIComponent(c.item_id)}">Ver los contrapuntos</a>` : ''}
            ${curso ? `<button type="button" class="btn btn-fantasma btn-chico cp-descartar" data-descartar="${esc(c.item_id)}">${icono('basura', 15)}Descartar el diálogo en curso</button>` : ''}
          </div>`;
        })() : ''}
      </div>
    </section>`;

  const tarjeta = (c, k) => {
    const n = cuantas(c.item_id);
    const curso = enCurso(c.item_id, nubes[k]);
    return `<article class="fm-tarjeta cp-tarjeta">
      <a class="fm-tarjeta-enlace" href="${href(c.item_id)}">
        <span class="rotulo">${cuenta(c.datos.parlamentos.length, 'parlamento', 'parlamentos')}</span>
        <span class="fm-tarjeta-titulo">${esc(c.datos.titulo || 'Una voz')}</span>
      </a>
      <div class="fm-tarjeta-pie">
        ${n ? `<span class="estado-pill si">${icono('check', 13)}${n === 1 ? 'Publicado' : `${n} contrapuntos`}</span>` : ''}
        ${curso ? '<span class="estado-pill">En curso</span>' : ''}
        <span class="espaciador"></span>
        ${curso ? `<button type="button" class="btn btn-chico btn-fantasma btn-icono" data-descartar="${esc(c.item_id)}" aria-label="Descartar el diálogo en curso" title="Descartar el diálogo en curso">${icono('basura', 16)}</button>` : ''}
        ${n ? `<a class="btn btn-chico btn-fantasma" href="#/muro?dinamica=${SLUG}&item=${encodeURIComponent(c.item_id)}">Contrapuntos</a>` : ''}
        <a class="btn btn-chico btn-primario" href="${href(c.item_id)}">${curso ? 'Seguir' : n ? 'Otro diálogo' : 'Empezar'}</a>
      </div>
    </article>`;
  };

  cont.innerHTML = `
  <div class="contenedor cp-portada" style="--acento:${ACENTO}">
    ${intro}
    ${!bancos.length ? vacio('Todavía no hay voces', 'El tutor las carga desde el panel.')
      : bancos.length > 1 ? `<h2 class="titulo-seccion cp-titulo-sec">Elija una voz</h2><div class="fm-rejilla">${bancos.map(tarjeta).join('')}</div>` : ''}
  </div>`;

  cont.querySelector('.cp-portada').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-descartar]');
    if (!b) return;
    if (!(await confirmar('¿Descartar el diálogo en curso? Se pierde la conversación y lo que haya escrito.', { si: 'Descartar', peligro: true }))) return;
    quitarBorrador(`${SLUG}:${b.dataset.descartar}`);
    aviso('Diálogo descartado.');
    portada(cont);
  });
}

// ---------------------------------------------------------------------
// Trabajo: conversación → revelación → versión preliminar
// ---------------------------------------------------------------------
async function trabajar(cont, itemId, { entrega = null, fija = false } = {}) {
  const clave = `${SLUG}:${itemId}`;
  const sinVoz = (t, x) => { cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio(t, x, `<a class="btn" href="#/d/${SLUG}">Volver a Contrapuntos</a>`)}</div>`; };
  let E;
  let nota = '';
  if (entrega) {
    E = desdeEntrega(entrega);
    if (!E) { cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este contrapunto no se puede editar aquí', '', `<a class="btn" href="#/entrega/${entrega.id}">Volver al texto</a>`)}</div>`; return; }
  } else {
    const b = await leerBorrador(clave);
    E = limpiarEstado(b?.estado);
    if (E && empezado(E)) nota = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`;
  }
  // Los parlamentos de la voz (solo hacen falta mientras se conversa).
  let P = [];
  if (!entrega && (!E || E.fase === 'conversacion')) {
    const c = await estado.api.contenido(SLUG, itemId).catch(() => null);
    P = (c?.datos?.parlamentos || []).map(sinRaya).filter(Boolean);
    if (!E) {
      if (!P.length) { sinVoz('Esta voz no está disponible', 'Puede que el tutor la haya retirado.'); return; }
      E = nuevoEstado(itemId, c.datos);
    } else if (!P.length) { sinVoz('Esta voz no está disponible', 'Puede que el tutor la haya retirado. Su conversación sigue guardada.'); return; }
    // Si el banco se acortó, la conversación ya llegó al final.
    if (E.turnos.length >= P.length) { E.fase = 'revelacion'; E.completo = true; }
  }

  let publicado = false;
  let limpiar = () => {};
  const guardado = t => { const el = cont.querySelector('#guardado'); if (el) el.textContent = t; };
  const guardarNube = debounce(async () => {
    if (publicado || entrega) return;
    try { await estado.api.guardarBorrador(clave, { estado: E }); guardado('Guardado'); }
    catch { guardado('Guardado en este dispositivo'); }
  }, 1500);
  function cambio() {
    if (entrega) { guardado('Cambios sin guardar'); return; }
    if (publicado) return;
    local(`borrador:${estado.yo.id}:${clave}`, { estado: E, _actualizado: new Date().toISOString() });
    guardado('Guardando…');
    guardarNube();
  }
  const volverHTML = entrega ? `<a class="herr" href="#/entrega/${entrega.id}" title="Volver al texto" aria-label="Volver al texto">${icono('izquierda', 18)}</a>`
    : fija ? '' : `<a class="herr" href="#/d/${SLUG}" title="Volver a Contrapuntos" aria-label="Volver a Contrapuntos">${icono('izquierda', 18)}</a>`;

  function pintar() {
    limpiar();
    if (E.fase === 'conversacion') limpiar = conversacion();
    else if (E.fase === 'revelacion') limpiar = revelacion();
    else limpiar = montaje();
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------
  // 1. Conversación
  // ---------------------------------------------------------------
  function conversacion() {
    const pasos = PASOS_CONVERSACION.map(p => (typeof p === 'function' ? p(P.length) : p));
    cont.innerHTML = `
    <div class="contenedor" style="max-width:1400px">
      <div class="escritorio cp-escritorio" style="--acento:${ACENTO}">
        <aside class="consigna-panel cp-panel">
          <span class="rotulo">Contrapuntos</span>
          <h1>Responda a la voz</h1>
          <div class="consigna-texto"><ol>${pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol></div>
          <div class="cp-cuenta" id="cp-cuenta"></div>
        </aside>
        <section class="mesa cp-mesa">
          <div class="mesa-barra">
            ${volverHTML}
            <span class="rotulo cp-rotulo">Conversación</span>
            <span class="espaciador"></span>
            <span class="guardado" id="guardado">${esc(nota)}</span>
            <button type="button" class="herr" id="enfoque" title="Modo enfoque" aria-label="Modo enfoque">${icono('enfoque', 18)}</button>
          </div>
          <div class="hoja-escribir cp-hoja">
            ${E.turnos.length ? '' : `<p class="cp-empieza">${esc(INTRO[0])}</p>`}
            <div class="cp-hilo" id="cp-hilo" aria-live="polite"></div>
            <div class="cp-responder" id="cp-responder">
              <label class="rotulo" for="cp-resp">Su respuesta</label>
              <textarea class="cp-resp" id="cp-resp" rows="2" maxlength="${MAX_RESP}" placeholder="Escriba aquí lo que le responde…" spellcheck="true"></textarea>
              <div class="cp-responder-pie">
                <span class="cp-tecla">Enter para responder</span>
                <span class="espaciador"></span>
                <button type="button" class="btn btn-fantasma" id="cp-silencio">Guardar silencio</button>
                <button type="button" class="btn btn-primario" id="cp-enviar">${icono('enviar', 18)}Responder</button>
              </div>
            </div>
          </div>
          <div class="mesa-pie">
            <span class="contador" id="contador"></span>
            <span class="espaciador"></span>
            <button type="button" class="btn" id="cp-terminar">${icono('check', 18)}Terminar la conversación</button>
          </div>
        </section>
      </div>
    </div>`;
    const $ = s => cont.querySelector(s);
    const area = $('#cp-resp');
    let espera = null;
    const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    function pintarHilo(esperando = false) {
      const actual = E.turnos.length < P.length ? P[E.turnos.length] : null;
      $('#cp-hilo').innerHTML = E.turnos.map(t => `<p class="cp-voz">${esc(t.v)}</p>${t.r === null ? '<p class="cp-silencio">Silencio</p>' : `<p class="cp-resp-dicha">${esc(t.r)}</p>`}`).join('')
        + (esperando ? '<p class="cp-voz cp-espera" aria-label="La voz va a hablar"><span></span><span></span><span></span></p>'
          : actual !== null ? `<p class="cp-voz cp-actual">${esc(actual)}</p>` : '');
    }
    function pintarCuenta() {
      const r = respuestas(E);
      const s = silencios(E);
      const faltan = Math.max(0, MIN_RESP - r);
      $('#contador').textContent = `${cuenta(r, 'respuesta', 'respuestas')}${s ? ` · ${cuenta(s, 'silencio', 'silencios')}` : ''}${faltan ? ` · ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`} para poder terminar` : ''}`;
      $('#cp-cuenta').innerHTML = `<span class="rotulo">Parlamento ${Math.min(E.turnos.length + 1, P.length)} de ${P.length}</span>
        <div class="cp-barra" aria-hidden="true"><i style="width:${Math.round(100 * E.turnos.length / P.length)}%"></i></div>`;
      const b = $('#cp-terminar');
      b.disabled = !!faltan;
      b.title = faltan ? `Puede terminar con ${MIN_RESP} respuestas` : '';
    }
    function listo() {
      $('#cp-enviar').disabled = $('#cp-silencio').disabled = !!espera;
      area.disabled = !!espera;
      if (!espera) area.focus({ preventScroll: true });
    }
    function bajar() {
      const ult = $('#cp-hilo').lastElementChild;
      (ult || area).scrollIntoView({ block: 'center', behavior: reducido() ? 'auto' : 'smooth' });
    }

    function turno(r) {
      if (espera || E.turnos.length >= P.length) return;
      E.turnos.push({ v: P[E.turnos.length], r });
      area.value = '';
      crecer(area);
      if (E.turnos.length >= P.length) {
        E.completo = true;
        E.fase = 'revelacion';
        cambio();
        guardarNube.ahora();
        pintar();
        return;
      }
      cambio();
      pintarCuenta();
      if (reducido()) { pintarHilo(); bajar(); listo(); return; }
      espera = setTimeout(() => { espera = null; pintarHilo(); bajar(); listo(); }, PAUSA);
      pintarHilo(true);
      bajar();
      listo();
    }
    function responder() {
      const r = sinRaya(area.value);
      if (!r) { aviso('Escriba su respuesta, o guarde silencio.'); area.focus(); return; }
      turno(r);
    }
    async function terminar() {
      if (respuestas(E) < MIN_RESP) return;
      if (sinRaya(area.value) && !(await confirmar('Lo que está escribiendo todavía no es una respuesta y se pierde al terminar. ¿Terminar de todos modos?', { si: 'Terminar', no: 'Seguir conversando' }))) return;
      if (!(await confirmar('¿Terminar la conversación? Ya no podrá seguir respondiendo.', { si: 'Terminar', no: 'Seguir conversando' }))) return;
      E.fase = 'revelacion';
      E.completo = false;
      cambio();
      guardarNube.ahora();
      pintar();
    }

    $('#cp-enviar').addEventListener('click', responder);
    $('#cp-silencio').addEventListener('click', () => turno(null));
    $('#cp-terminar').addEventListener('click', terminar);
    area.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); responder(); }
    });
    area.addEventListener('input', () => crecer(area));
    $('#enfoque').addEventListener('click', ev => { ev.currentTarget.classList.toggle('on', document.body.classList.toggle('enfoque')); });

    pintarHilo();
    pintarCuenta();
    if (E.turnos.length) requestAnimationFrame(bajar);
    listo();
    return () => { clearTimeout(espera); document.body.classList.remove('enfoque'); };
  }

  // ---------------------------------------------------------------
  // 2. Revelación
  // ---------------------------------------------------------------
  function revelacion() {
    const r = respuestas(E);
    const s = silencios(E);
    cont.innerHTML = `
    <div class="contenedor contenedor-estrecho" style="--acento:${ACENTO}">
      <section class="tarjeta cp-revelacion">
        <span class="cp-sello">${icono('dialogo', 28)}</span>
        <span class="rotulo">${E.completo ? 'La voz no tiene nada más que decir' : 'Fin de la conversación'}</span>
        <p class="cp-revela">${E.banco.revelacion ? esc(E.banco.revelacion) : `Usted conversó con ${vozHTML(E.banco)}.`}</p>
        ${E.banco.traductor && !E.banco.revelacion ? `<p class="tenue cp-revela-trad">Traducción de ${esc(E.banco.traductor)}.</p>` : ''}
        <p class="cp-revela-cuenta">${cuenta(r, 'respuesta', 'respuestas')}${s ? ` y ${cuenta(s, 'silencio', 'silencios')}` : ''}.</p>
        <p class="cp-revela-nota">Ahora su conversación pasa a la versión preliminar: allí la convierte en una historia. Solo usted la ve hasta que la publique.</p>
        <div class="cp-revela-acciones">
          <button type="button" class="btn btn-primario" id="cp-montar">${icono('lapiz', 18)}Pasar a la versión preliminar</button>
          <button type="button" class="btn btn-fantasma" id="cp-ver">${icono('ojo', 18)}Ver la conversación</button>
        </div>
      </section>
    </div>`;
    cont.querySelector('#cp-ver').addEventListener('click', verConversacion);
    cont.querySelector('#cp-montar').addEventListener('click', () => {
      Object.assign(E, armarMontaje(E.turnos), { fase: 'montaje' });
      cambio();
      guardarNube.ahora();
      pintar();
    });
    return () => {};
  }

  function verConversacion() {
    modal({
      titulo: 'La conversación',
      cuerpo: `<div class="cp-modal">${conversacionHTML(E.turnos)}</div>`,
      acciones: [{ texto: 'Cerrar', clase: 'btn-primario' }],
      ancho: 680,
    });
  }

  // ---------------------------------------------------------------
  // 3. Versión preliminar
  // ---------------------------------------------------------------
  function montaje() {
    cont.innerHTML = `
    <div class="contenedor" style="max-width:1400px">
      <div class="escritorio cp-escritorio" style="--acento:${ACENTO}">
        <aside class="consigna-panel cp-panel">
          <span class="rotulo">Contrapuntos · versión preliminar</span>
          <h1>Del diálogo a la historia</h1>
          <div class="consigna-texto">
            <p>Su conversación ya es un diálogo. Ahora conviértalo en una historia.</p>
            <ol>${PASOS_MONTAJE.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
          </div>
          <details class="cp-detalle" id="cp-guia"${window.innerWidth > 960 ? ' open' : ''}>
            <summary>${icono('libro', 16)}Cómo se escribe un diálogo</summary>
            ${guiaHTML()}
          </details>
        </aside>
        <section class="mesa cp-mesa">
          <div class="mesa-barra">
            ${volverHTML}
            <span class="rotulo cp-rotulo">${entrega ? 'Editar la historia' : 'Versión preliminar · solo la ve usted'}</span>
            <span class="espaciador"></span>
            <span class="guardado" id="guardado">${esc(nota)}</span>
            <button type="button" class="herr cp-raya" id="cp-raya" title="Insertar una raya (—)" aria-label="Insertar una raya">—</button>
            <button type="button" class="herr" id="cp-ver" title="Ver la conversación" aria-label="Ver la conversación">${icono('ojo', 18)}</button>
            <button type="button" class="herr" id="enfoque" title="Modo enfoque" aria-label="Modo enfoque">${icono('enfoque', 18)}</button>
          </div>
          <div class="hoja-escribir cp-hoja">
            <input class="titulo-escribir" id="titulo" placeholder="Título" maxlength="140" value="${esc(E.titulo)}" aria-label="Título">
            <p class="cp-leyenda"><span class="cp-c-v">La voz</span> · <span>Usted</span> · <span class="cp-c-s">${esc(SILENCIO)}</span> = un silencio</p>
            <div class="cp-editor">
              <div class="cp-fondo" id="cp-fondo" aria-hidden="true"></div>
              <textarea class="cp-texto" id="cp-texto" spellcheck="true" rows="6" aria-label="Su historia"></textarea>
            </div>
            <div class="cp-avisos" id="cp-avisos" aria-live="polite"></div>
          </div>
          <div class="mesa-pie">
            <span class="contador" id="contador"></span>
            <span class="espaciador"></span>
            <button type="button" class="btn btn-primario" id="cp-publicar">${icono(entrega ? 'check' : 'enviar', 18)}${entrega ? 'Guardar cambios' : 'Publicar la historia'}</button>
          </div>
        </section>
      </div>
    </div>`;
    const $ = s => cont.querySelector(s);
    const area = $('#cp-texto');
    let org = deTramos(E.tramos, E.texto.length);
    let previo = E.texto;
    let marca = null;
    let quitarMarca = null;
    area.value = E.texto;

    // La escritura se ve con sus colores en una capa debajo del área de texto (que es transparente).
    function pintarFondo() {
      const v = area.value;
      let html;
      if (marca && marca.b <= v.length) {
        html = coloreadoOrg(v.slice(0, marca.a), org.slice(0, marca.a), { enParrafos: false, clase: 'cp-c' })
          + `<mark class="cp-marca">${coloreadoOrg(v.slice(marca.a, marca.b), org.slice(marca.a, marca.b), { enParrafos: false, clase: 'cp-c' })}</mark>`
          + coloreadoOrg(v.slice(marca.b), org.slice(marca.b), { enParrafos: false, clase: 'cp-c' });
      } else html = coloreadoOrg(v, org, { enParrafos: false, clase: 'cp-c' });
      $('#cp-fondo').innerHTML = html + '\n';
    }
    function pintarAvisos() {
      const lista = revisar(area.value);
      const quedan = aTramos(org).filter(t => t[2] === 's').length;
      $('#cp-avisos').innerHTML = `
        <div class="cp-avisos-cab"><span class="rotulo">Revisor</span><span class="cp-avisos-n">${lista.length ? cuenta(lista.length, 'aviso', 'avisos') : 'Sin avisos de puntuación'}</span></div>
        ${quedan ? `<p class="cp-aviso-silencio">${quedan === 1 ? 'Queda 1 silencio marcado' : `Quedan ${quedan} silencios marcados`}: escriba ahí o bórrelo. Los que queden se quitan al publicar.</p>` : ''}
        ${lista.length ? `<ul>${lista.map(x => `<li><button type="button" data-a="${x.a}" data-b="${x.b}"><b>Párrafo ${x.n}</b>${esc(x.msg)}</button></li>`).join('')}</ul>` : ''}`;
    }
    const avisosLuego = debounce(pintarAvisos, 450);
    function pintarPie() {
      const n = contarPalabras(area.value.split(SILENCIO).join(' '));
      const falta = !E.titulo.trim();
      $('#contador').textContent = `${enPalabras(n)}${falta ? ' · Falta el título' : ''}`;
      $('#contador').classList.toggle('pasado', falta);
      $('#cp-publicar').disabled = falta;
    }
    function irAParrafo(a, b) {
      area.focus({ preventScroll: true });
      area.setSelectionRange(a, b);
      marca = { a, b };
      pintarFondo();
      cont.querySelector('.cp-marca')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      clearTimeout(quitarMarca);
      quitarMarca = setTimeout(() => { marca = null; pintarFondo(); }, 2200);
    }

    // Lo que se escribe o se cambia a mano es escritura propia. Dos guiones seguidos se vuelven raya.
    area.addEventListener('input', () => {
      let v = area.value;
      const o = previo;
      const max = Math.min(v.length, o.length);
      let p = 0;
      while (p < max && v[p] === o[p]) p++;
      let s = 0;
      while (s < max - p && v[v.length - 1 - s] === o[o.length - 1 - s]) s++;
      org = [...org.slice(0, p), ...new Array(v.length - p - s).fill('p'), ...org.slice(o.length - s)];
      if (v.includes('--')) {
        let cur = area.selectionStart;
        let nv = '';
        const no = [];
        for (let i = 0; i < v.length; i++) {
          if (v[i] === '-' && v[i + 1] === '-') { nv += '—'; no.push('p'); if (i + 1 < cur) cur--; i++; continue; }
          nv += v[i]; no.push(org[i]);
        }
        v = nv; org = no;
        area.value = v;
        area.setSelectionRange(cur, cur);
      }
      previo = v;
      E.texto = v;
      E.tramos = aTramos(org);
      marca = null;
      crecer(area);
      pintarFondo();
      cambio();
      pintarPie();
      avisosLuego();
    });
    $('#cp-raya').addEventListener('mousedown', ev => ev.preventDefault());
    $('#cp-raya').addEventListener('click', () => {
      const a = area.selectionStart ?? area.value.length;
      const b = area.selectionEnd ?? a;
      area.focus({ preventScroll: true });
      area.setRangeText('—', a, b, 'end');
      area.dispatchEvent(new Event('input'));
    });
    $('#cp-avisos').addEventListener('click', ev => {
      const b = ev.target.closest('[data-a]');
      if (b) irAParrafo(Number(b.dataset.a), Number(b.dataset.b));
    });
    $('#titulo').addEventListener('input', ev => { E.titulo = ev.target.value; cambio(); pintarPie(); });
    $('#cp-ver').addEventListener('click', verConversacion);
    $('#cp-publicar').addEventListener('click', publicar);
    $('#enfoque').addEventListener('click', ev => { ev.currentTarget.classList.toggle('on', document.body.classList.toggle('enfoque')); });
    const alCambiarTamano = debounce(() => crecer(area), 150);
    window.addEventListener('resize', alCambiarTamano);

    async function publicar() {
      const titulo = E.titulo.trim();
      if (!titulo) { aviso('Falta el título.'); $('#titulo').focus(); return; }
      // Los silencios que quedan se quitan.
      const v = area.value;
      let t = '';
      const o = [];
      for (let i = 0; i < v.length; i++) if (org[i] !== 's') { t += v[i]; o.push(org[i]); }
      const L = limpiarConOrigen(t, o);
      if (!L.texto) { aviso('La historia está vacía.'); return; }
      const quedan = aTramos(org).filter(x => x[2] === 's').length;
      const avisos = revisar(v).length;
      const extra = `${quedan ? ` ${quedan === 1 ? 'El silencio marcado que queda se quita' : `Los ${quedan} silencios marcados que quedan se quitan`}.` : ''}${avisos ? ` El revisor tiene ${cuenta(avisos, 'aviso', 'avisos')} de puntuación.` : ''}`;
      if (!entrega && !(await confirmar(`${avisoPublicar('su historia', 'la')}${extra}`, { si: 'Publicar', no: 'Seguir escribiendo' }))) return;
      if (entrega && extra && !(await confirmar(`${extra.trim()} ¿Guardar los cambios?`, { si: 'Guardar cambios', no: 'Seguir escribiendo' }))) return;
      const btn = $('#cp-publicar');
      btn.disabled = true;
      const datos = { banco: E.banco, turnos: E.turnos, completo: E.completo, historia: L.texto, tramos: aTramos(L.org) };
      try {
        publicado = true;
        guardarNube.cancelar();
        await publicarEntrega({
          dinamica: SLUG, item_id: itemId, titulo,
          texto: `${L.texto}\n\n${creditoDe(datos.banco)}`, vista: vistaHTML(datos), datos, modulo_version: VERSION,
        }, { entregaExistente: entrega });
        if (!entrega) quitarBorrador(clave);
      } catch (err) {
        publicado = false;
        cambio();
        errorAviso(err);
        btn.disabled = false;
      }
    }

    crecer(area);
    pintarFondo();
    pintarAvisos();
    pintarPie();
    return () => {
      window.removeEventListener('resize', alCambiarTamano);
      clearTimeout(quitarMarca);
      avisosLuego.cancelar();
      document.body.classList.remove('enfoque');
    };
  }

  pintar();
  return () => {
    limpiar();
    if (!publicado && !entrega && empezado(E)) guardarNube.ahora();
  };
}
