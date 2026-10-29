// Módulo: Literatura definicional (Oulipo). Una frase se reescribe reemplazando sus
// palabras por sus definiciones (nivel 1); luego se hace lo mismo con el nivel 1 (nivel 2),
// y así sucesivamente. Las definiciones salen del diccionario común (nucleo/diccionario.js).
//
// Cada nivel empieza con una copia del anterior. Arriba se ve toda la escalera; el nivel
// anterior trae sus palabras para tocar: al tocar una se abren sus definiciones y «Trasladar»
// la cambia, en la escritura, por la acepción elegida. Las palabras se marcan como definidas o
// «se queda así»; las funcionales (artículos, preposiciones…) no cuentan. En la escritura, lo
// trasladado se ve en granate y lo que escribe la persona, en violeta. Se puede ir y volver
// entre niveles: solo el nivel abierto se edita; los de adelante quedan como borradores.
// Se publica (la escalera completa) desde el nivel 2.
//
// Borrador (clave 'definicional:<item>'): { estado: E }
//   E = { v, origen: { texto, autor, obra, traductor, propio }, max, titulo, actual,
//         niveles: [{ texto, marcas: { <posición>: 'd' | 'q' }, ins: { <posición>: texto trasladado },
//                     tramos: [[inicio, fin, 'd' | 'p']…], fuente }] }
//   niveles[k] es el nivel k + 1; actual, el que está abierto. Las marcas son de las palabras del
//   nivel anterior tal como era en «fuente» (si ese nivel cambia, se reacomodan al volver).
//   tramos: lo trasladado del diccionario ('d') y lo escrito a mano ('p'); el resto viene del nivel anterior.
// Entrega: texto = último nivel + la escalera · datos = { origen, niveles: [texto…], marcas: […], tramos: […], max }
//   (desde la versión 1.1; las de la 1.0 no traen tramos)
// Las frases propias usan item_id 'propio-<id>' y una lista en el borrador 'definicional:_propios'.
import { estado, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, debounce, contarPalabras, confirmar, aviso, errorAviso, hace, modal } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';
import { montarDiccionario, esFuncional } from '../nucleo/diccionario.js';

const SLUG = 'definicional';
const ACENTO = '#9E2B4E';
const VERSION = '1.1';
const PROPIO = 'propio-';
const NUEVO = 'propio-nuevo';
const CLAVE_INDICE = `${SLUG}:_propios`;
const MIN_NIVELES = 2;
const NIVELES_DEF = 4;
const MAX_NIVELES = 6;
const MIN_PROPIA = 3;
const MAX_PROPIA = 40;
const MAX_FRASE = 80;

const INTRO = [
  'La literatura definicional consiste en reescribir y expandir un texto a partir de las definiciones de sus palabras.',
  'Se empieza con una frase y se reescribe con las definiciones de las palabras que la componen: ese es el nivel 1. Después se hace lo mismo con el nivel 1, y así, nivel por nivel. La frase crece, el sentido se desvía y la sintaxis tiene que sostenerse.',
];

// Ejemplos de la dinámica (se ven en la portada y en el escritorio).
const EJEMPLOS = [{
  original: 'El gato tomó leche.',
  niveles: [
    'El mamífero carnívoro doméstico que se apoya sobre sus dedos tragó un líquido blanco, de un sabor dulce, provisto por las hembras de los mamíferos.',
    'Ese que tiene mamas, come carne, camina sobre las extremidades de sus dedos y vive en las casas, hizo descender desde la garganta hasta el estómago una materia sin forma propia, del color de la leche, de una impresión agradable sobre los órganos del gusto, producida por los animales del sexo femenino que tienen mamas.',
  ],
}];

const PARA_QUE = [
  'Expande el dominio del lenguaje y la precisión léxica.',
  'Desarrolla la conciencia estilística.',
  'Mejora la capacidad de descripción y evocación.',
  'Fomenta la creatividad y la experimentación con la forma.',
  'Ayuda a comprender la importancia de la concisión y la expansión.',
  'Ejercita la reescritura y la reformulación del pensamiento.',
  'Explora la musicalidad y el ritmo en la prosa.',
  'Afina la construcción de metáforas y comparaciones.',
];

const esPropio = id => String(id || '').startsWith(PROPIO);
// ---------- origen de cada carácter: 'b' (nivel anterior), 'd' (diccionario), 'p' (escrito a mano) ----------
const aTramos = org => {
  const t = [];
  for (let i = 0; i < org.length;) {
    let j = i + 1;
    while (j < org.length && org[j] === org[i]) j++;
    if (org[i] === 'd' || org[i] === 'p') t.push([i, j, org[i]]);
    i = j;
  }
  return t;
};
const deTramos = (tramos, largo) => {
  const org = new Array(largo).fill('b');
  for (const x of Array.isArray(tramos) ? tramos : []) {
    if (!Array.isArray(x) || !(x[2] === 'd' || x[2] === 'p')) continue;
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
    c.push(x); o.push(org[i] || 'b');
  }
  while (ultimo() === ' ' || ultimo() === '\n') { c.pop(); o.pop(); }
  return { texto: c.join(''), org: o };
}
const limpio = t => limpiarConOrigen(t).texto;

// Texto con sus colores. enParrafos: <p> por párrafo (vista publicada); si no, el texto tal cual (capa del editor).
function coloreado(texto, tramos, { enParrafos = true, clase = 'v-df' } = {}) {
  const org = deTramos(tramos, texto.length);
  let html = '';
  for (let i = 0; i < texto.length;) {
    let j = i + 1;
    while (j < texto.length && org[j] === org[i]) j++;
    const cl = org[i] === 'b' ? '' : `${clase}-${org[i]}`;
    let h = esc(texto.slice(i, j));
    if (enParrafos) h = h.replace(/\n{2,}/g, cl ? `</span></p><p><span class="${cl}">` : '</p><p>').replace(/\n/g, '<br>');
    html += cl ? `<span class="${cl}">${h}</span>` : h;
    i = j;
  }
  return enParrafos ? `<p>${html}</p>` : html;
}
const corto = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };
const palabras = t => contarPalabras(t);
const enPalabras = n => `${n} ${n === 1 ? 'palabra' : 'palabras'}`;
const crecer = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };

const RE_PAL = /[\p{L}\p{M}]+/gu;
const tokens = texto => [...String(texto).matchAll(RE_PAL)].map((m, i) => ({ i, t: m[0], a: m.index, b: m.index + m[0].length }));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------
// Escalera (vista publicada, ejemplo y «Ver la escalera»)
// ---------------------------------------------------------------------
const parrafosHTML = t => limpio(t).split(/\n{2,}/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

// tramos[k]: colores del nivel k + 1 (opcional). Con colores, la escalera trae su leyenda.
export function escaleraHTML(original, niveles, tramos = null) {
  const conColor = Array.isArray(tramos) && tramos.some(t => t?.length);
  return `<div class="v-definicional">${[original, ...niveles].map((t, k) => `
    <div class="v-df-nivel v-df-n${Math.min(k, MAX_NIVELES)}">
      <div class="v-rotulo">${k ? `Nivel ${k}` : 'Frase original'} · ${enPalabras(palabras(t))}</div>
      ${k && conColor && tramos[k - 1]?.length ? coloreado(t, tramos[k - 1]) : parrafosHTML(t)}
    </div>`).join('')}${conColor ? '<p class="v-df-leyenda"><span class="v-df-d">Del diccionario</span> · <span class="v-df-p">Escritura propia</span></p>' : ''}</div>`;
}

function deQuien(o = {}) {
  if (!o.autor) return o.propio ? 'una frase propia' : 'una frase del taller';
  return `una frase de ${o.autor}${o.obra ? ` (${o.obra})` : ''}${o.traductor ? `, en traducción de ${o.traductor}` : ''}`;
}
const creditoDe = o => `Literatura definicional a partir de ${deQuien(o)}.`;

function vistaHTML(d) {
  return `${escaleraHTML(d.origen.texto, d.niveles, d.tramos)}<p class="v-credito">${esc(creditoDe(d.origen))}</p>`;
}

// Texto plano: el último nivel primero (es el que se ve en el muro) y debajo la escalera.
function planoDe(d) {
  const n = d.niveles.length;
  return [
    d.niveles[n - 1],
    '— Escalera —',
    `Frase original: ${d.origen.texto}`,
    ...d.niveles.slice(0, n - 1).map((t, k) => `Nivel ${k + 1}: ${t}`),
    creditoDe(d.origen),
  ].join('\n\n');
}

const ejemploHTML = () => EJEMPLOS.map(e => escaleraHTML(e.original, e.niveles)).join('');
const paraQueHTML = () => `<ul class="df-paraque-lista">${PARA_QUE.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`;

// ---------------------------------------------------------------------
// Estado y borradores
// ---------------------------------------------------------------------
const nivelesMax = n => Math.min(MAX_NIVELES, Math.max(MIN_NIVELES, Number(n) || NIVELES_DEF));

function nuevoEstado(origen, max) {
  return { v: 1, origen, max: nivelesMax(max), titulo: '', actual: 0, niveles: [{ texto: origen.texto, marcas: {}, ins: {}, tramos: [], fuente: origen.texto }] };
}

function limpiarEstado(e) {
  if (!e || typeof e.origen?.texto !== 'string' || !e.origen.texto.trim() || !Array.isArray(e.niveles) || !e.niveles.length) return null;
  const marcas = m => Object.fromEntries(Object.entries(m || {}).filter(([k, v]) => /^\d+$/.test(k) && (v === 'd' || v === 'q')));
  const ins = m => Object.fromEntries(Object.entries(m || {}).filter(([k, v]) => /^\d+$/.test(k) && typeof v === 'string'));
  const max = Math.max(nivelesMax(e.max), e.niveles.length);
  const niveles = e.niveles.slice(0, max).map(n => {
    const texto = String(n?.texto ?? '');
    return { texto, marcas: marcas(n?.marcas), ins: ins(n?.ins), tramos: aTramos(deTramos(n?.tramos, texto.length)), fuente: typeof n?.fuente === 'string' ? n.fuente : null };
  });
  // Los borradores anteriores a la versión 1.1 no guardan «fuente»: se dan por alineados.
  niveles.forEach((n, k) => { if (n.fuente === null) n.fuente = k ? niveles[k - 1].texto : e.origen.texto; });
  const actual = Number.isInteger(e.actual) && e.actual >= 0 && e.actual < niveles.length ? e.actual : niveles.length - 1;
  return {
    v: 1,
    origen: { texto: e.origen.texto, autor: String(e.origen.autor || ''), obra: String(e.origen.obra || ''), traductor: String(e.origen.traductor || ''), propio: !!e.origen.propio },
    max, titulo: String(e.titulo || ''), actual, niveles,
  };
}

function desdeEntrega(entrega) {
  const d = entrega.datos || {};
  if (!d.origen?.texto || !Array.isArray(d.niveles) || !d.niveles.length) return null;
  return limpiarEstado({
    origen: d.origen, max: Math.max(d.max || NIVELES_DEF, d.niveles.length), titulo: entrega.titulo || '',
    niveles: d.niveles.map((t, k) => ({ texto: t, marcas: d.marcas?.[k] || {}, tramos: d.tramos?.[k] || [] })),
  });
}

// ¿Ya hay algo hecho? (para la marca «En curso» de la portada)
const empezado = E => !!E && (E.niveles.length > 1 || limpio(E.niveles[0].texto) !== limpio(E.origen.texto) || Object.keys(E.niveles[0].marcas || {}).length > 0);

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
// Módulo
// ---------------------------------------------------------------------
export default {
  slug: SLUG,
  nombre: 'Literatura definicional',
  version: VERSION,

  async abrir(cont, ctx) {
    if (ctx.entrega) return trabajar(cont, ctx.entrega.item_id, { entrega: ctx.entrega });
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    if (!id) return portada(cont);
    if (id === NUEVO) return nuevaPropia(cont);
    if (id.startsWith('_')) { location.replace(`#/d/${SLUG}`); return; }
    return trabajar(cont, id, { fija: !ctx.item_id && !!ctx.sesion?.item_id });
  },

  paquete: {
    plantilla: 'plantillas/definicional.json',
    describir: d => `${d.autor ? `${d.autor} · ` : ''}${corto(d.texto, 70)}`,
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json) ? json : Array.isArray(json?.frases) ? json.frases : null;
      if (!lista || !lista.length) return { items, errores: ['El archivo debe tener una lista "frases": [ … ] con al menos una frase.'] };
      const vistos = new Set();
      const txt = v => (typeof v === 'string' ? v.trim() : '');
      lista.forEach((f, i) => {
        const id = txt(f?.id);
        const n = `Frase ${i + 1}${id ? ` (${id})` : ''}`;
        if (!id) errores.push(`Frase ${i + 1}: falta "id".`);
        else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errores.push(`${n}: el id solo puede tener minúsculas sin tildes, números y guiones.`);
        else if (id.startsWith(PROPIO)) errores.push(`${n}: el id no puede empezar con "${PROPIO}".`);
        else if (vistos.has(id)) errores.push(`${n}: el id está repetido.`);
        vistos.add(id);
        const texto = limpio(f?.texto);
        if (!texto) { errores.push(`${n}: falta "texto".`); return; }
        if (palabras(texto) > MAX_FRASE) errores.push(`${n}: tiene ${palabras(texto)} palabras; el máximo es ${MAX_FRASE}.`);
        if (f?.niveles !== undefined && !(Number.isInteger(f.niveles) && f.niveles >= MIN_NIVELES && f.niveles <= MAX_NIVELES)) {
          errores.push(`${n}: "niveles" debe ser un número entero entre ${MIN_NIVELES} y ${MAX_NIVELES}.`);
        }
        const obra = txt(f?.obra);
        items.push({
          item_id: id,
          datos: { texto, autor: txt(f?.autor), obra, traductor: txt(f?.traductor), niveles: nivelesMax(f?.niveles), titulo: obra || corto(texto, 60) },
        });
      });
      return { items, errores };
    },
    exportar(items) {
      return {
        frases: items.map(({ item_id, datos: d }) => ({
          id: item_id, texto: d.texto,
          ...(d.autor ? { autor: d.autor } : {}), ...(d.obra ? { obra: d.obra } : {}), ...(d.traductor ? { traductor: d.traductor } : {}),
          ...(d.niveles !== NIVELES_DEF ? { niveles: d.niveles } : {}),
        })),
      };
    },
  },
};

