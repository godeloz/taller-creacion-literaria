// Lectura crítica de un texto de consigna: se selecciona un fragmento y se comenta.
// Notas numeradas al margen, modos de lectura (Limpio, Mis notas, Todas, Tutor),
// «Coincido», respuestas a un nivel (con marca Autor/a), notas del tutor con tipo
// y visibilidad, devolución general, «Revisado» y PDF con comentarios.
// Nadie puede editar el texto: solo comentarlo.
import { estado, esTutor, soloTutor, soyVisible } from '../nucleo/estado.js';
import {
  esc, enlazar, sanitizar, parrafos, hace, fechaHora, aviso, errorAviso, confirmar, modal, local, copiar,
  abrirImprimible, $,
} from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { avatar, barraReacciones, activarReacciones, etiquetaSoloTutor, revisarInsigniasNuevas } from '../nucleo/componentes.js';
import { descargarTXT, imprimir } from '../nucleo/exportar.js';

export const TIPOS = {
  acierto: { nombre: 'Acierto', ico: 'check' },
  revisar: { nombre: 'Revisar', ico: 'lapiz' },
  pregunta: { nombre: 'Pregunta', ico: 'info' },
};
const MODOS_LECTURA = [['limpio', 'Limpio'], ['mias', 'Mis notas'], ['todas', 'Todas'], ['tutor', 'Tutor']];
const esDeTutor = c => c.perfil?.rol === 'tutor';

// ---------------------------------------------------------------------
// Posiciones en el texto: se cuentan los caracteres del texto tal como se ve
// (sin los números de las notas). Como el texto publicado no cambia, son estables.
// ---------------------------------------------------------------------
function nodosTexto(raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest('.lc-n') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const out = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
  return out;
}
function textoCompleto(raiz) { return nodosTexto(raiz).map(t => t.data).join(''); }
function posicion(raiz, nodo, off) {
  const r = document.createRange();
  r.setStart(raiz, 0);
  r.setEnd(nodo, off);
  let total = 0;
  for (const t of nodosTexto(raiz)) {
    if (t === nodo) return total + off;
    if (!r.intersectsNode(t)) break;
    total += t.data.length;
  }
  return total;
}

// Pinta las marcas sobre el texto base. lista: [{ id, inicio, fin, n, clase }]
function pintarMarcas(raiz, baseHTML, lista) {
  raiz.innerHTML = baseHTML;
  if (!lista.length) return;
  const cortes = [...new Set(lista.flatMap(x => [x.inicio, x.fin]))];
  let pos = 0;
  for (const t of nodosTexto(raiz)) {
    const L = t.data.length, ini = pos;
    cortes.filter(c => c > ini && c < ini + L).sort((a, b) => b - a).forEach(c => t.splitText(c - ini));
    pos += L;
  }
  pos = 0;
  for (const t of nodosTexto(raiz)) {
    const s = pos, f = pos + t.data.length;
    pos = f;
    if (!t.data.trim()) continue;
    const cubren = lista.filter(x => x.inicio < f && x.fin > s);
    if (!cubren.length) continue;
    const m = document.createElement('mark');
    const clases = new Set(['lc-marca']);
    cubren.forEach(x => (x.clase || '').split(' ').filter(Boolean).forEach(k => clases.add(k)));
    if (cubren.filter(x => !x.temporal).length > 1) clases.add('varias');
    m.className = [...clases].join(' ');
    m.dataset.ids = cubren.filter(x => !x.temporal).map(x => x.id).join(' ');
    t.replaceWith(m);
    m.appendChild(t);
  }
  for (const x of lista) {
    if (x.temporal || !x.n) continue;
    const ms = [...raiz.querySelectorAll('mark.lc-marca')].filter(m => m.dataset.ids.split(' ').includes(x.id));
    let ult = ms[ms.length - 1];
    if (!ult) continue;
    while (ult.nextSibling?.classList?.contains('lc-n')) ult = ult.nextSibling;   // varias notas que terminan en el mismo punto
    const sup = document.createElement('sup');
    sup.className = 'lc-n';
    sup.dataset.ids = x.id;
    sup.textContent = x.n;
    ult.after(sup);
  }
}

// Ubica el fragmento de una nota; si la posición no coincide con la cita, la busca.
function ubicar(completo, a) {
  if (!a) return null;
  if (completo.slice(a.inicio, a.fin) === a.cita) return { inicio: a.inicio, fin: a.fin };
  const i = completo.indexOf(a.cita);
  return i >= 0 ? { inicio: i, fin: i + a.cita.length } : null;
}

