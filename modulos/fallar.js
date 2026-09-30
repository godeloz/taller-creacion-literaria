// Módulo: Fallar mejor. Revisar un borrador con control de cambios: lo que se
// borra queda tachado y lo que se agrega aparece en color. Al publicar se abre
// la versión final de quien lo escribió, si el tutor la cargó.
//
// El texto es una lista de caracteres { c, s, d, n }:
//   c  el carácter ('\n' es salto de línea; dos seguidos separan párrafos)
//   s  origen: 'o' original · 'ad' tachado por la autora · 'ai' duda de la autora […] · 'i' agregado
//   d  tachado (en 'ad' empieza en true: recuperarlo es ponerlo en false)
//   n  identificador estable: amarra las explicaciones del historial a su cambio
//
// La versión de la autora vive en un elemento aparte ('_autora-<id>') que la
// base de datos solo entrega a quien ya publicó su revisión de ese texto.
import { estado, esTutor, soyVisible } from '../nucleo/estado.js';
import { esc, local, debounce, confirmar, aviso, errorAviso, hace, contarPalabras } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const SLUG = 'fallar';
const ACENTO = '#5B3DF5';
const VERSION = '1.0';
const AUTORA = '_autora-';
const PROPIO = 'propio-';
const NUEVO = 'propio-nuevo';
const MAX_PALABRAS = 3000;
const CLAVE_INDICE = `${SLUG}:_propios`;
const RE_LETRA = /[\p{L}\p{M}\p{N}'’-]/u;

const esPropio = id => String(id || '').startsWith(PROPIO);
const cambiado = ch => ch.s === 'i' || (ch.s === 'ad' ? !ch.d : ch.d);

// ---------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------
function normalizarSaltos(t) {
  return String(t ?? '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\t/g, ' ')
    .replace(/[ ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ~~texto~~ = tachado por la autora · [texto] = duda de la autora
function leerMarcado(fuente) {
  const t = normalizarSaltos(fuente);
  const chars = [];
  let modo = 'o';
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith('~~', i) && modo !== 'ai') { modo = modo === 'ad' ? 'o' : 'ad'; i++; continue; }
    if (t[i] === '[' && modo === 'o') { modo = 'ai'; continue; }
    if (t[i] === ']' && modo === 'ai') { modo = 'o'; continue; }
    chars.push({ c: t[i], s: modo, d: modo === 'ad', n: chars.length });
  }
  return chars;
}

function empacar(chars) {
  const runs = [];
  for (const ch of chars) {
    const u = runs[runs.length - 1];
    if (u && u.s === ch.s && u.d === ch.d && u.n + u.t.length === ch.n) u.t += ch.c;
    else runs.push({ t: ch.c, s: ch.s, d: ch.d, n: ch.n });
  }
  return runs;
}

function desempacar(runs) {
  const out = [];
  for (const r of runs || []) for (let k = 0; k < r.t.length; k++) out.push({ c: r.t[k], s: r.s, d: !!r.d, n: r.n + k });
  return out;
}

function textoLimpio(chars) {
  return chars.filter(ch => !ch.d).map(ch => ch.c).join('')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([,.;:!?…)\]»”’])/g, '$1')
    .replace(/([(¿¡«“]) +/g, '$1')
    .replace(/^ +| +$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Texto del borrador tal como lo dejó la autora (sin lo que ella tachó).
const textoBorrador = marcado => textoLimpio(leerMarcado(marcado));

const parrafosHTML = t => String(t || '').split(/\n{2,}/).filter(p => p.trim()).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

function estilo(ch) {
  if (ch.s === 'i') return 'ag';
  if (ch.s === 'ad') return ch.d ? 'ta' : 'rec';
  if (ch.s === 'ai') return ch.d ? 'td du' : 'du';
  return ch.d ? 'td' : '';
}
const clases = e => e.split(' ').filter(Boolean).map(x => `fm-${x}`).join(' ');

// Versión con marcas, para leer (vista publicada, paneles y resultado).
function marcasHTML(chars) {
  let html = '';
  let i = 0;
  while (i < chars.length) {
    const e = estilo(chars[i]);
    let j = i;
    let t = '';
    while (j < chars.length && estilo(chars[j]) === e && (chars[j].s === 'ai') === (chars[i].s === 'ai')) { t += chars[j].c; j++; }
    const ini = chars[i].s === 'ai' && (i === 0 || chars[i - 1].s !== 'ai');
    const fin = chars[j - 1].s === 'ai' && (j === chars.length || chars[j].s !== 'ai');
    const tachado = e === 'ta' || e.startsWith('td');
    let cuerpo = esc(t).replace(/\n/g, tachado ? '¶' : e === 'ag' ? '¶<br>' : '<br>');
    if (e === 'ag' || e === 'rec') cuerpo = `<u class="${clases(e)}">${cuerpo}</u>`;
    else if (tachado) cuerpo = `<s class="${clases(e)}">${cuerpo}</s>`;
    else if (e === 'du') cuerpo = `<span class="fm-du">${cuerpo}</span>`;
    html += (ini ? '<span class="fm-cor">[</span>' : '') + cuerpo + (fin ? '<span class="fm-cor">]</span>' : '');
    i = j;
  }
  return `<div class="fm-marcas">${html}</div>`;
}

// ---------- historial: cambios contiguos ----------
function unidades(chars) {
  const out = [];
  let i = 0;
  while (i < chars.length) {
    if (!cambiado(chars[i])) { i++; continue; }
    const u = { a: i, ids: [], tach: '', agr: '', rec: '' };
    let j = i;
    while (j < chars.length && cambiado(chars[j])) {
      const ch = chars[j];
      u.ids.push(ch.n);
      if (ch.s === 'i') u.agr += ch.c; else if (ch.s === 'ad') u.rec += ch.c; else u.tach += ch.c;
      j++;
    }
    u.b = j;
    u.clave = String(chars[i].n);
    out.push(u);
    i = j;
  }
  return out;
}

function citar(s) {
  const t = s.replace(/\n+/g, ' ¶ ').replace(/\s+/g, ' ').trim();
  if (!t) return s.includes('\n') ? 'un salto de línea' : 'un espacio';
  return `«${t.length > 70 ? t.slice(0, 68).trim() + '…' : t}»`;
}

function describir(u) {
  const partes = [];
  if (u.tach && u.agr) partes.push(`Cambió ${citar(u.tach)} por ${citar(u.agr)}`);
  else if (u.tach) partes.push(`Tachó ${citar(u.tach)}`);
  else if (u.agr) partes.push(`Agregó ${citar(u.agr)}`);
  if (u.rec) partes.push(`Recuperó ${citar(u.rec)}`);
  return partes.join(' · ');
}

const explicacionDe = (u, expl) => { for (const id of u.ids) if (expl[id]) return expl[id]; return ''; };

function normalizarExpl(chars, expl) {
  const nuevo = {};
  for (const u of unidades(chars)) { const t = explicacionDe(u, expl); if (t.trim()) nuevo[u.clave] = t; }
  return nuevo;
}

// ---------- entrega publicada ----------
function historialVista(us, expl) {
  if (!us.length) return '';
  return `<div class="v-fallar-hist"><div class="v-rotulo">Historial de cambios · ${us.length}</div><ol>${us.map(u => {
    const t = explicacionDe(u, expl).trim();
    return `<li><span class="v-cambio">${esc(describir(u))}</span>${t ? `<span class="v-porque">${esc(t)}</span>` : ''}</li>`;
  }).join('')}</ol></div>`;
}

function armarEntrega({ chars, expl, titulo, itemId, base }) {
  const ex = normalizarExpl(chars, expl);
  const limpio = textoLimpio(chars);
  const us = unidades(chars);
  const credito = base.propio
    ? `Revisión de un texto propio${base.titulo ? `: «${base.titulo}»` : ''}.`
    : `Revisión del borrador «${base.titulo}»${base.autor ? `, de ${base.autor}` : ''}.`;
  const razones = us.map(u => ({ u, t: explicacionDe(u, ex).trim() })).filter(x => x.t);
  const vista = `<div class="v-fallar"><div class="v-fallar-cols">`
    + `<div class="v-fallar-col"><div class="v-rotulo">Nueva versión</div>${parrafosHTML(limpio)}</div>`
    + `<div class="v-fallar-col"><div class="v-rotulo">Con cambios</div>${marcasHTML(chars)}</div></div>`
    + `${historialVista(us, ex)}<p class="v-credito">${esc(credito)}</p></div>`;
  const texto = [limpio, credito, razones.length ? 'Por qué cambié:\n' + razones.map(x => `– ${describir(x.u)}: ${x.t}`).join('\n') : '']
    .filter(Boolean).join('\n\n');
  return {
    dinamica: SLUG, item_id: itemId, titulo: (titulo || '').trim() || (base.propio ? base.titulo || '' : ''), texto, vista,
    modulo_version: VERSION,
    datos: { runs: empacar(chars), expl: ex, n_cambios: us.length, base_titulo: base.titulo || '', base_autor: base.autor || '', ...(base.propio ? { propio: true } : {}) },
  };
}

// ---------- diferencias entre dos textos (cambios de la autora) ----------
function diferencias(a, b) {
  const tok = t => t.match(/\n+|[ ]+|[\p{L}\p{M}\p{N}'’-]+|[^\s\p{L}\p{M}\p{N}]/gu) || [];
  const x = tok(a), y = tok(b);
  const n = x.length, m = y.length;
  if (n * m > 3e6) return null;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (t, s) => { const u = out[out.length - 1]; if (u && u.s === s) u.t += t; else out.push({ t, s }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { push(x[i], '='); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push(x[i], '-'); i++; }
    else { push(y[j], '+'); j++; }
  }
  while (i < n) push(x[i++], '-');
  while (j < m) push(y[j++], '+');
  return out.map(r => {
    const h = esc(r.t);
    if (r.s === '=') return h.replace(/\n/g, '<br>');
    if (r.s === '-') return r.t.trim() ? `<s class="fm-ta">${h.replace(/\n/g, '¶')}</s>` : '';
    return r.t.trim() ? `<u class="fm-aa">${h.replace(/\n/g, '<br>')}</u>` : h.replace(/\n/g, '<br>');
  }).join('');
}

// Comentario: párrafos separados por línea en blanco; '> ' al inicio = cita;
// ~~texto~~ = tachado.
function comentarioHTML(t) {
  return normalizarSaltos(t).split(/\n{2,}/).map(p => {
    const cita = p.startsWith('>');
    const cuerpo = esc(cita ? p.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n') : p)
      .replace(/~~(.+?)~~/gs, '<s class="fm-ta">$1</s>').replace(/\n/g, '<br>');
    return cita ? `<blockquote>${cuerpo}</blockquote>` : `<p>${cuerpo}</p>`;
  }).join('');
}

// ---------- borradores ----------
async function leerBorrador(clave) {
  const loc = local(`borrador:${estado.yo.id}:${clave}`);
  let nube = null;
  try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
  return [loc, nube].filter(Boolean).sort((a, c) => (c._actualizado || '').localeCompare(a._actualizado || ''))[0] || null;
}
async function escribirBorrador(clave, datos) {
  local(`borrador:${estado.yo.id}:${clave}`, { ...datos, _actualizado: new Date().toISOString() });
  try { await estado.api.guardarBorrador(clave, datos); return true; } catch { return false; }
}
function quitarBorrador(clave) {
  local(`borrador:${estado.yo.id}:${clave}`, null);
  estado.api.borrarBorrador(clave).catch(() => {});
}
async function leerIndice() { return (await leerBorrador(CLAVE_INDICE))?.lista || []; }
async function guardarIndice(lista) { await escribirBorrador(CLAVE_INDICE, { lista }); }

// ---------------------------------------------------------------------
// Pantallas
// ---------------------------------------------------------------------
export default {
  slug: SLUG,
  nombre: 'Fallar mejor',
  version: VERSION,

  async abrir(cont, ctx) {
    const query = ctx.query || {};
    if (ctx.entrega) {
      return esPropio(ctx.entrega.item_id) ? editor(cont, { entrega: ctx.entrega }) : resultado(cont, { entrega: ctx.entrega });
    }
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    if (!id) return portada(cont);
    if (id === NUEVO) return nuevoPropio(cont);
    if (id.startsWith('_')) { location.replace(`#/d/${SLUG}`); return; }
    const mias = await estado.api.entregas({ dinamica: SLUG, autor: estado.yo.id, item_id: id, conVista: true });
    const mia = mias.find(e => e.autor === estado.yo.id);
    if (mia) return resultado(cont, { entrega: mia, verAutora: 'autora' in query });
    if (esTutor() && 'autora' in query) return resultado(cont, { soloAutora: id });
    return editor(cont, { item: id });
  },

  paquete: {
    plantilla: 'plantillas/fallar.json',
    describir: d => d.tipo === 'autora'
      ? `Versión final · ${d.titulo}${d.comentario ? ' · con comentario' : ''}`
      : `${d.titulo}${d.autor ? ` · ${d.autor}` : ''}`,
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json) ? json : Array.isArray(json?.textos) ? json.textos : null;
      if (!lista || !lista.length) return { items, errores: ['El archivo debe tener una lista "textos": [ … ] con al menos un texto.'] };
      const vistos = new Set();
      const txt = v => (typeof v === 'string' ? v.trim() : '');
      lista.forEach((t, i) => {
        const id = txt(t?.id);
        const n = `Texto ${i + 1}${id ? ` (${id})` : ''}`;
        if (!id) errores.push(`Texto ${i + 1}: falta "id".`);
        else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errores.push(`${n}: el id solo puede tener minúsculas sin tildes, números y guiones.`);
        else if (id.startsWith(PROPIO)) errores.push(`${n}: el id no puede empezar con "${PROPIO}".`);
        else if (vistos.has(id)) errores.push(`${n}: el id está repetido.`);
        vistos.add(id);
        const titulo = txt(t?.titulo);
        const borrador = txt(t?.borrador);
        const final = txt(t?.final);
        const comentario = txt(t?.comentario);
        if (!titulo) errores.push(`${n}: falta "titulo".`);
        if (!borrador) errores.push(`${n}: falta "borrador" (el texto que se va a revisar).`);
        else {
          if ((borrador.match(/~~/g) || []).length % 2) errores.push(`${n}: en "borrador" hay un ~~ sin cerrar.`);
          let abierto = false;
          for (const c of borrador.replace(/~~/g, '')) {
            if (c === '[') { if (abierto) { errores.push(`${n}: en "borrador" hay un [ dentro de otro.`); break; } abierto = true; }
            if (c === ']') { if (!abierto) { errores.push(`${n}: en "borrador" hay un ] sin su [.`); break; } abierto = false; }
          }
          if (abierto) errores.push(`${n}: en "borrador" hay un [ sin cerrar.`);
          if (!textoBorrador(borrador)) errores.push(`${n}: el borrador queda vacío.`);
        }
        if (comentario && !final) errores.push(`${n}: tiene "comentario" pero no "final". El comentario acompaña a la versión final.`);
        const autor = txt(t?.autor);
        items.push({ item_id: id, datos: { titulo, autor, borrador, con_final: !!final } });
        if (final) {
          items.push({
            item_id: AUTORA + id,
            datos: { tipo: 'autora', de: id, titulo, autor, titulo_final: txt(t?.titulo_final), final, comentario, comentario_titulo: txt(t?.comentario_titulo), fuente: txt(t?.fuente) },
          });
        }
      });
      return { items, errores };
    },
    // Reúne cada texto con su versión final para exportar el contenido actual.
    exportar(items) {
      const finales = Object.fromEntries(items.filter(i => i.item_id.startsWith(AUTORA)).map(i => [i.datos.de, i.datos]));
      const textos = items.filter(i => !i.item_id.startsWith('_')).map(i => {
        const f = finales[i.item_id] || {};
        const t = { id: i.item_id, titulo: i.datos.titulo, autor: i.datos.autor, borrador: i.datos.borrador };
        for (const k of ['titulo_final', 'final', 'comentario_titulo', 'comentario', 'fuente']) if (f[k]) t[k] = f[k];
        return t;
      });
      return { textos };
    },
  },
};

// ---------------------------------------------------------------------
// Portada: introducción, borradores y textos propios
// ---------------------------------------------------------------------
async function portada(cont) {
  const [todos, mias, indice] = await Promise.all([
    estado.api.contenidos(SLUG),
    estado.api.entregas({ dinamica: SLUG, autor: estado.yo.id }),
    leerIndice(),
  ]);
  const textos = todos.filter(c => !c.item_id.startsWith('_'));
  const publicadas = new Map(mias.filter(e => e.autor === estado.yo.id).map(e => [e.item_id, e]));
  const enCurso = id => !!local(`borrador:${estado.yo.id}:${SLUG}:${id}`)?.runs;
  const propiosEnCurso = indice.filter(p => !publicadas.has(p.id));
  const propiosPublicados = [...publicadas.values()].filter(e => esPropio(e.item_id));

  const tarjetaTexto = c => {
    const d = c.datos;
    const pub = publicadas.get(c.item_id);
    const extracto = textoBorrador(d.borrador).replace(/\s+/g, ' ');
    return `<article class="fm-tarjeta">
      <a class="fm-tarjeta-enlace" href="#/d/${SLUG}/${encodeURIComponent(c.item_id)}">
        ${d.autor ? `<span class="rotulo">${esc(d.autor)}</span>` : ''}
        <span class="fm-tarjeta-titulo">${esc(d.titulo)}</span>
        <span class="fm-tarjeta-extracto">${esc(extracto.length > 170 ? extracto.slice(0, 168) + '…' : extracto)}</span>
      </a>
      <div class="fm-tarjeta-pie">
        ${pub ? `<span class="estado-pill si">${icono('check', 13)}Publicado</span>` : enCurso(c.item_id) ? '<span class="estado-pill">En curso</span>' : ''}
        ${d.con_final ? `<span class="fm-pista" title="Se abre cuando publique su revisión">${icono(pub ? 'libro' : 'candado', 13)}Versión final${pub ? ' disponible' : ' al publicar'}</span>` : ''}
        <span class="espaciador"></span>
        ${esTutor() && d.con_final && !pub ? `<a class="btn btn-chico btn-fantasma" href="#/d/${SLUG}/${encodeURIComponent(c.item_id)}?autora">${icono('libro', 15)}Versión final</a>` : ''}
        <a class="btn btn-chico ${pub ? 'btn-fantasma' : 'btn-primario'}" href="#/d/${SLUG}/${encodeURIComponent(c.item_id)}">${pub ? 'Ver su versión' : enCurso(c.item_id) ? 'Seguir' : 'Revisar'}</a>
      </div>
    </article>`;
  };

  cont.innerHTML = `
  <div class="contenedor fm-portada" style="--acento:${ACENTO}">
    <section class="fm-intro">
      <span class="fm-sello">${icono('revision', 28)}</span>
      <div>
        <span class="rotulo">Fallar mejor</span>
        <h1 class="saludo">Todo texto fue antes un borrador</h1>
        <div class="fm-intro-texto">
          <p>Aquí recibe un borrador con las dudas y los tachones de quien lo escribió, y lo revisa con control de cambios. Tache lo que sobra, agregue lo que falta, cambie una palabra por otra. Lo que borra queda tachado; lo que escribe aparece en color.</p>
          <p>Pregúntese qué le sobra al texto, qué le falta, qué dice dos veces y dónde debería terminar. Apropíese de él: esta versión es suya.</p>
          <p>Al publicar podrá leer la versión final. No se trata de adivinarla, sino de ver otra manera de resolver los mismos problemas.</p>
        </div>
      </div>
    </section>

    <h2 class="titulo-seccion fm-titulo">Borradores</h2>
    ${textos.length ? `<div class="fm-rejilla">${textos.map(tarjetaTexto).join('')}</div>`
      : vacio('Todavía no hay borradores', 'El tutor los cargará pronto. Mientras tanto, puede revisar un texto suyo.')}

    <h2 class="titulo-seccion fm-titulo">Sus textos</h2>
    <div class="fm-rejilla">
      <a class="fm-tarjeta fm-tarjeta-nueva" href="#/d/${SLUG}/${NUEVO}">
        <span class="fm-mas">${icono('mas', 26)}</span>
        <span class="fm-tarjeta-titulo">Revisar un texto propio</span>
        <span class="fm-tarjeta-extracto">Pegue un borrador suyo y trabájelo con las mismas herramientas.</span>
      </a>
      ${propiosEnCurso.map(p => `<article class="fm-tarjeta">
        <a class="fm-tarjeta-enlace" href="#/d/${SLUG}/${encodeURIComponent(p.id)}">
          <span class="rotulo">Texto propio · empezado ${esc(hace(p.creado || new Date().toISOString()))}</span>
          <span class="fm-tarjeta-titulo">${esc(p.titulo || 'Sin título')}</span>
        </a>
        <div class="fm-tarjeta-pie"><span class="estado-pill">En curso</span><span class="espaciador"></span>
          <button type="button" class="btn btn-chico btn-fantasma btn-icono" data-descartar="${esc(p.id)}" aria-label="Descartar este borrador" title="Descartar">${icono('basura', 16)}</button>
          <a class="btn btn-chico btn-primario" href="#/d/${SLUG}/${encodeURIComponent(p.id)}">Seguir</a></div>
      </article>`).join('')}
      ${propiosPublicados.map(e => `<article class="fm-tarjeta">
        <a class="fm-tarjeta-enlace" href="#/d/${SLUG}/${encodeURIComponent(e.item_id)}">
          <span class="rotulo">Texto propio · publicado ${esc(hace(e.creado))}</span>
          <span class="fm-tarjeta-titulo">${esc(e.titulo || 'Sin título')}</span>
          <span class="fm-tarjeta-extracto">${esc((e.texto || '').split('\n\n')[0].slice(0, 150))}${(e.texto || '').split('\n\n')[0].length > 150 ? '…' : ''}</span>
        </a>
        <div class="fm-tarjeta-pie"><span class="estado-pill si">${icono('check', 13)}Publicado</span><span class="espaciador"></span>
          <a class="btn btn-chico btn-fantasma" href="#/d/${SLUG}/${encodeURIComponent(e.item_id)}">Ver su versión</a></div>
      </article>`).join('')}
    </div>
  </div>`;

  cont.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-descartar]');
    if (!b) return;
    if (!(await confirmar('¿Descartar este borrador? Se pierde lo que haya revisado.', { si: 'Descartar', peligro: true }))) return;
    const id = b.dataset.descartar;
    quitarBorrador(`${SLUG}:${id}`);
    await guardarIndice((await leerIndice()).filter(p => p.id !== id));
    b.closest('.fm-tarjeta').remove();
    aviso('Borrador descartado.');
  });
}

// ---------------------------------------------------------------------
// Texto propio: pegar y empezar
// ---------------------------------------------------------------------
function nuevoPropio(cont) {
  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho" style="--acento:${ACENTO}">
    <a class="btn btn-fantasma btn-chico" href="#/d/${SLUG}" style="margin-bottom:14px">${icono('izquierda', 16)}Fallar mejor</a>
    <section class="tarjeta fm-nuevo">
      <span class="rotulo">Fallar mejor · Texto propio</span>
      <h1 class="titulo-seccion" style="margin:6px 0 8px">Traiga un borrador suyo</h1>
      <p class="tenue" style="margin-top:0">Péguelo aquí y revíselo con control de cambios. Mientras trabaja, solo usted lo ve. Si lo publica, se lee como cualquier otra entrega.</p>
      <div class="campo"><label for="fm-nt">Título (opcional)</label><input class="entrada" id="fm-nt" maxlength="140"></div>
      <div class="campo"><label for="fm-nx">Texto</label><textarea class="area fm-pegar" id="fm-nx" rows="12" placeholder="Pegue aquí su texto…"></textarea>
        <p class="nota-campo" id="fm-nc">0 palabras</p></div>
      <button type="button" class="btn btn-primario" id="fm-empezar" disabled>${icono('revision', 18)}Empezar a revisar</button>
    </section>
  </div>`;
  const $ = s => cont.querySelector(s);
  const area = $('#fm-nx');
  const revisar = () => {
    const n = contarPalabras(area.value);
    $('#fm-nc').textContent = n > MAX_PALABRAS ? `${n} palabras · el máximo es ${MAX_PALABRAS}` : `${n} ${n === 1 ? 'palabra' : 'palabras'}`;
    $('#fm-nc').style.color = n > MAX_PALABRAS ? 'var(--rojo)' : '';
    $('#fm-empezar').disabled = !n || n > MAX_PALABRAS;
  };
  area.addEventListener('input', revisar);
  $('#fm-empezar').addEventListener('click', async () => {
    const texto = normalizarSaltos(area.value);
    if (!texto) return;
    const id = PROPIO + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const titulo = $('#fm-nt').value.trim();
    const chars = texto.split('').map((c, n) => ({ c, s: 'o', d: false, n }));
    $('#fm-empezar').disabled = true;
    await escribirBorrador(`${SLUG}:${id}`, { runs: empacar(chars), expl: {}, titulo: '', fase: 'editar', base_titulo: titulo });
    await guardarIndice([{ id, titulo, creado: new Date().toISOString() }, ...(await leerIndice())]);
    location.hash = `#/d/${SLUG}/${id}`;
  });
}

