// Módulo: Pliegues. El texto de quien escribe se divide en frases, se pliega
// (las frases se dispersan) y vuelve frase por frase, en desorden. Después de
// cada frase que emerge se escriben hasta tres frases propias; al desplegar,
// aparece la siguiente debajo. Al final hay dos caras del mismo trabajo:
//   · Pliegues: el recorrido, con las frases de origen fijas.
//   · Texto final: el texto unificado, editable entero. Se arma solo a partir de
//     los pliegues hasta que se edita por primera vez; desde ahí el despliegue
//     queda cerrado (los pliegues ya no cambian).
//
// Borrador (clave 'pliegues:<item>'): { estado: E }
//   E = { v, origen: { titulo, autor, propio }, frases: [...], orden: [índices],
//         n (frases desplegadas), escritos: [...], fase: 'plegar' | 'escribir' | 'cierre',
//         cerrado, final (null mientras se arma solo), titulo }
//   El orden se baraja una sola vez: recargar no vuelve a barajar.
// Entrega: texto = texto final · datos = { origen, frases_total, pasos: [{ frase, escrito }],
//   final, marcas: [[inicio, fin], …] } — marcas son los tramos del texto final que
//   vienen del texto de origen (se pintan en el muro y en la entrega).
// El texto de origen completo no se publica: solo las frases que se desplegaron.
import { estado, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, debounce, contarPalabras, confirmar, aviso, errorAviso, hace, barajar } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const SLUG = 'pliegues';
const ACENTO = '#FFB547';
const VERSION = '1.0';
const PROPIO = 'propio-';
const NUEVO = 'propio-nuevo';
const CLAVE_INDICE = `${SLUG}:_propios`;
const MIN_PALABRAS = 100;
const MAX_PALABRAS = 3000;
const MIN_FRASES = 3;
const MAX_POR_PLIEGUE = 3;
const MIN_PLIEGUES = 5;

const RITUAL = [
  'El texto atravesará por un proceso de dispersión y plegado.',
  'Las frases dejarán de ocupar su lugar.',
  'Se subvertirá el orden establecido.',
  'Se romperá la linealidad.',
  'El sentido podría sufrir reveses.',
  'Los puntos de entrada se convertirán en ventanas de fuga.',
];
const CONSIGNA_1 = 'Reescriba su texto a partir de las frases que empiezan a emerger.';
const CONSIGNA_2 = 'Transforme su escritura y llévela por otros caminos: huya del síntoma.';

const esPropio = id => String(id || '').startsWith(PROPIO);

// ---------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------
export function normalizar(t) {
  return String(t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]/g, ' ')
    .replace(/[ ]+\n/g, '\n').replace(/\n[ ]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
}

// Abreviaturas frecuentes: su punto no cierra la frase.
const ABREV = new Set(['sr', 'sra', 'srta', 'sres', 'dr', 'dra', 'lic', 'ing', 'prof', 'profa', 'arq', 'pág', 'págs',
  'pp', 'núm', 'ud', 'uds', 'vd', 'vds', 'av', 'avda', 'cap', 'fig', 'vol', 'ed', 'eds', 'ej', 'cía', 'gral', 'cnel',
  'st', 'sto', 'sta', 'vs', 'aprox', 'tel', 'mr', 'mrs', 'ms', 'jr', 'dña', 'dn']);

