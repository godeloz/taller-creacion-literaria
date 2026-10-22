// Módulo: Correo de secretos (al modo de PostSecret, de Frank Warren).
// Portada → sobre → animación que elige una postal al azar → secreto (imagen y traducción) → historia.
// También el Banco de secretos: secretos anónimos del taller, que el tutor revisa sin saber de quién son.
//
// Las imágenes viven en GitHub, en img/correo-secretos/ (WebP grande y mini/, más indice.json con sus medidas).
// Las genera herramientas/optimizar_imagenes.py a partir de imagenes/correo-secretos/. Las traducciones son
// el contenido de la dinámica (paquete «secretos»): { id, imagen?, traduccion }.
import { estado, esTutor } from '../nucleo/estado.js';
import { esc, local, barajar, aviso, errorAviso, modal, debounce } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { montarEscritorio } from '../nucleo/escritorio.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio, revisarInsigniasNuevas } from '../nucleo/componentes.js';

const SLUG = 'correo-secretos';
const VERSION = '1.0';
const ACENTO = '#FFD84D';
const LIMITE = 500;          // caracteres de un secreto anónimo
const POR_DIA = 3;           // secretos anónimos por persona y día
const BANCO = 'banco';       // #/d/correo-secretos/banco
const DEL_BANCO = 'banco-';  // item_id de una historia sobre un secreto del Banco
const CUADROS = 18;          // imágenes que pasan en la animación
const RUTA = `#/d/${SLUG}`;

const CAMINOS = [
  { n: 1, nombre: 'Primera frase', texto: 'Convierta la confesión del secreto en la primera frase de su historia y desarróllela de forma coherente con el tono y el estilo que alcance a percibir en su composición.' },
  { n: 2, nombre: 'Revelación final', texto: 'Convierta el secreto en la revelación final: que todas las acciones, los personajes y la trama desemboquen en esa frase, sin alteraciones.' },
  { n: 3, nombre: 'Secreto oculto', texto: 'Cree una historia en la que el secreto nunca se revele, pero en la que todos los indicios le permitan al lector saber qué oculta el narrador o alguno de los personajes.' },
];

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
// Descarga una imagen (y la decodifica) una sola vez; nunca falla: si no carga, sigue sin ella.
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