// ---------------------------------------------------------------------
// Editor con control de cambios
// ---------------------------------------------------------------------
async function editor(cont, { item, entrega }) {
  const editando = entrega || null;
  const itemId = editando ? editando.item_id : item;
  const propio = esPropio(itemId);
  const clave = `${SLUG}:${itemId}`;
  let base;
  let chars;
  let expl = {};
  let titulo = '';
  let fase = 'editar';
  let notaBorrador = '';

  if (editando) {
    const d = editando.datos || {};
    chars = desempacar(d.runs);
    expl = { ...(d.expl || {}) };
    titulo = editando.titulo || '';
    base = { titulo: d.base_titulo || '', autor: d.base_autor || '', propio: true };
  } else {
    const b = await leerBorrador(clave);
    if (propio) {
      if (!b?.runs) {
        cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No encontramos este borrador', 'Puede que lo haya descartado o que esté en otro navegador sin conexión.', `<a class="btn" href="#/d/${SLUG}">Volver a Fallar mejor</a>`)}</div>`;
        return;
      }
      base = { titulo: b.base_titulo || '', autor: '', propio: true };
    } else {
      const c = await estado.api.contenido(SLUG, itemId);
      if (!c) {
        cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este texto no está disponible', 'Puede que el tutor lo haya retirado.', `<a class="btn" href="#/d/${SLUG}">Volver a Fallar mejor</a>`)}</div>`;
        return;
      }
      base = { titulo: c.datos.titulo, autor: c.datos.autor || '', con_final: !!c.datos.con_final, marcado: c.datos.borrador };
    }
    if (b?.runs) {
      chars = desempacar(b.runs);
      expl = b.expl || {};
      titulo = b.titulo || '';
      fase = b.fase === 'revisar' ? 'revisar' : 'editar';
      if (!propio || unidades(chars).length) notaBorrador = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`;
    } else {
      chars = leerMarcado(base.marcado);
    }
  }
  let sig = chars.reduce((m, ch) => Math.max(m, ch.n), -1) + 1;
  const tieneMarcas = chars.some(ch => ch.s === 'ad' || ch.s === 'ai');
  const quien = base.autor || 'quien lo escribió';
  let modo = local('fallar-modo-edicion') || (matchMedia('(pointer: coarse)').matches || innerWidth <= 760 ? 'toque' : 'escritura');
  let selTok = null;       // en modo toque: { k1, k2, ancla }
  let campo = null;        // en modo toque: { tipo: 'reemplazar' | 'agregar', donde: 'despues' | 'antes' }
  let toks = [];
  let pestana = 'limpia';  // en móvil, en la fase revisar
  const pila = [];
  const rehechos = [];
  let publicado = false;

  cont.innerHTML = `
  <div class="contenedor" style="max-width:1480px">
    <div class="escritorio fm-escritorio" id="esc" style="--acento:${ACENTO}">
      <aside class="consigna-panel" id="panel"></aside>
      <section class="mesa fm-mesa">
        <div class="mesa-barra">
          <a class="herr" href="#/d/${SLUG}" title="Volver a Fallar mejor" aria-label="Volver a Fallar mejor">${icono('izquierda', 18)}</a>
          <span class="rotulo fm-rotulo-texto">${esc(propio ? (base.titulo || 'Texto propio') : `${base.titulo}${base.autor ? ' · ' + base.autor : ''}`)}</span>
          <span class="espaciador"></span>
          <span class="guardado" id="guardado">${esc(notaBorrador)}</span>
          <span class="fm-herramientas" id="herramientas"></span>
        </div>
        <div class="hoja-escribir fm-hoja" id="hoja"></div>
        <div class="mesa-pie fm-pie" id="pie"></div>
      </section>
      <aside class="fm-historial" id="historial" aria-label="Historial de cambios"></aside>
    </div>
  </div>`;
  const $ = s => cont.querySelector(s);
  const elGuardado = $('#guardado');
  let ed = null;           // el texto editable (fase editar)
  let ultimoRender = '';

  // ---------- guardado ----------
  const guardarNube = debounce(async () => {
    if (editando) return;
    const ok = await escribirBorrador(clave, datosBorrador());
    elGuardado.textContent = ok ? 'Guardado' : 'Guardado en este dispositivo';
  }, 2500);
  function datosBorrador() {
    return { runs: empacar(chars), expl: normalizarExpl(chars, expl), titulo, fase, ...(propio ? { base_titulo: base.titulo } : {}) };
  }
  function cambio() {
    if (editando) { elGuardado.textContent = 'Cambios sin guardar'; return; }
    local(`borrador:${estado.yo.id}:${clave}`, { ...datosBorrador(), _actualizado: new Date().toISOString() });
    elGuardado.textContent = 'Guardando…';
    guardarNube();
  }

  // ---------- operaciones sobre el modelo ----------
  function paso() { pila.push(JSON.stringify(empacar(chars))); if (pila.length > 300) pila.shift(); rehechos.length = 0; }
  function deshacer() { if (!pila.length) return; rehechos.push(JSON.stringify(empacar(chars))); chars = desempacar(JSON.parse(pila.pop())); selTok = null; campo = null; tras(null); }
  function rehacer() { if (!rehechos.length) return; pila.push(JSON.stringify(empacar(chars))); chars = desempacar(JSON.parse(rehechos.pop())); selTok = null; campo = null; tras(null); }

  function tachar(a, b) {
    let quitados = 0;
    for (let i = a; i < b; i++) { const ch = chars[i]; if (ch.s === 'i') { ch.q = true; quitados++; } else ch.d = true; }
    if (quitados) chars = chars.filter(ch => !ch.q);
    return b - quitados;
  }
  function recuperar(a, b) { for (let i = a; i < b; i++) if (chars[i].s !== 'i') chars[i].d = false; }
  function insertar(pos, texto) {
    const t = String(texto).replace(/\r\n?/g, '\n').replace(/ |\t/g, ' ');
    const nuevos = t.split('').map(c => ({ c, s: 'i', d: false, n: sig++ }));
    chars.splice(pos, 0, ...nuevos);
    return pos + nuevos.length;
  }
  function borrarAtras(p) {
    let i = p - 1;
    while (i >= 0 && chars[i].s !== 'i' && chars[i].d) i--;
    if (i < 0) return p;
    if (chars[i].s === 'i') { chars.splice(i, 1); return i; }
    chars[i].d = true;
    return i;
  }
  function borrarAdelante(p) {
    let i = p;
    while (i < chars.length && chars[i].s !== 'i' && chars[i].d) i++;
    if (i >= chars.length) return p;
    if (chars[i].s === 'i') { chars.splice(i, 1); return i; }
    chars[i].d = true;
    return i + 1;
  }

  // ---------- pintar ----------
  function spans(a, b, conIndice) {
    let html = '';
    let i = a;
    while (i < b) {
      const e = estilo(chars[i]);
      const esDuda = chars[i].s === 'ai';
      let j = i;
      while (j < b && estilo(chars[j]) === e && (chars[j].s === 'ai') === esDuda) j++;
      const t = chars.slice(i, j).map(ch => (ch.c === '\n' && ch.d ? '¶' : ch.c)).join('');
      const cl = [clases(e)];
      if (esDuda && (i === 0 || chars[i - 1].s !== 'ai')) cl.push('fm-du-ini');
      if (esDuda && (j === chars.length || chars[j].s !== 'ai')) cl.push('fm-du-fin');
      html += `<span class="${cl.filter(Boolean).join(' ')}"${conIndice ? ` data-a="${i}"` : ''}>${esc(t)}</span>`;
      i = j;
    }
    return html;
  }
  function tokens() {
    const out = [];
    let i = 0;
    while (i < chars.length) {
      const c = chars[i].c;
      if (/\s/.test(c) && !(c === '\n' && chars[i].d)) { i++; continue; }
      let j = i + 1;
      if (RE_LETRA.test(c)) while (j < chars.length && RE_LETRA.test(chars[j].c)) j++;
      out.push({ a: i, b: j });
      i = j;
    }
    return out;
  }
  const rangoSel = () => (selTok ? [toks[Math.min(selTok.k1, selTok.k2)].a, toks[Math.max(selTok.k1, selTok.k2)].b] : null);

  function htmlToque() {
    toks = tokens();
    const [sa, sb] = rangoSel() || [-1, -1];
    let html = '';
    let i = 0;
    let k = 0;
    while (i < chars.length) {
      if (k < toks.length && toks[k].a === i) {
        const t = toks[k];
        html += `<span class="tk${t.a >= sa && t.b <= sb ? ' sel' : ''}" data-k="${k}">${spans(t.a, t.b, true)}</span>`;
        i = t.b; k++;
      } else {
        const fin = k < toks.length ? toks[k].a : chars.length;
        html += spans(i, fin, true);
        i = fin;
      }
    }
    return html;
  }

  function pintarPanel() {
    const pasos = fase === 'revisar'
      ? `<p>Compare. A un lado está su versión limpia; al otro, todos los cambios.</p>
         <p>Si algo no le convence, vuelva a editar. Si quiere, póngale título.</p>
         <p>${!propio && base.con_final ? `Al publicar se abrirá la versión final de ${esc(quien)}.` : 'Cuando esté lista, publíquela.'}</p>`
      : `<ol>
          ${modo === 'toque'
            ? '<li><strong>Toque una palabra</strong>, o la primera y la última de un fragmento, y elija abajo qué hacer.</li><li><strong>Tache</strong> lo que sobra, <strong>reemplace</strong> o <strong>agregue</strong>. Nada se borra: queda tachado.</li>'
            : '<li><strong>Tache</strong> lo que sobra: seleccione y borre. No desaparece, queda tachado.</li><li><strong>Agregue</strong> lo que falta: escriba donde quiera. Lo suyo aparece en color.</li>'}
          ${tieneMarcas ? `<li>Las marcas grises son de ${esc(quien)}. Puede recuperar lo que tachó, tachar sus dudas o dejarlas.</li>` : ''}
          <li>En el historial, cuente por qué hizo cada cambio. Es opcional.</li>
          <li>Al terminar, pulse <strong>Ver nueva versión</strong>.</li>
        </ol>`;
    $('#panel').innerHTML = `
      <span class="rotulo">Fallar mejor${propio ? ' · Texto propio' : ''}</span>
      <h1>${fase === 'revisar' ? 'Mire su nueva versión' : propio ? 'Revise su texto' : 'Revise este borrador'}</h1>
      <div class="consigna-texto">${pasos}</div>
      <div class="consigna-extra fm-leyenda">
        ${tieneMarcas ? `<span><s class="fm-ta">Tachado</s> y <span class="fm-du fm-du-ini fm-du-fin">duda</span> de ${esc(quien)}</span>` : ''}
        <span><s class="fm-td">Su tachado</s> · <u class="fm-ag">su agregado</u>${tieneMarcas ? ' · <u class="fm-rec">recuperado</u>' : ''}</span>
      </div>`;
  }

  function pintarHerramientas() {
    const h = $('#herramientas');
    if (fase === 'revisar') { h.innerHTML = ''; return; }
    h.innerHTML = `
      <span class="conmutador fm-modo" role="group" aria-label="Forma de editar">
        <button type="button" data-modo="escritura" class="${modo === 'escritura' ? 'on' : ''}" aria-pressed="${modo === 'escritura'}" title="Escribir y borrar con el teclado">${icono('lapiz', 15)}<span>Escribir</span></button>
        <button type="button" data-modo="toque" class="${modo === 'toque' ? 'on' : ''}" aria-pressed="${modo === 'toque'}" title="Tocar palabras y elegir qué hacer">${icono('fichas', 15)}<span>Tocar</span></button>
      </span>
      <span class="sep"></span>
      ${modo === 'escritura' ? `<button type="button" class="herr" data-accion="tachar" title="Tachar lo seleccionado" aria-label="Tachar lo seleccionado">${icono('tachar', 18)}</button>
      <button type="button" class="herr" data-accion="recuperar" title="Quitar el tachado de lo seleccionado" aria-label="Quitar el tachado de lo seleccionado">${icono('reiniciar', 17)}</button>` : ''}
      <button type="button" class="herr" data-accion="deshacer" title="Deshacer" aria-label="Deshacer" ${pila.length ? '' : 'disabled'}>${icono('deshacer', 18)}</button>
      <button type="button" class="herr" data-accion="rehacer" title="Rehacer" aria-label="Rehacer" ${rehechos.length ? '' : 'disabled'}>${icono('rehacer', 18)}</button>`;
  }

  function pintarHoja() {
    const hoja = $('#hoja');
    if (fase === 'revisar') {
      ed = null;
      hoja.innerHTML = `
        <input class="titulo-escribir" id="titulo" placeholder="Título (opcional)" maxlength="140" value="${esc(titulo)}">
        <div class="conmutador fm-pestanas" role="tablist" aria-label="Versiones">
          <button type="button" role="tab" data-p="limpia" class="${pestana === 'limpia' ? 'on' : ''}" aria-selected="${pestana === 'limpia'}">Nueva versión</button>
          <button type="button" role="tab" data-p="marcas" class="${pestana === 'marcas' ? 'on' : ''}" aria-selected="${pestana === 'marcas'}">Con cambios</button>
        </div>
        <div class="fm-paneles" data-ver="${pestana}">
          <section class="fm-panel" data-p="limpia"><div class="rotulo">Nueva versión</div><div class="fm-lectura">${parrafosHTML(textoLimpio(chars))}</div></section>
          <section class="fm-panel" data-p="marcas"><div class="rotulo">Con cambios</div><div class="fm-lectura">${marcasHTML(chars)}</div></section>
        </div>`;
      $('#titulo').addEventListener('input', ev => { titulo = ev.target.value; cambio(); });
      return;
    }
    hoja.innerHTML = `<div class="fm-texto ${modo === 'toque' ? 'toque' : ''}" id="texto" ${modo === 'escritura'
      ? 'contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" translate="no" role="textbox" aria-multiline="true"'
      : 'role="group"'} aria-label="Texto en revisión"></div>`;
    ed = $('#texto');
    pintarTexto();
    if (modo === 'escritura') activarEscritura(); else activarToque();
  }

  function pintarTexto() {
    if (!ed) return;
    ed.innerHTML = modo === 'toque' ? htmlToque() : spans(0, chars.length, true);
    ultimoRender = ed.textContent;
  }

  function pintarPie() {
    const pie = $('#pie');
    const n = unidades(chars).length;
    const cuenta = `<span class="contador">${n} ${n === 1 ? 'cambio' : 'cambios'}</span>`;
    if (fase === 'revisar') {
      pie.innerHTML = `${cuenta}<span class="espaciador"></span>
        <button type="button" class="btn btn-fantasma" id="volver">${icono('lapiz', 17)}Seguir editando</button>
        <button type="button" class="btn btn-primario" id="publicar" ${n ? '' : 'disabled'}>${icono(editando ? 'check' : 'enviar', 18)}${editando ? 'Guardar cambios' : 'Publicar'}</button>`;
      return;
    }
    const r = modo === 'toque' ? rangoSel() : null;
    if (r) {
      const frag = chars.slice(r[0], r[1]);
      const hayVivo = frag.some(ch => !ch.d || ch.s === 'i');
      const hayTachado = frag.some(ch => ch.s !== 'i' && ch.d);
      const vista = frag.map(ch => ch.c).join('').replace(/\s+/g, ' ').trim();
      if (campo) {
        const valor = campo.tipo === 'reemplazar' ? textoLimpio(frag) : '';
        pie.innerHTML = `<div class="fm-accion">
          <label class="fm-accion-rotulo" for="fm-campo">${campo.tipo === 'reemplazar' ? `Reemplazar «${esc(vista.length > 40 ? vista.slice(0, 38) + '…' : vista)}» por` : 'Agregar'}</label>
          ${campo.tipo === 'agregar' ? `<span class="conmutador" role="group" aria-label="Dónde agregar">
            <button type="button" data-donde="antes" class="${campo.donde === 'antes' ? 'on' : ''}">Antes</button>
            <button type="button" data-donde="despues" class="${campo.donde === 'despues' ? 'on' : ''}">Después</button></span>` : ''}
          <input class="entrada" id="fm-campo" value="${esc(valor)}" autocomplete="off" autocapitalize="off" spellcheck="true">
          <span class="fm-accion-botones"><button type="button" class="btn btn-fantasma btn-chico" data-t="cancelar">Cancelar</button>
          <button type="button" class="btn btn-primario btn-chico" data-t="aplicar">${icono('check', 16)}Aplicar</button></span></div>`;
        const inp = $('#fm-campo');
        setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
        return;
      }
      pie.innerHTML = `<div class="fm-accion">
        <span class="fm-accion-rotulo">«${esc(vista.length > 46 ? vista.slice(0, 44) + '…' : vista)}»</span>
        <span class="fm-accion-botones">
          <button type="button" class="btn btn-chico" data-t="tachar" ${hayVivo ? '' : 'disabled'}>${icono('tachar', 16)}Tachar</button>
          <button type="button" class="btn btn-chico" data-t="reemplazar">${icono('lapiz', 16)}Reemplazar</button>
          <button type="button" class="btn btn-chico" data-t="agregar">${icono('mas', 16)}Agregar</button>
          <button type="button" class="btn btn-chico" data-t="recuperar" ${hayTachado ? '' : 'disabled'}>${icono('reiniciar', 15)}Recuperar</button>
          <button type="button" class="btn btn-chico btn-fantasma btn-icono" data-t="soltar" aria-label="Quitar la selección" title="Quitar la selección">${icono('x', 16)}</button>
        </span></div>`;
      return;
    }
    pie.innerHTML = `${cuenta}${modo === 'toque' ? '<span class="tenue fm-pista-pie">Toque una palabra para empezar</span>' : ''}<span class="espaciador"></span>
      <button type="button" class="btn btn-primario" id="ver">${icono('ojo', 18)}Ver nueva versión</button>`;
  }

  function pintarHistorial() {
    const us = unidades(chars);
    const h = $('#historial');
    h.innerHTML = `
      <div class="fm-hist-cab"><h2>Historial de cambios</h2><span class="fm-n">${us.length}</span></div>
      ${us.length ? `<p class="fm-hist-ayuda">Cuente, si quiere, por qué hizo cada cambio.</p>
        <ol class="fm-hist">${us.map((u, i) => `<li>
          <button type="button" class="fm-ir" data-u="${i}" title="Ver en el texto">${esc(describir(u))}</button>
          <label class="sr" for="fm-por-${i}">Por qué: ${esc(describir(u))}</label>
          <textarea class="fm-por" id="fm-por-${i}" data-u="${i}" rows="1" placeholder="¿Por qué? (opcional)">${esc(explicacionDe(u, expl))}</textarea>
        </li>`).join('')}</ol>`
      : '<p class="fm-hist-ayuda">Aquí aparecerá cada cambio que haga, para que pueda explicar por qué lo hizo.</p>'}`;
    h.querySelectorAll('.fm-por').forEach(ajustarAlto);
    h._unidades = us;
  }

  function ajustarAlto(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 240) + 'px'; }

  function pintarTodo() {
    $('#esc').classList.toggle('fase-revisar', fase === 'revisar');
    pintarPanel(); pintarHerramientas(); pintarHoja(); pintarPie(); pintarHistorial();
  }

  // Después de cada cambio en el texto.
  function tras(pos) {
    pintarTexto();
    if (pos != null && modo === 'escritura') ponerCursor(pos);
    pintarHerramientas(); pintarPie(); pintarHistorial();
    cambio();
  }

  // ---------- modo escritura (contenteditable) ----------
  function indiceDe(nodo, off) {
    if (!ed || !ed.contains(nodo)) return null;
    if (nodo.nodeType === 3) {
      const sp = nodo.parentElement.closest('[data-a]');
      return sp ? Number(sp.dataset.a) + Math.min(off, nodo.length) : null;
    }
    if (nodo === ed) {
      const hijo = ed.childNodes[off];
      return hijo?.dataset?.a != null ? Number(hijo.dataset.a) : chars.length;
    }
    const sp = nodo.closest('[data-a]');
    if (!sp) return null;
    return Number(sp.dataset.a) + (off > 0 ? sp.textContent.length : 0);
  }
  function seleccion() {
    const s = getSelection();
    if (!s.rangeCount) return null;
    const r = s.getRangeAt(0);
    const a = indiceDe(r.startContainer, r.startOffset);
    const b = indiceDe(r.endContainer, r.endOffset);
    if (a == null || b == null) return null;
    return [Math.min(a, b), Math.max(a, b)];
  }
  function ponerCursor(idx) {
    const lista = [...ed.querySelectorAll('[data-a]')];
    for (let k = 0; k < lista.length; k++) {
      const sp = lista[k];
      const a = Number(sp.dataset.a);
      const n = sp.textContent.length;
      if ((idx >= a && idx < a + n) || (idx === a + n && k === lista.length - 1)) {
        const r = document.createRange();
        r.setStart(sp.firstChild || sp, Math.min(idx - a, n));
        r.collapse(true);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
        return;
      }
    }
  }
  let componiendo = false;
  let selComp = null;

  function activarEscritura() {
    ed.addEventListener('beforeinput', ev => {
      if (componiendo || ev.isComposing || ev.inputType === 'insertCompositionText') return;
      ev.preventDefault();
      const sel = seleccion();
      if (!sel) return;
      let [a, b] = sel;
      const tipo = ev.inputType;
      const objetivo = () => {
        const r = ev.getTargetRanges?.()[0];
        if (!r) return [a, b];
        const x = indiceDe(r.startContainer, r.startOffset);
        const y = indiceDe(r.endContainer, r.endOffset);
        return x == null || y == null ? [a, b] : [Math.min(x, y), Math.max(x, y)];
      };
      let pos = null;
      switch (tipo) {
        case 'insertText':
        case 'insertFromPaste':
        case 'insertReplacementText':
        case 'insertFromYank': {
          const t = ev.data ?? ev.dataTransfer?.getData('text/plain') ?? '';
          if (!t) return;
          if (tipo === 'insertReplacementText') [a, b] = objetivo();
          paso();
          pos = a < b ? tachar(a, b) : a;
          pos = insertar(pos, t);
          break;
        }
        case 'insertParagraph':
        case 'insertLineBreak': {
          paso();
          pos = a < b ? tachar(a, b) : a;
          // Enter abre un párrafo nuevo; Mayúscula + Enter, solo un salto de línea.
          const junto = chars[pos - 1]?.c === '\n' || chars[pos]?.c === '\n';
          pos = insertar(pos, tipo === 'insertParagraph' && !junto ? '\n\n' : '\n');
          break;
        }
        case 'deleteContentBackward':
        case 'deleteContentForward':
          paso();
          pos = a < b ? tachar(a, b) : tipo === 'deleteContentBackward' ? borrarAtras(a) : borrarAdelante(a);
          break;
        case 'deleteByCut':
          if (a >= b) return;
          paso();
          pos = tachar(a, b);
          break;
        case 'historyUndo': deshacer(); return;
        case 'historyRedo': rehacer(); return;
        default:
          if (tipo.startsWith('delete')) {
            const [x, y] = a < b ? [a, b] : objetivo();
            if (x >= y) return;
            paso();
            const fin = tachar(x, y);
            pos = tipo.includes('Backward') && a === b ? x : fin;
            break;
          }
          return; // formato, arrastrar y soltar: nada
      }
      tras(pos);
    });
    // Tildes y teclados con composición: el navegador escribe mientras se compone;
    // al terminar se descarta lo que hizo y se aplica al modelo.
    ed.addEventListener('compositionstart', () => { componiendo = true; selComp = seleccion(); });
    ed.addEventListener('compositionend', ev => {
      componiendo = false;
      const t = ev.data || '';
      const [a, b] = selComp || [chars.length, chars.length];
      selComp = null;
      pintarTexto();
      if (!t) { ponerCursor(a); return; }
      paso();
      let pos = a < b ? tachar(a, b) : a;
      pos = insertar(pos, t);
      tras(pos);
    });
    ed.addEventListener('input', ev => {
      if (componiendo || ev.isComposing) return;
      if (ed.textContent !== ultimoRender) { const s = seleccion(); pintarTexto(); if (s) ponerCursor(s[0]); }
    });
    ed.addEventListener('keydown', ev => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
      const k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); deshacer(); }
      else if ((k === 'z' && ev.shiftKey) || k === 'y') { ev.preventDefault(); rehacer(); }
      else if (k === 'b' || k === 'i' || k === 'u') ev.preventDefault();
    });
    ed.addEventListener('drop', ev => ev.preventDefault());
    ed.addEventListener('dragstart', ev => ev.preventDefault());
  }

  // ---------- modo toque ----------
  function activarToque() {
    ed.addEventListener('click', ev => {
      const t = ev.target.closest('.tk');
      if (!t) return;
      const k = Number(t.dataset.k);
      campo = null;
      if (!selTok) selTok = { k1: k, k2: k };
      else if (selTok.k1 === selTok.k2 && selTok.k1 === k) selTok = null;
      else if (selTok.k1 === selTok.k2) selTok = { k1: selTok.k1, k2: k };
      else selTok = { k1: k, k2: k };
      pintarTexto(); pintarPie();
    });
  }

  function aplicarCampo() {
    const r = rangoSel();
    const inp = $('#fm-campo');
    if (!r || !inp) return;
    let t = inp.value.replace(/\s+/g, ' ');
    const [a, b] = r;
    if (campo.tipo === 'reemplazar') {
      t = t.trim();
      paso();
      const fin = tachar(a, b);
      if (t) insertar(fin, t);
    } else {
      t = t.trim();
      if (!t) return;
      paso();
      if (campo.donde === 'antes') insertar(a, /[(¿¡«“]$/.test(t) ? t : t + ' ');
      else insertar(b, /^[,.;:!?…)\]»”]/.test(t) ? t : ' ' + t);
    }
    selTok = null; campo = null;
    tras(null);
  }

  // ---------- eventos generales ----------
  $('#herramientas').addEventListener('mousedown', ev => { if (ev.target.closest('[data-accion]')) ev.preventDefault(); });
  $('#herramientas').addEventListener('click', ev => {
    const m = ev.target.closest('[data-modo]');
    if (m && m.dataset.modo !== modo) {
      modo = m.dataset.modo;
      local('fallar-modo-edicion', modo);
      selTok = null; campo = null;
      pintarPanel(); pintarHerramientas(); pintarHoja(); pintarPie();
      return;
    }
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    const acc = b.dataset.accion;
    if (acc === 'deshacer') return deshacer();
    if (acc === 'rehacer') return rehacer();
    const s = seleccion();
    if (!s || s[0] === s[1]) { aviso('Primero seleccione una parte del texto.'); return; }
    paso();
    if (acc === 'tachar') tras(tachar(s[0], s[1]));
    else { recuperar(s[0], s[1]); tras(s[1]); }
  });

  $('#pie').addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'ver') { fase = 'revisar'; selTok = null; campo = null; pintarTodo(); cambio(); window.scrollTo({ top: 0 }); return; }
    if (b.id === 'volver') { fase = 'editar'; pintarTodo(); cambio(); return; }
    if (b.id === 'publicar') return publicar(b);
    if (b.dataset.donde) { campo.donde = b.dataset.donde; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('#fm-campo')?.focus(); return; }
    const t = b.dataset.t;
    const r = rangoSel();
    if (!t || !r) return;
    if (t === 'soltar') { selTok = null; pintarTexto(); pintarPie(); return; }
    if (t === 'cancelar') { campo = null; pintarPie(); return; }
    if (t === 'aplicar') return aplicarCampo();
    if (t === 'reemplazar' || t === 'agregar') { campo = { tipo: t, donde: 'despues' }; pintarPie(); return; }
    paso();
    if (t === 'tachar') tachar(r[0], r[1]); else recuperar(r[0], r[1]);
    selTok = null;
    tras(null);
  });
  $('#pie').addEventListener('keydown', ev => {
    if (ev.target.id !== 'fm-campo') return;
    if (ev.key === 'Enter') { ev.preventDefault(); aplicarCampo(); }
    if (ev.key === 'Escape') { campo = null; pintarPie(); }
  });

  $('#hoja').addEventListener('click', ev => {
    const p = ev.target.closest('[data-p]');
    if (!p || !p.closest('.fm-pestanas')) return;
    pestana = p.dataset.p;
    p.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === p); x.setAttribute('aria-selected', x === p); });
    $('.fm-paneles').dataset.ver = pestana;
  });

  $('#historial').addEventListener('input', ev => {
    const t = ev.target.closest('.fm-por');
    if (!t) return;
    const u = $('#historial')._unidades[Number(t.dataset.u)];
    if (!u) return;
    for (const id of u.ids) delete expl[id];
    if (t.value.trim()) expl[u.clave] = t.value;
    ajustarAlto(t);
    cambio();
  });
  $('#historial').addEventListener('click', ev => {
    const b = ev.target.closest('.fm-ir');
    if (!b || fase !== 'editar' || !ed) return;
    const u = $('#historial')._unidades[Number(b.dataset.u)];
    const marcas = [...ed.querySelectorAll('[data-a]')].filter(sp => { const a = Number(sp.dataset.a); return a < u.b && a + sp.textContent.length > u.a; });
    if (!marcas.length) return;
    marcas[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    marcas.forEach(m => { m.classList.remove('fm-destello'); void m.offsetWidth; m.classList.add('fm-destello'); });
  });

  // ---------- publicar ----------
  async function publicar(boton) {
    expl = normalizarExpl(chars, expl);
    if (!unidades(chars).length) return;
    const nativo = !propio;
    const msg = (soyVisible() ? 'Al publicar, el grupo podrá leer su versión.' : 'Al publicar, solo el tutor podrá leer su versión.')
      + (nativo ? ` El texto quedará fijo: después solo podrá completar sus explicaciones.${base.con_final ? ` Y se abrirá la versión final de ${quien}.` : ''}`
        : ' Después podrá seguir revisándola, pero no borrarla.');
    if (!editando && !(await confirmar(msg, { si: 'Publicar', no: 'Seguir revisando' }))) return;
    boton.disabled = true;
    try {
      const e = armarEntrega({ chars, expl, titulo, itemId, base });
      guardarNube.cancelar();
      publicado = true;
      if (!editando) quitarBorrador(clave);
      await publicarEntrega(e, { entregaExistente: editando, irA: nativo ? `#/d/${SLUG}/${encodeURIComponent(itemId)}${base.con_final ? '?autora' : ''}` : null });
      if (!editando && propio) guardarIndice((await leerIndice()).filter(p => p.id !== itemId)).catch(() => {});
    } catch (err) {
      publicado = false;
      if (!editando) cambio();
      errorAviso(err);
      boton.disabled = false;
    }
  }

  pintarTodo();
  if (modo === 'escritura' && ed && fase === 'editar' && !matchMedia('(pointer: coarse)').matches) { ed.focus(); ponerCursor(0); }
  return () => { if (!editando && !publicado && pila.length) guardarNube.ahora(); };
}