// ---------------------------------------------------------------------
export default async function lecturaCritica(cont, e) {
  const api = estado.api;
  const yo = estado.yo.id;
  const tutorYo = esTutor();
  const mia = e.autor === yo;
  const puedeDescargar = mia || tutorYo;

  const [consigna, vistoAntes, reacciones] = await Promise.all([
    api.consigna(e.item_id).catch(() => null),
    api.abrirLectura(e.id).catch(() => null),
    api.reacciones([e.id]).catch(() => []),
  ]);
  let revisado = mia || tutorYo ? (await api.revisiones([e.id]).catch(() => []))[0] || null : null;

  // Textos de la misma consigna: avance («ha comentado X de N») y siguiente texto.
  let recorrido = [], hechos = new Set();
  if (tutorYo) {
    recorrido = (await api.entregas({ dinamica: 'consignas', item_id: e.item_id, incluirOcultas: true }).catch(() => []))
      .filter(x => (x.grupo_id ?? x.perfil?.grupo_id) === (e.grupo_id ?? e.perfil?.grupo_id));
    hechos = new Set((await api.revisiones(recorrido.map(x => x.id)).catch(() => [])).map(r => r.entrega_id));
  } else if (!mia) {
    recorrido = (await api.entregas({ dinamica: 'consignas', item_id: e.item_id }).catch(() => [])).filter(x => x.autor !== yo);
    hechos = new Set(await api.comentadas(recorrido.map(x => x.id)).catch(() => []));
  }
  recorrido.sort((a, b) => a.creado.localeCompare(b.creado));

  const claveModo = `modo-lectura:${yo}`;
  let modo = !vistoAntes ? (mia ? 'todas' : 'limpio') : (local(claveModo) || 'todas');
  if (!MODOS_LECTURA.some(([m]) => m === modo)) modo = 'todas';

  let comentarios = [], coinc = [];
  const cargar = async () => {
    comentarios = await api.comentarios(e.id).catch(err => { errorAviso(err); return []; });
    coinc = await api.coincidencias(comentarios.map(c => c.id)).catch(() => []);
  };
  await cargar();

  const baseHTML = e.vista ? sanitizar(e.vista) : parrafos(e.texto);
  const etiquetaAutor = e.perfil?.nombre || 'Autor/a';

  cont.innerHTML = `
  <div class="contenedor lc">
    <div class="fila lc-arriba">
      <a class="btn btn-fantasma btn-chico" href="#/consignas/${encodeURIComponent(e.item_id)}">${icono('izquierda', 16)}Consigna</a>
      <span id="lc-avance"></span>
      <span class="espaciador"></span>
      ${puedeDescargar ? `<button class="btn btn-chico btn-fantasma" id="b-copiar">${icono('copiar', 16)}Copiar</button>
        <button class="btn btn-chico btn-fantasma" id="b-txt">${icono('descargar', 16)}.txt</button>
        <button class="btn btn-chico btn-fantasma" id="b-pdf">${icono('imprimir', 16)}PDF</button>
        <button class="btn btn-chico" id="b-pdf-notas">${icono('imprimir', 16)}PDF con comentarios</button>` : ''}
      ${tutorYo ? `<button class="btn btn-chico" id="b-ocultar">${icono(e.estado === 'oculta' ? 'ojo' : 'ojoNo', 16)}${e.estado === 'oculta' ? 'Mostrar' : 'Ocultar'}</button>
        <button class="btn btn-chico btn-peligro" id="b-borrar">${icono('basura', 16)}Borrar</button>` : ''}
    </div>
    <div class="lc-barra">
      <div class="conmutador" role="group" aria-label="Modo de lectura" id="lc-modos"></div>
      <span class="lc-ayuda tenue" id="lc-ayuda"></span>
      <span class="espaciador"></span>
      <span id="lc-nuevas"></span>
      <button class="btn btn-chico btn-fantasma lc-solo-tactil" id="lc-toques">${icono('lapiz', 15)}Marcar con toques</button>
      ${tutorYo ? `<button class="btn btn-chico" id="lc-revisado"></button>` : ''}
    </div>
    <div class="lc-rejilla">
      <div>
        <article class="hoja lc-hoja">
          <div class="hoja-cab">
            <a href="#/perfil/${e.autor}" style="display:flex;gap:12px;align-items:center;text-decoration:none">
              ${avatar(e.perfil, 44)}
              <div><div class="autor-nombre" style="font-size:17px">${esc(e.perfil?.nombre || '')}</div>
              <div class="autor-meta">${esc(fechaHora(e.creado))}${e.estado === 'oculta' ? ' · oculto para el grupo' : ''}</div>
              ${etiquetaSoloTutor(e.perfil) ? `<div style="margin-top:4px">${etiquetaSoloTutor(e.perfil)}</div>` : ''}</div>
            </a>
            <span class="espaciador"></span>
            <span id="lc-revisado-pill"></span>
          </div>
          ${e.titulo ? `<h1>${esc(e.titulo)}</h1>` : ''}
          ${consigna ? `<div class="consigna-ref"><b>Consigna</b>${esc(consigna.titulo)}<a class="enlace-respuestas" href="#/consignas/${encodeURIComponent(e.item_id)}">Ver los textos de esta consigna</a></div>` : ''}
          <div class="lectura lc-texto" id="lc-texto"></div>
          <div class="tenue" style="font-size:13px;margin-top:22px">${e.palabras} palabras · el texto no se puede editar, solo comentar</div>
        </article>
        <section id="lc-devolucion"></section>
        <div style="margin-top:18px" id="reacciones">${barraReacciones(e.id, reacciones)}</div>
        <section class="lc-generales" id="lc-generales"></section>
      </div>
      <aside class="lc-notas" id="lc-notas" aria-label="Notas sobre el texto"></aside>
    </div>
  </div>
  <button type="button" class="lc-comentar" id="lc-comentar" hidden>${icono('comentario', 18)}Comentar</button>
  <div class="lc-hoja-inf" id="lc-sheet" hidden></div>`;

  // En el menú, estos textos pertenecen a Consignas.
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('activo', a.dataset.ruta === 'consignas'));
  const textoEl = $('#lc-texto', cont);
  const notasEl = $('#lc-notas', cont);
  const sheet = $('#lc-sheet', cont);
  const botonComentar = $('#lc-comentar', cont);
  activarReacciones($('#reacciones', cont), reacciones);
  const angosto = () => matchMedia('(max-width: 960px)').matches;
  const tactil = () => matchMedia('(pointer: coarse)').matches;

  // ---------- qué se ve en cada modo ----------
  const raices = () => comentarios.filter(c => !c.padre_id);
  const respuestasDe = id => comentarios.filter(c => c.padre_id === id).sort((a, b) => a.creado.localeCompare(b.creado));
  const enModo = c => modo === 'todas' || (modo === 'mias' && c.autor === yo) || (modo === 'tutor' && esDeTutor(c));
  const devolucion = () => comentarios.find(c => c.tipo === 'devolucion' && !c.padre_id) || null;

  function notasVisibles(m = modo) {
    const antes = modo; modo = m;
    const completo = textoCompleto(Object.assign(document.createElement('div'), { innerHTML: baseHTML }));
    const lista = raices().filter(c => c.ancla && c.tipo !== 'devolucion' && m !== 'limpio' && enModo(c))
      .map(c => ({ c, pos: ubicar(completo, c.ancla) }))
      .sort((a, b) => (a.pos?.inicio ?? 1e9) - (b.pos?.inicio ?? 1e9) || (a.pos?.fin ?? 0) - (b.pos?.fin ?? 0) || a.c.creado.localeCompare(b.c.creado))
      .map((x, i) => ({ ...x, n: i + 1 }));
    modo = antes;
    return lista;
  }
  const claseNota = c => [esDeTutor(c) ? `de-tutor${c.tipo ? ' t-' + c.tipo : ''}` : '', c.autor === yo ? 'mia' : ''].join(' ');

  // ---------- tarjetas ----------
  function sellos(c) {
    return [
      esDeTutor(c) ? '<span class="sello-tutor">Tutor</span>' : '',
      c.autor === e.autor && !esDeTutor(c) ? '<span class="sello-autor">Autor/a</span>' : '',
      c.privado ? '<span class="sello-privado" title="Solo la ven el tutor y quien escribió el texto">Solo para el autor</span>' : '',
      !c.privado && soloTutor(c.perfil) ? etiquetaSoloTutor(c.perfil) : '',
    ].join('');
  }
  function respuestaHTML(r) {
    return `<div class="lc-respuesta" data-c="${r.id}">
      <div class="lc-nota-cab">${avatar(r.perfil, 22)}<b>${esc(r.autor === yo ? 'Usted' : r.perfil?.nombre || '')}</b>${sellos(r)}
        <span class="tenue lc-hace">${hace(r.creado)}${r.editado ? ' · editado' : ''}</span><span class="espaciador"></span>
        ${r.autor === yo || tutorYo ? `<button class="btn btn-fantasma btn-chico btn-icono" data-borrar="${r.id}" title="Borrar" aria-label="Borrar respuesta">${icono('basura', 14)}</button>` : ''}</div>
      <p>${enlazar(r.texto)}</p>
    </div>`;
  }
  function tarjetaNota(c, { n = null, devol = false } = {}) {
    const cs = coinc.filter(x => x.comentario_id === c.id);
    const yoCoincido = cs.some(x => x.usuario === yo);
    const nombres = cs.map(x => x.usuario === yo ? 'Usted' : estado.perfiles.find(p => p.id === x.usuario)?.nombre || '').filter(Boolean).join(', ');
    const resp = respuestasDe(c.id);
    const cita = c.ancla?.cita || '';
    return `<div class="lc-nota ${claseNota(c)} ${c.privado ? 'privada' : ''} ${devol ? 'lc-devol' : ''}" data-nota="${c.id}">
      <div class="lc-nota-cab">
        ${n ? `<span class="lc-num">${n}</span>` : ''}${avatar(c.perfil, 26)}
        <b>${esc(c.autor === yo ? 'Usted' : c.perfil?.nombre || '')}</b>${sellos(c)}
      </div>
      ${cita ? `<blockquote class="lc-cita" ${n ? `data-ir="${c.id}" title="Ver en el texto"` : ''}>«${esc(cita.length > 160 ? cita.slice(0, 157) + '…' : cita)}»</blockquote>` : ''}
      ${c.tipo && TIPOS[c.tipo] ? `<span class="lc-tipo t-${c.tipo}">${icono(TIPOS[c.tipo].ico, 13)}${TIPOS[c.tipo].nombre}</span>` : ''}
      <p class="lc-cuerpo">${enlazar(c.texto)}</p>
      <div class="lc-pie">
        <span class="tenue lc-hace">${hace(c.creado)}${c.editado ? ' · editado' : ''}</span>
        <span class="espaciador"></span>
        ${!devol && c.autor !== yo ? `<button class="lc-coincido ${yoCoincido ? 'on' : ''}" data-coincidir="${c.id}" aria-pressed="${yoCoincido}" title="${esc(nombres ? `Coinciden: ${nombres}` : 'Marque si está de acuerdo con esta nota')}">${icono('check', 14)}Coincido${cs.length ? ` · ${cs.length}` : ''}</button>`
          : cs.length ? `<span class="lc-coincido-n" title="${esc(nombres)}">${icono('check', 14)}${cs.length} ${cs.length === 1 ? 'coincide' : 'coinciden'}</span>` : ''}
        ${devol && tutorYo && c.autor === yo ? `<button class="lc-accion" data-editar-devol="${c.id}">${icono('lapiz', 14)}Editar</button>` : ''}
        <button class="lc-accion" data-responder="${c.id}">${icono('comentario', 14)}Responder</button>
        ${c.autor === yo || tutorYo ? `<button class="btn btn-fantasma btn-chico btn-icono" data-borrar="${c.id}" title="Borrar" aria-label="Borrar nota">${icono('basura', 15)}</button>` : ''}
      </div>
      ${resp.length ? `<div class="lc-respuestas">${resp.map(respuestaHTML).join('')}</div>` : ''}
      <form class="lc-form-resp" data-padre="${c.id}" hidden>
        <textarea class="area" rows="2" placeholder="Escriba su respuesta…" aria-label="Respuesta"></textarea>
        <div class="fila"><span class="espaciador"></span>
          <button type="button" class="btn btn-fantasma btn-chico" data-cancelar>Cancelar</button>
          <button type="submit" class="btn btn-primario btn-chico">${icono('enviar', 15)}Responder</button></div>
      </form>
    </div>`;
  }

  // ---------- pintar todo ----------
  let temporal = null;   // primer toque en «Marcar con toques»
  function pintar() {
    const lista = notasVisibles();
    const marcas = lista.filter(x => x.pos).map(x => ({ id: x.c.id, inicio: x.pos.inicio, fin: x.pos.fin, n: x.n, clase: claseNota(x.c) }));
    if (temporal) marcas.push({ id: '_t', ...temporal, temporal: true, clase: 'temporal' });
    pintarMarcas(textoEl, baseHTML, marcas);

    const todas = raices().filter(c => c.ancla && c.tipo !== 'devolucion');
    const cuenta = m => m === 'limpio' ? '' : m === 'todas' ? todas.length : todas.filter(c => (m === 'mias' ? c.autor === yo : esDeTutor(c))).length;
    $('#lc-modos', cont).innerHTML = MODOS_LECTURA.map(([m, t]) =>
      `<button type="button" data-modo="${m}" class="${m === modo ? 'on' : ''}" aria-pressed="${m === modo}">${t}${cuenta(m) !== '' ? ` <span class="lc-cuenta">${cuenta(m)}</span>` : ''}</button>`).join('');
    $('#lc-ayuda', cont).textContent = modo === 'limpio'
      ? (todas.length ? `Lectura sin comentarios. Hay ${todas.length} ${todas.length === 1 ? 'nota oculta' : 'notas ocultas'}.` : 'Lectura sin comentarios.')
      : 'Seleccione palabras, frases o párrafos para comentarlos.';

    notasEl.innerHTML = modo === 'limpio'
      ? `<div class="lc-vacio"><b>Modo Limpio</b><p>Lea el texto sin marcas ni comentarios. Cuando quiera, seleccione un fragmento para dejar su nota.</p></div>`
      : `<div class="lc-notas-cab"><span class="rotulo">Notas${lista.length ? ` · ${lista.length}` : ''}</span></div>
        ${lista.length ? lista.map(x => tarjetaNota(x.c, { n: x.n })).join('')
          : `<div class="lc-vacio"><p>${modo === 'mias' ? 'Todavía no ha dejado notas en este texto.' : modo === 'tutor' ? 'El tutor todavía no ha dejado notas.' : 'Todavía no hay notas. Seleccione un fragmento del texto para comentarlo.'}</p></div>`}`;

    // devolución general
    const dv = devolucion();
    const verDevol = dv && modo !== 'limpio' && (modo !== 'mias' || dv.autor === yo);
    $('#lc-devolucion', cont).innerHTML = verDevol
      ? `<div class="lc-devolucion"><div class="rotulo">${icono('pluma', 14)} Devolución del tutor</div>${tarjetaNota(dv, { devol: true })}</div>`
      : tutorYo && !dv ? `<button class="btn btn-chico lc-btn-devol" id="lc-nueva-devol">${icono('pluma', 16)}Escribir devolución general</button>` : '';

    // comentarios generales
    const generales = raices().filter(c => !c.ancla && c.tipo !== 'devolucion');
    const vg = generales.filter(enModo);
    $('#lc-generales', cont).innerHTML = modo === 'limpio' ? '' : `
      <div class="fila" style="margin-top:28px"><h3 class="titulo-seccion" style="font-size:26px">Comentarios generales</h3><span class="tenue">${vg.length || ''}</span></div>
      <p class="tenue" style="margin:4px 0 12px;font-size:14.5px">Sobre el texto completo. Para comentar una parte, selecciónela en el texto.</p>
      ${vg.map(c => tarjetaNota(c)).join('')}
      <form class="form-comentario lc-form-general">
        <label class="sr" for="lc-general">Comentario general</label>
        <textarea id="lc-general" placeholder="Un comentario sobre el texto completo…" required></textarea>
        ${!soyVisible() ? '<p class="tenue" style="margin:6px 0 0;font-size:14px">Por su modo de participación, sus comentarios solo los ve el tutor.</p>' : ''}
        <div class="fila">
          ${tutorYo ? '<label class="fila" style="gap:6px;font-size:14px;font-weight:600"><input type="checkbox" name="privado"> Solo para el autor</label>' : ''}
          <span class="espaciador"></span>
          <button class="btn btn-primario btn-chico" type="submit">${icono('enviar', 16)}Comentar</button>
        </div>
      </form>`;

    // revisado
    if (tutorYo) {
      const b = $('#lc-revisado', cont);
      b.className = `btn btn-chico ${revisado ? 'btn-lima' : ''}`;
      b.innerHTML = `${icono('check', 15)}${revisado ? 'Revisado' : 'Marcar como revisado'}`;
      b.title = revisado ? `Revisado ${fechaHora(revisado.creado)}. Toque para quitar la marca.` : 'Marque el texto cuando termine de revisarlo';
    }
    $('#lc-revisado-pill', cont).innerHTML = revisado ? `<span class="pill-consigna hecha" title="${esc(fechaHora(revisado.creado))}">${icono('check', 14)}Revisado por el tutor</span>` : '';
    pintarAvance();
  }

  function pintarAvance() {
    const el = $('#lc-avance', cont);
    if (!recorrido.length) { el.innerHTML = ''; return; }
    const i = recorrido.findIndex(x => x.id === e.id);
    const resto = [...recorrido.slice(i + 1), ...recorrido.slice(0, Math.max(i, 0))].filter(x => x.id !== e.id);
    const sig = resto.find(x => !hechos.has(x.id)) || resto[0];
    const n = recorrido.filter(x => hechos.has(x.id)).length;
    el.innerHTML = `<span class="lc-avance">${tutorYo ? `${n} de ${recorrido.length} revisados en el grupo` : `Ha comentado ${n} de ${recorrido.length} ${recorrido.length === 1 ? 'texto' : 'textos'}`}</span>
      ${sig ? `<a class="btn btn-chico" href="#/entrega/${sig.id}">${tutorYo && !hechos.has(sig.id) ? 'Siguiente sin revisar' : 'Siguiente texto'}${icono('derecha', 15)}</a>` : ''}`;
  }

  let silencio = 0;   // no avisar de «notas nuevas» por lo que uno mismo acaba de hacer
  async function recargar() { silencio = Date.now() + 2500; await cargar(); pintar(); }
  pintar();

  // ---------- selección de un fragmento ----------
  function rangoActual() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!textoEl.contains(r.startContainer) || !textoEl.contains(r.endContainer)) return null;
    let inicio = posicion(textoEl, r.startContainer, r.startOffset);
    let fin = posicion(textoEl, r.endContainer, r.endOffset);
    const completo = textoCompleto(textoEl);
    while (inicio < fin && /\s/.test(completo[inicio])) inicio++;
    while (fin > inicio && /\s/.test(completo[fin - 1])) fin--;
    if (fin <= inicio) return null;
    return { inicio, fin, cita: completo.slice(inicio, fin), rect: r.getBoundingClientRect() };
  }
  let pendiente = null;
  function ubicarBoton() {
    if (modoToques) return;
    pendiente = rangoActual();
    if (!pendiente) { botonComentar.hidden = true; return; }
    botonComentar.hidden = false;
    if (tactil() || angosto()) {
      botonComentar.classList.add('abajo');
      botonComentar.style.top = ''; botonComentar.style.left = '';
    } else {
      botonComentar.classList.remove('abajo');
      const r = pendiente.rect;
      const ancho = botonComentar.offsetWidth || 130;
      botonComentar.style.top = `${Math.min(innerHeight - 56, r.bottom + 10)}px`;
      botonComentar.style.left = `${Math.max(12, Math.min(innerWidth - ancho - 12, r.left + r.width / 2 - ancho / 2))}px`;
    }
  }
  let tSel = null;
  const alCambiarSeleccion = () => { clearTimeout(tSel); tSel = setTimeout(ubicarBoton, 140); };
  document.addEventListener('selectionchange', alCambiarSeleccion);
  const alDesplazar = () => { if (!botonComentar.hidden && !botonComentar.classList.contains('abajo')) ubicarBoton(); };
  window.addEventListener('scroll', alDesplazar, { passive: true });
  botonComentar.addEventListener('mousedown', ev => ev.preventDefault());
  botonComentar.addEventListener('click', () => {
    const f = pendiente || rangoActual();
    botonComentar.hidden = true;
    if (f) componer(f);
  });

  // ---------- marcar con toques (pantallas táctiles) ----------
  let modoToques = false;
  function puntoA(x, y) {
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { nodo: p.offsetNode, off: p.offset }; }
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { nodo: r.startContainer, off: r.startOffset }; }
    return null;
  }
  function palabraEn(x, y) {
    const p = puntoA(x, y);
    if (!p || !textoEl.contains(p.nodo) || p.nodo.nodeType !== 3) return null;
    const g = posicion(textoEl, p.nodo, p.off);
    const t = textoCompleto(textoEl);
    const letra = /[\p{L}\p{N}’'-]/u;
    let i = Math.min(g, t.length - 1), f = g;
    if (!letra.test(t[i] || '') && letra.test(t[i - 1] || '')) i--;
    if (!letra.test(t[i] || '')) return null;
    while (i > 0 && letra.test(t[i - 1])) i--;
    f = i;
    while (f < t.length && letra.test(t[f])) f++;
    return { inicio: i, fin: f };
  }
  function activarToques(on) {
    modoToques = on;
    temporal = null;
    textoEl.classList.toggle('tocando', on);
    $('#lc-toques', cont).classList.toggle('btn-lima', on);
    $('#lc-toques', cont).innerHTML = `${icono(on ? 'x' : 'lapiz', 15)}${on ? 'Cancelar' : 'Marcar con toques'}`;
    if (on) aviso('Toque la primera palabra del fragmento.');
    pintar();
  }
  $('#lc-toques', cont).addEventListener('click', () => activarToques(!modoToques));
  textoEl.addEventListener('click', ev => {
    if (modoToques) {
      ev.preventDefault();
      const w = palabraEn(ev.clientX, ev.clientY);
      if (!w) return;
      if (!temporal) {
        temporal = w;
        pintar();
        aviso('Ahora toque la última palabra.');
        return;
      }
      const inicio = Math.min(temporal.inicio, w.inicio), fin = Math.max(temporal.fin, w.fin);
      const t = textoCompleto(textoEl);
      activarToques(false);
      componer({ inicio, fin, cita: t.slice(inicio, fin) });
      return;
    }
    const m = ev.target.closest('mark.lc-marca, sup.lc-n');
    if (!m || !getSelection().isCollapsed || !m.dataset.ids) return;
    abrirNotas(m.dataset.ids.split(' '));
  });

  // ---------- nueva nota sobre un fragmento ----------
  async function componer(f) {
    const cuerpo = `
      <blockquote class="lc-cita" style="margin:0 0 14px">«${esc(f.cita.length > 400 ? f.cita.slice(0, 397) + '…' : f.cita)}»</blockquote>
      ${tutorYo ? `<div class="lc-tipos" role="radiogroup" aria-label="Tipo de nota">
          <label><input type="radio" name="tipo" value="" checked> Sin tipo</label>
          ${Object.entries(TIPOS).map(([k, t]) => `<label class="t-${k}"><input type="radio" name="tipo" value="${k}"> ${t.nombre}</label>`).join('')}
        </div>` : ''}
      <div class="campo" style="margin-bottom:8px"><label for="lc-nueva">Su nota</label>
        <textarea class="area" id="lc-nueva" placeholder="Qué le produce este fragmento, qué funciona, qué preguntaría…"></textarea></div>
      ${tutorYo ? '<label class="fila" style="gap:8px;font-size:14px;font-weight:600"><input type="checkbox" id="lc-privada"> Solo para el autor (el grupo no la ve)</label>'
        : !soyVisible() ? '<p class="tenue" style="font-size:14px;margin:0">Por su modo de participación, su nota solo la verán el tutor y usted.</p>'
        : '<p class="tenue" style="font-size:14px;margin:0">La verán quien escribió el texto, sus compañeros y el tutor.</p>'}`;
    const ok = await modal({
      titulo: 'Comentar fragmento', cuerpo, ancho: 560,
      acciones: [
        { texto: 'Cancelar', clase: 'btn-fantasma', valor: null },
        {
          texto: 'Guardar nota', clase: 'btn-primario', accion: async v => {
            const texto = v.querySelector('#lc-nueva').value.trim();
            if (!texto) { aviso('Escriba su nota antes de guardarla.', 'error'); return false; }
            try {
              silencio = Date.now() + 2500;
              await api.comentar(e.id, texto, !!v.querySelector('#lc-privada')?.checked, {
                ancla: { inicio: f.inicio, fin: f.fin, cita: f.cita },
                tipo: v.querySelector('[name=tipo]:checked')?.value || null,
              });
              return true;
            } catch (err) { errorAviso(err); return false; }
          },
        },
      ],
    });
    getSelection().removeAllRanges();
    botonComentar.hidden = true;
    if (ok !== true) { temporal = null; pintar(); return; }
    if (!tutorYo) hechos.add(e.id);
    if (modo === 'limpio' || modo === 'tutor') { modo = tutorYo && modo === 'tutor' ? 'tutor' : 'mias'; local(claveModo, modo); }
    await recargar();
    aviso('Nota guardada.', 'exito');
    revisarInsigniasNuevas();
  }

  // ---------- notas de una marca ----------
  function abrirNotas(ids) {
    const visibles = notasVisibles();
    const sel = visibles.filter(x => ids.includes(x.c.id));
    if (!sel.length) return;
    textoEl.querySelectorAll('mark.activa').forEach(m => m.classList.remove('activa'));
    textoEl.querySelectorAll('mark.lc-marca').forEach(m => { if (m.dataset.ids.split(' ').some(id => ids.includes(id))) m.classList.add('activa'); });
    if (angosto()) {
      sheet.innerHTML = `<div class="lc-sheet-cab"><span class="rotulo">${sel.length === 1 ? 'Nota' : `${sel.length} notas`}</span><span class="espaciador"></span>
        <button class="btn btn-fantasma btn-chico btn-icono" data-cerrar-sheet aria-label="Cerrar">${icono('x', 18)}</button></div>
        ${sel.map(x => tarjetaNota(x.c, { n: x.n })).join('')}`;
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add('ver'));
    } else {
      const t = notasEl.querySelector(`[data-nota="${ids.find(id => notasEl.querySelector(`[data-nota="${id}"]`))}"]`);
      if (!t) return;
      t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      notasEl.querySelectorAll('.lc-nota.resalta').forEach(x => x.classList.remove('resalta'));
      t.classList.add('resalta');
      setTimeout(() => t.classList.remove('resalta'), 1600);
    }
  }
  function cerrarSheet() {
    sheet.classList.remove('ver');
    setTimeout(() => { sheet.hidden = true; sheet.innerHTML = ''; }, 180);
    textoEl.querySelectorAll('mark.activa').forEach(m => m.classList.remove('activa'));
  }
  function irAlTexto(id) {
    const m = [...textoEl.querySelectorAll('mark.lc-marca')].find(x => x.dataset.ids.split(' ').includes(id));
    if (!m) return;
    if (!sheet.hidden) cerrarSheet();
    m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    textoEl.querySelectorAll('mark.activa').forEach(x => x.classList.remove('activa'));
    textoEl.querySelectorAll('mark.lc-marca').forEach(x => { if (x.dataset.ids.split(' ').includes(id)) x.classList.add('activa'); });
    setTimeout(() => textoEl.querySelectorAll('mark.activa').forEach(x => x.classList.remove('activa')), 1800);
  }

  // ---------- acciones (delegadas en la vista y en la hoja inferior) ----------
  async function alClic(ev) {
    const t = ev.target;
    const bModo = t.closest('[data-modo]');
    if (bModo) { modo = bModo.dataset.modo; local(claveModo, modo); if (!sheet.hidden) cerrarSheet(); pintar(); return; }
    if (t.closest('[data-cerrar-sheet]')) { cerrarSheet(); return; }
    const ir = t.closest('[data-ir]');
    if (ir) { irAlTexto(ir.dataset.ir); return; }
    const bCo = t.closest('[data-coincidir]');
    if (bCo) {
      const id = bCo.dataset.coincidir;
      const poner = !coinc.some(x => x.comentario_id === id && x.usuario === yo);
      try {
        await api.coincidir(id, poner);
        coinc = poner ? [...coinc, { comentario_id: id, usuario: yo }] : coinc.filter(x => !(x.comentario_id === id && x.usuario === yo));
        refrescarTarjeta(id);
      } catch (err) { errorAviso(err); }
      return;
    }
    const bRe = t.closest('[data-responder]');
    if (bRe) {
      const caja = bRe.closest('.lc-nota');
      const f = caja.querySelector('.lc-form-resp');
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector('textarea').focus();
      return;
    }
    if (t.closest('[data-cancelar]')) { t.closest('form').hidden = true; return; }
    const bBo = t.closest('[data-borrar]');
    if (bBo) {
      const c = comentarios.find(x => x.id === bBo.dataset.borrar);
      const n = c ? respuestasDe(c.id).length : 0;
      if (!(await confirmar(n ? `¿Borrar esta nota y sus ${n === 1 ? 'una respuesta' : `${n} respuestas`}?` : '¿Borrar este comentario?', { si: 'Borrar', peligro: true }))) return;
      try { await api.borrarComentario(bBo.dataset.borrar); if (!sheet.hidden) cerrarSheet(); await recargar(); } catch (err) { errorAviso(err); }
      return;
    }
    if (t.closest('#lc-nueva-devol')) { editarDevolucion(null); return; }
    const bEd = t.closest('[data-editar-devol]');
    if (bEd) { editarDevolucion(comentarios.find(x => x.id === bEd.dataset.editarDevol)); return; }
  }
  async function alEnviar(ev) {
    const f = ev.target;
    if (f.matches('.lc-form-resp')) {
      ev.preventDefault();
      const texto = f.querySelector('textarea').value.trim();
      if (!texto) return;
      f.querySelector('[type=submit]').disabled = true;
      try {
        silencio = Date.now() + 2500;
        await api.comentar(e.id, texto, false, { padre_id: f.dataset.padre });
        if (!tutorYo) hechos.add(e.id);
        const abierta = !sheet.hidden ? [...sheet.querySelectorAll('[data-nota]')].map(x => x.dataset.nota) : null;
        await recargar();
        if (abierta) abrirNotas(abierta);
        revisarInsigniasNuevas();
      } catch (err) { errorAviso(err); f.querySelector('[type=submit]').disabled = false; }
    } else if (f.matches('.lc-form-general')) {
      ev.preventDefault();
      const texto = f.querySelector('textarea').value.trim();
      if (!texto) return;
      f.querySelector('[type=submit]').disabled = true;
      try {
        silencio = Date.now() + 2500;
        await api.comentar(e.id, texto, !!f.querySelector('[name=privado]')?.checked);
        if (!tutorYo) hechos.add(e.id);
        await recargar();
        revisarInsigniasNuevas();
      } catch (err) { errorAviso(err); f.querySelector('[type=submit]').disabled = false; }
    }
  }
  cont.addEventListener('click', alClic);
  cont.addEventListener('submit', alEnviar);

  function refrescarTarjeta(id) {
    const c = comentarios.find(x => x.id === id);
    if (!c) return;
    cont.querySelectorAll(`[data-nota="${id}"]`).forEach(viejo => {
      const n = viejo.querySelector('.lc-num')?.textContent;
      const nuevo = document.createElement('div');
      nuevo.innerHTML = tarjetaNota(c, { n: n ? Number(n) : null, devol: c.tipo === 'devolucion' });
      viejo.replaceWith(nuevo.firstElementChild);
    });
  }

  async function editarDevolucion(dv) {
    const r = await modal({
      titulo: dv ? 'Editar devolución' : 'Devolución general',
      cuerpo: `<p class="tenue" style="margin-top:0">Una mirada de conjunto al texto: lo que logra, lo que conviene trabajar en la próxima versión.</p>
        <div class="campo"><label for="lc-devol">Devolución</label><textarea class="area" id="lc-devol" style="min-height:180px">${esc(dv?.texto || '')}</textarea></div>
        <label class="fila" style="gap:8px;font-size:14px;font-weight:600"><input type="checkbox" id="lc-devol-priv" ${!dv || dv.privado ? 'checked' : ''}> Solo para el autor (el grupo no la ve)</label>`,
      ancho: 620,
      acciones: [
        { texto: 'Cancelar', clase: 'btn-fantasma', valor: null },
        {
          texto: dv ? 'Guardar cambios' : 'Guardar devolución', clase: 'btn-primario', accion: async v => {
            const texto = v.querySelector('#lc-devol').value.trim();
            const privado = v.querySelector('#lc-devol-priv').checked;
            if (!texto) { aviso('Escriba la devolución.', 'error'); return false; }
            try {
              silencio = Date.now() + 2500;
              if (dv) await api.editarComentario(dv.id, { texto, privado });
              else await api.comentar(e.id, texto, privado, { tipo: 'devolucion' });
              return true;
            } catch (err) { errorAviso(err); return false; }
          },
        },
      ],
    });
    if (r !== true) return;
    if (modo === 'limpio' || modo === 'mias') { modo = 'todas'; local(claveModo, modo); }
    await recargar();
    aviso('Devolución guardada.', 'exito');
  }

  // ---------- tutor ----------
  $('#lc-revisado', cont)?.addEventListener('click', async () => {
    try {
      await api.marcarRevisado(e.id, !revisado);
      revisado = revisado ? null : { entrega_id: e.id, creado: new Date().toISOString() };
      if (revisado) hechos.add(e.id); else hechos.delete(e.id);
      pintar();
      aviso(revisado ? 'Texto marcado como revisado.' : 'Se quitó la marca de revisado.', 'exito');
    } catch (err) { errorAviso(err); }
  });
  $('#b-ocultar', cont)?.addEventListener('click', async () => {
    try {
      await api.cambiarEstadoEntrega(e.id, e.estado === 'oculta' ? 'publicada' : 'oculta');
      aviso(e.estado === 'oculta' ? 'El texto vuelve a estar visible.' : 'El texto quedó oculto para el grupo.');
      location.reload();
    } catch (err) { errorAviso(err); }
  });
  $('#b-borrar', cont)?.addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar este texto de forma definitiva? No se puede recuperar.', { si: 'Borrar', peligro: true }))) return;
    try { await api.borrarEntrega(e.id); aviso('Texto borrado.'); location.hash = `#/consignas/${encodeURIComponent(e.item_id)}`; } catch (err) { errorAviso(err); }
  });

  // ---------- descargas ----------
  const nombre = `${e.perfil?.nombre || 'texto'} ${e.titulo || consigna?.titulo || ''}`;
  $('#b-copiar', cont)?.addEventListener('click', () => copiar([e.titulo, e.texto].filter(Boolean).join('\n\n')));
  $('#b-txt', cont)?.addEventListener('click', () => descargarTXT([e], nombre));
  $('#b-pdf', cont)?.addEventListener('click', () => imprimir([e], e.titulo || consigna?.titulo || 'Texto', e.perfil?.nombre || ''));
  $('#b-pdf-notas', cont)?.addEventListener('click', () => {
    const lista = notasVisibles('todas');
    const tmp = document.createElement('div');
    pintarMarcas(tmp, baseHTML, lista.filter(x => x.pos).map(x => ({ id: x.c.id, inicio: x.pos.inicio, fin: x.pos.fin, n: x.n })));
    tmp.querySelectorAll('mark').forEach(m => m.setAttribute('style', 'background:#FFF1A8'));
    tmp.querySelectorAll('sup').forEach(s => { s.setAttribute('style', 'font-family:Manrope,sans-serif;font-size:8pt;font-weight:700;color:#5B3DF5'); s.textContent = `[${s.textContent}]`; });
    const quien = c => `${esc(c.perfil?.nombre || '')}${esDeTutor(c) ? ' (tutor)' : c.autor === e.autor ? ' (autor/a)' : ''}`;
    const resp = c => respuestasDe(c.id).map(r => `<div style="margin:4px 0 0 18px;font-size:10.5pt"><b>${quien(r)}:</b> ${esc(r.texto)}</div>`).join('');
    const dv = devolucion();
    const generales = raices().filter(c => !c.ancla && c.tipo !== 'devolucion');
    const cuerpo = `<h1>${esc(e.titulo || 'Sin título')}</h1>
      <div class="meta">${esc(e.perfil?.nombre || '')} · ${esc(consigna?.titulo || 'Consigna')} · ${esc(fechaHora(e.creado))}</div>
      <div style="margin-top:18px">${tmp.innerHTML}</div>
      ${lista.length ? `<h2>Notas sobre el texto</h2><ol style="padding-left:1.2em">${lista.map(x => `<li style="margin-bottom:10px;font-size:11pt">
        <i>«${esc(x.c.ancla?.cita || '')}»</i><br><b>${quien(x.c)}</b>${x.c.tipo && TIPOS[x.c.tipo] ? ` · ${TIPOS[x.c.tipo].nombre}` : ''}${x.c.privado ? ' · solo para el autor' : ''}: ${esc(x.c.texto)}${resp(x.c)}</li>`).join('')}</ol>` : ''}
      ${dv ? `<h2>Devolución del tutor</h2><p>${esc(dv.texto).replace(/\n/g, '<br>')}</p>${resp(dv)}` : ''}
      ${generales.length ? `<h2>Comentarios generales</h2>${generales.map(c => `<p style="font-size:11pt"><b>${quien(c)}:</b> ${esc(c.texto)}</p>${resp(c)}`).join('')}` : ''}`;
    abrirImprimible(`${e.titulo || consigna?.titulo || 'Texto'} · comentarios`, cuerpo);
  });

  // ---------- notas nuevas mientras se lee ----------
  const avisarNuevas = () => {
    const n = $('#lc-nuevas', cont);
    if (!n || n.innerHTML) return;
    n.innerHTML = `<button class="btn btn-chico btn-coral">${icono('reiniciar', 15)}Hay notas nuevas · actualizar</button>`;
    n.querySelector('button').onclick = async () => { n.innerHTML = ''; await recargar(); };
  };
  const quitar1 = api.suscribir('comentarios', p => {
    if (Date.now() < silencio || p.new?.autor === yo) return;
    if (p.new?.entrega_id && p.new.entrega_id !== e.id) return;
    avisarNuevas();
  });

  return () => {
    document.removeEventListener('selectionchange', alCambiarSeleccion);
    window.removeEventListener('scroll', alDesplazar);
    clearTimeout(tSel);
    quitar1?.();
  };
}
