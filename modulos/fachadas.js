// Módulo: Fachadas.
// Una casa abierta (una pintura) se mira con zoom, se planea un recorrido marcando de 3 a 7 recuadros sobre ella
// y se narra el recorrido en el escritorio, con los recortes a la vista.
//
// Los recortes NO se guardan como imágenes: cada punto es [x, y, ancho, alto] en fracciones de la fachada (0 a 1),
// y los recortes se dibujan con la misma imagen (CSS: background-size y background-position). La línea del recorrido
// une los centros de los recuadros en orden. La entrega guarda solo esos números (menos de 1 KB).
//
// Imágenes en GitHub, en img/fachadas/ (las genera herramientas/optimizar_imagenes.py fachadas --detalle 3000):
//   <nombre>.webp (1000 px: vista general y recortes), mini/<nombre>.webp (240 px: portada),
//   detalle/<nombre>.webp (3000 px: solo al acercarse o al ampliar un recorte) e indice.json con las medidas.
//
// Borradores: 'fachadas:<fachada>:recorrido' → { R: { fase, puntos, checks } } y 'fachadas:<fachada>' (el texto,
// lo guarda el escritorio común). Un recorrido en curso por fachada; publicado uno, se puede empezar otro.
// Entrega: item_id = id de la fachada; datos = { fachada, titulo_fachada, credito, imagen, ancho, alto, puntos, html };
// la vista lleva el trazo (SVG) y el texto.
import { estado, esTutor, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, aviso, modal, debounce, confirmar } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { montarEscritorio } from '../nucleo/escritorio.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio, trazoFachada } from '../nucleo/componentes.js';

const SLUG = 'fachadas';
const VERSION = '1.0';
const ACENTO = '#B85C38';
const RUTA = `#/d/${SLUG}`;
const MIN = 3;
const MAX = 7;
const TOPE = 12;          // máximo que admite el paquete
const LADO_MIN = 14;      // px en pantalla: un recuadro más chico no cuenta (un clic suelto no crea un punto)
const ZOOM_MAX = 8;

const CONSIGNA = 'El ojo que recorre el interior de una casa sale impune de la observación. Nada se le oculta porque lo que sucede tras las paredes también lo adivina, conoce incluso los secretos que nacen en los rincones que no se pueden ver a través de la ventana. Narre un recorrido por el espacio, escape de la tercera dimensión, decida crear las grietas para ingresar a los espacios liminares de la casa.';

// ---------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------
const NOMBRE = /^[a-z0-9][a-z0-9-]*$/;
const urlImg = (nombre, tam = '') => new URL(`../img/${SLUG}/${tam ? `${tam}/` : ''}${nombre}.webp`, import.meta.url).href;
let indice = null;
async function leerIndice() {
  if (indice) return indice;
  try {
    const r = await fetch(new URL(`../img/${SLUG}/indice.json`, import.meta.url));
    indice = r.ok ? await r.json() : { imagenes: {} };
  } catch { indice = { imagenes: {} }; }
  if (!indice.imagenes) indice.imagenes = {};
  return indice;
}
const cargadas = new Map();
function precargar(src) {
  if (!cargadas.has(src)) {
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
    cargadas.set(src, (im.decode ? im.decode() : new Promise(r => { im.onload = r; im.onerror = r; })).then(() => true, () => false));
  }
  return cargadas.get(src);
}

// ---------------------------------------------------------------------
// Puntos: [x, y, ancho, alto] en fracciones de la fachada
// ---------------------------------------------------------------------
const r4 = n => Math.round(n * 10000) / 10000;
const entre = (n, a, b) => Math.min(b, Math.max(a, n));
function puntoValido(p) {
  if (!Array.isArray(p) || p.length !== 4) return null;
  const [x, y, w, h] = p.map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const X = entre(x, 0, 1), Y = entre(y, 0, 1);
  return [r4(X), r4(Y), r4(entre(w, 0.001, 1 - X)), r4(entre(h, 0.001, 1 - Y))];
}
const puntosValidos = lista => (Array.isArray(lista) ? lista : []).map(puntoValido).filter(Boolean);

// Un recorte dentro de una caja de proporción `caja` (ancho / alto), centrado y sin deformar.
// Las capas de fondo van de la más nítida a la más liviana: mientras baja el detalle se ve la grande.
function recorteHTML(p, f, { caja = 4 / 3, detalle = false, clase = 'fa-recorte', extra = '' } = {}) {
  const [x, y, w, h] = p;
  const prop = (w * f.ancho) / (h * f.alto);
  const iw = prop >= caja ? 100 : (prop / caja) * 100;
  const ih = prop >= caja ? (caja / prop) * 100 : 100;
  const px = w < 0.9999 ? (x / (1 - w)) * 100 : 0;
  const py = h < 0.9999 ? (y / (1 - h)) * 100 : 0;
  const capas = [detalle && f.detalle ? `url('${urlImg(f.imagen, 'detalle')}')` : '', `url('${urlImg(f.imagen)}')`].filter(Boolean).join(',');
  return `<span class="${clase}" style="aspect-ratio:${caja}"${extra}><i style="width:${iw.toFixed(2)}%;height:${ih.toFixed(2)}%;background-image:${capas};background-size:${(100 / w).toFixed(3)}% ${(100 / h).toFixed(3)}%;background-position:${px.toFixed(3)}% ${py.toFixed(3)}%"></i></span>`;
}

// ---------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------
function fachadaDe(c, idx) {
  const d = c.datos || {};
  const imagen = d.imagen || c.item_id;
  const m = idx.imagenes[imagen];
  if (!m) return null;
  return {
    id: c.item_id, titulo: d.titulo || c.item_id, credito: d.credito || '', imagen, ancho: m[0], alto: m[1],
    detalle: !!idx.detalle, premisa: d.premisa || '', consigna: d.consigna || '',
    min: d.min || MIN, max: d.max || MAX,
  };
}