// ---------------------------------------------------------------------
// Portada: introducción, ejemplo, para qué sirve y las frases
// ---------------------------------------------------------------------
async function portada(cont) {
  const yo = estado.yo.id;
  const [todos, mias, indice] = await Promise.all([
    estado.api.contenidos(SLUG),
    estado.api.entregas({ dinamica: SLUG, autor: yo }).catch(() => []),
    leerIndice(),
  ]);
  const frases = todos.filter(c => !c.item_id.startsWith('_'));
  const nubes = await Promise.all(frases.map(c => estado.api.borrador(`${SLUG}:${c.item_id}`).catch(() => null)));
  const mis = mias.filter(e => e.autor === yo);
  const cuantas = id => mis.filter(e => e.item_id === id).length;
  const enCurso = (id, nube) => [local(`borrador:${yo}:${SLUG}:${id}`), nube].some(b => empezado(limpiarEstado(b?.estado)));
  const propiasEnCurso = indice.filter(p => !mis.some(e => e.item_id === p.id));
  const propiasPublicadas = mis.filter(e => esPropio(e.item_id));

  const tarjeta = (c, k) => {
    const d = c.datos;
    const n = cuantas(c.item_id);
    const curso = enCurso(c.item_id, nubes[k]);
    const href = `#/d/${SLUG}/${encodeURIComponent(c.item_id)}`;
    return `<article class="fm-tarjeta df-tarjeta">
      <a class="fm-tarjeta-enlace" href="${href}">
        <span class="rotulo">${d.autor ? esc(d.autor) + (d.obra ? ` · ${esc(d.obra)}` : '') : 'Frase del taller'}</span>
        <span class="df-tarjeta-frase">${esc(d.texto)}</span>
        <span class="df-tarjeta-meta">${enPalabras(palabras(d.texto))} · hasta ${d.niveles || NIVELES_DEF} niveles</span>
      </a>
      <div class="fm-tarjeta-pie">
        ${n ? `<span class="estado-pill si">${icono('check', 13)}${n === 1 ? 'Publicada' : `${n} escaleras`}</span>` : ''}
        ${curso ? '<span class="estado-pill">En curso</span>' : ''}
        <span class="espaciador"></span>
        <a class="btn btn-chico btn-fantasma" href="#/muro?dinamica=${SLUG}&item=${encodeURIComponent(c.item_id)}">Escaleras</a>
        <a class="btn btn-chico btn-primario" href="${href}">${curso ? 'Seguir' : n ? 'Otra escalera' : 'Empezar'}</a>
      </div>
    </article>`;
  };

  cont.innerHTML = `
  <div class="contenedor df-portada" style="--acento:${ACENTO}">
    <section class="df-intro">
      <span class="df-sello">${icono('libro', 28)}</span>
      <div>
        <span class="rotulo">Literatura definicional · Oulipo</span>
        <h1 class="saludo">Escribir con definiciones</h1>
        <div class="df-intro-texto">${INTRO.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      </div>
    </section>

    <div class="df-info">
      <section class="df-caja df-ejemplo">
        <span class="rotulo">Un ejemplo</span>
        ${ejemploHTML()}
      </section>
      <section class="df-caja df-paraque">
        <span class="rotulo">Para qué sirve</span>
        ${paraQueHTML()}
      </section>
    </div>

    <h2 class="titulo-seccion df-titulo-sec">Elija una frase</h2>
    <div class="fm-rejilla">
      <a class="fm-tarjeta fm-tarjeta-nueva df-nueva" href="#/d/${SLUG}/${NUEVO}">
        <span class="df-mas">${icono('mas', 24)}</span>
        <span class="fm-tarjeta-titulo">Traer su propia frase</span>
        <span class="fm-tarjeta-extracto">Una frase suya o ajena, de hasta ${MAX_PROPIA} palabras.</span>
      </a>
      ${propiasEnCurso.map(p => `<article class="fm-tarjeta df-tarjeta">
        <a class="fm-tarjeta-enlace" href="#/d/${SLUG}/${encodeURIComponent(p.id)}">
          <span class="rotulo">Su frase · empezada ${esc(hace(p.creado || new Date().toISOString()))}</span>
          <span class="df-tarjeta-frase">${esc(p.texto || '')}</span>
        </a>
        <div class="fm-tarjeta-pie"><span class="estado-pill">En curso</span><span class="espaciador"></span>
          <button type="button" class="btn btn-chico btn-fantasma btn-icono" data-descartar="${esc(p.id)}" aria-label="Descartar esta frase" title="Descartar">${icono('basura', 16)}</button>
          <a class="btn btn-chico btn-primario" href="#/d/${SLUG}/${encodeURIComponent(p.id)}">Seguir</a></div>
      </article>`).join('')}
      ${propiasPublicadas.map(e => `<article class="fm-tarjeta df-tarjeta">
        <a class="fm-tarjeta-enlace" href="#/entrega/${e.id}">
          <span class="rotulo">Su frase · publicada ${esc(hace(e.creado))}</span>
          <span class="df-tarjeta-frase">${esc(e.titulo || corto(e.texto, 150))}</span>
        </a>
        <div class="fm-tarjeta-pie"><span class="estado-pill si">${icono('check', 13)}Publicada</span><span class="espaciador"></span>
          <a class="btn btn-chico btn-fantasma" href="#/entrega/${e.id}">Ver su escalera</a></div>
      </article>`).join('')}
      ${frases.map(tarjeta).join('')}
    </div>
  </div>`;

  cont.querySelector('.df-portada').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-descartar]');
    if (!b) return;
    if (!(await confirmar('¿Descartar esta frase? Se pierde lo que haya escrito.', { si: 'Descartar', peligro: true }))) return;
    const id = b.dataset.descartar;
    quitarBorrador(`${SLUG}:${id}`);
    await guardarIndice((await leerIndice()).filter(p => p.id !== id));
    b.closest('.fm-tarjeta').remove();
    aviso('Frase descartada.');
  });
}