// Divide un texto en frases. Una frase termina en . ? ! o …, salvo en
// abreviaturas, iniciales o cuando lo que sigue empieza en minúscula
// («¿Vienes? —preguntó»). Un párrafo que no termina en punto también cierra frase.
export function dividirFrases(texto) {
  const out = [];
  for (const parrafo of normalizar(texto).split(/\n{2,}/)) {
    const s = parrafo.replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').trim();
    if (!s) continue;
    const re = /[.?!…]+[»"”’)\]]*(?=\s|$)/g;
    let ini = 0;
    let m;
    while ((m = re.exec(s))) {
      const fin = m.index + m[0].length;
      const palabra = (s.slice(ini, m.index).match(/(\p{L}+)$/u) || [])[1] || '';
      const resto = s.slice(fin).trimStart();
      if (m[0][0] === '.' && !/^\.{2,}/.test(m[0]) && (ABREV.has(palabra.toLowerCase()) || /^\p{Lu}$/u.test(palabra))) continue;
      if (resto && /^[\p{Ll},;:]/u.test(resto)) continue;
      if (resto && /^[—–-]\s*\p{Ll}/u.test(resto)) continue;
      out.push(s.slice(ini, fin).trim());
      ini = fin;
    }
    const cola = s.slice(ini).trim();
    if (cola) out.push(cola);
  }
  return out.filter(f => /[\p{L}\p{N}]/u.test(f));
}

const frasesEscritas = t => (String(t || '').trim() ? Math.max(1, dividirFrases(t).length) : 0);

// Revisa un texto de origen. Devuelve { palabras, frases, error }.
function revisarOrigen(texto) {
  const palabras = contarPalabras(texto);
  const frases = dividirFrases(texto);
  let error = '';
  if (palabras > MAX_PALABRAS) error = `El texto tiene ${palabras} palabras: el máximo es ${MAX_PALABRAS}.`;
  else if (palabras < MIN_PALABRAS) error = `Faltan ${MIN_PALABRAS - palabras} ${MIN_PALABRAS - palabras === 1 ? 'palabra' : 'palabras'} (el mínimo es ${MIN_PALABRAS}).`;
  else if (frases.length < MIN_FRASES) error = `El texto necesita al menos ${MIN_FRASES} frases. La app reconoce una frase por el punto final (también por ? y !).`;
  return { palabras, frases, error };
}

// ---------------------------------------------------------------------
// Texto final y marcas de origen
// ---------------------------------------------------------------------
const limpiarEscrito = t => normalizar(t);

function pasosDe(E) {
  return E.orden.slice(0, E.n).map((idx, k) => ({ frase: E.frases[idx], escrito: E.escritos[k] || '' }));
}

// Une los pliegues en un texto: cada frase de origen con lo que se escribió
// después forma un párrafo. Devuelve también dónde quedó cada frase de origen.
function armarFinal(pasos) {
  let texto = '';
  const origen = [];
  pasos.forEach((p, k) => {
    if (k) texto += '\n\n';
    origen.push([texto.length, texto.length + p.frase.length]);
    texto += p.frase;
    const e = limpiarEscrito(p.escrito);
    if (e) texto += ' ' + e;
  });
  return { texto, origen };
}

const RE_TOK = /[\p{L}\p{M}\p{N}'’-]+|[^\s\p{L}\p{M}\p{N}]/gu;
const tokens = t => [...String(t).matchAll(RE_TOK)].map(m => ({ t: m[0], a: m.index, b: m.index + m[0].length }));

// Qué partes del texto final vienen del texto de origen. Compara palabra por
// palabra el texto final con el texto armado desde los pliegues: lo que sigue
// igual conserva su origen; lo agregado o cambiado cuenta como escritura.
export function marcasOrigen(final, pasos) {
  const { texto: fuente, origen } = armarFinal(pasos);
  const deOrigen = pos => origen.some(([a, b]) => pos >= a && pos < b);
  const x = tokens(fuente).map(k => ({ ...k, o: deOrigen(k.a) }));
  const y = tokens(final);
  const marcado = new Array(y.length).fill(false);
  let p = 0;
  while (p < x.length && p < y.length && x[p].t === y[p].t) { marcado[p] = x[p].o; p++; }
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s].t === y[y.length - 1 - s].t) { marcado[y.length - 1 - s] = x[x.length - 1 - s].o; s++; }
  const n = x.length - p - s;
  const m = y.length - p - s;
  if (n > 0 && m > 0) {
    if (n * m <= 4e6) {
      const L = new Uint32Array((n + 1) * (m + 1));
      const at = (i, j) => i * (m + 1) + j;
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          L[at(i, j)] = x[p + i].t === y[p + j].t ? L[at(i + 1, j + 1)] + 1 : Math.max(L[at(i + 1, j)], L[at(i, j + 1)]);
        }
      }
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (x[p + i].t === y[p + j].t) { marcado[p + j] = x[p + i].o; i++; j++; }
        else if (L[at(i + 1, j)] >= L[at(i, j + 1)]) i++;
        else j++;
      }
    } else {
      // Texto muy largo y muy cambiado: se marcan las frases de origen que siguen intactas.
      for (const paso of pasos) {
        let desde = 0;
        let k;
        while (paso.frase && (k = final.indexOf(paso.frase, desde)) >= 0) {
          const f = k + paso.frase.length;
          y.forEach((tk, jj) => { if (tk.a >= k && tk.b <= f) marcado[jj] = true; });
          desde = f;
        }
      }
    }
  }
  const tramos = [];
  y.forEach((tk, j) => {
    if (!marcado[j]) return;
    const u = tramos[tramos.length - 1];
    if (u && /^[ ]*$/.test(final.slice(u[1], tk.a))) u[1] = tk.b;
    else tramos.push([tk.a, tk.b]);
  });
  // Un signo suelto (un punto que sobrevivió a la frase) no se resalta.
  return tramos.filter(([a, b]) => /[\p{L}\p{N}]/u.test(final.slice(a, b)));
}

function trozos(texto, tramos) {
  const out = [];
  let pos = 0;
  for (const [a, b] of tramos || []) {
    if (!(a >= pos && b > a && b <= texto.length)) continue;
    if (a > pos) out.push([texto.slice(pos, a), false]);
    out.push([texto.slice(a, b), true]);
    pos = b;
  }
  if (pos < texto.length) out.push([texto.slice(pos), false]);
  return out;
}

// Texto con las marcas de origen, en párrafos (las marcas nunca cruzan un salto de línea).
function marcasHTML(texto, tramos, clase) {
  const cuerpo = trozos(texto, tramos).map(([t, o]) => {
    const h = esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
    return o ? `<span class="${clase}">${h}</span>` : h;
  }).join('');
  return `<p>${cuerpo}</p>`;
}