// ---------------------------------------------------------------------
// Resultado: la revisión publicada, su historial y la versión final
// ---------------------------------------------------------------------
async function resultado(cont, { entrega = null, verAutora = false, soloAutora = null }) {
  const itemId = entrega ? entrega.item_id : soloAutora;
  const propio = esPropio(itemId);
  const d = entrega?.datos || {};
  let chars = desempacar(d.runs);
  let expl = { ...(d.expl || {}) };
  const [base, autora] = propio ? [null, null] : await Promise.all([
    estado.api.contenido(SLUG, itemId).catch(() => null),
    estado.api.contenido(SLUG, AUTORA + itemId).catch(() => null),
  ]);
  const B = base?.datos || { titulo: d.base_titulo || '', autor: d.base_autor || '' };
  const A = autora?.datos || null;
  const quien = A?.autor || B.autor || 'quien lo escribió';
  const pestanas = [
    ...(entrega ? [['version', 'Su versión'], ['historial', `Historial · ${unidades(chars).length}`]] : []),
    ...(A ? [['autora', `Versión de ${quien}`, 'Versión final']] : []),
  ];
  if (!pestanas.length) {
    cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No hay nada que mostrar todavía', '', `<a class="btn" href="#/d/${SLUG}">Volver a Fallar mejor</a>`)}</div>`;
    return;
  }
  let pestana = verAutora && A ? 'autora' : pestanas[0][0];
  let vistaAutora = 'final';
  const titulo = entrega ? (entrega.titulo || B.titulo || 'Su revisión') : B.titulo;

  cont.innerHTML = `
  <div class="contenedor fm-resultado" style="--acento:${ACENTO}">
    <div class="fila" style="margin-bottom:16px">
      <a class="btn btn-fantasma btn-chico" href="#/d/${SLUG}">${icono('izquierda', 16)}Fallar mejor</a>
      <span class="espaciador"></span>
      ${entrega ? `<a class="btn btn-chico btn-fantasma" href="#/entrega/${entrega.id}">${icono('comentario', 16)}Ver en el muro</a>` : ''}
      ${entrega && !propio ? `<a class="btn btn-chico btn-fantasma" href="#/muro?dinamica=${SLUG}&item=${encodeURIComponent(itemId)}">${icono('usuarios', 16)}Respuestas del grupo</a>` : ''}
      ${entrega && propio ? `<a class="btn btn-chico" href="#/editar/${entrega.id}">${icono('lapiz', 16)}Seguir revisando</a>` : ''}
    </div>
    <header class="fm-resultado-cab">
      <span class="rotulo">Fallar mejor · ${entrega ? (propio ? 'Texto propio' : `Borrador de ${esc(B.autor || B.titulo)}`) : 'Vista del tutor'}</span>
      <h1 class="saludo">${esc(titulo)}</h1>
      ${pestanas.length > 1 ? `<div class="conmutador fm-tabs" role="tablist">${pestanas.map(([k, n, corto]) => `<button type="button" role="tab" data-tab="${k}" class="${k === pestana ? 'on' : ''}" aria-selected="${k === pestana}">${k === 'autora' ? icono('libro', 15) : ''}${corto ? `<span class="fm-largo">${esc(n)}</span><span class="fm-corto">${esc(corto)}</span>` : esc(n)}</button>`).join('')}</div>` : ''}
    </header>
    <div id="fm-cuerpo"></div>
  </div>`;
  const $ = s => cont.querySelector(s);

  function pintar() {
    const c = $('#fm-cuerpo');
    if (pestana === 'version') {
      c.innerHTML = `<div class="fm-dos">
        <article class="hoja"><div class="rotulo">Nueva versión</div><div class="fm-lectura">${parrafosHTML(textoLimpio(chars))}</div></article>
        <article class="hoja"><div class="rotulo">Con cambios</div><div class="fm-lectura">${marcasHTML(chars)}</div></article></div>`;
    } else if (pestana === 'historial') {
      const us = unidades(chars);
      c.innerHTML = `<article class="hoja fm-hoja-hist">
        <p class="tenue" style="margin-top:0">Su texto ya está fijo, pero puede seguir escribiendo por qué hizo cada cambio. Leerlo junto a la versión final suele dar ideas.</p>
        <ol class="fm-hist">${us.map((u, i) => `<li><span class="fm-ir">${esc(describir(u))}</span>
          <label class="sr" for="fr-${i}">Por qué: ${esc(describir(u))}</label>
          <textarea class="fm-por" id="fr-${i}" data-u="${i}" rows="1" placeholder="¿Por qué? (opcional)">${esc(explicacionDe(u, expl))}</textarea></li>`).join('')}</ol>
        <div class="fila" style="margin-top:14px"><span class="espaciador"></span><span class="guardado" id="fr-estado"></span>
          <button type="button" class="btn btn-primario" id="fr-guardar" disabled>${icono('check', 17)}Guardar explicaciones</button></div>
      </article>`;
      c.querySelectorAll('.fm-por').forEach(t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; });
      c._unidades = us;
    } else {
      const borrador = textoBorrador(B.borrador || '');
      const dif = A.final && borrador ? diferencias(borrador, A.final) : null;
      const opciones = [['final', 'Versión final'], ...(dif ? [['cambios', 'Cambios del borrador']] : []), ...(entrega ? [['junto', 'Junto a la suya']] : [])];
      if (!opciones.some(o => o[0] === vistaAutora)) vistaAutora = 'final';
      const final = `${A.titulo_final ? `<h2 class="fm-titulo-final">${esc(A.titulo_final)}</h2>` : ''}<div class="fm-lectura">${parrafosHTML(A.final)}</div>`;
      let cuerpo;
      if (vistaAutora === 'cambios') cuerpo = `<p class="tenue fm-nota">Del borrador a la versión final: <s class="fm-ta">tachado</s> lo que quitó, <u class="fm-aa">subrayado</u> lo que agregó.</p><div class="fm-lectura">${dif}</div>`;
      else if (vistaAutora === 'junto') cuerpo = `<div class="fm-dos fm-dos-interno"><div><div class="rotulo">Su versión</div>${entrega.titulo ? `<h2 class="fm-titulo-final">${esc(entrega.titulo)}</h2>` : ''}<div class="fm-lectura">${parrafosHTML(textoLimpio(chars))}</div></div><div><div class="rotulo">Versión de ${esc(quien)}</div>${final}</div></div>`;
      else cuerpo = final;
      c.innerHTML = `<article class="hoja fm-autora">
        <div class="fila" style="margin-bottom:18px"><span class="rotulo">Versión de ${esc(quien)}</span><span class="espaciador"></span>
          ${opciones.length > 1 ? `<span class="conmutador" role="group" aria-label="Cómo ver la versión final">${opciones.map(([k, n]) => `<button type="button" data-va="${k}" class="${k === vistaAutora ? 'on' : ''}">${esc(n)}</button>`).join('')}</span>` : ''}</div>
        ${cuerpo}
        ${A.comentario ? `<section class="fm-comentario"><h2>${esc(A.comentario_titulo || 'Comentario')}</h2><div class="fm-lectura">${comentarioHTML(A.comentario)}</div>${A.fuente ? `<p class="v-credito">${esc(A.fuente)}</p>` : ''}</section>` : ''}
      </article>`;
    }
  }

  cont.addEventListener('click', async ev => {
    const tab = ev.target.closest('[data-tab]');
    if (tab) {
      pestana = tab.dataset.tab;
      cont.querySelectorAll('[data-tab]').forEach(x => { x.classList.toggle('on', x === tab); x.setAttribute('aria-selected', x === tab); });
      pintar();
      return;
    }
    const va = ev.target.closest('[data-va]');
    if (va) { vistaAutora = va.dataset.va; pintar(); return; }
    if (ev.target.closest('#fr-guardar')) {
      const b = ev.target.closest('#fr-guardar');
      b.disabled = true;
      try {
        const e = armarEntrega({ chars, expl, titulo: entrega.titulo || '', itemId, base: { titulo: d.base_titulo || B.titulo, autor: d.base_autor || B.autor, propio } });
        await estado.api.editarEntrega(entrega.id, { titulo: e.titulo, texto: e.texto, vista: e.vista, datos: e.datos });
        entrega.datos = e.datos;
        expl = { ...e.datos.expl };
        $('#fr-estado').textContent = 'Guardado';
        aviso('Explicaciones guardadas.', 'exito');
      } catch (err) { errorAviso(err); b.disabled = false; }
    }
  });
  cont.addEventListener('input', ev => {
    const t = ev.target.closest('.fm-por');
    if (!t) return;
    const u = $('#fm-cuerpo')._unidades?.[Number(t.dataset.u)];
    if (!u) return;
    for (const id of u.ids) delete expl[id];
    if (t.value.trim()) expl[u.clave] = t.value;
    t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px';
    $('#fr-guardar').disabled = false;
    $('#fr-estado').textContent = 'Sin guardar';
  });

  pintar();
}