// ---------------------------------------------------------------------
// Frase propia
// ---------------------------------------------------------------------
function nuevaPropia(cont) {
  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho" style="--acento:${ACENTO}">
    <a class="btn btn-fantasma btn-chico" href="#/d/${SLUG}" style="margin-bottom:14px">${icono('izquierda', 16)}Literatura definicional</a>
    <section class="tarjeta df-nueva-form">
      <span class="rotulo">Literatura definicional</span>
      <h1 class="titulo-seccion" style="margin:6px 0 8px">Traiga su frase</h1>
      <p class="tenue" style="margin-top:0">Escriba o pegue una frase, suya o ajena, de ${MIN_PROPIA} a ${MAX_PROPIA} palabras. Será el punto de partida de su escalera.</p>
      <div class="campo"><label for="df-nf">Frase</label><textarea class="area df-pegar" id="df-nf" rows="4" placeholder="Escriba aquí su frase…"></textarea>
        <p class="nota-campo" id="df-nc">0 palabras</p></div>
      <div class="df-dos-campos">
        <div class="campo"><label for="df-na">Autor (opcional, si no es suya)</label><input class="entrada" id="df-na" maxlength="140"></div>
        <div class="campo"><label for="df-no">Obra (opcional)</label><input class="entrada" id="df-no" maxlength="140"></div>
      </div>
      <button type="button" class="btn btn-primario" id="df-empezar" disabled>${icono('libro', 18)}Empezar</button>
    </section>
  </div>`;
  const $ = s => cont.querySelector(s);
  const area = $('#df-nf');
  const revisar = () => {
    const t = limpio(area.value);
    const n = palabras(t);
    const error = !t ? '' : n < MIN_PROPIA ? `${MIN_PROPIA - n === 1 ? 'Falta 1 palabra' : `Faltan ${MIN_PROPIA - n} palabras`}.` : n > MAX_PROPIA ? `${n - MAX_PROPIA === 1 ? 'Sobra 1' : `Sobran ${n - MAX_PROPIA}`}: el máximo es ${MAX_PROPIA}.` : '';
    const nc = $('#df-nc');
    nc.textContent = !t ? '0 palabras' : `${enPalabras(n)}${error ? `. ${error}` : '. Lista para empezar.'}`;
    nc.classList.toggle('falta', !!error);
    $('#df-empezar').disabled = !t || !!error;
    return { t, error };
  };
  area.addEventListener('input', revisar);
  $('#df-empezar').addEventListener('click', async () => {
    const { t, error } = revisar();
    if (!t || error) return;
    const id = PROPIO + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    $('#df-empezar').disabled = true;
    const origen = { texto: t, autor: $('#df-na').value.trim(), obra: $('#df-no').value.trim(), traductor: '', propio: true };
    await escribirBorrador(`${SLUG}:${id}`, { estado: nuevoEstado(origen, NIVELES_DEF) });
    await guardarIndice([{ id, texto: t, creado: new Date().toISOString() }, ...(await leerIndice())]);
    location.hash = `#/d/${SLUG}/${id}`;
  });
}