const parrafosHTML = t => normalizar(t).split(/\n{2,}/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

// «Las llaves», un texto propio · «El último bus», de Autora · un texto de Autora
function origenDe(origen) {
  const o = origen || {};
  if (o.autor) return `${o.titulo ? `«${o.titulo}»,` : 'un texto'} de ${o.autor}`;
  if (o.propio) return o.titulo ? `«${o.titulo}», un texto propio` : 'un texto propio';
  return o.titulo ? `«${o.titulo}»` : 'un texto';
}
const creditoDe = origen => `Pliegues de ${origenDe(origen)}.`;

function recorridoHTML(pasos, claseFrase, claseEscrito) {
  return pasos.map(p => `<p class="${claseFrase}">${esc(p.frase)}</p>${p.escrito.trim() ? `<div class="${claseEscrito}">${parrafosHTML(p.escrito)}</div>` : ''}`).join('');
}

function vistaHTML(d) {
  return '<div class="v-pliegues">'
    + `<div class="v-pl-final"><div class="v-rotulo">Texto final</div>${marcasHTML(d.final, d.marcas, 'v-pl-o')}`
    + '<p class="v-pl-leyenda"><span class="v-pl-o">Resaltado</span>: lo que viene del texto de origen.</p></div>'
    + `<div class="v-pl-recorrido"><div class="v-rotulo">Pliegues · ${d.pasos.length} de ${d.frases_total} frases desplegadas</div>`
    + `${recorridoHTML(d.pasos, 'v-pl-frase', 'v-pl-escrito')}</div>`
    + `<p class="v-credito">${esc(creditoDe(d.origen))}</p></div>`;
}

// ---------------------------------------------------------------------
// Estado y borradores
// ---------------------------------------------------------------------
function nuevoEstado(origen, frases) {
  return { v: 1, origen, frases, orden: barajar(frases.map((_, i) => i)), n: 0, escritos: [], fase: 'plegar', cerrado: false, final: null, titulo: '' };
}

function limpiarEstado(e) {
  if (!e || !Array.isArray(e.frases) || !e.frases.length) return null;
  const frases = e.frases.map(f => String(f));
  const N = frases.length;
  const ordenOk = Array.isArray(e.orden) && e.orden.length === N && new Set(e.orden).size === N
    && e.orden.every(i => Number.isInteger(i) && i >= 0 && i < N);
  const fase = ['plegar', 'escribir', 'cierre'].includes(e.fase) ? e.fase : 'plegar';
  let n = Math.min(Math.max(0, Number(e.n) | 0), N);
  if (fase !== 'plegar' && n < 1) n = 1;
  const cerrado = !!e.cerrado && typeof e.final === 'string';
  return {
    v: 1,
    origen: { titulo: String(e.origen?.titulo || ''), autor: String(e.origen?.autor || ''), propio: !!e.origen?.propio },
    frases, orden: ordenOk ? e.orden : barajar(frases.map((_, i) => i)), n,
    escritos: Array.from({ length: n }, (_, k) => String(e.escritos?.[k] ?? '')),
    fase: cerrado ? 'cierre' : fase, cerrado, final: cerrado ? e.final : null, titulo: String(e.titulo || ''),
  };
}

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

const lectura = t => Math.min(9000, Math.max(2600, 1200 + contarPalabras(t) * 330));
const crecer = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };

// ---------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------
export default {
  slug: SLUG,
  nombre: 'Pliegues',
  version: VERSION,

  async abrir(cont, ctx) {
    if (ctx.entrega) return cierre(cont, { entrega: ctx.entrega });
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    if (!id) return portada(cont);
    if (id === NUEVO) return nuevoPropio(cont);
    if (id.startsWith('_')) { location.replace(`#/d/${SLUG}`); return; }
    const mias = await estado.api.entregas({ dinamica: SLUG, autor: estado.yo.id, item_id: id });
    const mia = mias.find(e => e.autor === estado.yo.id);
    if (mia) { location.replace(`#/entrega/${mia.id}`); return; }
    return trabajar(cont, id);
  },

  paquete: {
    plantilla: 'plantillas/pliegues.json',
    describir: d => `${d.titulo}${d.autor ? ` · ${d.autor}` : ''} · ${d.n_frases} frases`,
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
        const texto = normalizar(t?.texto);
        if (!titulo) errores.push(`${n}: falta "titulo".`);
        if (!texto) { errores.push(`${n}: falta "texto".`); return; }
        const r = revisarOrigen(texto);
        if (r.error) errores.push(`${n}: ${r.error}`);
        items.push({ item_id: id, datos: { titulo, autor: txt(t?.autor), texto, n_frases: r.frases.length } });
      });
      return { items, errores };
    },
    exportar(items) {
      return { textos: items.map(i => ({ id: i.item_id, titulo: i.datos.titulo, ...(i.datos.autor ? { autor: i.datos.autor } : {}), texto: i.datos.texto })) };
    },
  },
};