// «Así», con comillas angulares, salvo que el texto ya las traiga.
export function comillas(t) {
  const s = String(t || '').trim();
  return /^[«"“]/.test(s) ? s : `«${s}»`;
}

// ---------------------------------------------------------------------
// Datos de la sesión
// ---------------------------------------------------------------------
async function cargarBase() {
  const [idx, items, mias, vistos] = await Promise.all([
    leerIndice(),
    estado.api.contenidos(SLUG).catch(() => []),
    estado.api.entregas({ dinamica: SLUG, autor: estado.yo.id, incluirOcultas: true, archivo: 'incluir' }).catch(() => []),
    leerVistos(),
  ]);
  const secretos = items.map(c => {
    const imagen = c.datos.imagen || c.item_id;
    const medida = idx.imagenes[imagen];
    return medida ? { id: c.item_id, origen: 'postal', imagen, ancho: medida[0], alto: medida[1], traduccion: c.datos.traduccion } : null;
  }).filter(Boolean);
  return {
    secretos,
    sinImagen: items.length - secretos.length,
    sobres: Object.keys(idx.imagenes).filter(k => k.startsWith('sobre-')),
    // Para la animación sirve cualquier postal del banco de imágenes (pasan tan rápido que no se leen).
    postales: Object.keys(idx.imagenes).filter(k => k.startsWith('secreto-')),
    mias: new Map(mias.filter(e => e.autor === estado.yo.id && !e.borrada_en).map(e => [e.item_id, e])),
    vistos,
  };
}

// Secretos vistos: en este navegador y en la nube (se usa la unión), para no repetir hasta verlos todos.
const claveVistosLocal = () => `${SLUG}-vistos:${estado.yo.id}`;
async function leerVistos() {
  const loc = local(claveVistosLocal())?.ids || [];
  let nube = [];
  try { nube = (await estado.api.borrador(`${SLUG}:vistos`))?.ids || []; } catch { /* sin conexión */ }
  return new Set([...loc, ...nube]);
}
const guardarVistosNube = debounce(ids => { estado.api.guardarBorrador(`${SLUG}:vistos`, { ids }).catch(() => {}); }, 1200);
function marcarVisto(base, id) {
  base.vistos.add(id);
  const ids = [...base.vistos];
  local(claveVistosLocal(), { ids });
  guardarVistosNube(ids);
}
// Un secreto que no haya visto (ni sea el actual). Si ya vio todos, vuelve a empezar.
function elegir(base, actual = null) {
  const otros = base.secretos.filter(s => s.id !== actual);
  if (!otros.length) return base.secretos[0] || null;
  let libres = otros.filter(s => !base.vistos.has(s.id));
  if (!libres.length) {
    base.vistos = new Set(actual ? [actual] : []);
    libres = otros;
  }
  return libres[Math.floor(Math.random() * libres.length)];
}

// ---------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------
function navegacion(activa, pendientes = 0) {
  return `<nav class="cs-nav" aria-label="Correo de secretos">
    <a href="${RUTA}" class="${activa === 'correo' ? 'activo' : ''}">${icono('sobre', 17)}Correo</a>
    <a href="${RUTA}/${BANCO}" class="${activa === 'banco' ? 'activo' : ''}">${icono('candado', 17)}Banco de secretos${pendientes ? `<span class="cs-n" title="Secretos por revisar">${pendientes}</span>` : ''}</a>
  </nav>`;
}

function botonesContada(historia) {
  if (!historia) return '';
  return `<a class="btn btn-primario" href="#/entrega/${historia.id}">${icono('libro', 18)}${historia.archivada_en ? 'Ver mi historia (en su archivo)' : 'Ver mi historia'}</a>
    ${historia.archivada_en ? '' : `<a class="btn" href="#/editar/${historia.id}">${icono('lapiz', 18)}Editar</a>`}`;
}
const sello = () => `<span class="cs-sello">${icono('check', 15, { grosor: 2.4 })}Ya contó esta historia</span>`;

async function pendientesTutor() {
  if (!esTutor()) return { n: 0, lista: [] };
  try { return await estado.api.secretosPendientes(); } catch { return { n: 0, lista: [] }; }
}

// ---------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------
export default {
  slug: SLUG,
  nombre: 'Correo de secretos',
  version: VERSION,

  async abrir(cont, ctx) {
    const limpieza = [];
    const fin = () => limpieza.forEach(f => { try { f(); } catch { /* nada */ } });
    if (ctx.entrega) {
      const base = await cargarBase();
      escribir(cont, base, secretoDeEntrega(ctx.entrega), limpieza, ctx.entrega);
      return fin;
    }
    const q = ctx.query || {};
    const base = await cargarBase();
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    if (q.publicado) await despues(cont, base, q.publicado, limpieza);
    else if (id === BANCO) await banco(cont, base, limpieza);
    else if (id?.startsWith(DEL_BANCO)) await escribirDelBanco(cont, base, id, limpieza);
    else if (id && 'escribir' in q) {
      const s = base.secretos.find(x => x.id === id);
      if (!s) location.replace(RUTA);
      else if (base.mias.has(id)) location.replace(`#/entrega/${base.mias.get(id).id}`);
      else escribir(cont, base, s, limpieza);
    } else if (id && 'ver' in q) secreto(cont, base, base.secretos.find(x => x.id === id) || elegir(base), { animar: false }, limpieza);
    else if (id) sobre(cont, base, base.secretos.find(x => x.id === id) || null, limpieza);
    else if ('descubrir' in q) secreto(cont, base, elegir(base), { animar: true }, limpieza);
    else await portada(cont, base);
    return fin;
  },

  paquete: {
    plantilla: 'plantillas/correo-secretos.json',
    describir: d => {
      const t = String(d.traduccion || '').replace(/\s+/g, ' ');
      return `${d.imagen ? `${d.imagen} · ` : ''}${t.length > 90 ? t.slice(0, 88).trim() + '…' : t}`;
    },
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json) ? json : Array.isArray(json?.secretos) ? json.secretos : null;
      if (!lista || !lista.length) return { items, errores: ['El archivo debe tener una lista "secretos": [ … ] con al menos un secreto.'] };
      const vistos = new Set();
      const txt = v => (typeof v === 'string' ? v.trim() : '');
      lista.forEach((s, i) => {
        const id = txt(s?.id);
        const n = `Secreto ${i + 1}${id ? ` (${id})` : ''}`;
        if (!id) { errores.push(`Secreto ${i + 1}: falta "id".`); return; }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errores.push(`${n}: el id solo puede tener minúsculas sin tildes, números y guiones.`);
        else if (id === BANCO || id.startsWith(DEL_BANCO) || id.startsWith('sobre-')) errores.push(`${n}: el id no puede ser "${BANCO}" ni empezar con "${DEL_BANCO}" o "sobre-".`);
        else if (vistos.has(id)) errores.push(`${n}: el id está repetido.`);
        vistos.add(id);
        const imagen = txt(s?.imagen) || id;
        if (!/^[a-z0-9][a-z0-9-]*$/.test(imagen)) errores.push(`${n}: "imagen" es el nombre del archivo sin extensión (por ejemplo, "secreto-7").`);
        const traduccion = txt(s?.traduccion);
        if (!traduccion) errores.push(`${n}: falta "traduccion".`);
        else items.push({ item_id: id, datos: imagen === id ? { traduccion } : { imagen, traduccion } });
      });
      return { items, errores };
    },
    exportar(items) {
      return { secretos: items.map(i => ({ id: i.item_id, ...(i.datos.imagen ? { imagen: i.datos.imagen } : {}), traduccion: i.datos.traduccion })) };
    },
  },
};