// ---------------------------------------------------------------------
// Escritorio: nivel por nivel
// ---------------------------------------------------------------------
async function trabajar(cont, itemId, { entrega = null, fija = false } = {}) {
  const clave = `${SLUG}:${itemId}`;
  let E;
  let nota = '';
  if (entrega) {
    E = desdeEntrega(entrega);
    if (!E) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Esta escalera no se puede editar aquí', '', `<a class="btn" href="#/entrega/${entrega.id}">Volver al texto</a>`)}</div>`;
      return;
    }
  } else {
    const b = await leerBorrador(clave);
    E = limpiarEstado(b?.estado);
    if (E && empezado(E)) nota = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`;
    if (!E) {
      if (esPropio(itemId)) {
        cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No encontramos esta frase', 'Puede que la haya descartado o que esté en otro navegador sin conexión.', `<a class="btn" href="#/d/${SLUG}">Volver a las frases</a>`)}</div>`;
        return;
      }
      const c = await estado.api.contenido(SLUG, itemId).catch(() => null);
      if (!c?.datos?.texto) {
        cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Esta frase no está disponible', 'Puede que el tutor la haya retirado.', `<a class="btn" href="#/d/${SLUG}">Volver a las frases</a>`)}</div>`;
        return;
      }
      const d = c.datos;
      E = nuevoEstado({ texto: d.texto, autor: d.autor || '', obra: d.obra || '', traductor: d.traductor || '', propio: false }, d.niveles);
    }
  }

  let sel = null;      // posición de la palabra elegida en el nivel anterior
  let publicado = false;
  let org = [];        // de dónde viene cada carácter del nivel abierto
  let previo = '';     // texto del nivel abierto antes del último cambio (para saber qué se escribió)
  const k = () => E.actual;
  const ultimo = () => E.niveles.length - 1;
  const N = () => E.niveles[k()];
  const baseDe = j => (j ? E.niveles[j - 1].texto : E.origen.texto);
  const base = () => baseDe(k());
  const toks = () => tokens(base());
  const nombreBase = j => (j ? `el nivel ${j}` : 'la frase original');
  const deBase = j => (j ? `del nivel ${j}` : 'de la frase original');
  const faltanTxt = n => (n === 1 ? 'Falta 1 palabra' : `Faltan ${n} palabras`);
  const faltan = () => toks().filter(t => !esFuncional(t.t) && !N().marcas[t.i]).length;

  const volver = entrega ? `<a class="herr" href="#/entrega/${entrega.id}" title="Volver al texto" aria-label="Volver al texto">${icono('izquierda', 18)}</a>`
    : fija ? '' : `<a class="btn btn-chico btn-fantasma" href="#/d/${SLUG}" title="Elegir otra frase">${icono('izquierda', 16)}Frases</a>`;

  cont.innerHTML = `
  <div class="contenedor" style="max-width:1400px">
    <div class="escritorio df-escritorio" style="--acento:${ACENTO}">
      <aside class="consigna-panel df-panel">
        <span class="rotulo">Literatura definicional</span>
        <h1>Defina cada palabra</h1>
        <div class="consigna-texto">
          <ol>
            <li>Toque una palabra del nivel anterior para ver sus definiciones.</li>
            <li>Elija una acepción y pulse <strong>Trasladar</strong>: la palabra se cambia por esa definición en su escritura. También puede escribirla a mano.</li>
            <li>Ajuste la frase para que se sostenga: conjugue, concuerde, reacomode.</li>
            <li>Pase al nivel siguiente: lo que escribió será el nuevo punto de partida. Puede volver a cualquier nivel desde los escalones; no se borra nada.</li>
          </ol>
          <p class="df-nota">Artículos, preposiciones y pronombres no hace falta definirlos. Puede publicar desde el nivel ${MIN_NIVELES}.</p>
        </div>
        <div class="df-progreso" id="df-progreso"></div>
        <div class="consigna-extra">
          <span class="linea-ico">${icono('libro', 16)}<span>Punto de partida: ${esc(deQuien(E.origen))}.</span></span>
          <details class="df-detalle"><summary>${icono('pagina', 16)}Ver el ejemplo</summary>${ejemploHTML()}</details>
          <details class="df-detalle"><summary>${icono('info', 16)}Para qué sirve</summary>${paraQueHTML()}</details>
        </div>
      </aside>
      <section class="mesa df-mesa">
        <div class="mesa-barra">
          ${volver}
          <span class="rotulo df-rotulo" id="df-rotulo"></span>
          <span class="espaciador"></span>
          <span class="guardado" id="guardado">${esc(nota)}</span>
          <button type="button" class="herr" id="df-abrir-dicc" title="Abrir el diccionario" aria-label="Abrir el diccionario">${icono('diccionario', 18)}</button>
          <button type="button" class="herr" id="df-escalera" title="Ver la escalera" aria-label="Ver la escalera">${icono('ojo', 18)}</button>
          <button type="button" class="herr" id="enfoque" title="Modo enfoque" aria-label="Modo enfoque">${icono('enfoque', 18)}</button>
        </div>
        <div class="hoja-escribir df-hoja">
          <input class="titulo-escribir" id="titulo" placeholder="Título (opcional)" maxlength="140" value="${esc(E.titulo)}" aria-label="Título">
          <div class="df-anteriores" id="df-anteriores"></div>
          <div class="df-fuente">
            <div class="df-fuente-cab"><span class="rotulo" id="df-fuente-rotulo"></span><span class="df-faltan" id="df-faltan"></span></div>
            <p class="df-palabras" id="df-palabras"></p>
          </div>
          <div class="df-dicc" id="df-dicc" hidden>
            <div class="df-dicc-cab">
              <span class="rotulo">Diccionario</span>
              <span class="df-dicc-palabra" id="df-dicc-palabra"></span>
              <span class="espaciador"></span>
              <button type="button" class="herr" id="df-cerrar" title="Cerrar el diccionario" aria-label="Cerrar el diccionario">${icono('x', 18)}</button>
            </div>
            <div class="df-marcas" id="df-marcas"></div>
            <div id="df-dicc-cuerpo"></div>
          </div>
          <div class="df-escribe-cab">
            <label class="rotulo" for="df-texto" id="df-escribe-rotulo"></label>
            <span class="df-leyenda"><span class="df-c-d">Del diccionario</span> · <span class="df-c-p">Escrito por usted</span></span>
            <span class="espaciador"></span>
            <button type="button" class="btn btn-chico btn-fantasma df-descartar" id="df-descartar">${icono('basura', 15)}<span id="df-descartar-txt"></span></button>
          </div>
          <div class="df-editor">
            <div class="df-fondo" id="df-fondo" aria-hidden="true"></div>
            <textarea class="df-texto" id="df-texto" spellcheck="true" rows="3"></textarea>
          </div>
          <div class="df-adelante" id="df-adelante"></div>
        </div>
        <div class="mesa-pie">
          <span class="contador" id="contador"></span>
          <span class="espaciador"></span>
          <button type="button" class="btn btn-fantasma" id="df-atras">${icono('izquierda', 18)}<span id="df-atras-txt"></span></button>
          <button type="button" class="btn" id="df-avanzar"><span id="df-avanzar-txt"></span>${icono('derecha', 18)}</button>
          <button type="button" class="btn btn-primario" id="df-publicar">${icono(entrega ? 'check' : 'enviar', 18)}${entrega ? 'Guardar cambios' : 'Publicar'}</button>
        </div>
      </section>
    </div>
  </div>`;
  const $ = s => cont.querySelector(s);
  const area = $('#df-texto');
  const caja = $('#df-dicc');
  const dicc = montarDiccionario($('#df-dicc-cuerpo'), { alTrasladar: trasladar });

  // ---------- guardar ----------
  const guardado = t => { $('#guardado').textContent = t; };
  const guardarNube = debounce(async () => {
    if (publicado || entrega) return;
    try { await estado.api.guardarBorrador(clave, { estado: E }); guardado('Guardado'); }
    catch { guardado('Guardado en este dispositivo'); }
  }, 2500);
  function cambio() {
    if (entrega) { guardado('Cambios sin guardar'); return; }
    if (publicado) return;
    local(`borrador:${estado.yo.id}:${clave}`, { estado: E, _actualizado: new Date().toISOString() });
    guardado('Guardando…');
    guardarNube();
  }

  // ---------- pintar ----------
  function pintarFuente() {
    const b = base();
    const n = N();
    let html = '';
    let pos = 0;
    for (const t of toks()) {
      html += esc(b.slice(pos, t.a)).replace(/\n/g, '<br>');
      const m = n.marcas[t.i];
      const clases = ['df-pal', esFuncional(t.t) ? 'funcional' : '', m === 'd' ? 'definida' : m === 'q' ? 'queda' : '', sel === t.i ? 'elegida' : ''].filter(Boolean).join(' ');
      html += `<button type="button" class="${clases}" data-i="${t.i}">${esc(t.t)}</button>`;
      pos = t.b;
    }
    html += esc(b.slice(pos)).replace(/\n/g, '<br>');
    $('#df-palabras').innerHTML = html;
    const f = faltan();
    const el = $('#df-faltan');
    el.textContent = f ? `${faltanTxt(f)} por definir` : 'Todas las palabras están definidas';
    el.classList.toggle('listo', !f);
  }

  // Los escalones también sirven para ir de un nivel a otro.
  function pintarProgreso() {
    const j = k();
    const escalones = [E.origen.texto, ...E.niveles.map(x => x.texto)];
    $('#df-progreso').innerHTML = `
      <span class="rotulo">Nivel ${j + 1} de ${E.max}</span>
      <div class="df-escalones" aria-label="Niveles y sus palabras">${escalones.map((t, i) => `${i ? '<span class="df-flecha" aria-hidden="true">→</span>' : ''}${i
        ? `<button type="button" class="df-escalon${i === j + 1 ? ' on' : ''}${i - 1 > j ? ' borrador' : ''}" data-ir="${i - 1}" title="${i === j + 1 ? 'Nivel abierto' : `Ir al nivel ${i}`}"${i === j + 1 ? ' aria-current="step"' : ''}><small>N${i}</small><b>${palabras(t)}</b></button>`
        : `<span class="df-escalon"><small>Frase</small><b>${palabras(t)}</b></span>`}`).join('')}</div>
      <p class="df-faltan-panel">${faltan() ? `${faltanTxt(faltan())} ${deBase(j)}.` : `Ya definió ${nombreBase(j)}.`}</p>`;
  }

  function pintarPie() {
    const j = k();
    const n = palabras(N().texto);
    const total = E.niveles.length;
    $('#contador').textContent = `${enPalabras(n)} · antes ${palabras(base())}`;
    $('#df-atras').hidden = j === 0;
    $('#df-atras-txt').textContent = `Nivel ${j}`;
    $('#df-avanzar').hidden = j + 1 >= E.max;
    $('#df-avanzar-txt').textContent = j < ultimo() ? `Nivel ${j + 2}` : `Pasar al nivel ${j + 2}`;
    $('#df-descartar').hidden = !(j === ultimo() && j > 0);
    $('#df-descartar-txt').textContent = `Descartar el nivel ${j + 1}`;
    $('#df-publicar').disabled = total < MIN_NIVELES;
    $('#df-publicar').title = total < MIN_NIVELES ? `Puede publicar desde el nivel ${MIN_NIVELES}` : '';
  }

  // Lo que va antes del nivel anterior: la frase y los niveles ya escritos (solo para leer).
  function pintarAnteriores() {
    const j = k();
    const refs = [];
    if (j >= 1) refs.push(['Frase original', E.origen.texto]);
    for (let i = 0; i < j - 1; i++) refs.push([`Nivel ${i + 1}`, E.niveles[i].texto]);
    $('#df-anteriores').innerHTML = refs.map(([r, t]) => `<div class="df-ref"><span class="rotulo">${r} · ${enPalabras(palabras(t))}</span><p>${esc(limpio(t)).replace(/\n/g, '<br>')}</p></div>`).join('');
  }

  // Los niveles de adelante, como borradores: se ven, pero no se editan desde aquí.
  function pintarAdelante() {
    const j = k();
    let html = '';
    for (let i = j + 1; i <= ultimo(); i++) {
      const n = E.niveles[i];
      const desfase = n.fuente !== E.niveles[i - 1].texto;
      html += `<div class="df-borrador">
        <div class="df-borrador-cab"><span class="rotulo">Nivel ${i + 1} · borrador</span>${desfase ? `<span class="df-borrador-aviso">El nivel ${i} cambió después de escribir este</span>` : ''}
          <span class="espaciador"></span><button type="button" class="btn btn-chico btn-fantasma" data-ir="${i}">Ir al nivel ${i + 1}${icono('derecha', 15)}</button></div>
        <p>${esc(limpio(n.texto)).replace(/\n/g, '<br>') || '<span class="tenue">Vacío</span>'}</p>
      </div>`;
    }
    $('#df-adelante').innerHTML = html;
  }
  // Mientras se escribe en un nivel con borradores adelante, el aviso del siguiente se pone al día.
  function avisoAdelante() {
    const sig = E.niveles[k() + 1];
    const cab = $('#df-adelante .df-borrador-cab');
    if (!sig || !cab) return;
    const desfase = sig.fuente !== N().texto;
    const el = cab.querySelector('.df-borrador-aviso');
    if (desfase && !el) cab.querySelector('.rotulo').insertAdjacentHTML('afterend', `<span class="df-borrador-aviso">El nivel ${k() + 1} cambió después de escribir este</span>`);
    else if (!desfase && el) el.remove();
  }

  // La escritura se ve con sus colores en una capa debajo del área de texto (que es transparente).
  function pintarFondo() {
    $('#df-fondo').innerHTML = coloreado(area.value, aTramos(org), { enParrafos: false, clase: 'df-c' }) + '\n';
  }
  function guardarOrg() { N().tramos = aTramos(org); }

  // Si el nivel anterior cambió desde que se marcaron sus palabras, las marcas pasan a la misma
  // palabra (la misma vez que aparece) en el texto nuevo; las que ya no están, se quitan.
  function realinear(n, b) {
    if (n.fuente === b) return;
    const viejos = tokens(n.fuente ?? b);
    const nuevos = tokens(b);
    const igual = (x, y) => x.t.toLowerCase() === y.t.toLowerCase();
    const marcas = {};
    const ins = {};
    for (const [i, v] of Object.entries(n.marcas)) {
      const t = viejos[i];
      if (!t) continue;
      const r = viejos.filter(x => igual(x, t)).indexOf(t);
      const c = nuevos.filter(x => igual(x, t))[r];
      if (!c) continue;
      marcas[c.i] = v;
      if (n.ins[i]) ins[c.i] = n.ins[i];
    }
    n.marcas = marcas;
    n.ins = ins;
    n.fuente = b;
  }

  function pintarNivel() {
    const j = k();
    realinear(N(), base());
    org = deTramos(N().tramos, N().texto.length);
    previo = N().texto;
    $('#df-rotulo').textContent = `Nivel ${j + 1}${j < ultimo() ? ` · ${ultimo() - j} en borrador` : ''}`;
    $('#df-fuente-rotulo').textContent = j ? `Nivel ${j} · toque una palabra` : 'Frase original · toque una palabra';
    $('#df-escribe-rotulo').textContent = `Nivel ${j + 1} · su escritura`;
    area.value = N().texto;
    area.placeholder = `Escriba aquí el nivel ${j + 1}…`;
    crecer(area);
    pintarFondo();
    cerrarDicc();
    pintarAnteriores();
    pintarFuente();
    pintarAdelante();
    pintarProgreso();
    pintarPie();
  }

  function irA(i) {
    if (i === k() || i < 0 || i > ultimo()) return;
    E.actual = i;
    cambio();
    pintarNivel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function actualizar() { pintarFuente(); pintarProgreso(); pintarPie(); }

  // ---------- diccionario ----------
  function pintarMarcas() {
    const m = sel === null ? null : N().marcas[sel];
    const t = sel === null ? null : toks()[sel];
    $('#df-dicc-palabra').textContent = t ? `«${t.t}»` : '';
    $('#df-marcas').innerHTML = t ? `
      ${m === 'd' ? `<span class="estado-pill si">${icono('check', 13)}Definida</span>` : m === 'q' ? '<span class="estado-pill">Se queda así</span>' : ''}
      ${m ? `<button type="button" class="btn btn-chico btn-fantasma" data-marca="">Quitar la marca</button>`
        : `<button type="button" class="btn btn-chico btn-fantasma" data-marca="d">${icono('check', 15)}Ya la definí</button>
           <button type="button" class="btn btn-chico btn-fantasma" data-marca="q">Dejarla así</button>`}
      <span class="espaciador"></span>
      <button type="button" class="btn btn-chico btn-fantasma" id="df-siguiente">Siguiente palabra${icono('derecha', 15)}</button>` : '';
    $('#df-marcas').hidden = !t;
  }

  function abrirDicc(palabra) {
    caja.hidden = false;
    pintarMarcas();
    dicc.mostrar(palabra);
    requestAnimationFrame(() => caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  function cerrarDicc() {
    sel = null;
    caja.hidden = true;
  }
  function elegir(i) {
    sel = i;
    pintarFuente();
    abrirDicc(toks()[i].t);
  }
  function marcar(valor) {
    if (sel === null) return;
    if (valor) N().marcas[sel] = valor; else { delete N().marcas[sel]; delete N().ins[sel]; }
    cambio();
    pintarMarcas();
    actualizar();
  }
  function siguiente() {
    const ts = toks();
    const desde = sel === null ? -1 : sel;
    const pend = ts.filter(t => !esFuncional(t.t) && !N().marcas[t.i]);
    const sig = pend.find(t => t.i > desde) || pend[0];
    if (!sig) { aviso(`Ya definió todas las palabras de ${nombreBase(k())}.`); return; }
    elegir(sig.i);
  }

  // Prepara una acepción para entrar en la frase: sin paréntesis inicial, sin punto final y,
  // si no va al principio de una frase, en minúscula.
  function preparar(def, mayus) {
    let d = String(def).trim().replace(/^\([^)]*\)\s*/, '').replace(/[.\s]+$/, '');
    if (mayus) d = d.charAt(0).toUpperCase() + d.slice(1);
    else if (/^\p{Lu}\p{Ll}/u.test(d)) d = d.charAt(0).toLowerCase() + d.slice(1);
    return d;
  }

  function trasladar(def) {
    const v = area.value;
    const n = N();
    let a;
    let b;
    let mayus = false;
    if (sel !== null) {
      const ts = toks();
      const tok = ts[sel];
      const antes = n.ins[sel];
      const pk = antes ? v.indexOf(antes) : -1;
      if (pk >= 0) {
        a = pk; b = pk + antes.length; mayus = /^\p{Lu}/u.test(antes);
      } else {
        const iguales = ts.filter(x => x.t.toLowerCase() === tok.t.toLowerCase());
        const rango = iguales.indexOf(tok);
        const re = new RegExp(`(?<![\\p{L}\\p{M}])${escRe(tok.t)}(?![\\p{L}\\p{M}])`, 'giu');
        const hay = [...v.matchAll(re)];
        if (hay.length) {
          const m = hay[Math.min(rango, hay.length - 1)];
          a = m.index; b = a + m[0].length; mayus = /^\p{Lu}/u.test(m[0]);
        }
      }
    }
    if (a === undefined) {
      a = area.selectionStart ?? v.length;
      b = area.selectionEnd ?? a;
      mayus = !v.slice(0, a).trim() || /[.?!…]\s*$/.test(v.slice(0, a));
    }
    const d = preparar(def, mayus);
    area.value = v.slice(0, a) + d + v.slice(b);
    n.texto = area.value;
    org = [...org.slice(0, a), ...new Array(d.length).fill('d'), ...org.slice(b)];
    previo = area.value;
    guardarOrg();
    if (sel !== null) { n.marcas[sel] = 'd'; n.ins[sel] = d; }
    crecer(area);
    pintarFondo();
    if (k() < ultimo()) avisoAdelante();
    area.focus({ preventScroll: true });
    area.setSelectionRange(a, a + d.length);
    area.scrollIntoView({ block: 'center', behavior: 'smooth' });
    cambio();
    pintarMarcas();
    actualizar();
  }

  // ---------- niveles ----------
  // Si el nivel siguiente ya existe (como borrador), se va a él; si no, se crea con una copia de este.
  async function avanzar() {
    const j = k();
    if (j + 1 >= E.max) return;
    if (j < ultimo()) { irA(j + 1); return; }
    const t = limpio(N().texto);
    if (!t) { aviso(`Escriba el nivel ${j + 1} antes de pasar al siguiente.`); return; }
    if (t === limpio(base())) { aviso(`El nivel ${j + 1} todavía es igual a ${nombreBase(j)}. Defina al menos una palabra.`); return; }
    const f = faltan();
    if (f && !(await confirmar(`${f === 1 ? 'Queda 1 palabra' : `Quedan ${f} palabras`} sin definir en ${nombreBase(j)}. ¿Pasar al nivel ${j + 2} de todos modos?`, { si: `Pasar al nivel ${j + 2}`, no: 'Seguir definiendo' }))) return;
    E.niveles.push({ texto: N().texto, marcas: {}, ins: {}, tramos: [], fuente: N().texto });
    E.actual = ultimo();
    cambio();
    pintarNivel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    aviso(`Nivel ${j + 2}: ahora defina las palabras del nivel ${j + 1}.`);
  }

  // Volver no borra nada: el nivel que se deja queda como borrador.
  function atras() { irA(k() - 1); }

  async function descartar() {
    const j = k();
    if (!(j === ultimo() && j > 0)) return;
    if (!(await confirmar(`¿Descartar el nivel ${j + 1}? Se borra lo que escribió en él.`, { si: `Descartar el nivel ${j + 1}`, no: 'Conservarlo', peligro: true }))) return;
    E.niveles.pop();
    E.actual = ultimo();
    cambio();
    pintarNivel();
  }

  function verEscalera() {
    modal({
      titulo: 'La escalera hasta ahora',
      cuerpo: `<div class="df-modal">${escaleraHTML(E.origen.texto, E.niveles.map(x => x.texto), E.niveles.map(x => x.tramos))}</div>`,
      acciones: [{ texto: 'Cerrar', clase: 'btn-primario' }],
      ancho: 680,
    });
  }

  async function publicar() {
    const n = E.niveles.length;
    if (n < MIN_NIVELES) return;
    // Se publica la escalera completa, también los niveles que están como borrador.
    const limpios = E.niveles.map(x => limpiarConOrigen(x.texto, deTramos(x.tramos, x.texto.length)));
    const textos = limpios.map(x => x.texto);
    const hueco = textos.findIndex(t => !t);
    if (hueco >= 0) { aviso(`El nivel ${hueco + 1} está vacío.`); return; }
    if (textos[n - 1] === textos[n - 2]) { aviso(`El nivel ${n} todavía es igual al nivel ${n - 1}. Reescríbalo, o descártelo para publicar hasta el nivel ${n - 1}.`); return; }
    const borradores = k() < ultimo() ? ` Se publican los ${n} niveles, también ${ultimo() - k() === 1 ? 'el que está' : 'los que están'} como borrador.` : '';
    if (!entrega && !(await confirmar(`${avisoPublicar('su escalera', 'la')}${borradores}`, { si: 'Publicar', no: 'Seguir escribiendo' }))) return;
    if (entrega && borradores && !(await confirmar(`${borradores.trim()} ¿Guardar los cambios?`, { si: 'Guardar cambios', no: 'Seguir escribiendo' }))) return;
    const btn = $('#df-publicar');
    btn.disabled = true;
    const datos = { origen: E.origen, niveles: textos, marcas: E.niveles.map(x => x.marcas), tramos: limpios.map(x => aTramos(x.org)), max: E.max };
    try {
      publicado = true;
      guardarNube.cancelar();
      await publicarEntrega({
        dinamica: SLUG, item_id: itemId, titulo: (E.titulo || '').trim(),
        texto: planoDe(datos), vista: vistaHTML(datos), datos, modulo_version: VERSION,
      }, { entregaExistente: entrega });
      if (!entrega) {
        quitarBorrador(clave);
        if (esPropio(itemId)) guardarIndice((await leerIndice()).filter(p => p.id !== itemId)).catch(() => {});
      }
    } catch (err) {
      publicado = false;
      cambio();
      errorAviso(err);
      btn.disabled = false;
    }
  }

  // ---------- eventos ----------
  $('#df-palabras').addEventListener('click', ev => {
    const p = ev.target.closest('.df-pal');
    if (!p) return;
    const i = Number(p.dataset.i);
    if (sel === i && !caja.hidden) { cerrarDicc(); pintarFuente(); return; }
    elegir(i);
  });
  $('#df-marcas').addEventListener('click', ev => {
    const m = ev.target.closest('[data-marca]');
    if (m) { marcar(m.dataset.marca); return; }
    if (ev.target.closest('#df-siguiente')) siguiente();
  });
  $('#df-cerrar').addEventListener('click', () => { cerrarDicc(); pintarFuente(); });
  $('#df-abrir-dicc').addEventListener('click', () => {
    sel = null;
    pintarFuente();
    caja.hidden = false;
    pintarMarcas();
    requestAnimationFrame(() => { caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); caja.querySelector('#dicc-q')?.focus(); });
  });
  // Lo que se escribe o se cambia a mano queda marcado como escritura propia.
  area.addEventListener('input', () => {
    const v = area.value;
    const o = previo;
    const max = Math.min(v.length, o.length);
    let p = 0;
    while (p < max && v[p] === o[p]) p++;
    let s = 0;
    while (s < max - p && v[v.length - 1 - s] === o[o.length - 1 - s]) s++;
    org = [...org.slice(0, p), ...new Array(v.length - p - s).fill('p'), ...org.slice(o.length - s)];
    previo = v;
    N().texto = v;
    guardarOrg();
    crecer(area);
    pintarFondo();
    cambio();
    pintarProgreso();
    pintarPie();
    if (k() < ultimo()) avisoAdelante();
  });
  $('#df-progreso').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ir]');
    if (b) irA(Number(b.dataset.ir));
  });
  $('#df-adelante').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ir]');
    if (b) irA(Number(b.dataset.ir));
  });
  $('#df-descartar').addEventListener('click', descartar);
  $('#titulo').addEventListener('input', ev => { E.titulo = ev.target.value; cambio(); });
  $('#df-avanzar').addEventListener('click', avanzar);
  $('#df-atras').addEventListener('click', atras);
  $('#df-publicar').addEventListener('click', publicar);
  $('#df-escalera').addEventListener('click', verEscalera);
  $('#enfoque').addEventListener('click', ev => { ev.currentTarget.classList.toggle('on', document.body.classList.toggle('enfoque')); });
  const alCambiarTamano = debounce(() => crecer(area), 150);
  window.addEventListener('resize', alCambiarTamano);

  pintarNivel();
  return () => {
    dicc.limpiar();
    window.removeEventListener('resize', alCambiarTamano);
    document.body.classList.remove('enfoque');
    if (!publicado && !entrega && empezado(E)) guardarNube.ahora();
  };
}