// ---------------------------------------------------------------------
// Portada: sus textos y los del taller
// ---------------------------------------------------------------------
async function portada(cont) {
  const [todos, mias, indice] = await Promise.all([
    estado.api.contenidos(SLUG),
    estado.api.entregas({ dinamica: SLUG, autor: estado.yo.id }),
    leerIndice(),
  ]);
  const textos = todos.filter(c => !c.item_id.startsWith('_'));
  const publicadas = new Map(mias.filter(e => e.autor === estado.yo.id).map(e => [e.item_id, e]));
  const enCurso = id => !!local(`borrador:${estado.yo.id}:${SLUG}:${id}`)?.estado;
  const propiosEnCurso = indice.filter(p => !publicadas.has(p.id));
  const propiosPublicados = [...publicadas.values()].filter(e => esPropio(e.item_id));
  const corto = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 2).trim() + '…' : s; };

  const tarjetaTaller = c => {
    const d = c.datos;
    const pub = publicadas.get(c.item_id);
    const href = pub ? `#/entrega/${pub.id}` : `#/d/${SLUG}/${encodeURIComponent(c.item_id)}`;
    return `<article class="pl-tarjeta">
      <a class="pl-tarjeta-enlace" href="${href}">
        ${d.autor ? `<span class="rotulo">${esc(d.autor)}</span>` : ''}
        <span class="pl-tarjeta-titulo">${esc(d.titulo)}</span>
        <span class="pl-tarjeta-extracto">${esc(corto(d.texto, 170))}</span>
      </a>
      <div class="pl-tarjeta-pie">
        ${pub ? `<span class="estado-pill si">${icono('check', 13)}Publicado</span>` : enCurso(c.item_id) ? '<span class="estado-pill">En curso</span>' : `<span class="tenue pl-cuantas">${d.n_frases} frases</span>`}
        <span class="espaciador"></span>
        <a class="btn btn-chico ${pub ? 'btn-fantasma' : 'btn-primario'}" href="${href}">${pub ? 'Ver su texto' : enCurso(c.item_id) ? 'Seguir' : 'Plegar'}</a>
      </div>
    </article>`;
  };

  cont.innerHTML = `
  <div class="contenedor pl-portada" style="--acento:${ACENTO}">
    <section class="pl-intro">
      <span class="pl-sello">${icono('pliegue', 28)}</span>
      <div>
        <span class="rotulo">Pliegues</span>
        <h1 class="saludo">Un texto que se dobla y se despliega</h1>
        <div class="pl-intro-texto">
          <p>Traiga un texto escrito en frases. La app lo pliega: las frases se dispersan y vuelven una a una, en otro orden.</p>
          <p>A partir de cada frase que emerge, usted escribe hasta tres frases y despliega la siguiente. Al final, su texto tendrá dos caras: los pliegues y el texto final.</p>
        </div>
      </div>
    </section>

    <h2 class="titulo-seccion pl-titulo-sec">Sus textos</h2>
    <div class="pl-rejilla">
      <a class="pl-tarjeta pl-tarjeta-nueva" href="#/d/${SLUG}/${NUEVO}">
        <span class="pl-mas">${icono('mas', 26)}</span>
        <span class="pl-tarjeta-titulo">Plegar un texto</span>
        <span class="pl-tarjeta-extracto">Pegue o escriba un texto de al menos ${MIN_PALABRAS} palabras.</span>
      </a>
      ${propiosEnCurso.map(p => `<article class="pl-tarjeta">
        <a class="pl-tarjeta-enlace" href="#/d/${SLUG}/${encodeURIComponent(p.id)}">
          <span class="rotulo">Empezado ${esc(hace(p.creado || new Date().toISOString()))}</span>
          <span class="pl-tarjeta-titulo">${esc(p.titulo || 'Sin título')}</span>
        </a>
        <div class="pl-tarjeta-pie"><span class="estado-pill">En curso</span><span class="espaciador"></span>
          <button type="button" class="btn btn-chico btn-fantasma btn-icono" data-descartar="${esc(p.id)}" aria-label="Descartar este texto" title="Descartar">${icono('basura', 16)}</button>
          <a class="btn btn-chico btn-primario" href="#/d/${SLUG}/${encodeURIComponent(p.id)}">Seguir</a></div>
      </article>`).join('')}
      ${propiosPublicados.map(e => `<article class="pl-tarjeta">
        <a class="pl-tarjeta-enlace" href="#/entrega/${e.id}">
          <span class="rotulo">Publicado ${esc(hace(e.creado))}</span>
          <span class="pl-tarjeta-titulo">${esc(e.titulo || 'Sin título')}</span>
          <span class="pl-tarjeta-extracto">${esc(corto(e.texto, 150))}</span>
        </a>
        <div class="pl-tarjeta-pie"><span class="estado-pill si">${icono('check', 13)}Publicado</span><span class="espaciador"></span>
          <a class="btn btn-chico btn-fantasma" href="#/entrega/${e.id}">Ver su texto</a></div>
      </article>`).join('')}
    </div>

    ${textos.length ? `<h2 class="titulo-seccion pl-titulo-sec">Textos del taller</h2>
    <div class="pl-rejilla">${textos.map(tarjetaTaller).join('')}</div>` : ''}
  </div>`;

  cont.querySelector('.pl-portada').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-descartar]');
    if (!b) return;
    if (!(await confirmar('¿Descartar este texto? Se pierde lo que haya escrito.', { si: 'Descartar', peligro: true }))) return;
    const id = b.dataset.descartar;
    quitarBorrador(`${SLUG}:${id}`);
    await guardarIndice((await leerIndice()).filter(p => p.id !== id));
    b.closest('.pl-tarjeta').remove();
    aviso('Texto descartado.');
  });
}

// ---------------------------------------------------------------------
// Texto propio: pegar o escribir
// ---------------------------------------------------------------------
function nuevoPropio(cont) {
  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho" style="--acento:${ACENTO}">
    <a class="btn btn-fantasma btn-chico" href="#/d/${SLUG}" style="margin-bottom:14px">${icono('izquierda', 16)}Pliegues</a>
    <section class="tarjeta pl-nuevo">
      <span class="rotulo">Pliegues · Paso 1</span>
      <h1 class="titulo-seccion" style="margin:6px 0 8px">Traiga un texto</h1>
      <p class="tenue" style="margin-top:0">Péguelo o escríbalo aquí. Necesita al menos ${MIN_PALABRAS} palabras y estar escrito en frases: la app reconoce cada frase por su punto final. Un párrafo sin puntos no sirve.</p>
      <div class="campo"><label for="pl-nx">Texto</label><textarea class="area pl-pegar" id="pl-nx" rows="12" placeholder="Pegue o escriba aquí su texto…"></textarea>
        <p class="nota-campo pl-revision" id="pl-nc">0 palabras</p></div>
      <div class="pl-dos-campos">
        <div class="campo"><label for="pl-nt">Título del texto (opcional)</label><input class="entrada" id="pl-nt" maxlength="140"></div>
        <div class="campo"><label for="pl-na">Autor (opcional, si no es suyo)</label><input class="entrada" id="pl-na" maxlength="140"></div>
      </div>
      <p class="tenue" style="font-size:14px">El texto completo no se publica: solo las frases que se desplieguen.</p>
      <button type="button" class="btn btn-primario" id="pl-plegar" disabled>${icono('pliegue', 18)}Plegar</button>
    </section>
  </div>`;
  const $ = s => cont.querySelector(s);
  const area = $('#pl-nx');
  const revisar = () => {
    const r = revisarOrigen(area.value);
    const nc = $('#pl-nc');
    const base = `${r.palabras} ${r.palabras === 1 ? 'palabra' : 'palabras'} · ${r.frases.length} ${r.frases.length === 1 ? 'frase' : 'frases'}`;
    nc.textContent = !area.value.trim() ? '0 palabras' : r.error ? `${base}. ${r.error}` : `${base}. Listo para plegar.`;
    nc.classList.toggle('ok', !r.error);
    nc.classList.toggle('falta', !!r.error && !!area.value.trim());
    $('#pl-plegar').disabled = !!r.error;
    return r;
  };
  area.addEventListener('input', revisar);
  $('#pl-plegar').addEventListener('click', async () => {
    const r = revisar();
    if (r.error) return;
    const id = PROPIO + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const titulo = $('#pl-nt').value.trim();
    const autor = $('#pl-na').value.trim();
    $('#pl-plegar').disabled = true;
    await escribirBorrador(`${SLUG}:${id}`, { estado: nuevoEstado({ titulo, autor, propio: true }, r.frases) });
    await guardarIndice([{ id, titulo, creado: new Date().toISOString() }, ...(await leerIndice())]);
    location.hash = `#/d/${SLUG}/${id}`;
  });
}