// ---------------------------------------------------------------------
// Portada: la historia de PostSecret
// ---------------------------------------------------------------------
async function portada(cont, base) {
  const p = await pendientesTutor();
  cont.innerHTML = `
  <div class="contenedor cs" style="--acento:${ACENTO}">
    ${navegacion('correo', p.n)}
    <section class="cs-portada">
      <span class="cs-portada-sello">${icono('sobre', 34)}</span>
      <span class="rotulo">Correo de secretos</span>
      <h1 class="saludo">Un millón de secretos</h1>
      <div class="cs-portada-texto">
        <p>En el año 2004, Frank Warren distribuyó 3000 postales al azar en Washington D. C. Invitaba a los desconocidos que las recibían a compartir un secreto de cualquier índole. «Tu secreto puede ser un deseo, un remordimiento, un miedo, una traición, una confesión o una humillación de la infancia», decía la postal. La condición era que nunca lo hubieran compartido con nadie y que fuera verdad.</p>
        <p>Desde entonces, el proyecto <a href="https://postsecret.com/" target="_blank" rel="noopener">PostSecret</a> ha recibido más de un millón de secretos. Frases cortas, directas y personalizadas que funcionan como desahogo y provocación. Cada una de ellas con la claridad y la potencia suficientes para desembocar en grandes historias.</p>
      </div>
      <div class="fila cs-portada-acciones">
        <a class="btn btn-primario btn-grande" href="${RUTA}/${base.secretos.length ? encodeURIComponent(elegir(base)?.id || '') : ''}" ${base.secretos.length ? '' : 'aria-disabled="true"'}>${icono('sobre', 20)}Abrir Correo de secretos</a>
        <a class="btn btn-fantasma" href="${RUTA}/${BANCO}">${icono('candado', 18)}Banco de secretos</a>
      </div>
      ${!base.secretos.length ? `<p class="tenue">${esTutor() ? 'Todavía no hay secretos: suba el paquete en Panel › Contenido.' : 'El correo todavía está vacío. Vuelva pronto.'}</p>` : ''}
      ${esTutor() && base.sinImagen ? `<p class="tenue">${base.sinImagen === 1 ? 'Un secreto del contenido no tiene' : `${base.sinImagen} secretos del contenido no tienen`} imagen en <code>img/${SLUG}/</code> y no se muestra${base.sinImagen === 1 ? '' : 'n'}.</p>` : ''}
    </section>
  </div>`;
  // Las miniaturas y los sobres se adelantan mientras se lee la historia.
  base.sobres.forEach(s => precargar(urlImg(s)));
}