async function cargarBase() {
  const [idx, items, mias] = await Promise.all([
    leerIndice(),
    estado.api.contenidos(SLUG).catch(() => []),
    estado.api.entregas({ dinamica: SLUG, autor: estado.yo.id }).catch(() => []),
  ]);
  const fachadas = items.map(c => fachadaDe(c, idx)).filter(Boolean);
  return { fachadas, sinImagen: items.length - fachadas.length, mias: mias.filter(e => e.autor === estado.yo.id) };
}

// La fachada con que se escribió una entrega (aunque ya no esté en el contenido).
function fachadaDeEntrega(e, base) {
  const d = e.datos || {};
  const actual = base.fachadas.find(f => f.id === e.item_id);
  return {
    ...(actual || {}),
    id: e.item_id, titulo: d.titulo_fachada || actual?.titulo || '', credito: d.credito ?? actual?.credito ?? '',
    imagen: d.imagen || actual?.imagen, ancho: d.ancho || actual?.ancho || 1000, alto: d.alto || actual?.alto || 1000,
    detalle: actual?.detalle ?? !!indice?.detalle, min: actual?.min || MIN, max: Math.max(actual?.max || MAX, puntosValidos(d.puntos).length),
  };
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
  nombre: 'Fachadas',
  version: VERSION,

  async abrir(cont, ctx) {
    const limpieza = [];
    const fin = () => limpieza.forEach(f => { try { f(); } catch { /* nada */ } });
    const base = await cargarBase();
    if (ctx.entrega) {
      await trabajar(cont, base, fachadaDeEntrega(ctx.entrega, base), limpieza, { entrega: ctx.entrega });
      return fin;
    }
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    if (id) {
      const f = base.fachadas.find(x => x.id === id);
      if (!f) cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Esta fachada no está disponible', 'Puede que el tutor la haya retirado.', `<a class="btn" href="${RUTA}">Ver las fachadas</a>`)}</div>`;
      // «‹ Fachadas» no aparece cuando la clase en vivo fija una fachada (como en S+7)
      else await trabajar(cont, base, f, limpieza, { volver: base.fachadas.length > 1 && !ctx.sesion?.item_id });
    } else if (base.fachadas.length === 1) {
      await trabajar(cont, base, base.fachadas[0], limpieza, {});
    } else {
      await portada(cont, base);
    }
    return fin;
  },

  paquete: {
    plantilla: 'plantillas/fachadas.json',
    describir: d => `${d.titulo || ''}${d.credito ? ` — ${d.credito}` : ''}`,
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json) ? json : Array.isArray(json?.fachadas) ? json.fachadas : null;
      if (!lista || !lista.length) return { items, errores: ['El archivo debe tener una lista "fachadas": [ … ] con al menos una fachada.'] };
      const vistos = new Set();
      const txt = v => (typeof v === 'string' ? v.trim() : '');
      lista.forEach((f, i) => {
        const id = txt(f?.id);
        const n = `Fachada ${i + 1}${id ? ` (${id})` : ''}`;
        if (!id) { errores.push(`Fachada ${i + 1}: falta "id".`); return; }
        if (!NOMBRE.test(id)) { errores.push(`${n}: el id solo puede tener minúsculas sin tildes, números y guiones.`); return; }
        if (vistos.has(id)) { errores.push(`${n}: el id está repetido.`); return; }
        vistos.add(id);
        const titulo = txt(f?.titulo);
        if (!titulo) { errores.push(`${n}: falta "titulo".`); return; }
        const imagen = txt(f?.imagen) || id;
        if (!NOMBRE.test(imagen)) { errores.push(`${n}: "imagen" es el nombre del archivo en img/fachadas/, sin extensión (por ejemplo, "fachada-4").`); return; }
        const min = f?.min === undefined || f?.min === '' ? MIN : Number(f.min);
        const max = f?.max === undefined || f?.max === '' ? MAX : Number(f.max);
        if (!Number.isInteger(min) || min < 2 || min > TOPE) { errores.push(`${n}: "min" debe ser un número entero entre 2 y ${TOPE}.`); return; }
        if (!Number.isInteger(max) || max < min || max > TOPE) { errores.push(`${n}: "max" debe ser un número entero entre "min" (${min}) y ${TOPE}.`); return; }
        const datos = { titulo, imagen };
        if (txt(f?.credito)) datos.credito = txt(f.credito);
        if (txt(f?.premisa)) datos.premisa = txt(f.premisa);
        if (txt(f?.consigna)) datos.consigna = txt(f.consigna);
        if (min !== MIN) datos.min = min;
        if (max !== MAX) datos.max = max;
        items.push({ item_id: id, datos });
      });
      return { items, errores };
    },
    exportar(items) {
      return { fachadas: items.map(i => ({ id: i.item_id, ...i.datos })) };
    },
  },
};