// ---------------------------------------------------------------------
// Trabajo: plegado → escritura → despliegue
// ---------------------------------------------------------------------
async function trabajar(cont, itemId) {
  const clave = `${SLUG}:${itemId}`;
  const b = await leerBorrador(clave);
  let E = limpiarEstado(b?.estado);
  let nota = '';
  if (E) {
    if (E.fase !== 'plegar') nota = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`;
  } else {
    if (esPropio(itemId)) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No encontramos este texto', 'Puede que lo haya descartado o que esté en otro navegador sin conexión.', `<a class="btn" href="#/d/${SLUG}">Volver a Pliegues</a>`)}</div>`;
      return;
    }
    const c = await estado.api.contenido(SLUG, itemId);
    const frases = c ? dividirFrases(c.datos.texto) : [];
    if (!c || !frases.length) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este texto no está disponible', 'Puede que el tutor lo haya retirado.', `<a class="btn" href="#/d/${SLUG}">Volver a Pliegues</a>`)}</div>`;
      return;
    }
    E = nuevoEstado({ titulo: c.datos.titulo, autor: c.datos.autor || '', propio: false }, frases);
    await escribirBorrador(clave, { estado: E });
  }

  const S = {
    E, itemId, clave, nota, publicado: false, limpiar: null,
    guardado(t) { const el = cont.querySelector('#guardado'); if (el) el.textContent = t; },
  };
  S.guardarNube = debounce(async () => {
    if (S.publicado) return;
    try { await estado.api.guardarBorrador(clave, { estado: S.E }); S.guardado('Guardado'); }
    catch { S.guardado('Guardado en este dispositivo'); }
  }, 2500);
  S.cambio = () => {
    if (S.publicado) return;
    local(`borrador:${estado.yo.id}:${clave}`, { estado: S.E, _actualizado: new Date().toISOString() });
    S.guardado('Guardando…');
    S.guardarNube();
  };
  S.ir = (fase, op = {}) => {
    S.limpiar?.();
    S.limpiar = null;
    window.scrollTo(0, 0);
    if (fase === 'plegar') S.limpiar = ritual(cont, S);
    else if (fase === 'cierre') S.limpiar = cierre(cont, { S });
    else S.limpiar = escritura(cont, S, op);
  };
  S.ir(E.fase);
  return () => {
    S.limpiar?.();
    if (!S.publicado) S.guardarNube.ahora();
  };
}

// ---------- el plegado ----------
function ritual(cont, S) {
  const claveVisto = `pliegues-ritual:${estado.yo.id}`;
  const visto = !!local(claveVisto);
  cont.innerHTML = `
  <div class="pl-ritual" style="--acento:${ACENTO}" role="dialog" aria-modal="true" aria-label="Plegado del texto">
    <div class="pl-dispersion" aria-hidden="true">${S.E.frases.map(f => `<span>${esc(f)}</span>`).join(' ')}</div>
    <div class="pl-escena"><p class="pl-ritual-frase" aria-live="polite"></p></div>
    <div class="pl-ritual-pie">
      <span class="pl-ritual-pasos" aria-hidden="true">${RITUAL.map(() => '<i></i>').join('')}</span>
      ${visto ? '<button type="button" class="pl-saltar" id="pl-saltar">Saltar</button>' : ''}
    </div>
  </div>`;
  document.body.classList.add('pl-sin-scroll');
  const $ = s => cont.querySelector(s);
  const frase = $('.pl-ritual-frase');
  const marcas = [...cont.querySelectorAll('.pl-ritual-pasos i')];
  const timers = [];
  let vivo = true;
  let terminado = false;
  const esperar = ms => new Promise(r => { timers.push(setTimeout(r, ms)); });

  // Las frases del texto se dispersan al fondo mientras dura el plegado.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cont.querySelectorAll('.pl-dispersion span').forEach(sp => {
      const r = () => Math.random() * 2 - 1;
      sp.style.setProperty('--dx', `${Math.round(r() * 40)}vw`);
      sp.style.setProperty('--dy', `${Math.round(r() * 30)}vh`);
      sp.style.setProperty('--rot', `${Math.round(r() * 35)}deg`);
    });
    $('.pl-dispersion')?.classList.add('dispersa');
  }));

  function final() {
    if (terminado || !vivo) return;
    terminado = true;
    timers.forEach(clearTimeout);
    local(claveVisto, true);
    marcas.forEach(m => m.classList.add('on'));
    $('#pl-saltar')?.remove();
    $('.pl-escena').innerHTML = `<div class="pl-ritual-fin">
      <p class="pl-r-1">${esc(CONSIGNA_1)}</p>
      <p class="pl-r-2">${esc(CONSIGNA_2)}</p>
      <button type="button" class="btn pl-btn-acento" id="pl-empezar">${icono('pliegue', 18)}Desplegar la primera frase</button>
    </div>`;
    const b = $('#pl-empezar');
    b.focus();
    b.addEventListener('click', () => {
      S.E.fase = 'escribir';
      if (S.E.n < 1) { S.E.n = 1; S.E.escritos = ['']; }
      S.cambio();
      S.ir('escribir', { nueva: true });
    });
  }

  $('#pl-saltar')?.addEventListener('click', final);
  (async () => {
    await esperar(700);
    for (let i = 0; i < RITUAL.length; i++) {
      if (!vivo || terminado) return;
      frase.textContent = RITUAL[i];
      frase.classList.remove('emerge', 'sale');
      void frase.offsetWidth;
      frase.classList.add('emerge');
      marcas.forEach((m, k) => m.classList.toggle('on', k <= i));
      await esperar(lectura(RITUAL[i]));
      if (!vivo || terminado) return;
      frase.classList.add('sale');
      await esperar(650);
    }
    final();
  })();

  return () => {
    vivo = false;
    timers.forEach(clearTimeout);
    document.body.classList.remove('pl-sin-scroll');
  };
}

