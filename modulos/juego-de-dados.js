// Módulo: Juego de dados (inspirado en Story Dice, de Dave Birss; imágenes de Diego).
// Una mesa trae varios dados, cada uno con sus caras (imágenes). Se juega hasta tres tiradas:
// después de cada una se tocan los dados que se guardan y se relanzan los demás. En cualquier
// momento se puede pasar a escribir con los dados que hayan quedado; tras la tercera tirada,
// los dados quedan fijos. Mientras haya una partida sin publicar no se vuelve a tirar:
// escribir la historia que el azar asignó es lo que permite jugar otra vez.
//
// Las imágenes viven en GitHub, en img/juego-de-dados/ (WebP grande y mini/, más indice.json).
// Las genera herramientas/optimizar_imagenes.py a partir de imagenes/juego-de-dados/.
// El contenido (paquete «mesas»): { id, nombre, premisa: [pasos], dados: [{ nombre, caras: [{ imagen, nombre }] }] }.
import { estado, esTutor } from '../nucleo/estado.js';
import { esc, local, debounce, confirmar } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { montarEscritorio } from '../nucleo/escritorio.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const SLUG = 'juego-de-dados';
const VERSION = '1.0';
const ACENTO = '#1FB5C9';
const TIRADAS = 3;
const RUTA = `#/d/${SLUG}`;

// ---------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------
const urlImg = (nombre, mini = false) => new URL(`../img/${SLUG}/${mini ? 'mini/' : ''}${nombre}.webp`, import.meta.url).href;
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
    cargadas.set(src, (im.decode ? im.decode() : new Promise(r => { im.onload = r; im.onerror = r; })).catch(() => {}));
  }
  return cargadas.get(src);
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const azar = lista => lista[Math.floor(Math.random() * lista.length)];