// ---------------------------------------------------------------------
// Portada (cuando hay más de una fachada)
// ---------------------------------------------------------------------
async function portada(cont, base) {
  const yo = estado.yo.id;
  if (!base.fachadas.length) {
    cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Todavía no hay fachadas',
      esTutor() ? `Suba el paquete en Panel › Contenido. ${base.sinImagen ? `Hay ${base.sinImagen === 1 ? 'una fachada' : `${base.sinImagen} fachadas`} sin imagen en img/${SLUG}/.` : ''}` : 'Vuelva pronto.')}</div>`;
    return;
  }
  const curso = await Promise.all(base.fachadas.map(async f => {
    const b = await leerBorrador(`${SLUG}:${f.id}:recorrido`);
    return !!(b?.R?.puntos?.length) || !!local(`borrador:${yo}:${SLUG}:${f.id}`)?.html;
  }));
  const tarjeta = (f, k) => {
    const n = base.mias.filter(e => e.item_id === f.id).length;
    const href = `${RUTA}/${encodeURIComponent(f.id)}`;
    return `<article class="fm-tarjeta fa-tarjeta">
      <a class="fm-tarjeta-enlace" href="${href}">
        <span class="fa-tarjeta-img"><img src="${urlImg(f.imagen, 'mini')}" alt="" loading="lazy" decoding="async"></span>
        <span class="fm-tarjeta-titulo">${esc(f.titulo)}</span>
        ${f.credito ? `<span class="fa-tarjeta-credito">${esc(f.credito)}</span>` : ''}
      </a>
      <div class="fm-tarjeta-pie">
        ${n ? `<span class="estado-pill si">${icono('check', 13)}${n === 1 ? '1 recorrido' : `${n} recorridos`}</span>` : ''}
        ${curso[k] ? '<span class="estado-pill">En curso</span>' : ''}
        <span class="espaciador"></span>
        <a class="btn btn-chico btn-fantasma" href="#/muro?dinamica=${SLUG}&item=${encodeURIComponent(f.id)}">Recorridos</a>
        <a class="btn btn-chico btn-primario" href="${href}">${curso[k] ? 'Seguir' : n ? 'Otro recorrido' : 'Empezar'}</a>
      </div>
    </article>`;
  };
  cont.innerHTML = `
  <div class="contenedor fa-portada" style="--acento:${ACENTO}">
    <span class="rotulo">Fachadas</span>
    <h1 class="saludo">Elija una casa</h1>
    <p class="fa-portada-intro">Mire una casa abierta, marque de ${MIN} a ${MAX} lugares y narre el recorrido que los une.</p>
    <div class="fm-rejilla">${base.fachadas.map(tarjeta).join('')}</div>
  </div>`;
}

// ---------------------------------------------------------------------
// Trabajo sobre una fachada: mirar → planear → narrar
// ---------------------------------------------------------------------
async function trabajar(cont, base, f, limpieza, { entrega = null, volver = false } = {}) {
  const claveRec = `${SLUG}:${f.id}:recorrido`;
  const claveTexto = `${SLUG}:${f.id}`;
  const claveLocalRec = `borrador:${estado.yo.id}:${claveRec}`;
  let R = { fase: 'mirar', puntos: [], checks: [] };
  let htmlEdit = entrega?.datos?.html || '';
  let tituloEdit = entrega?.titulo || '';
  let terminado = false;   // publicado: ya no se guarda nada

  if (entrega) {
    const puntos = puntosValidos(entrega.datos?.puntos);
    R = { fase: 'narrar', puntos, checks: puntos.map(() => false) };
  } else {
    const b = await leerBorrador(claveRec);
    if (b?.R) {
      const puntos = puntosValidos(b.R.puntos).slice(0, f.max);
      R = {
        fase: ['mirar', 'planear', 'narrar'].includes(b.R.fase) ? b.R.fase : 'planear',
        puntos, checks: puntos.map((_, i) => !!b.R.checks?.[i]),
      };
      if (R.fase === 'narrar' && R.puntos.length < f.min) R.fase = 'planear';
    }
  }

  const guardarNube = debounce(() => {
    if (terminado || entrega) return;
    estado.api.guardarBorrador(claveRec, { R }).catch(() => {});
  }, 1500);
  const guardar = () => {
    if (terminado || entrega) return;
    local(claveLocalRec, { R, _actualizado: new Date().toISOString() });
    guardarNube();
  };
  limpieza.push(() => { if (!terminado && !entrega) guardarNube.ahora(); });

  // Precarga: la grande ya; el detalle, en cuanto haya tiempo.
  precargar(urlImg(f.imagen));
  if (f.detalle) setTimeout(() => precargar(urlImg(f.imagen, 'detalle')), 1200);

  // En el celular el botón queda debajo de la fachada: al cambiar de pantalla, la fachada vuelve a la vista.
  const verVisor = () => cont.querySelector('.fa-visor-marco')?.scrollIntoView({ block: 'nearest' });
  let quitarPantalla = () => {};
  limpieza.push(() => quitarPantalla());
  const mostrar = () => {
    quitarPantalla();
    quitarPantalla = R.fase === 'narrar' ? narrar() : visor();
  };

  const publicadas = base.mias.filter(e => e.item_id === f.id).length;
  const cabecera = () => `
    <div class="fa-cab">
      ${volver ? `<a class="btn btn-fantasma btn-chico" href="${RUTA}">${icono('izquierda', 16)}Fachadas</a>` : ''}
      <div class="fa-cab-tit">
        <span class="rotulo">Fachadas${entrega ? ' · Editando' : ''}</span>
        <h1 class="fa-titulo">${esc(f.titulo)}</h1>
        ${f.credito ? `<span class="fa-credito">${esc(f.credito)}</span>` : ''}
      </div>
      ${publicadas && !entrega ? `<a class="fa-cab-mias" href="#/muro?dinamica=${SLUG}&item=${encodeURIComponent(f.id)}">${publicadas === 1 ? 'Ya publicó un recorrido' : `Ya publicó ${publicadas} recorridos`} en esta fachada</a>` : ''}
    </div>`;
  const consignaHTML = () => `
    <div class="consigna-texto fa-consigna"><p>${esc(f.consigna || CONSIGNA)}</p>
      ${f.premisa ? `<p class="fa-premisa"><strong>Premisa:</strong> ${esc(f.premisa)}</p>` : ''}</div>`;

  // -------------------------------------------------------------------
  // Mirar y planear: la fachada con zoom, los recuadros y la línea
  // -------------------------------------------------------------------
  function visor() {
    let herramienta = R.fase === 'planear' ? 'marcar' : 'mover';
    let marcas = true;          // ¿se ven los recuadros y la línea?
    let resaltado = -1;
    cont.innerHTML = `
    <div class="contenedor fa" style="--acento:${ACENTO};max-width:1400px">
      ${cabecera()}
      <div class="fa-plano">
        <section class="fa-visor-marco">
          <div class="fa-visor ${R.fase === 'planear' ? 'planear' : ''}" id="fa-visor" tabindex="0" role="application" aria-label="Fachada ${esc(f.titulo)}. Acerque con la rueda del mouse o pellizcando; arrastre para recorrerla.">
            <img class="fa-img" id="fa-img" src="${urlImg(f.imagen)}" alt="${esc(`${f.titulo}${f.credito ? `. ${f.credito}` : ''}`)}" draggable="false">
            <svg class="fa-capa" id="fa-capa" aria-hidden="true"></svg>
          </div>
          <div class="fa-controles">
            ${R.fase === 'planear' ? `<div class="conmutador fa-herramientas" role="radiogroup" aria-label="Herramienta">
              <button type="button" role="radio" data-herr="mover" title="Mover la fachada (también: barra espaciadora)">${icono('mover', 17)}<span>Mover</span></button>
              <button type="button" role="radio" data-herr="marcar" title="Marcar un recuadro arrastrando">${icono('recuadro', 17)}<span>Marcar</span></button>
            </div>` : ''}
            <span class="espaciador"></span>
            <div class="fa-zoom">
              <button type="button" class="herr" id="fa-menos" aria-label="Alejar" title="Alejar">${icono('menos', 18)}</button>
              <span class="fa-zoom-n" id="fa-zoom-n">100 %</span>
              <button type="button" class="herr" id="fa-mas" aria-label="Acercar" title="Acercar">${icono('mas', 18)}</button>
              <button type="button" class="herr" id="fa-encajar" aria-label="Ver la fachada completa" title="Ver la fachada completa">${icono('encajar', 18)}</button>
              ${R.fase === 'planear' ? `<button type="button" class="herr on" id="fa-marcas" aria-pressed="true" aria-label="Mostrar u ocultar el recorrido" title="Mostrar u ocultar el recorrido">${icono('ojo', 18)}</button>` : ''}
            </div>
          </div>
        </section>
        <aside class="fa-lado" id="fa-lado"></aside>
      </div>
    </div>`;

    const vis = cont.querySelector('#fa-visor');
    const img = cont.querySelector('#fa-img');
    const capa = cont.querySelector('#fa-capa');
    const lado = cont.querySelector('#fa-lado');
    let VW = 0, VH = 0, k0 = 1, s = 1, tx = 0, ty = 0;
    let conDetalle = false;
    const W = () => f.ancho * k0 * s;
    const H = () => f.alto * k0 * s;

    function medir(primera = false) {
      const r = vis.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // conserva el centro de lo que se está viendo
      const cu = primera ? 0.5 : (VW / 2 - tx) / W();
      const cv = primera ? 0.5 : (VH / 2 - ty) / H();
      VW = r.width; VH = r.height;
      k0 = Math.min(VW / f.ancho, VH / f.alto);
      img.style.width = `${f.ancho * k0}px`;
      img.style.height = `${f.alto * k0}px`;
      capa.setAttribute('width', VW); capa.setAttribute('height', VH);
      capa.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
      tx = VW / 2 - cu * W(); ty = VH / 2 - cv * H();
      aplicar();
    }
    function limitar() {
      const m = 30;
      tx = W() <= VW ? (VW - W()) / 2 : entre(tx, VW - W() - m, m);
      ty = H() <= VH ? (VH - H()) / 2 : entre(ty, VH - H() - m, m);
    }
    function aplicar() {
      limitar();
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      cont.querySelector('#fa-zoom-n').textContent = `${Math.round(s * 100)} %`;
      // Más allá de la resolución de la grande, se pasa a la de detalle (una sola vez).
      if (!conDetalle && f.detalle && W() > f.ancho * 1.15) {
        conDetalle = true;
        const det = urlImg(f.imagen, 'detalle');
        precargar(det).then(ok => { if (ok && img.isConnected) img.src = det; });
      }
      dibujar();
    }
    function zoomEn(px, py, factor) {
      const ns = entre(s * factor, 1, ZOOM_MAX);
      tx = px - (px - tx) * (ns / s);
      ty = py - (py - ty) * (ns / s);
      s = ns;
      aplicar();
    }
    const aPantalla = (u, v) => [tx + u * W(), ty + v * H()];
    const aFachada = (px, py) => [entre((px - tx) / W(), 0, 1), entre((py - ty) / H(), 0, 1)];

    // ---- dibujo de la capa (en coordenadas de pantalla: los trazos no engordan con el zoom) ----
    let temporal = null;
    function dibujar() {
      if (!marcas && !temporal) { capa.innerHTML = ''; return; }
      const cajas = R.puntos.map(([x, y, w, h]) => {
        const [a, b] = aPantalla(x, y);
        return [a, b, w * W(), h * H()];
      });
      const centros = cajas.map(([a, b, w, h]) => [a + w / 2, b + h / 2]);
      let svg = '';
      if (marcas) {
        svg += cajas.map(([a, b, w, h], i) => `<g class="fa-caja${i === resaltado ? ' on' : ''}">
          <rect x="${a}" y="${b}" width="${w}" height="${h}" rx="3" class="fa-caja-halo"/>
          <rect x="${a}" y="${b}" width="${w}" height="${h}" rx="3" class="fa-caja-linea"/></g>`).join('');
        if (centros.length > 1) {
          const pts = centros.map(c => c.map(n => n.toFixed(1)).join(',')).join(' ');
          svg += `<polyline points="${pts}" class="fa-linea-halo"/><polyline points="${pts}" class="fa-linea"/>`;
        }
        svg += centros.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="4" class="fa-centro"/>`).join('');
        svg += cajas.map(([a, b], i) => {
          const cx = a + 13, cy = b + 13;
          return `<g class="fa-num${i === resaltado ? ' on' : ''}"><circle cx="${cx}" cy="${cy}" r="11"/><text x="${cx}" y="${cy + 4.2}" text-anchor="middle">${i + 1}</text></g>`;
        }).join('');
      }
      if (temporal) {
        const [a, b] = aPantalla(Math.min(temporal[0], temporal[2]), Math.min(temporal[1], temporal[3]));
        const w = Math.abs(temporal[2] - temporal[0]) * W(), h = Math.abs(temporal[3] - temporal[1]) * H();
        svg += `<rect x="${a}" y="${b}" width="${w}" height="${h}" rx="3" class="fa-caja-halo"/><rect x="${a}" y="${b}" width="${w}" height="${h}" rx="3" class="fa-temporal"/>`;
      }
      capa.innerHTML = svg;
    }

    // ---- panel lateral ----
    function pintarLado() {
      if (R.fase === 'mirar') {
        lado.innerHTML = `
          ${consignaHTML()}
          <ol class="fa-pasos">
            <li><b>Mire la fachada.</b> Acérquese con la rueda del mouse o pellizcando, y recórrala arrastrando.</li>
            <li><b>Planee el recorrido.</b> Marque de ${f.min} a ${f.max} recuadros. El orden en que los marca es el orden del recorrido.</li>
            <li><b>Narre el recorrido.</b> Los recortes lo acompañan mientras escribe.</li>
          </ol>
          <button type="button" class="btn btn-primario fa-ancho" id="fa-planear">${icono('recuadro', 18)}Planear el recorrido</button>`;
        lado.querySelector('#fa-planear').addEventListener('click', () => {
          R.fase = 'planear';
          guardar();
          mostrar();
          verVisor();
        });
        return;
      }
      const n = R.puntos.length;
      lado.innerHTML = `
        <details class="fa-consigna-plegable"${n ? '' : ' open'}><summary>${icono('info', 16)}Consigna</summary>${consignaHTML()}</details>
        <div class="fila fa-lado-cab"><span class="rotulo">El recorrido</span><span class="espaciador"></span><span class="fa-cuenta${n >= f.max ? ' lleno' : ''}">${n} de ${f.max}</span></div>
        ${n ? `<ol class="fa-puntos">${R.puntos.map((p, i) => `
          <li class="fa-punto" data-i="${i}">
            <button type="button" class="fa-punto-ir" data-ir="${i}" title="Ver el punto ${i + 1} en la fachada">
              <span class="fa-punto-n">${i + 1}</span>${recorteHTML(p, f, { caja: 1, clase: 'fa-recorte fa-recorte-mini' })}<span class="fa-punto-txt">Punto ${i + 1}</span>
            </button>
            <span class="fa-punto-acc">
              <button type="button" class="herr" data-subir="${i}" ${i ? '' : 'disabled'} aria-label="Subir el punto ${i + 1}" title="Antes en el recorrido">${icono('arriba', 16)}</button>
              <button type="button" class="herr" data-bajar="${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="Bajar el punto ${i + 1}" title="Después en el recorrido">${icono('abajo', 16)}</button>
              <button type="button" class="herr" data-quitar="${i}" aria-label="Quitar el punto ${i + 1}" title="Quitar">${icono('x', 16)}</button>
            </span>
          </li>`).join('')}</ol>`
          : `<p class="fa-vacio">Arrastre sobre la fachada para marcar el primer punto.</p>`}
        <p class="fa-nota">${n >= f.max ? `Llegó a ${f.max} puntos: quite uno para marcar otro.` : n < f.min ? `Marque ${f.min - n === 1 ? 'un punto más' : `${f.min - n} puntos más`} para narrar. Los recuadros se pueden superponer.` : 'Puede seguir marcando, cambiar el orden o quitar puntos.'}</p>
        <div class="fa-lado-acciones">
          <button type="button" class="btn btn-primario fa-ancho" id="fa-narrar" ${n >= f.min ? '' : 'disabled'} title="${n >= f.min ? '' : `Marque al menos ${f.min} puntos`}">${icono('pluma', 18)}Narrar el recorrido</button>
          ${n ? `<button type="button" class="btn btn-fantasma btn-chico" id="fa-borrar">${icono('basura', 16)}Borrar todos</button>` : ''}
        </div>`;
    }
    lado.addEventListener('click', async ev => {
      const t = ev.target.closest('button');
      if (!t) return;
      const d = t.dataset;
      if (d.ir !== undefined) { enfocar(Number(d.ir)); return; }
      if (d.subir !== undefined || d.bajar !== undefined) {
        const i = Number(d.subir ?? d.bajar), j = d.subir !== undefined ? i - 1 : i + 1;
        if (j < 0 || j >= R.puntos.length) return;
        [R.puntos[i], R.puntos[j]] = [R.puntos[j], R.puntos[i]];
        [R.checks[i], R.checks[j]] = [R.checks[j], R.checks[i]];
        resaltado = j;
        cambio();
        lado.querySelector(`[data-${d.subir !== undefined ? 'subir' : 'bajar'}="${j}"]:not([disabled])`)?.focus();
        return;
      }
      if (d.quitar !== undefined) {
        const i = Number(d.quitar);
        R.puntos.splice(i, 1); R.checks.splice(i, 1);
        resaltado = -1;
        cambio();
        return;
      }
      if (t.id === 'fa-borrar') {
        if (!(await confirmar('¿Borrar todos los puntos del recorrido?', { si: 'Borrar todos', no: 'Cancelar', peligro: true }))) return;
        R.puntos = []; R.checks = [];
        resaltado = -1;
        cambio();
        return;
      }
      if (t.id === 'fa-narrar' && R.puntos.length >= f.min) {
        R.fase = 'narrar';
        guardar();
        mostrar();
      }
    });
    lado.addEventListener('pointerover', ev => {
      const li = ev.target.closest('.fa-punto');
      const i = li ? Number(li.dataset.i) : -1;
      if (i !== resaltado) { resaltado = i; dibujar(); }
    });
    lado.addEventListener('pointerleave', () => { if (resaltado !== -1) { resaltado = -1; dibujar(); } });

    function cambio() {
      guardar();
      pintarLado();
      dibujar();
    }
    // Acerca la vista a un punto (con margen) y lo resalta.
    function enfocar(i) {
      const [x, y, w, h] = R.puntos[i];
      const ns = entre(Math.min(VW / (w * f.ancho * k0), VH / (h * f.alto * k0)) * 0.7, 1, ZOOM_MAX);
      s = ns;
      tx = VW / 2 - (x + w / 2) * W();
      ty = VH / 2 - (y + h / 2) * H();
      resaltado = i;
      aplicar();
    }

    // ---- herramientas ----
    const pintarHerramienta = () => {
      cont.querySelectorAll('[data-herr]').forEach(b => {
        const on = b.dataset.herr === herramienta;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      vis.classList.toggle('marcar', R.fase === 'planear' && herramienta === 'marcar');
    };
    cont.querySelector('.fa-herramientas')?.addEventListener('click', ev => {
      const b = ev.target.closest('[data-herr]');
      if (!b) return;
      herramienta = b.dataset.herr;
      pintarHerramienta();
    });
    cont.querySelector('#fa-mas').addEventListener('click', () => zoomEn(VW / 2, VH / 2, 1.5));
    cont.querySelector('#fa-menos').addEventListener('click', () => zoomEn(VW / 2, VH / 2, 1 / 1.5));
    cont.querySelector('#fa-encajar').addEventListener('click', () => { s = 1; aplicar(); });
    cont.querySelector('#fa-marcas')?.addEventListener('click', ev => {
      marcas = !marcas;
      ev.currentTarget.classList.toggle('on', marcas);
      ev.currentTarget.setAttribute('aria-pressed', String(marcas));
      ev.currentTarget.innerHTML = icono(marcas ? 'ojo' : 'ojoNo', 18);
      dibujar();
    });

    // ---- rueda, arrastre, pellizco ----
    const pos = ev => { const r = vis.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    vis.addEventListener('wheel', ev => {
      ev.preventDefault();
      const [px, py] = pos(ev);
      const delta = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
      zoomEn(px, py, Math.exp(-delta * (ev.ctrlKey ? 0.01 : 0.0018)));
    }, { passive: false });
    vis.addEventListener('dblclick', ev => {
      if (R.fase === 'planear' && herramienta === 'marcar') return;
      const [px, py] = pos(ev);
      zoomEn(px, py, 2);
    });

    const punteros = new Map();
    let gesto = null;     // { tipo: 'mover' | 'marcar' | 'pellizco', … }
    let espacio = false;
    let avisoClic = false;
    const iniciarPellizco = () => {
      const [a, b] = [...punteros.values()];
      gesto = { tipo: 'pellizco', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s0: s, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tx0: tx, ty0: ty };
    };
    vis.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse' && ev.button !== 0 && ev.button !== 1) return;
      try { vis.setPointerCapture(ev.pointerId); } catch { /* puntero que ya no existe */ }
      punteros.set(ev.pointerId, pos(ev));
      vis.focus({ preventScroll: true });
      if (punteros.size === 2) { temporal = null; iniciarPellizco(); dibujar(); return; }
      if (punteros.size > 2) return;
      const [px, py] = pos(ev);
      const marcar = R.fase === 'planear' && herramienta === 'marcar' && !espacio && ev.button === 0;
      if (marcar) {
        const [u, v] = aFachada(px, py);
        if (px < tx || py < ty || px > tx + W() || py > ty + H()) { gesto = { tipo: 'mover', x0: px, y0: py, tx0: tx, ty0: ty }; return; }
        if (R.puntos.length >= f.max) { aviso(`El recorrido ya tiene ${f.max} puntos. Quite uno para marcar otro.`); gesto = null; return; }
        gesto = { tipo: 'marcar', x0: px, y0: py };
        temporal = [u, v, u, v];
      } else {
        gesto = { tipo: 'mover', x0: px, y0: py, tx0: tx, ty0: ty };
        vis.classList.add('arrastrando');
      }
    });
    vis.addEventListener('pointermove', ev => {
      if (!punteros.has(ev.pointerId)) return;
      punteros.set(ev.pointerId, pos(ev));
      if (!gesto) return;
      if (gesto.tipo === 'pellizco' && punteros.size >= 2) {
        const [a, b] = [...punteros.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const ns = entre(gesto.s0 * d / gesto.d0, 1, ZOOM_MAX);
        tx = m[0] - (gesto.m0[0] - gesto.tx0) * (ns / gesto.s0);
        ty = m[1] - (gesto.m0[1] - gesto.ty0) * (ns / gesto.s0);
        s = ns;
        aplicar();
      } else if (gesto.tipo === 'mover') {
        const [px, py] = pos(ev);
        tx = gesto.tx0 + (px - gesto.x0);
        ty = gesto.ty0 + (py - gesto.y0);
        aplicar();
      } else if (gesto.tipo === 'marcar') {
        const [u, v] = aFachada(...pos(ev));
        temporal[2] = u; temporal[3] = v;
        dibujar();
      }
    });
    const soltar = ev => {
      if (!punteros.has(ev.pointerId)) return;
      punteros.delete(ev.pointerId);
      vis.classList.remove('arrastrando');
      if (gesto?.tipo === 'pellizco') { gesto = null; return; }   // al levantar un dedo del pellizco no se marca nada
      if (gesto?.tipo === 'marcar' && temporal && ev.type === 'pointerup') {
        const [u0, v0, u1, v1] = temporal;
        const x = Math.min(u0, u1), y = Math.min(v0, v1), w = Math.abs(u1 - u0), h = Math.abs(v1 - v0);
        temporal = null;
        if (w * W() >= LADO_MIN && h * H() >= LADO_MIN) {
          const p = puntoValido([x, y, w, h]);
          if (p) { R.puntos.push(p); R.checks.push(false); resaltado = -1; cambio(); return; }
        } else if (!avisoClic) {
          avisoClic = true;
          aviso('Para marcar un punto, arrastre: dibuje un recuadro sobre la fachada.');
        }
      }
      temporal = null;
      gesto = null;
      dibujar();
    };
    vis.addEventListener('pointerup', soltar);
    vis.addEventListener('pointercancel', soltar);

    // ---- teclado: + − 0, flechas; espacio sostenido para mover mientras se marca ----
    const tecla = ev => {
      if (ev.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (ev.key === ' ' && R.fase === 'planear' && document.activeElement === vis) {
        ev.preventDefault();
        if (ev.type === 'keydown' && !espacio) { espacio = true; vis.classList.add('espacio'); }
        if (ev.type === 'keyup') { espacio = false; vis.classList.remove('espacio'); }
        return;
      }
      if (ev.type !== 'keydown' || document.activeElement !== vis) return;
      const paso = 60;
      if (ev.key === '+' || ev.key === '=') zoomEn(VW / 2, VH / 2, 1.3);
      else if (ev.key === '-') zoomEn(VW / 2, VH / 2, 1 / 1.3);
      else if (ev.key === '0') { s = 1; aplicar(); }
      else if (ev.key === 'ArrowLeft') { tx += paso; aplicar(); }
      else if (ev.key === 'ArrowRight') { tx -= paso; aplicar(); }
      else if (ev.key === 'ArrowUp') { ty += paso; aplicar(); }
      else if (ev.key === 'ArrowDown') { ty -= paso; aplicar(); }
      else return;
      ev.preventDefault();
    };
    document.addEventListener('keydown', tecla);
    document.addEventListener('keyup', tecla);

    const ro = new ResizeObserver(() => medir(false));
    pintarLado();
    pintarHerramienta();
    medir(true);
    ro.observe(vis);
    return () => {
      ro.disconnect();
      document.removeEventListener('keydown', tecla);
      document.removeEventListener('keyup', tecla);
    };
  }

  // -------------------------------------------------------------------
  // Narrar: el escritorio común con los recortes y sus marcas
  // -------------------------------------------------------------------
  function narrar() {
    const n = R.puntos.length;
    const panel = `
      <div class="fa-panel">
        <div class="fa-panel-cab">
          <span class="rotulo">Fachadas</span>
          <span class="espaciador"></span>
          <button type="button" class="btn btn-fantasma btn-chico" id="fa-volver" title="Volver a la fachada para cambiar los puntos (lo escrito se conserva)">${icono('izquierda', 16)}Recorrido</button>
        </div>
        <h1 class="fa-panel-titulo">${esc(f.titulo)}</h1>
        ${f.credito ? `<p class="fa-credito">${esc(f.credito)}</p>` : ''}
        ${consignaHTML()}
        <div class="fa-panel-rec">
          <div class="fila"><span class="rotulo">El recorrido · ${n} puntos</span><span class="espaciador"></span><span class="fa-cuenta" id="fa-hechos"></span></div>
          <ol class="fa-recortes">${R.puntos.map((p, i) => `
            <li class="fa-recorte-item${R.checks[i] ? ' hecho' : ''}" data-i="${i}">
              <button type="button" class="fa-recorte-btn" data-ver="${i}" aria-label="Ver el punto ${i + 1} ampliado" title="Ver ampliado">
                ${recorteHTML(p, f, { caja: 4 / 3 })}<span class="fa-recorte-n">${i + 1}</span>
              </button>
              <label class="fa-check"><input type="checkbox" data-check="${i}" ${R.checks[i] ? 'checked' : ''}><span>Narrado</span></label>
            </li>`).join('')}</ol>
          <p class="fa-nota">Toque un recorte para verlo de cerca. Marque los puntos que ya narró: es solo una guía.</p>
        </div>
      </div>`;
    const es = montarEscritorio(cont, {
      acento: ACENTO,
      panelHTML: panel,
      clave: claveTexto,
      titulo: tituloEdit,
      html: htmlEdit,
      editando: !!entrega,
      textoBoton: entrega ? 'Guardar cambios' : 'Publicar',
      placeholder: 'Narre aquí el recorrido…',
      avisoPublicar: () => {
        const faltan = R.checks.filter(c => !c).length;
        const general = avisoPublicar('su recorrido', 'lo');
        return faltan ? `${faltan === 1 ? 'Queda 1 punto sin marcar' : `Quedan ${faltan} puntos sin marcar`} como narrado. ${general}` : general;
      },
      alPublicar: async d => {
        const datos = {
          fachada: f.id, titulo_fachada: f.titulo, credito: f.credito || '', imagen: f.imagen, ancho: f.ancho, alto: f.alto,
          puntos: R.puntos, html: d.html,
        };
        const vista = `<div class="v-fachadas">${trazoFachada(datos)}</div>${d.html}`;
        terminado = true;
        guardarNube.cancelar();
        try {
          await publicarEntrega({ dinamica: SLUG, item_id: f.id, titulo: d.titulo, texto: d.texto, vista, datos, modulo_version: VERSION },
            { entregaExistente: entrega });
        } catch (e) { terminado = false; throw e; }
        if (!entrega) quitarBorrador(claveRec);
      },
    });
    const mesa = cont.querySelector('.escritorio');
    mesa.classList.add('fa-escritorio');
    const hechos = () => {
      const k = R.checks.filter(Boolean).length;
      cont.querySelector('#fa-hechos').textContent = k ? `${k} de ${n} narrados` : '';
    };
    hechos();
    const marcar = (i, on) => {
      R.checks[i] = on;
      cont.querySelector(`.fa-recorte-item[data-i="${i}"]`)?.classList.toggle('hecho', on);
      const cb = cont.querySelector(`[data-check="${i}"]`);
      if (cb) cb.checked = on;
      hechos();
      guardar();
    };
    const panelEl = cont.querySelector('.fa-panel');
    panelEl.addEventListener('change', ev => {
      const cb = ev.target.closest('[data-check]');
      if (cb) marcar(Number(cb.dataset.check), cb.checked);
    });
    panelEl.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ver]');
      if (b) ampliar(f, R.puntos, Number(b.dataset.ver), { checks: R.checks, alMarcar: marcar });
    });
    cont.querySelector('#fa-volver').addEventListener('click', () => {
      // lo escrito se conserva: en edición, en memoria; si no, en el borrador del escritorio
      htmlEdit = cont.querySelector('#editor')?.innerHTML || htmlEdit;
      tituloEdit = cont.querySelector('#titulo')?.value || tituloEdit;
      R.fase = 'planear';
      guardar();
      mostrar();
      verVisor();
    });
    return () => es.destruir();
  }

  mostrar();
}