// ---------------------------------------------------------------------
// Sobre sellado
// ---------------------------------------------------------------------
function sobre(cont, base, objetivo, limpieza) {
  if (!base.secretos.length) { location.replace(RUTA); return; }
  const nombre = base.sobres.length ? base.sobres[Math.floor(Math.random() * base.sobres.length)] : null;
  const medida = nombre ? indice.imagenes[nombre] : null;
  cont.innerHTML = `
  <div class="contenedor cs" style="--acento:${ACENTO}">
    ${navegacion('correo')}
    <section class="cs-escena-sobre">
      ${nombre ? `<img class="cs-sobre" src="${urlImg(nombre)}" width="${medida[0]}" height="${medida[1]}" alt="Un sobre de correo sellado" fetchpriority="high">`
        : `<div class="cs-sobre cs-sobre-vacio">${icono('sobre', 90)}</div>`}
      <button type="button" class="btn btn-primario btn-grande" id="cs-descubrir">${icono('sobre', 20)}Descubrir secretos</button>
    </section>
  </div>`;
  // Mientras se mira el sobre, bajan las miniaturas de la animación y la postal elegida.
  const destino = objetivo || elegir(base);
  const tira = tiraDeCuadros(base, destino);
  tira.forEach(n => precargar(urlImg(n, true)));
  precargar(urlImg(destino.imagen));
  cont.querySelector('#cs-descubrir').addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    const im = cont.querySelector('.cs-sobre');
    if (!sinMovimiento()) { im?.classList.add('abrir'); await esperar(420); }
    secreto(cont, base, destino, { animar: true, tira }, limpieza);
  });
}

// Las postales que pasan en la animación: al azar, sin repetir seguidas, y al final la elegida.
function tiraDeCuadros(base, destino) {
  const pool = base.postales.filter(n => n !== destino.imagen);
  if (!pool.length) return [destino.imagen];
  let tira = [];
  while (tira.length < CUADROS - 1) tira = tira.concat(barajar(pool));
  return [...tira.slice(0, CUADROS - 1), destino.imagen];
}

// ---------------------------------------------------------------------
// Un secreto: imagen y traducción (con la animación que lo elige)
// ---------------------------------------------------------------------
function secreto(cont, base, s, { animar = true, tira = null } = {}, limpieza) {
  if (!s) { location.replace(RUTA); return; }
  let vivo = true;
  limpieza.push(() => { vivo = false; });
  history.replaceState(null, '', `${RUTA}/${encodeURIComponent(s.id)}?ver`);
  const horizontal = s.ancho / s.alto > 1.15;
  cont.innerHTML = `
  <div class="contenedor cs" style="--acento:${ACENTO}">
    ${navegacion('correo')}
    <section class="cs-secreto ${horizontal ? 'cs-horizontal' : 'cs-vertical'}">
      <figure class="cs-marco ${animar ? 'girando' : ''}">
        <img class="cs-postal" ${animar ? '' : `src="${urlImg(s.imagen)}"`} width="${s.ancho}" height="${s.alto}" alt="${animar ? '' : esc(`Postal: ${s.traduccion}`)}">
      </figure>
      <div class="cs-lado" aria-live="polite">
        ${animar ? '<p class="cs-eligiendo">Eligiendo un secreto…</p>' : ladoSecreto(base, s)}
      </div>
    </section>
  </div>`;
  const marco = cont.querySelector('.cs-marco');
  const img = cont.querySelector('.cs-postal');
  const mostrar = () => {
    if (!vivo) return;
    marco.classList.remove('girando', 'lento');
    marco.style.setProperty('--giro', '-1.5deg');
    img.src = urlImg(s.imagen);
    img.alt = `Postal: ${s.traduccion}`;
    cont.querySelector('.cs-lado').innerHTML = ladoSecreto(base, s);
    activarLado();
    marcarVisto(base, s.id);
  };
  const activarLado = () => {
    cont.querySelector('#cs-otro')?.addEventListener('click', () => secreto(cont, base, elegir(base, s.id), { animar: true }, limpieza));
    cont.querySelector('#cs-enviar')?.addEventListener('click', () => enviarSecreto());
  };
  if (!animar) { activarLado(); marcarVisto(base, s.id); return; }
  girar(img, marco, tira || tiraDeCuadros(base, s), s, () => vivo).then(mostrar);
}