// ---------- la escritura ----------
function escritura(cont, S, { nueva = false } = {}) {
  const E = S.E;
  const N = E.frases.length;
  const minimo = Math.min(MIN_PLIEGUES, N);
  cont.innerHTML = `
  <div class="contenedor" style="max-width:1400px">
    <div class="escritorio pl-escritorio" style="--acento:${ACENTO}">
      <aside class="consigna-panel pl-panel">
        <span class="rotulo">Pliegues</span>
        <h1>Escriba desde lo que emerge</h1>
        <div class="consigna-texto">
          <p><strong>${esc(CONSIGNA_1)}</strong> ${esc(CONSIGNA_2)}</p>
          <p>Escriba hasta tres frases para revelar el siguiente pliegue. Las frases de su texto no se pueden cambiar; lo que usted escribe, sí.</p>
        </div>
        <div class="pl-progreso">
          <div class="fila"><span class="rotulo" id="pl-cuenta-pliegues"></span></div>
          <div class="pl-barra" aria-hidden="true"><span id="pl-barra"></span><i style="left:${(minimo / N) * 100}%"></i></div>
          <p class="pl-estado" id="pl-estado"></p>
        </div>
        <div class="consigna-extra">
          <span class="linea-ico">${icono('info', 16)}<span><b>Enter</b> despliega la siguiente frase. <b>Mayús + Enter</b> hace un salto de línea.</span></span>
          <span class="linea-ico">${icono('libro', 16)}<span>Texto de origen: ${esc(origenDe(E.origen))}.</span></span>
        </div>
      </aside>
      <section class="mesa pl-mesa">
        <div class="mesa-barra">
          <a class="herr" href="#/d/${SLUG}" title="Volver a Pliegues" aria-label="Volver a Pliegues">${icono('izquierda', 18)}</a>
          <span class="rotulo pl-rotulo-texto">${esc(E.origen.titulo || 'Pliegues')}</span>
          <span class="espaciador"></span>
          <span class="guardado" id="guardado">${esc(S.nota)}</span>
          <button type="button" class="herr" id="enfoque" title="Modo enfoque" aria-label="Modo enfoque">${icono('enfoque', 18)}</button>
        </div>
        <div class="hoja-escribir"><div class="pl-pasos" id="pasos"></div></div>
        <div class="mesa-pie">
          <span class="contador" id="contador"></span>
          <span class="contador pl-pie-pliegue" id="pl-pie-pliegue"></span>
          <span class="espaciador"></span>
          <button type="button" class="btn btn-fantasma" id="ver">${icono('ojo', 18)}Ver despliegue</button>
          <button type="button" class="btn btn-primario" id="desplegar">${icono('pliegue', 18)}Desplegar</button>
        </div>
      </section>
    </div>
  </div>`;
  S.nota = '';
  const $ = s => cont.querySelector(s);
  const pasosEl = $('#pasos');

  const pasoHTML = (k, animar) => `<div class="pl-paso${animar ? ' pl-nuevo' : ''}" data-k="${k}">
    <p class="pl-frase"><span class="pl-num" aria-hidden="true">${k + 1}</span>${esc(E.frases[E.orden[k]])}</p>
    <label class="sr" for="pl-e-${k}">Su escritura después del pliegue ${k + 1}</label>
    <textarea class="pl-escrito" id="pl-e-${k}" data-k="${k}" rows="2">${esc(E.escritos[k] || '')}</textarea>
    <p class="pl-exceso" data-exceso="${k}" hidden></p>
  </div>`;
  pasosEl.innerHTML = Array.from({ length: E.n }, (_, k) => pasoHTML(k, nueva && k === E.n - 1)).join('');
  pasosEl.querySelectorAll('.pl-escrito').forEach(crecer);

  function actualizar() {
    const ultimo = E.n - 1;
    let todosBien = true;
    pasosEl.querySelectorAll('.pl-escrito').forEach(t => {
      const k = Number(t.dataset.k);
      const n = frasesEscritas(E.escritos[k]);
      const pasado = n > MAX_POR_PLIEGUE;
      if (!n || pasado) todosBien = false;
      t.classList.toggle('pasado', pasado);
      t.placeholder = k === ultimo ? 'Siga escribiendo desde aquí…' : 'Este pliegue quedó vacío.';
      const ex = pasosEl.querySelector(`[data-exceso="${k}"]`);
      ex.hidden = !pasado;
      if (pasado) ex.textContent = `Tiene ${n} frases: el máximo es ${MAX_POR_PLIEGUE}.`;
    });
    const nUlt = frasesEscritas(E.escritos[ultimo]);
    const restantes = N - E.n;
    const c = $('#contador');
    c.textContent = !nUlt ? 'Escriba al menos una frase' : `${nUlt} de ${MAX_POR_PLIEGUE} frases`;
    c.classList.toggle('pasado', nUlt > MAX_POR_PLIEGUE);
    const desplegar = $('#desplegar');
    desplegar.hidden = restantes === 0;
    desplegar.disabled = !nUlt || nUlt > MAX_POR_PLIEGUE;
    const puedeVer = E.n >= minimo && todosBien;
    $('#ver').disabled = !puedeVer;
    $('#pl-cuenta-pliegues').textContent = `Pliegue ${E.n} de ${N}`;
    $('#pl-pie-pliegue').textContent = `· Pliegue ${E.n} de ${N}`;
    $('#pl-barra').style.width = `${(E.n / N) * 100}%`;
    $('#pl-estado').textContent = !restantes ? 'Desplegó todas las frases de su texto.'
      : E.n < minimo ? `Desde el pliegue ${minimo} puede ver el despliegue.`
      : 'Ya puede ver el despliegue, o seguir desplegando.';
  }

  function enfocarUltimo(suave) {
    const t = pasosEl.querySelector(`.pl-escrito[data-k="${E.n - 1}"]`);
    if (!t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(t.value.length, t.value.length);
    t.closest('.pl-paso').scrollIntoView({ block: 'center', behavior: suave ? 'smooth' : 'auto' });
  }

  function desplegar() {
    const nUlt = frasesEscritas(E.escritos[E.n - 1]);
    if (E.n >= N) return;
    if (!nUlt) { aviso('Escriba al menos una frase antes de desplegar.'); return; }
    if (nUlt > MAX_POR_PLIEGUE) { aviso(`Escriba máximo ${MAX_POR_PLIEGUE} frases antes de desplegar.`); return; }
    E.n++;
    E.escritos.push('');
    S.cambio();
    pasosEl.insertAdjacentHTML('beforeend', pasoHTML(E.n - 1, true));
    crecer(pasosEl.lastElementChild.querySelector('.pl-escrito'));
    actualizar();
    enfocarUltimo(true);
  }

  pasosEl.addEventListener('input', ev => {
    const t = ev.target.closest('.pl-escrito');
    if (!t) return;
    E.escritos[Number(t.dataset.k)] = t.value;
    crecer(t);
    actualizar();
    S.cambio();
  });
  pasosEl.addEventListener('keydown', ev => {
    const t = ev.target.closest('.pl-escrito');
    if (!t || ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
    ev.preventDefault();
    const k = Number(t.dataset.k);
    if (k === E.n - 1) desplegar();
    else pasosEl.querySelector(`.pl-escrito[data-k="${k + 1}"]`)?.focus();
  });
  $('#desplegar').addEventListener('click', desplegar);
  $('#ver').addEventListener('click', () => {
    E.fase = 'cierre';
    S.cambio();
    S.ir('cierre');
  });
  $('#enfoque').addEventListener('click', ev => { ev.currentTarget.classList.toggle('on', document.body.classList.toggle('enfoque')); });

  actualizar();
  requestAnimationFrame(() => enfocarUltimo(false));
  return () => document.body.classList.remove('enfoque');
}

// ---------- el despliegue: Texto final y Pliegues ----------
function cierre(cont, { S = null, entrega = null }) {
  const editando = entrega;
  let E;
  let frasesTotal;
  if (editando) {
    const d = editando.datos || {};
    if (!Array.isArray(d.pasos) || !d.pasos.length) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este texto no se puede editar aquí', '', `<a class="btn" href="#/entrega/${editando.id}">Volver al texto</a>`)}</div>`;
      return null;
    }
    E = {
      origen: d.origen || {}, frases: d.pasos.map(p => String(p.frase || '')), orden: d.pasos.map((_, i) => i), n: d.pasos.length,
      escritos: d.pasos.map(p => String(p.escrito || '')), fase: 'cierre', cerrado: true,
      final: typeof d.final === 'string' ? d.final : editando.texto || '', titulo: editando.titulo || '',
    };
    frasesTotal = d.frases_total || d.pasos.length;
  } else {
    E = S.E;
    frasesTotal = E.frases.length;
  }
  const pasos = pasosDe(E);
  let final = E.cerrado ? E.final : armarFinal(pasos).texto;
  let pestana = 'final';
  let pidiendo = false;
  const cambio = () => { if (editando) { const g = cont.querySelector('#guardado'); if (g) g.textContent = 'Cambios sin guardar'; } else S.cambio(); };

  cont.innerHTML = `
  <div class="contenedor pl-cierre" style="--acento:${ACENTO}">
    <div class="fila" style="margin-bottom:16px">
      ${editando ? `<a class="btn btn-fantasma btn-chico" href="#/entrega/${editando.id}">${icono('izquierda', 16)}Volver al texto</a>`
        : `<a class="btn btn-fantasma btn-chico" href="#/d/${SLUG}">${icono('izquierda', 16)}Pliegues</a>`}
      <span class="espaciador"></span>
      <span class="guardado" id="guardado">${S ? esc(S.nota) : ''}</span>
      ${!editando && !E.cerrado ? `<button type="button" class="btn btn-chico" id="volver">${icono('lapiz', 16)}Volver a escribir</button>` : ''}
    </div>
    <header class="pl-cierre-cab">
      <span class="rotulo">Pliegues · ${editando ? 'Editar' : 'Despliegue'}</span>
      <input class="titulo-escribir pl-titulo" id="titulo" placeholder="Título (opcional)" maxlength="140" value="${esc(E.titulo)}" aria-label="Título">
      <div class="conmutador" role="tablist" aria-label="Versión">
        <button type="button" role="tab" data-v="final">Texto final</button>
        <button type="button" role="tab" data-v="pliegues">Pliegues</button>
      </div>
    </header>
    <article class="hoja pl-hoja" id="cuerpo"></article>
    <div class="pl-acciones">
      <span class="contador" id="contador"></span>
      <span class="espaciador"></span>
      <button type="button" class="btn btn-primario" id="publicar">${icono(editando ? 'check' : 'enviar', 18)}${editando ? 'Guardar cambios' : 'Publicar'}</button>
    </div>
  </div>`;
  if (S) S.nota = '';
  const $ = s => cont.querySelector(s);
  const raiz = $('.pl-cierre');

  function contar() { $('#contador').textContent = `${contarPalabras(final)} palabras`; }

  function pintarMarcas() {
    const fondo = $('#pl-fondo');
    const t = $('#pl-final');
    if (!fondo || !t) return;
    const tramos = marcasOrigen(final, pasos);
    fondo.innerHTML = trozos(final, tramos).map(([x, o]) => (o ? `<mark>${esc(x)}</mark>` : esc(x))).join('') + '\n';
    crecer(t);
  }

  function pintar() {
    cont.querySelectorAll('[data-v]').forEach(b => { const on = b.dataset.v === pestana; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const c = $('#cuerpo');
    if (pestana === 'pliegues') {
      c.innerHTML = `<div class="rotulo pl-sub">${pasos.length} de ${frasesTotal} frases desplegadas</div>
        <div class="pl-recorrido">${recorridoHTML(pasos, 'pl-frase', 'pl-recorrido-escrito')}</div>
        <p class="v-credito">${esc(creditoDe(E.origen))}</p>`;
      return;
    }
    c.innerHTML = `
      <div class="pl-nota-final">
        <p>${E.cerrado ? 'Lo resaltado viene de su texto de origen. Puede editar todo el texto, incluidas esas frases.'
          : 'El texto final se arma con sus pliegues. Puede editarlo todo, incluso las frases de origen; al hacerlo, el despliegue se cierra.'}</p>
        ${E.cerrado ? '' : `<button type="button" class="btn btn-chico" id="abrir-final">${icono('lapiz', 16)}Editar el texto final</button>`}
      </div>
      <div class="pl-editor">
        <div class="pl-fondo" id="pl-fondo" aria-hidden="true"></div>
        <textarea class="pl-final" id="pl-final" aria-label="Texto final" spellcheck="true" ${E.cerrado ? '' : 'readonly'}>${esc(final)}</textarea>
      </div>`;
    pintarMarcas();
    requestAnimationFrame(pintarMarcas);
  }

  async function abrirFinal() {
    if (E.cerrado || pidiendo) return;
    pidiendo = true;
    const ok = await confirmar('Al editar el texto final se cierra el despliegue: ya no podrá desplegar más frases ni cambiar los pliegues. ¿Continuar?', { si: 'Editar el texto final', no: 'Todavía no' });
    pidiendo = false;
    if (!ok) return;
    E.cerrado = true;
    E.final = final;
    E.fase = 'cierre';
    cambio();
    $('#volver')?.remove();
    pintar();
    const t = $('#pl-final');
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }

  raiz.addEventListener('click', ev => {
    const v = ev.target.closest('[data-v]');
    if (v) { pestana = v.dataset.v; pintar(); return; }
    if (ev.target.closest('#abrir-final')) { abrirFinal(); return; }
    if (ev.target.closest('#volver')) {
      E.fase = 'escribir';
      S.cambio();
      S.ir('escribir');
    }
  });
  raiz.addEventListener('pointerdown', ev => { if (ev.target.closest('#pl-final[readonly]')) abrirFinal(); });
  raiz.addEventListener('keydown', ev => {
    if (ev.target.closest('#pl-final[readonly]') && (ev.key.length === 1 || ev.key === 'Enter' || ev.key === 'Backspace' || ev.key === 'Delete')) { ev.preventDefault(); abrirFinal(); }
  });
  raiz.addEventListener('input', ev => {
    if (ev.target.id === 'pl-final') {
      final = ev.target.value;
      if (!editando) E.final = final;
      if (final.length < 6000) pintarMarcas(); else marcasDiferidas();
      contar();
      cambio();
    } else if (ev.target.id === 'titulo') {
      E.titulo = ev.target.value;
      cambio();
    }
  });
  const marcasDiferidas = debounce(pintarMarcas, 90);
  const alCambiarTamano = debounce(pintarMarcas, 150);
  window.addEventListener('resize', alCambiarTamano);

  $('#publicar').addEventListener('click', async () => {
    const texto = normalizar(final);
    if (!texto) { aviso('El texto final está vacío.'); return; }
    if (!editando && !(await confirmar(`${avisoPublicar('su texto')} Los pliegues quedarán fijos.`, { si: 'Publicar', no: 'Seguir revisando' }))) return;
    const b = $('#publicar');
    b.disabled = true;
    const datos = {
      origen: E.origen, frases_total: frasesTotal,
      pasos: pasos.map(p => ({ frase: p.frase, escrito: limpiarEscrito(p.escrito) })),
      final: texto, marcas: [],
    };
    datos.marcas = marcasOrigen(texto, datos.pasos);
    try {
      if (S) { S.publicado = true; S.guardarNube.cancelar(); }
      await publicarEntrega({
        dinamica: SLUG, item_id: editando ? editando.item_id : S.itemId, titulo: (E.titulo || '').trim(),
        texto, vista: vistaHTML(datos), datos, modulo_version: VERSION,
      }, { entregaExistente: editando });
      if (S) {
        quitarBorrador(S.clave);
        if (esPropio(S.itemId)) guardarIndice((await leerIndice()).filter(p => p.id !== S.itemId)).catch(() => {});
      }
    } catch (err) {
      if (S) { S.publicado = false; S.cambio(); }
      errorAviso(err);
      b.disabled = false;
    }
  });

  pintar();
  contar();
  return () => window.removeEventListener('resize', alCambiarTamano);
}