// ---------------------------------------------------------------------
// Un punto ampliado (con la imagen de detalle), con «dónde está» en la fachada
// ---------------------------------------------------------------------
function ampliar(f, puntos, i0, { checks = null, alMarcar = null } = {}) {
  let i = i0;
  const n = puntos.length;
  const cuerpo = () => {
    const p = puntos[i];
    const prop = (p[2] * f.ancho) / (p[3] * f.alto);
    const maxW = Math.min(820, innerWidth - 90), maxH = Math.max(220, innerHeight * 0.58);
    const w = prop > maxW / maxH ? maxW : maxH * prop;
    const h = w / prop;
    return `<div class="fa-ampliado">
      <div class="fa-ampliado-img" style="width:${Math.round(w)}px;height:${Math.round(h)}px">${recorteHTML(p, f, { caja: prop, detalle: true, clase: 'fa-recorte fa-recorte-grande' })}</div>
      <div class="fa-ampliado-pie">
        <span class="fa-ubicacion" style="aspect-ratio:${f.ancho}/${f.alto}" title="Dónde está en la fachada">
          <img src="${urlImg(f.imagen, 'mini')}" alt="">
          <i style="left:${(p[0] * 100).toFixed(2)}%;top:${(p[1] * 100).toFixed(2)}%;width:${(p[2] * 100).toFixed(2)}%;height:${(p[3] * 100).toFixed(2)}%"></i>
        </span>
        <div class="fa-ampliado-nav">
          <button type="button" class="btn btn-chico btn-fantasma" data-paso="-1" ${i ? '' : 'disabled'}>${icono('izquierda', 16)}Anterior</button>
          <span class="fa-ampliado-n">Punto ${i + 1} de ${n}</span>
          <button type="button" class="btn btn-chico btn-fantasma" data-paso="1" ${i < n - 1 ? '' : 'disabled'}>Siguiente${icono('derecha', 16)}</button>
        </div>
        ${checks ? `<label class="fa-check fa-check-grande"><input type="checkbox" id="fa-amp-check" ${checks[i] ? 'checked' : ''}><span>Narrado</span></label>` : ''}
      </div>
    </div>`;
  };
  modal({
    titulo: `Punto ${i + 1}`,
    ancho: 900,
    cuerpo: cuerpo(),
    acciones: [{ texto: 'Volver', clase: 'btn-primario', valor: true }],
    alAbrir: velo => {
      const pintar = () => {
        velo.querySelector('.dialogo-titulo').textContent = `Punto ${i + 1}`;
        velo.querySelector('.dialogo-cuerpo').innerHTML = cuerpo();
      };
      velo.addEventListener('click', ev => {
        const b = ev.target.closest('[data-paso]');
        if (!b) return;
        i = entre(i + Number(b.dataset.paso), 0, n - 1);
        pintar();
      });
      velo.addEventListener('change', ev => {
        if (ev.target.id === 'fa-amp-check') alMarcar?.(i, ev.target.checked);
      });
      const tecla = ev => {
        if (!velo.isConnected) { document.removeEventListener('keydown', tecla); return; }
        if (ev.key === 'ArrowLeft' && i > 0) { i--; pintar(); }
        if (ev.key === 'ArrowRight' && i < n - 1) { i++; pintar(); }
      };
      document.addEventListener('keydown', tecla);
    },
  });
}