function ladoSecreto(base, s) {
  const historia = base.mias.get(s.id);
  return `
    <span class="rotulo">Traducción</span>
    <p class="cs-traduccion">${esc(comillas(s.traduccion))}</p>
    ${historia ? sello() : ''}
    <div class="cs-acciones">
      ${historia ? botonesContada(historia)
        : `<a class="btn btn-primario" href="${RUTA}/${encodeURIComponent(s.id)}?escribir">${icono('pluma', 18)}Contar la historia de este secreto</a>`}
      <button type="button" class="btn" id="cs-otro">${icono('sobre', 18)}Descubrir otro secreto</button>
    </div>`;
}

// La animación: las postales pasan cada vez más despacio hasta detenerse en la elegida.
async function girar(img, marco, tira, s, sigue) {
  const grande = precargar(urlImg(s.imagen));
  if (sinMovimiento()) { await grande; return; }
  const n = tira.length;
  for (let i = 0; i < n && sigue(); i++) {
    const src = urlImg(tira[i], true);
    await Promise.race([precargar(src), esperar(120)]);
    img.src = src;
    marco.style.setProperty('--giro', `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg`);
    marco.classList.toggle('lento', i > n * 0.7);
    const t = i / (n - 1);
    await esperar(55 + 330 * t ** 2.3);
  }
  // Si la postal grande aún no llega, se espera un poco (no más de 4 s).
  await Promise.race([grande, esperar(4000)]);
}

// ---------------------------------------------------------------------
// Escribir la historia
// ---------------------------------------------------------------------
function secretoDeEntrega(e) {
  const d = e.datos || {};
  return { id: e.item_id, origen: d.origen || (e.item_id?.startsWith(DEL_BANCO) ? 'banco' : 'postal'), imagen: d.imagen || null, ancho: d.ancho, alto: d.alto, traduccion: d.traduccion || '' };
}

async function escribirDelBanco(cont, base, id, limpieza) {
  if (base.mias.has(id)) { location.replace(`#/entrega/${base.mias.get(id).id}`); return; }
  const lista = await estado.api.secretosBanco().catch(() => []);
  const b = lista.find(x => DEL_BANCO + x.id === id && x.estado === 'publicado');
  if (!b) {
    cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este secreto ya no está en el Banco', 'Puede que el tutor lo haya retirado.', `<a class="btn" href="${RUTA}/${BANCO}">Volver al Banco</a>`)}</div>`;
    return;
  }
  escribir(cont, base, { id, origen: 'banco', imagen: null, traduccion: b.texto }, limpieza);
}

function panelSecreto(s, camino) {
  return `<div class="cs-panel">
    <div class="cs-panel-cab">
      <span class="rotulo">${s.origen === 'banco' ? 'Secreto del Banco' : 'Correo de secretos'}</span>
      <span class="espaciador"></span>
      <button type="button" class="btn btn-fantasma btn-chico btn-icono" id="cs-plegar" aria-expanded="true" aria-label="Ocultar el panel" title="Ocultar el panel">${icono('izquierda', 18)}</button>
    </div>
    <button type="button" class="cs-pestana" id="cs-desplegar" aria-label="Mostrar el secreto y los caminos" title="Mostrar el secreto y los caminos">${icono('sobre', 20)}<span>Secreto</span></button>
    <div class="cs-panel-cuerpo">
      ${s.imagen ? `<figure class="cs-panel-postal"><img src="${urlImg(s.imagen)}" width="${s.ancho || ''}" height="${s.alto || ''}" alt="Postal: ${esc(s.traduccion)}" decoding="async"></figure>` : ''}
      <p class="cs-traduccion cs-traduccion-panel">${esc(comillas(s.traduccion))}</p>
      <h2 class="cs-panel-sub">Para contar la historia de este secreto, tiene varios caminos:</h2>
      <div class="cs-caminos" role="radiogroup" aria-label="Camino que tomó">
        ${CAMINOS.map(c => `<button type="button" class="cs-camino ${camino === c.n ? 'on' : ''}" role="radio" aria-checked="${camino === c.n}" data-camino="${c.n}">
          <b>${c.n}. ${esc(c.nombre)}</b><span>${esc(c.texto)}</span></button>`).join('')}
      </div>
      <p class="cs-nota">Marque el camino que tomó, si quiere: aparecerá junto a su historia.</p>
    </div>
  </div>`;
}