// Nombre visible a partir del nombre del archivo: «caballo-de-troya» → «Caballo de troya».
const nombreDeImagen = s => { const t = String(s || '').replace(/-/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// ---------------------------------------------------------------------
// La partida: se guarda en este navegador y en la nube después de cada tirada,
// así recargar no da dados nuevos y se puede seguir en otro computador.
// { id, mesa, tirada, caras: [imagen], guardados: [bool], vistas: [[imagen]], escribiendo, usados: [bool], _actualizado }
// ---------------------------------------------------------------------
const claveNube = mesa => `${SLUG}:partida:${mesa}`;
const claveLocal = mesa => `${SLUG}-partida:${estado.yo.id}:${mesa}`;
async function leerPartida(mesa) {
  const loc = local(claveLocal(mesa));
  let nube = null;
  try { nube = await estado.api.borrador(claveNube(mesa)); } catch { /* sin conexión: queda la local */ }
  return [loc, nube].filter(p => p && p.id).sort((a, b) => (b._actualizado || '').localeCompare(a._actualizado || ''))[0] || null;
}
const guardarNube = debounce((mesa, p) => { estado.api.guardarBorrador(claveNube(mesa), p).catch(() => {}); }, 600);
function guardarPartida(p) {
  p._actualizado = new Date().toISOString();
  local(claveLocal(p.mesa), p);
  guardarNube(p.mesa, p);
}
async function borrarPartida(mesa) {
  guardarNube.cancelar();
  local(claveLocal(mesa), null);
  await estado.api.borrarBorrador(claveNube(mesa)).catch(() => {});
}
function nuevaPartida(mesa) {
  const n = mesa.dados.length;
  return {
    id: (crypto.randomUUID?.() || String(Date.now())).slice(0, 8), mesa: mesa.id, tirada: 0,
    caras: Array(n).fill(null), guardados: Array(n).fill(false), vistas: Array.from({ length: n }, () => []),
    escribiendo: false, usados: Array(n).fill(false),
  };
}

// Una cara al azar del dado k, distinta de la actual y, si se puede, de las que ya salieron en esta partida.
function rodar(mesa, p, k) {
  const caras = mesa.dados[k].caras.map(c => c.imagen);
  const actual = p.caras[k];
  let libres = caras.filter(c => c !== actual && !p.vistas[k].includes(c));
  if (!libres.length) libres = caras.filter(c => c !== actual);
  if (!libres.length) libres = caras;
  const cara = azar(libres);
  p.caras[k] = cara;
  p.vistas[k].push(cara);
  return cara;
}

const nombreCara = (mesa, k, imagen) => mesa.dados[k]?.caras.find(c => c.imagen === imagen)?.nombre || nombreDeImagen(imagen);

// ---------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------
async function cargarMesas() {
  const [idx, items] = await Promise.all([leerIndice(), estado.api.contenidos(SLUG).catch(() => [])]);
  return items.map(c => {
    const faltan = [];
    const dados = (c.datos.dados || []).map(d => {
      const caras = (d.caras || []).filter(x => { const hay = !!idx.imagenes[x.imagen]; if (!hay) faltan.push(x.imagen); return hay; });
      return { ...d, caras };
    }).filter(d => d.caras.length);
    return { id: c.item_id, nombre: c.datos.nombre || 'Mesa', descripcion: c.datos.descripcion || '', premisa: c.datos.premisa || [], dados, faltan };
  }).filter(m => m.dados.length);
}

// ---------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------
export default {
  slug: SLUG,
  nombre: 'Juego de dados',
  version: VERSION,

  async abrir(cont, ctx) {
    const limpieza = [];
    const fin = () => limpieza.forEach(f => { try { f(); } catch { /* nada */ } });
    if (ctx.entrega) {
      await leerIndice();
      escribirEdicion(cont, ctx.entrega, limpieza);
      return fin;
    }
    const q = ctx.query || {};
    const mesas = await cargarMesas();
    if ('publicado' in q) { await despues(cont, mesas, q.publicado); return fin; }
    if (!mesas.length) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('La mesa todavía no está servida',
        esTutor() ? 'Cargue una mesa en Panel › Contenido › Juego de dados.' : 'El tutor todavía no ha cargado los dados de esta dinámica.')}</div>`;
      return fin;
    }
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    const mesa = mesas.find(m => m.id === id);
    if (!mesa) {
      if (mesas.length === 1) location.replace(`${RUTA}/${encodeURIComponent(mesas[0].id)}`);
      else elegirMesa(cont, mesas);
      return fin;
    }
    await jugar(cont, mesa, limpieza);
    return fin;
  },

  paquete: {
    plantilla: 'plantillas/juego-de-dados.json',
    describir: d => {
      const caras = (d.dados || []).reduce((n, x) => n + (x.caras?.length || 0), 0);
      return `${d.nombre || 'Mesa'} · ${(d.dados || []).length} dados · ${caras} caras`;
    },
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json) ? json : Array.isArray(json?.mesas) ? json.mesas : null;
      if (!lista || !lista.length) return { items, errores: ['El archivo debe tener una lista "mesas": [ … ] con al menos una mesa.'] };
      const ids = new Set();
      const txt = v => (typeof v === 'string' ? v.trim() : '');
      lista.forEach((m, i) => {
        const id = txt(m?.id);
        const n = `Mesa ${i + 1}${id ? ` (${id})` : ''}`;
        if (!id) { errores.push(`Mesa ${i + 1}: falta "id".`); return; }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errores.push(`${n}: el id solo puede tener minúsculas sin tildes, números y guiones.`);
        else if (ids.has(id)) errores.push(`${n}: el id está repetido.`);
        ids.add(id);
        const nombre = txt(m?.nombre);
        if (!nombre) errores.push(`${n}: falta "nombre".`);
        const premisa = (Array.isArray(m?.premisa) ? m.premisa : txt(m?.premisa).split(/\n+/)).map(txt).filter(Boolean);
        if (!premisa.length) errores.push(`${n}: falta "premisa" (una lista de frases).`);
        const dadosJ = Array.isArray(m?.dados) ? m.dados : [];
        if (dadosJ.length < 2 || dadosJ.length > 8) errores.push(`${n}: "dados" debe tener entre 2 y 8 dados (tiene ${dadosJ.length}).`);
        const enLaMesa = new Set();
        const dados = dadosJ.map((d, k) => {
          const nd = `${n}, dado ${k + 1}`;
          const caras = (Array.isArray(d?.caras) ? d.caras : []).map(c => {
            const imagen = txt(typeof c === 'string' ? c : c?.imagen);
            const nom = txt(typeof c === 'string' ? '' : c?.nombre);
            if (!/^[a-z0-9][a-z0-9-]*$/.test(imagen)) { errores.push(`${nd}: "${imagen}" no es un nombre de imagen válido (minúsculas sin tildes, números y guiones, sin «.webp»).`); return null; }
            if (enLaMesa.has(imagen)) errores.push(`${nd}: la imagen "${imagen}" está repetida en la mesa.`);
            enLaMesa.add(imagen);
            return nom && nom !== nombreDeImagen(imagen) ? { imagen, nombre: nom } : { imagen };
          }).filter(Boolean);
          if (caras.length < 2) errores.push(`${nd}: necesita al menos 2 caras.`);
          return { nombre: txt(d?.nombre) || `Dado ${k + 1}`, caras };
        });
        const datos = { nombre, premisa, dados };
        if (txt(m?.descripcion)) datos.descripcion = txt(m.descripcion);
        items.push({ item_id: id, datos });
      });
      return { items: errores.length ? [] : items, errores };
    },
    exportar(items) {
      return { mesas: items.map(i => ({ id: i.item_id, ...i.datos })) };
    },
  },
};

// Las caras guardadas en el contenido traen nombre solo si difiere del del archivo; aquí se completa.
function conNombres(m) {
  return { ...m, dados: m.dados.map(d => ({ ...d, caras: d.caras.map(c => ({ imagen: c.imagen, nombre: c.nombre || nombreDeImagen(c.imagen) })) })) };
}

// ---------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------
function premisaHTML(mesa, { titulo = true } = {}) {
  const letras = 'ABCDEFGHIJ';
  return `<div class="jd-premisa">
    ${titulo ? '<span class="rotulo">Premisa</span>' : ''}
    <ol class="jd-premisa-lista">${mesa.premisa.map((p, i) => `<li><b>${letras[i] || i + 1}.</b><span>${esc(p)}</span></li>`).join('')}</ol>
  </div>`;
}

function pips(tirada) {
  return `<span class="jd-pips" aria-label="Tirada ${tirada} de ${TIRADAS}">${Array.from({ length: TIRADAS }, (_, i) => `<span class="${i < tirada ? 'on' : ''}"></span>`).join('')}</span>`;
}

function caraHTML(mesa, k, imagen, { mini = false } = {}) {
  if (!imagen) return `<span class="jd-cara jd-cara-vacia">${icono('dado', mini ? 22 : 38)}</span>`;
  const nombre = nombreCara(mesa, k, imagen);
  return `<span class="jd-cara"><img src="${urlImg(imagen, mini)}" width="${mini ? 240 : 512}" height="${mini ? 240 : 512}" alt="${esc(nombre)}" decoding="async" draggable="false"></span>`;
}

// ---------------------------------------------------------------------
// Varias mesas: elegir una
// ---------------------------------------------------------------------
function elegirMesa(cont, mesas) {
  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho jd" style="--acento:${ACENTO}">
    <span class="rotulo">Juego de dados</span>
    <h1 class="saludo">Elija una mesa</h1>
    <div class="jd-mesas">${mesas.map(m => `<a class="jd-mesa-tarjeta" href="${RUTA}/${encodeURIComponent(m.id)}">
      <span class="jd-mesa-sello">${icono('dado', 26)}</span>
      <span><b>${esc(m.nombre)}</b><span class="tenue">${m.dados.length} dados${m.descripcion ? ` · ${esc(m.descripcion)}` : ''}</span></span></a>`).join('')}</div>
  </div>`;
}

// ---------------------------------------------------------------------
// La mesa: tiradas
// ---------------------------------------------------------------------
async function jugar(cont, mesaBase, limpieza) {
  const mesa = conNombres(mesaBase);
  let p = await leerPartida(mesa.id);
  // Una partida de otra versión de la mesa (cambió el número de dados) no se puede seguir.
  if (p && p.caras?.length !== mesa.dados.length) p = null;
  if (!p) p = nuevaPartida(mesa);
  if (p.escribiendo) { escribir(cont, mesa, p, limpieza); return; }

  let animando = false;
  let vivo = true;
  limpieza.push(() => { vivo = false; });
  const n = mesa.dados.length;

  cont.innerHTML = `
  <div class="contenedor jd" style="--acento:${ACENTO}">
    <div class="jd-cab">
      <div>
        <span class="rotulo">Juego de dados</span>
        <h1 class="saludo">${esc(mesa.nombre)}</h1>
      </div>
      <span class="espaciador"></span>
      <div class="jd-contador" id="jd-contador"></div>
    </div>
    <div class="jd-mesa">
      <section class="jd-tapete">
        <div class="jd-tablero" id="jd-tablero" style="--n:${n}">
          ${mesa.dados.map((_, k) => `<button type="button" class="jd-dado" data-k="${k}" disabled>${caraHTML(mesa, k, p.caras[k])}
            <span class="jd-marca" aria-hidden="true">${icono('candado', 14, { grosor: 2.2 })}</span>
            <span class="jd-nombre"></span></button>`).join('')}
        </div>
        <p class="jd-ayuda" id="jd-ayuda" aria-live="polite"></p>
        <div class="jd-acciones">
          <button type="button" class="btn btn-primario btn-grande" id="jd-lanzar"></button>
          <button type="button" class="btn btn-grande" id="jd-escribir">${icono('pluma', 20)}Escribir con estos dados</button>
        </div>
      </section>
      <aside class="jd-lado">
        ${premisaHTML(mesa)}
        <a class="jd-mis-historias" href="#/muro?dinamica=${SLUG}&autor=${encodeURIComponent(estado.yo.id)}">${icono('libro', 16)}Mis historias en el muro</a>
      </aside>
    </div>
  </div>`;

  const tablero = cont.querySelector('#jd-tablero');
  const botonLanzar = cont.querySelector('#jd-lanzar');
  const botonEscribir = cont.querySelector('#jd-escribir');
  const dados = [...tablero.querySelectorAll('.jd-dado')];

  function pintar() {
    const ultima = p.tirada >= TIRADAS;
    const sinGuardar = p.guardados.filter(g => !g).length;
    cont.querySelector('#jd-contador').innerHTML = p.tirada
      ? `<span class="rotulo">Tirada ${p.tirada} de ${TIRADAS}</span>${pips(p.tirada)}`
      : `<span class="rotulo">${TIRADAS} tiradas</span>${pips(0)}`;
    dados.forEach((b, k) => {
      const g = !!p.guardados[k] && !ultima;
      b.classList.toggle('guardado', g);
      b.classList.toggle('fijo', ultima);
      b.disabled = !p.tirada || ultima || animando;
      b.setAttribute('aria-pressed', String(g));
      const nombre = p.caras[k] ? nombreCara(mesa, k, p.caras[k]) : '';
      b.querySelector('.jd-nombre').textContent = nombre;
      b.setAttribute('aria-label', !p.caras[k] ? `Dado ${k + 1}` : ultima ? nombre : `${nombre}. ${g ? 'Guardado: toque para volver a lanzarlo' : 'Toque para guardarlo'}`);
      b.title = !p.tirada || ultima ? '' : g ? 'Guardado. Toque para soltarlo' : 'Toque para guardarlo';
    });
    const ayuda = cont.querySelector('#jd-ayuda');
    ayuda.textContent = !p.tirada ? 'Tiene tres tiradas. Después de cada una puede guardar los dados que quiera y volver a lanzar los demás.'
      : ultima ? 'Los dados quedaron fijos. Ahora escriba la historia que el azar le asignó.'
      : sinGuardar === 0 ? 'Guardó todos los dados. Puede escribir con ellos o soltar alguno para volver a lanzarlo.'
      : 'Toque los dados que quiere guardar. Los demás vuelven a rodar. También puede escribir ya con estos dados.';
    botonLanzar.hidden = ultima;
    botonLanzar.disabled = animando || (p.tirada > 0 && sinGuardar === 0);
    botonLanzar.innerHTML = `${icono('dado', 20)}${!p.tirada ? 'Lanzar los dados' : sinGuardar === n || sinGuardar === 0 ? 'Volver a lanzar' : `Relanzar ${sinGuardar} ${sinGuardar === 1 ? 'dado' : 'dados'}`}`;
    botonEscribir.hidden = !p.tirada;
    botonEscribir.disabled = animando;
    botonEscribir.className = `btn btn-grande ${ultima ? 'btn-primario' : ''}`;
    botonEscribir.innerHTML = `${icono('pluma', 20)}${ultima ? 'Escribir la historia' : 'Escribir con estos dados'}`;
  }

  async function lanzar() {
    if (animando || p.tirada >= TIRADAS) return;
    const ks = mesa.dados.map((_, k) => k).filter(k => !p.guardados[k] || !p.tirada);
    if (!ks.length) return;
    animando = true;
    pintar();
    ks.forEach(k => rodar(mesa, p, k));
    p.tirada += 1;
    if (p.tirada === 1) p.guardados = p.guardados.map(() => false);
    guardarPartida(p);
    // Las imágenes bajan mientras empieza el giro (máximo 0,8 s de espera).
    await Promise.race([Promise.all(ks.map(k => precargar(urlImg(p.caras[k])))), esperar(800)]);
    if (!vivo) return;
    ks.forEach((k, orden) => {
      const b = dados[k];
      b.querySelector('.jd-cara').outerHTML = caraHTML(mesa, k, p.caras[k]);
      b.style.setProperty('--orden', orden);
      b.classList.remove('cae');
      void b.offsetWidth;   // reinicia la animación
      b.classList.add('cae');
    });
    if (!sinMovimiento()) await esperar(560 + 70 * (ks.length - 1));
    if (!vivo) return;
    animando = false;
    pintar();
    if (p.tirada >= TIRADAS) cont.querySelector('#jd-escribir')?.focus();
  }

  tablero.addEventListener('click', ev => {
    const b = ev.target.closest('.jd-dado');
    if (!b || b.disabled || animando || !p.tirada || p.tirada >= TIRADAS) return;
    const k = Number(b.dataset.k);
    p.guardados[k] = !p.guardados[k];
    guardarPartida(p);
    pintar();
  });
  botonLanzar.addEventListener('click', lanzar);
  botonEscribir.addEventListener('click', async () => {
    if (animando || !p.tirada) return;
    if (p.tirada < TIRADAS && !(await confirmar('¿Escribir con estos dados? Ya no podrá volver a lanzarlos: la próxima partida empieza cuando publique esta historia.', { si: 'Escribir con estos dados', no: 'Seguir jugando' }))) return;
    p.escribiendo = true;
    p.guardados = p.guardados.map(() => true);
    guardarPartida(p);
    escribir(cont, mesa, p, limpieza);
  });
  // Las imágenes de la mesa se adelantan mientras se lee la premisa.
  if (!p.tirada) mesa.dados.forEach(d => d.caras.slice(0, 3).forEach(c => precargar(urlImg(c.imagen))));
  pintar();
}

// ---------------------------------------------------------------------
// Escribir la historia
// ---------------------------------------------------------------------
function panelDados(mesa, caras, usados) {
  const n = usados.filter(Boolean).length;
  return `<div class="jd-panel">
    <span class="rotulo">Juego de dados · ${esc(mesa.nombre)}</span>
    <div class="jd-panel-dados" style="--n:${caras.length}" role="group" aria-label="Sus dados: toque los que ya usó en la historia">
      ${caras.map((c, k) => `<button type="button" class="jd-mini ${usados[k] ? 'usado' : ''}" data-k="${k}" aria-pressed="${!!usados[k]}" title="${esc(nombreCara(mesa, k, c))}">
        ${caraHTML(mesa, k, c, { mini: true })}<span class="jd-visto" aria-hidden="true">${icono('check', 13, { grosor: 2.6 })}</span>
        <span class="jd-mini-nombre">${esc(nombreCara(mesa, k, c))}</span></button>`).join('')}
    </div>
    <p class="jd-usados" id="jd-usados">${textoUsados(n, caras.length)}</p>
    ${premisaHTML(mesa)}
  </div>`;
}
const textoUsados = (n, total) => (n ? `${n} de ${total} dados en la historia` : 'Toque cada dado cuando lo use en la historia.');

// Lo que se publica: la historia, con una línea que nombra los dados (para el PDF y el portafolio).
function vistaDe(mesa, caras, html) {
  return `<p class="jd-dados-texto">Dados: ${caras.map((c, k) => esc(nombreCara(mesa, k, c))).join(' · ')}</p>${html}`;
}

function activarMinis(cont, mesa, caras, usados, alCambiar) {
  cont.querySelector('.jd-panel-dados').addEventListener('click', ev => {
    const b = ev.target.closest('.jd-mini');
    if (!b) return;
    const k = Number(b.dataset.k);
    usados[k] = !usados[k];
    b.classList.toggle('usado', usados[k]);
    b.setAttribute('aria-pressed', String(usados[k]));
    cont.querySelector('#jd-usados').textContent = textoUsados(usados.filter(Boolean).length, caras.length);
    alCambiar?.();
  });
}

function escribir(cont, mesa, p, limpieza) {
  const es = montarEscritorio(cont, {
    acento: ACENTO,
    panelHTML: panelDados(mesa, p.caras, p.usados),
    clave: `${SLUG}:${p.id}`,
    placeholder: 'Escriba aquí la historia que le asignaron los dados…',
    alPublicar: async d => {
      await publicarEntrega({
        dinamica: SLUG, item_id: mesa.id, titulo: d.titulo, texto: d.texto, vista: vistaDe(mesa, p.caras, d.html), modulo_version: VERSION,
        datos: {
          mesa: mesa.id, mesa_nombre: mesa.nombre, partida: p.id, tiradas: p.tirada,
          dados: p.caras, nombres: p.caras.map((c, k) => nombreCara(mesa, k, c)), usados: p.usados.map(Boolean), html: d.html,
        },
      }, { irA: `${RUTA}/${encodeURIComponent(mesa.id)}?publicado` });
      await borrarPartida(mesa.id);
    },
  });
  limpieza.push(() => es.destruir());
  cont.querySelector('.escritorio').classList.add('jd-escritorio');
  activarMinis(cont, mesa, p.caras, p.usados, () => guardarPartida(p));
}

// Editar una historia ya publicada: los mismos dados; se pueden marcar o desmarcar los usados.
function escribirEdicion(cont, e, limpieza) {
  const d = e.datos || {};
  const caras = Array.isArray(d.dados) ? d.dados : [];
  const nombres = Array.isArray(d.nombres) ? d.nombres : [];
  // Una mesa mínima con los nombres que quedaron guardados en la entrega.
  const mesa = {
    id: d.mesa || e.item_id, nombre: d.mesa_nombre || 'Mesa',
    premisa: [], dados: caras.map((c, k) => ({ caras: [{ imagen: c, nombre: nombres[k] || nombreDeImagen(c) }] })),
  };
  const usados = caras.map((_, k) => !!d.usados?.[k]);
  const es = montarEscritorio(cont, {
    acento: ACENTO,
    panelHTML: panelDados(mesa, caras, usados),
    clave: `${SLUG}:e-${e.id}`,
    titulo: e.titulo || '',
    html: d.html || '',
    editando: true,
    textoBoton: 'Guardar cambios',
    alPublicar: async x => {
      await publicarEntrega({
        dinamica: SLUG, item_id: e.item_id, titulo: x.titulo, texto: x.texto, vista: vistaDe(mesa, caras, x.html), modulo_version: VERSION,
        datos: { ...d, usados, html: x.html },
      }, { entregaExistente: e });
    },
  });
  limpieza.push(() => es.destruir());
  cont.querySelector('.escritorio').classList.add('jd-escritorio');
  // La premisa de la mesa, si sigue en el contenido.
  estado.api.contenido(SLUG, e.item_id).then(c => {
    const premisa = c?.datos?.premisa;
    if (premisa?.length) cont.querySelector('.jd-panel')?.insertAdjacentHTML('beforeend', premisaHTML({ premisa }));
  }).catch(() => {});
  activarMinis(cont, mesa, caras, usados);
}

// ---------------------------------------------------------------------
// Después de publicar
// ---------------------------------------------------------------------
async function despues(cont, mesas, mesaId) {
  const id = mesaId || mesas[0]?.id || '';
  const mias = await estado.api.entregas({ dinamica: SLUG, autor: estado.yo.id, incluirOcultas: true }).catch(() => []);
  const ultima = mias.filter(e => e.autor === estado.yo.id).sort((a, b) => (b.creado || '').localeCompare(a.creado || ''))[0];
  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho jd" style="--acento:${ACENTO}">
    <section class="jd-despues">
      <span class="jd-sello">${icono('dado', 34)}</span>
      <h1 class="saludo">Su historia ya está en el muro</h1>
      <p>Pagó su apuesta: la mesa está libre para otra partida.</p>
      <div class="jd-acciones jd-acciones-despues">
        <a class="btn btn-primario btn-grande" href="${RUTA}/${encodeURIComponent(id)}">${icono('dado', 20)}Jugar otra vez</a>
        ${ultima ? `<a class="btn btn-grande" href="#/entrega/${ultima.id}">${icono('libro', 20)}Ver mi historia</a>` : ''}
      </div>
    </section>
  </div>`;
}