// ---------------------------------------------------------------------
// En la entrega publicada (vistas/entrega.js): la fachada con el recorrido y la tira de recortes
// ---------------------------------------------------------------------
function fachadaDeDatos(d) {
  const imagen = typeof d?.imagen === 'string' && NOMBRE.test(d.imagen) ? d.imagen : null;
  const ancho = Number(d?.ancho) > 0 ? Number(d.ancho) : 1000;
  const alto = Number(d?.alto) > 0 ? Number(d.alto) : 1000;
  return { imagen, ancho, alto, detalle: true, titulo: d?.titulo_fachada || '' };
}

export function figuraHTML(d) {
  const f = fachadaDeDatos(d);
  const puntos = puntosValidos(d?.puntos);
  if (!f.imagen || !puntos.length) return '';
  const Wv = 1000, Hv = Math.round(1000 * f.alto / f.ancho);
  const cajas = puntos.map(([x, y, w, h]) => [x * Wv, y * Hv, w * Wv, h * Hv]);
  const centros = cajas.map(([a, b, w, h]) => [a + w / 2, b + h / 2]);
  const pts = centros.map(c => c.map(v => v.toFixed(1)).join(',')).join(' ');
  return `<figure class="fa-figura" style="aspect-ratio:${f.ancho}/${f.alto}">
      <img src="img/${SLUG}/${f.imagen}.webp" width="${f.ancho}" height="${f.alto}" alt="${esc(`${f.titulo || 'Fachada'}${d.credito ? `. ${d.credito}` : ''}`)}" loading="lazy" decoding="async">
      <svg class="fa-figura-capa" viewBox="0 0 ${Wv} ${Hv}" aria-hidden="true">
        ${cajas.map(([a, b, w, h], i) => `<g class="fa-caja" data-ver="${i}"><rect x="${a}" y="${b}" width="${w}" height="${h}" rx="3" class="fa-caja-halo"/><rect x="${a}" y="${b}" width="${w}" height="${h}" rx="3" class="fa-caja-linea"/></g>`).join('')}
        ${centros.length > 1 ? `<polyline points="${pts}" class="fa-linea-halo"/><polyline points="${pts}" class="fa-linea"/>` : ''}
        ${centros.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="5" class="fa-centro"/>`).join('')}
        ${cajas.map(([a, b], i) => `<g class="fa-num" data-ver="${i}"><circle cx="${a + 18}" cy="${b + 18}" r="15"/><text x="${a + 18}" y="${b + 23.5}" text-anchor="middle">${i + 1}</text></g>`).join('')}
      </svg>
    </figure>
    <ol class="fa-tira">${puntos.map((p, i) => `<li><button type="button" class="fa-recorte-btn" data-ver="${i}" aria-label="Ver el punto ${i + 1} ampliado">${recorteHTML(p, { ...f, imagen: f.imagen }, { caja: 1 })}<span class="fa-recorte-n">${i + 1}</span></button></li>`).join('')}</ol>`;
}

export async function activarFigura(raiz, d) {
  if (!raiz) return;
  await leerIndice();
  const f = { ...fachadaDeDatos(d), detalle: !!indice?.detalle };
  const puntos = puntosValidos(d?.puntos);
  if (!f.imagen || !puntos.length) return;
  raiz.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ver]');
    if (b) ampliar(f, puntos, Number(b.dataset.ver));
  });
}