function escribir(cont, base, s, limpieza, editando = null) {
  const claveCamino = `${SLUG}-camino:${estado.yo.id}:${s.id}`;
  let camino = editando ? (editando.datos?.camino || null) : (local(claveCamino)?.camino || null);
  const es = montarEscritorio(cont, {
    acento: ACENTO,
    panelHTML: panelSecreto(s, camino),
    clave: `${SLUG}:${s.id}`,
    titulo: editando?.titulo || '',
    html: editando ? (editando.datos?.html || '') : '',
    editando: !!editando,
    textoBoton: editando ? 'Guardar cambios' : 'Publicar',
    placeholder: 'Escriba o pegue aquí su historia…',
    alPublicar: async d => {
      const vista = `<blockquote class="cs-epigrafe">${esc(comillas(s.traduccion))}</blockquote>${d.html}`;
      await publicarEntrega({
        dinamica: SLUG, item_id: s.id, titulo: d.titulo, texto: d.texto, vista, modulo_version: VERSION,
        datos: {
          origen: s.origen, imagen: s.imagen || null, ancho: s.ancho || null, alto: s.alto || null,
          traduccion: s.traduccion, camino: camino || null, html: d.html,
        },
      }, { entregaExistente: editando, irA: `${RUTA}?publicado=${encodeURIComponent(s.id)}` });
      local(claveCamino, null);
    },
  });
  limpieza.push(() => es.destruir());

  // Panel plegable (se recuerda en este navegador).
  const mesa = cont.querySelector('.escritorio');
  mesa.classList.add('cs-escritorio');
  const plegar = on => {
    mesa.classList.toggle('cs-plegado', on);
    cont.querySelector('#cs-plegar').setAttribute('aria-expanded', String(!on));
    local(`${SLUG}-plegado`, on || null);
  };
  plegar(!!local(`${SLUG}-plegado`));
  cont.querySelector('#cs-plegar').addEventListener('click', () => plegar(true));
  cont.querySelector('#cs-desplegar').addEventListener('click', () => plegar(false));

  // Camino (opcional): se marca y se desmarca.
  cont.querySelector('.cs-caminos').addEventListener('click', ev => {
    const b = ev.target.closest('[data-camino]');
    if (!b) return;
    const n = Number(b.dataset.camino);
    camino = camino === n ? null : n;
    cont.querySelectorAll('.cs-camino').forEach(x => {
      const on = Number(x.dataset.camino) === camino;
      x.classList.toggle('on', on);
      x.setAttribute('aria-checked', String(on));
    });
    if (!editando) local(claveCamino, camino ? { camino } : null);
  });
}

// ---------------------------------------------------------------------
// Después de publicar
// ---------------------------------------------------------------------
async function despues(cont, base, item, limpieza) {
  const historia = base.mias.get(item);
  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho cs" style="--acento:${ACENTO}">
    ${navegacion('correo')}
    <section class="cs-despues">
      <span class="cs-portada-sello">${icono('check', 34, { grosor: 2.2 })}</span>
      <h1 class="saludo">Su historia ya está en el muro</h1>
      <p>Puede descubrir otro secreto o, si quiere, dejar uno suyo en el correo.</p>
      <div class="cs-acciones cs-acciones-despues">
        <a class="btn btn-primario btn-grande" href="${RUTA}?descubrir">${icono('sobre', 20)}Descubrir otro secreto</a>
        <button type="button" class="btn btn-grande" id="cs-enviar">${icono('candado', 20)}Enviar un secreto anónimo</button>
        ${historia ? `<a class="btn btn-fantasma" href="#/entrega/${historia.id}">${icono('libro', 18)}Ver mi historia</a>` : ''}
      </div>
    </section>
  </div>`;
  cont.querySelector('#cs-enviar').addEventListener('click', () => enviarSecreto());
}

// ---------------------------------------------------------------------
// Enviar un secreto anónimo
// ---------------------------------------------------------------------
async function enviarSecreto(alEnviar) {
  let enviados = 0;
  try { enviados = await estado.api.secretosEnviadosHoy(); } catch { /* si falla, la base lo controla igual */ }
  const quedan = Math.max(0, POR_DIA - enviados);
  if (!quedan) {
    aviso(`Hoy ya envió ${POR_DIA} secretos. Mañana puede enviar otro.`);
    return;
  }
  const r = await modal({
    titulo: 'Enviar un secreto anónimo',
    ancho: 620,
    cuerpo: `
      <p class="cs-modal-texto">Escriba un secreto que nunca le haya contado a nadie: un deseo, un remordimiento, un miedo, una traición, una confesión o una humillación de la infancia.</p>
      <p class="cs-anonimo">${icono('candado', 18)}<span>Su nombre no se guarda con el secreto. Nadie en el taller, ni el tutor, puede ver quién lo escribió.</span></p>
      <div class="campo"><label for="cs-secreto" class="sr">Su secreto</label>
        <textarea class="area cs-area" id="cs-secreto" maxlength="${LIMITE}" rows="5" placeholder="Su secreto…"></textarea></div>
      <div class="cs-modal-pie"><span class="nota-campo">El tutor lo revisa antes de que aparezca en el Banco de secretos, sin saber de quién es. ${quedan === POR_DIA ? `Puede enviar hasta ${POR_DIA} al día.` : quedan === 1 ? 'Hoy puede enviar uno más.' : `Hoy puede enviar ${quedan} más.`}</span>
        <span class="contador" id="cs-cuenta">0 / ${LIMITE}</span></div>`,
    alAbrir: velo => {
      const ta = velo.querySelector('#cs-secreto');
      ta.addEventListener('input', () => { velo.querySelector('#cs-cuenta').textContent = `${ta.value.length} / ${LIMITE}`; });
    },
    acciones: [
      { texto: 'Cancelar', clase: 'btn-fantasma', valor: null },
      {
        texto: 'Enviar secreto', clase: 'btn-primario', accion: async velo => {
          const texto = velo.querySelector('#cs-secreto').value.trim();
          if (!texto) { aviso('Escriba su secreto antes de enviarlo.', 'error'); return false; }
          if (texto.length > LIMITE) { aviso(`El secreto admite máximo ${LIMITE} caracteres (el suyo tiene ${texto.length}).`, 'error'); return false; }
          try { await estado.api.enviarSecreto(texto); return true; } catch (e) { errorAviso(e); return false; }
        },
      },
    ],
  });
  if (r !== true) return;
  aviso('Su secreto quedó en el correo. Aparecerá en el Banco cuando el tutor lo revise.', 'exito', 5000);
  await revisarInsigniasNuevas();
  alEnviar?.();
}

// ---------------------------------------------------------------------
// Banco de secretos
// ---------------------------------------------------------------------
async function banco(cont, base, limpieza) {
  const [lista, p] = await Promise.all([estado.api.secretosBanco().catch(() => []), pendientesTutor()]);
  const publicados = lista.filter(x => x.estado === 'publicado');
  const ocultos = lista.filter(x => x.estado === 'oculto');
  const tarjeta = b => {
    const id = DEL_BANCO + b.id;
    const historia = base.mias.get(id);
    return `<article class="cs-carta">
      <p class="cs-carta-texto">${esc(comillas(b.texto))}</p>
      <div class="cs-carta-pie">
        ${historia ? sello() : ''}
        <div class="cs-acciones">
          ${historia ? botonesContada(historia) : `<a class="btn btn-chico btn-primario" href="${RUTA}/${encodeURIComponent(id)}">${icono('pluma', 16)}Contar la historia de este secreto</a>`}
          ${esTutor() ? `<button type="button" class="btn btn-chico btn-fantasma" data-moderar="${esc(b.id)}" data-estado="${b.estado === 'oculto' ? 'publicado' : 'oculto'}">${icono(b.estado === 'oculto' ? 'ojo' : 'ojoNo', 16)}${b.estado === 'oculto' ? 'Volver a publicar' : 'Ocultar'}</button>` : ''}
        </div>
      </div>
    </article>`;
  };
  const revision = !esTutor() ? '' : `
    <section class="cs-revision">
      <div class="fila"><h2 class="titulo-seccion">Por revisar</h2>${p.lista.length > 1 ? `<span class="espaciador"></span><button type="button" class="btn btn-chico btn-primario" id="cs-publicar-todos">${icono('check', 16)}Publicar todos</button>` : ''}</div>
      ${p.lista.length ? `<p class="tenue cs-nota-tutor">No hay forma de saber quién escribió cada uno: no se guarda el nombre ni la fecha, y aparecen en desorden.</p>
        <div class="cs-cartas">${p.lista.map(b => `<article class="cs-carta cs-carta-pendiente">
          <p class="cs-carta-texto">${esc(comillas(b.texto))}</p>
          <div class="cs-acciones">
            <button type="button" class="btn btn-chico btn-primario" data-moderar="${esc(b.id)}" data-estado="publicado">${icono('check', 16)}Publicar</button>
            <button type="button" class="btn btn-chico btn-fantasma" data-moderar="${esc(b.id)}" data-estado="descartado">${icono('x', 16)}Descartar</button>
          </div></article>`).join('')}</div>`
        : `<p class="tenue cs-nota-tutor">${p.n ? `${p.n === 1 ? 'Hay un secreto esperando' : `Hay ${p.n} secretos esperando`}. Aparecen aquí cuando sean al menos 3, para que no se pueda saber de quién es cada uno.` : 'No hay secretos por revisar.'}</p>`}
    </section>`;

  cont.innerHTML = `
  <div class="contenedor cs" style="--acento:${ACENTO}">
    ${navegacion('banco', p.n)}
    <section class="cs-banco-cab">
      <div>
        <h1 class="saludo">Banco de secretos</h1>
        <p class="tenue">Secretos del taller, sin nombre. Cualquiera puede contar su historia.</p>
      </div>
      <button type="button" class="btn btn-primario" id="cs-enviar">${icono('candado', 18)}Enviar un secreto anónimo</button>
    </section>
    ${revision}
    ${publicados.length ? `<div class="cs-cartas">${publicados.map(tarjeta).join('')}</div>`
      : vacio('Todavía no hay secretos en el Banco', 'Cuando alguien envíe uno y el tutor lo revise, aparecerá aquí.')}
    ${esTutor() && ocultos.length ? `<h2 class="titulo-seccion cs-titulo-ocultos">Ocultos</h2><p class="tenue">Solo usted los ve.</p><div class="cs-cartas cs-ocultos">${ocultos.map(tarjeta).join('')}</div>` : ''}
  </div>`;

  const recargar = () => banco(cont, base, limpieza);
  cont.querySelector('#cs-enviar').addEventListener('click', () => enviarSecreto(recargar));
  cont.querySelector('#cs-publicar-todos')?.addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    try {
      for (const b of p.lista) await estado.api.moderarSecreto(b.id, 'publicado');
      aviso('Secretos publicados en el Banco.', 'exito');
    } catch (e) { errorAviso(e); }
    recargar();
  });
  cont.querySelectorAll('[data-moderar]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await estado.api.moderarSecreto(b.dataset.moderar, b.dataset.estado);
      aviso({ publicado: 'Secreto publicado en el Banco.', descartado: 'Secreto descartado.', oculto: 'Secreto oculto.' }[b.dataset.estado] || 'Listo.', 'exito');
    } catch (e) { errorAviso(e); }
    recargar();
  }));
}

