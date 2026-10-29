// Módulo: S+7 (Oulipo). Reescribir un cuento cambiando palabras por otras de la
// misma clase gramatical, tomadas del diccionario. La ★ marca la regla clásica de
// Jean Lescure: la entrada que está siete lugares después.
// Hay varios textos para elegir (cuentos y poemas). En los poemas, cada estrofa es un
// elemento de «parrafos» y los versos van separados por saltos de línea.
import { estado, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, debounce, confirmar, aviso, errorAviso, hace } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const ACENTO = '#FF8A00';
const CLASES = { sust: 'sustantivo', adj: 'adjetivo', verb: 'verbo', adv: 'adverbio', otra: 'otra clase' };
const COLOR = { sust: '#2F6F8F', adj: '#3F7D43', verb: '#A5443B', adv: '#7C4FA0', otra: '#8A8272' };
const RE_PALABRA = /[\p{L}\p{M}]+/gu;
const DICC_ID = '_diccionario';

function ajustarMayuscula(original, nueva) {
  return /^\p{Lu}/u.test(original) ? nueva.charAt(0).toUpperCase() + nueva.slice(1) : nueva;
}

// Corta cada párrafo (o estrofa) en palabras y separadores. Las claves «párrafo:posición»
// son las que guardan las entregas en datos.cambios: este corte no debe cambiar.
export function tokenizar(lista, POS = {}) {
  return (lista || []).map((p, ip) => {
    const partes = [];
    let ultimo = 0, m;
    RE_PALABRA.lastIndex = 0;
    while ((m = RE_PALABRA.exec(p)) !== null) {
      if (m.index > ultimo) partes.push({ t: 'sep', texto: p.slice(ultimo, m.index) });
      partes.push({ t: 'pal', texto: m[0], clave: `${ip}:${partes.length}`, clase: POS[m[0].toLowerCase()] || 'otra' });
      ultimo = RE_PALABRA.lastIndex;
    }
    if (ultimo < p.length) partes.push({ t: 'sep', texto: p.slice(ultimo) });
    return partes;
  });
}

export const esPoema = datos => datos?.forma === 'poema';
// Separadores con salto de verso.
const sep = texto => esc(texto).replace(/\n/g, '<br>');

// Original y reescritura lado a lado. En los poemas, verso por verso; en la prosa, párrafo
// por párrafo. En pantallas angostas, cada línea del original queda encima de la nueva.
export function comparacionHTML(lista, cambios = {}, poema = false) {
  const pinta = (toks, nueva) => toks.map(x => x.t === 'sep' ? esc(x.texto)
    : cambios[x.clave] === undefined ? esc(x.texto)
    : nueva ? `<span class="v-cambiada">${esc(cambios[x.clave])}</span>` : `<span class="s7-quitada">${esc(x.texto)}</span>`).join('');
  const filas = [];
  tokenizar(lista).forEach((toks, ip) => {
    let lineas = [toks];
    if (poema) {
      let linea = [];
      lineas = [linea];
      for (const x of toks) {
        if (x.t !== 'sep' || !x.texto.includes('\n')) { linea.push(x); continue; }
        x.texto.split('\n').forEach((tr, k) => {
          if (k) { linea = []; lineas.push(linea); }
          if (tr) linea.push({ t: 'sep', texto: tr });
        });
      }
      if (ip) filas.push('<div class="s7-comp-hueco"></div>');
    }
    for (const l of lineas) filas.push(`<div class="s7-comp-o">${pinta(l, false) || '&nbsp;'}</div><div class="s7-comp-n">${pinta(l, true) || '&nbsp;'}</div>`);
  });
  return `<div class="s7-comp${poema ? ' s7-comp-poema' : ''}">
    <div class="rotulo s7-comp-cab">Original</div><div class="rotulo s7-comp-cab">Reescritura</div>
    <p class="s7-comp-nota">En cada pareja, arriba el original (en gris) y abajo la reescritura.</p>
    ${filas.join('')}</div>`;
}

export default {
  slug: 's7',
  nombre: 'S+7',
  version: '1.1',

  async abrir(cont, ctx) {
    const todos = await estado.api.contenidos('s7');
    const dicItem = todos.find(c => c.item_id === DICC_ID) || await estado.api.contenido('s7', DICC_ID).catch(() => null);
    const textos = todos.filter(c => c.item_id !== DICC_ID);
    const editando = ctx.entrega || null;
    let texto;
    if (editando) {
      // Desde la versión 1.1, la entrega guarda el texto original con que se escribió.
      const guardado = editando.datos?.original?.parrafos ? editando.datos.original : null;
      texto = textos.find(t => t.item_id === editando.item_id) || await estado.api.contenido('s7', editando.item_id).catch(() => null);
      if (!texto && !guardado) { cont.innerHTML = `<div class="contenedor">${vacio('El texto original ya no está disponible')}</div>`; return; }
      if (guardado) texto = { item_id: editando.item_id, datos: { ...(texto?.datos || {}), ...guardado, clases: texto?.datos?.clases || {} } };
    } else {
      if (!textos.length) { cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No hay textos cargados', 'El tutor todavía no ha cargado un texto para esta dinámica.')}</div>`; return; }
      const id = ctx.item_id || ctx.sesion?.item_id;
      if (!id && textos.length > 1) return portada(cont, textos);
      texto = textos.find(t => t.item_id === id);
      if (!texto) { location.replace(textos.length > 1 ? '#/d/s7' : `#/d/s7/${encodeURIComponent(textos[0].item_id)}`); return; }
    }
    const T = texto.datos;
    const POEMA = esPoema(T);
    const QUE = POEMA ? 'poema' : 'cuento';
    const POS = Object.fromEntries(Object.entries(T.clases || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const DICC = {};
    for (const k of ['sust', 'adj', 'verb', 'adv']) {
      DICC[k] = [...new Set((dicItem?.datos?.[k] || []).map(w => String(w).toLowerCase().trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    }
    const clave = `s7:${texto.item_id}`;
    const claveLocal = `borrador:${estado.yo.id}:${clave}`;

    // ---------- tokens ----------
    const parrafos = tokenizar(T.parrafos, POS);
    const TOK = {};
    parrafos.flat().filter(x => x.t === 'pal').forEach(x => { TOK[x.clave] = x; });
    const totalSignificativas = Object.values(TOK).filter(x => x.clase !== 'otra').length;

    // ---------- estado ----------
    let cambios = {};
    let titulo = '';
    let seleccion = null;
    let claseVista = null;
    let notaBorrador = '';
    let publicado = false;
    if (editando) {
      cambios = { ...(editando.datos?.cambios || {}) };
      titulo = editando.titulo || '';
    } else {
      const loc = local(claveLocal);
      let nube = null;
      try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
      const b = [loc, nube].filter(Boolean).sort((a, c) => (c._actualizado || '').localeCompare(a._actualizado || ''))[0];
      if (b?.cambios && Object.keys(b.cambios).length) { cambios = b.cambios; titulo = b.titulo || ''; notaBorrador = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`; }
    }
    for (const k of Object.keys(cambios)) if (!TOK[k]) delete cambios[k];
    const actual = k => cambios[k] ?? TOK[k].texto;

    // ---------- estructura ----------
    cont.innerHTML = `
    <div class="contenedor" style="max-width:1400px">
      <div class="escritorio" style="--acento:${ACENTO}">
        <aside class="consigna-panel" id="panel"></aside>
        <section class="mesa">
          <div class="mesa-barra">
            ${textos.length > 1 && !editando && !ctx.sesion?.item_id ? `<a class="btn btn-chico btn-fantasma s7-otro" href="#/d/s7" title="Elegir otro texto">${icono('izquierda', 16)}Textos</a>` : ''}
            <span class="rotulo s7-rotulo">${esc(T.titulo)}${T.autor ? ` · ${esc(T.autor)}` : ''}</span>
            <span class="espaciador"></span>
            <span class="guardado" id="guardado">${esc(notaBorrador)}</span>
            <button type="button" class="herr" id="comparar" title="Comparar con el original" aria-label="Comparar con el original">${icono('libro', 18)}</button>
          </div>
          <div class="hoja-escribir">
            <input class="titulo-escribir" id="titulo" placeholder="Título de la nueva versión (opcional)" maxlength="140" value="${esc(titulo)}">
            <div class="s7-cuento${POEMA ? ' s7-poema' : ''}" id="cuento"></div>
            <div id="comparacion" class="oculto"></div>
          </div>
          <div class="mesa-pie">
            <span class="contador" id="contador"></span>
            <span class="espaciador"></span>
            <button type="button" class="btn btn-primario" id="publicar">${icono(editando ? 'check' : 'enviar', 18)}${editando ? 'Guardar cambios' : 'Publicar versión'}</button>
          </div>
        </section>
      </div>
    </div>`;
    const $ = s => cont.querySelector(s);
    const elGuardado = $('#guardado');

    const guardarNube = debounce(async () => {
      if (editando) return;
      try { await estado.api.guardarBorrador(clave, { titulo, cambios }); elGuardado.textContent = 'Guardado'; }
      catch { elGuardado.textContent = 'Guardado en este dispositivo'; }
    }, 3000);
    function cambio() {
      if (editando) { elGuardado.textContent = 'Cambios sin guardar'; return; }
      local(claveLocal, { titulo, cambios, _actualizado: new Date().toISOString() });
      elGuardado.textContent = 'Guardando…';
      guardarNube();
    }

    // ---------- diccionario ----------
    // Posición de la palabra original en la lista; la ★ queda 7 entradas después.
    function vecindario(lista, palabra) {
      if (!lista.length) return { items: [], mas7: null };
      const base = palabra.toLowerCase();
      let idx = lista.findIndex(w => w.localeCompare(base, 'es') >= 0);
      if (idx === -1) idx = lista.length;
      const exacta = lista[idx] === base;
      const mas7 = lista[((exacta ? idx + 7 : idx + 6) % lista.length + lista.length) % lista.length];
      const inicio = Math.max(0, Math.min(idx - 4, lista.length - 14));
      const items = lista.slice(inicio, inicio + 14);
      if (!items.includes(mas7)) items.push(mas7);
      return { items, mas7 };
    }

    function pintarPanel() {
      const cab = `
        <span class="rotulo">S+7 · Oulipo</span>
        <h1>Reescriba el ${QUE} con el diccionario</h1>
        <div class="consigna-texto"><p>Haga clic en una palabra del ${QUE} y cámbiela por otra de la misma clase gramatical, tomada cerca de ella en el diccionario. La opción marcada con <strong>★</strong> está exactamente siete entradas después: es la regla clásica de Jean Lescure. Ajuste el género, el número o la conjugación para que la frase se sostenga.</p></div>`;
      let herramientas;
      if (!seleccion) {
        herramientas = '<p class="tenue" style="font-size:14.5px">Elija una palabra del ${QUE} para ver el diccionario.</p>';
      } else {
        const tok = TOK[seleccion];
        const clase = claseVista || tok.clase;
        let sug = '';
        if (clase !== 'otra') {
          const { items, mas7 } = vecindario(DICC[clase], tok.texto);
          sug = items.length ? `<div class="sugerencias">${items.map(w => `<button type="button" class="sug${w === mas7 ? ' mas7' : ''}" data-palabra="${esc(w)}">${w === mas7 ? '★ ' : ''}${esc(w)}</button>`).join('')}</div>`
            : '<p class="tenue" style="font-size:14px">El diccionario no tiene palabras de esta clase.</p>';
        } else {
          sug = '<p class="tenue" style="font-size:14px">Es una palabra de clase cerrada (artículo, preposición, pronombre…). No tiene lista, pero puede escribir un reemplazo.</p>';
        }
        herramientas = `
          <div class="fila" style="gap:8px;margin-bottom:8px"><span class="clase-pill" style="background:${COLOR[clase]}">${CLASES[clase]}</span>
            <span style="font-size:14.5px">Original: <b>${esc(tok.texto)}</b>${cambios[seleccion] ? ` · ahora: <b>${esc(cambios[seleccion])}</b>` : ''}</span></div>
          <label class="etiqueta" for="s7-clase" style="font-size:13px">Clase a explorar</label>
          <select class="selector" id="s7-clase" style="min-height:38px;margin:4px 0 10px">${['sust', 'adj', 'verb', 'adv'].map(k => `<option value="${k}" ${k === clase ? 'selected' : ''}>${CLASES[k]}</option>`).join('')}</select>
          ${sug}
          <label class="etiqueta" for="s7-libre" style="font-size:13px">Ajústela o escriba la suya</label>
          <div class="fila" style="margin-top:4px;flex-wrap:nowrap"><input class="entrada" id="s7-libre" value="${esc(actual(seleccion))}" style="min-height:40px"><button type="button" class="btn btn-primario btn-chico" id="s7-aplicar">Aplicar</button></div>
          <div class="fila" style="margin-top:10px"><button type="button" class="btn btn-fantasma btn-chico" id="s7-restaurar">${icono('reiniciar', 15)}Restaurar original</button></div>`;
      }
      $('#panel').innerHTML = cab + `<div class="consigna-extra" style="color:var(--tinta)">${herramientas}</div>
        <div class="fila" style="margin-top:14px"><button type="button" class="btn btn-chico" id="b-auto" title="Cambia cada sustantivo aún sin tocar por el que está siete entradas después">${icono('chispa', 16)}S+7 automático a los sustantivos</button></div>
        <div class="leyenda-s7">${Object.entries(CLASES).map(([k, n]) => `<span><i style="background:${COLOR[k]}"></i>${n}</span>`).join('')}</div>`;
    }

    function pintarCuento() {
      $('#cuento').innerHTML = parrafos.map(ps => `<p>${ps.map(x => {
        if (x.t === 'sep') return sep(x.texto);
        const cambiada = cambios[x.clave] !== undefined;
        return `<span class="pal pal-${x.clase}${cambiada ? ' cambiada' : ''}${seleccion === x.clave ? ' elegida' : ''}" data-k="${x.clave}" ${cambiada ? `title="Original: ${esc(x.texto)}"` : ''}>${esc(actual(x.clave))}</span>`;
      }).join('')}</p>`).join('');
      const n = Object.keys(cambios).length;
      $('#contador').textContent = `${n} ${n === 1 ? 'palabra cambiada' : 'palabras cambiadas'} · ${totalSignificativas} con significado propio`;
      $('#publicar').disabled = n === 0;
      if (!$('#comparacion').classList.contains('oculto')) pintarComparacion();
    }

    function pintarComparacion() {
      $('#comparacion').innerHTML = comparacionHTML(T.parrafos, cambios, POEMA);
    }

    function aplicar(k, palabra) {
      const tok = TOK[k];
      const p = palabra.trim();
      if (!p) return;
      const final = ajustarMayuscula(tok.texto, p);
      if (final === tok.texto) delete cambios[k]; else cambios[k] = final;
      pintarCuento(); pintarPanel(); cambio();
    }

    // ---------- eventos ----------
    $('#cuento').addEventListener('click', ev => {
      const s = ev.target.closest('.pal');
      if (!s) return;
      seleccion = s.dataset.k;
      claseVista = null;
      pintarCuento(); pintarPanel();
      if (window.innerWidth <= 960) $('#panel').scrollTop = $('#panel').scrollHeight;
    });
    $('#panel').addEventListener('click', ev => {
      const sug = ev.target.closest('.sug');
      if (sug && seleccion) { aplicar(seleccion, sug.dataset.palabra); return; }
      if (ev.target.closest('#s7-aplicar') && seleccion) { aplicar(seleccion, $('#s7-libre').value); return; }
      if (ev.target.closest('#s7-restaurar') && seleccion) { delete cambios[seleccion]; pintarCuento(); pintarPanel(); cambio(); return; }
      if (ev.target.closest('#b-auto')) {
        let n = 0;
        for (const [k, tok] of Object.entries(TOK)) {
          if (tok.clase !== 'sust' || cambios[k] !== undefined) continue;
          const { mas7 } = vecindario(DICC.sust, tok.texto);
          if (mas7) { cambios[k] = ajustarMayuscula(tok.texto, mas7); n++; }
        }
        aviso(n ? `Se aplicó S+7 a ${n} sustantivos. Ahora ajuste lo que haga falta.` : 'No quedaban sustantivos sin cambiar.');
        pintarCuento(); pintarPanel(); cambio();
      }
    });
    $('#panel').addEventListener('change', ev => { if (ev.target.id === 's7-clase') { claseVista = ev.target.value; pintarPanel(); } });
    $('#panel').addEventListener('keydown', ev => { if (ev.target.id === 's7-libre' && ev.key === 'Enter' && seleccion) aplicar(seleccion, ev.target.value); });
    $('#titulo').addEventListener('input', ev => { titulo = ev.target.value; cambio(); });
    $('#comparar').addEventListener('click', ev => {
      const c = $('#comparacion');
      c.classList.toggle('oculto');
      $('#cuento').classList.toggle('oculto', !c.classList.contains('oculto'));
      ev.currentTarget.classList.toggle('on', !c.classList.contains('oculto'));
      if (!c.classList.contains('oculto')) pintarComparacion();
    });

    // ---------- publicar ----------
    $('#publicar').addEventListener('click', async () => {
      const n = Object.keys(cambios).length;
      if (!n) return;
      const credito = `Reescritura S+7 de «${T.titulo}»${T.autor ? `, de ${T.autor}` : ''}.`;
      const vista = `<div class="v-s7${POEMA ? ' v-s7-poema' : ''}">${parrafos.map(ps => `<p>${ps.map(x => x.t === 'sep' ? sep(x.texto)
        : cambios[x.clave] !== undefined ? `<span class="v-cambiada">${esc(actual(x.clave))}</span>` : esc(x.texto)).join('')}</p>`).join('')}</div><p class="v-credito">${esc(credito)}</p>`;
      const plano = parrafos.map(ps => ps.map(x => x.t === 'sep' ? x.texto : actual(x.clave)).join('')).join('\n\n') + `\n\n${credito}`;
      if (!editando && !(await confirmar(avisoPublicar('su versión', 'la'), { si: 'Publicar', no: 'Seguir cambiando' }))) return;
      const b = $('#publicar');
      b.disabled = true;
      try {
        await publicarEntrega({ dinamica: 's7', item_id: texto.item_id, titulo: titulo.trim(), texto: plano, vista, modulo_version: '1.1',
          datos: { cambios, n_cambios: n, original: { titulo: T.titulo || '', autor: T.autor || '', forma: QUE, parrafos: T.parrafos } } }, { entregaExistente: editando });
        guardarNube.cancelar();
        publicado = true;
        if (!editando) { local(claveLocal, null); estado.api.borrarBorrador(clave).catch(() => {}); }
      } catch (e) { errorAviso(e); b.disabled = false; }
    });

    pintarPanel();
    pintarCuento();
    // Al salir se guarda el borrador (no después de publicar: ya no es borrador).
    return () => { if (!editando && !publicado && Object.keys(cambios).length) guardarNube.ahora(); };
  },

  paquete: {
    plantilla: 'plantillas/s7.json',
    describir: d => d.tipo === 'diccionario'
      ? `Diccionario · ${['sust', 'adj', 'verb', 'adv'].reduce((s, k) => s + (d[k]?.length || 0), 0)} palabras`
      : `${d.titulo} · ${d.autor || ''}${esPoema(d) ? ' · poema' : ''}`,
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json?.textos) ? json.textos : [];
      if (!lista.length && !json?.diccionario) return { items, errores: ['El archivo debe tener una lista "textos": [ … ], un "diccionario": { … }, o ambos.'] };
      const vistos = new Set();
      const validas = new Set(['sust', 'adj', 'verb', 'adv', 'otra']);
      lista.forEach((t, i) => {
        const n = `Texto ${i + 1}`;
        const id = String(t?.id || '').trim();
        if (!id) errores.push(`${n}: falta "id".`);
        else if (id.startsWith('_')) errores.push(`${n}: el id no puede empezar con "_".`);
        else if (vistos.has(id)) errores.push(`${n}: el id "${id}" está repetido.`);
        vistos.add(id);
        if (!String(t?.titulo || '').trim()) errores.push(`${n} (${id}): falta "titulo".`);
        // Cuento: "parrafos" (lista de textos). Poema: "estrofas" (lista de estrofas, cada una una lista de versos).
        const limpio = p => p.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/^\n+|\n+$/g, '');
        const conEstrofas = Array.isArray(t?.estrofas);
        const par = (conEstrofas
          ? t.estrofas.map(e => (Array.isArray(e) ? e.filter(v => typeof v === 'string').join('\n') : typeof e === 'string' ? e : ''))
          : Array.isArray(t?.parrafos) ? t.parrafos.filter(p => typeof p === 'string') : []).map(limpio).filter(p => p.trim());
        if (!par.length) errores.push(`${n} (${id}): necesita "parrafos" (un cuento) o "estrofas" (un poema).`);
        if (t?.forma !== undefined && !['cuento', 'poema'].includes(t.forma)) errores.push(`${n} (${id}): "forma" debe ser "cuento" o "poema".`);
        const forma = t?.forma === 'poema' || (t?.forma === undefined && conEstrofas) ? 'poema' : 'cuento';
        const clases = {};
        for (const [k, v] of Object.entries(t?.clases || {})) {
          if (!validas.has(v)) errores.push(`${n} (${id}): la palabra "${k}" tiene una clase desconocida ("${v}"). Use sust, adj, verb o adv.`);
          else if (v !== 'otra') clases[k.toLowerCase()] = v;
        }
        items.push({ item_id: id, datos: { titulo: String(t?.titulo || '').trim(), autor: String(t?.autor || '').trim(), forma, parrafos: par, clases } });
      });
      if (json?.diccionario) {
        const d = json.diccionario;
        const datos = { tipo: 'diccionario' };
        for (const k of ['sust', 'adj', 'verb', 'adv']) {
          if (d[k] !== undefined && !Array.isArray(d[k])) errores.push(`Diccionario: "${k}" debe ser una lista de palabras.`);
          datos[k] = (d[k] || []).filter(w => typeof w === 'string' && w.trim()).map(w => w.trim());
        }
        items.push({ item_id: DICC_ID, datos });
      }
      return { items, errores };
    },
  },
};

// ---------------------------------------------------------------------
// Portada: elegir el texto (cuando hay más de uno)
// ---------------------------------------------------------------------
async function portada(cont, textos) {
  const yo = estado.yo.id;
  const [mias, nubes] = await Promise.all([
    estado.api.entregas({ dinamica: 's7', autor: yo }).catch(() => []),
    Promise.all(textos.map(t => estado.api.borrador(`s7:${t.item_id}`).catch(() => null))),
  ]);
  const publicadas = {};
  for (const e of mias) if (e.autor === yo) publicadas[e.item_id] = (publicadas[e.item_id] || 0) + 1;
  const empezado = (t, k) => [local(`borrador:${yo}:s7:${t.item_id}`), nubes[k]].some(b => b?.cambios && Object.keys(b.cambios).length);

  const tarjeta = (t, k) => {
    const d = t.datos;
    const poema = esPoema(d);
    const palabras = (d.parrafos || []).join(' ').match(RE_PALABRA)?.length || 0;
    const primero = d.parrafos?.[0] || '';
    let extracto = poema ? primero.split('\n').slice(0, 3).join('\n') : primero.replace(/\s+/g, ' ');
    if (!poema && extracto.length > 170) extracto = extracto.slice(0, 168) + '…';
    else if (poema && (primero.split('\n').length > 3 || d.parrafos.length > 1)) extracto += ' …';
    const n = publicadas[t.item_id] || 0;
    const curso = empezado(t, k);
    const href = `#/d/s7/${encodeURIComponent(t.item_id)}`;
    return `<article class="fm-tarjeta s7-tarjeta">
      <a class="fm-tarjeta-enlace" href="${href}">
        <span class="rotulo">${poema ? 'Poema' : 'Cuento'} · ${palabras} palabras</span>
        <span class="fm-tarjeta-titulo">${esc(d.titulo)}</span>
        ${d.autor ? `<span class="s7-tarjeta-autor">${esc(d.autor)}</span>` : ''}
        <span class="fm-tarjeta-extracto${poema ? ' s7-extracto-poema' : ''}">${esc(extracto)}</span>
      </a>
      <div class="fm-tarjeta-pie">
        ${n ? `<span class="estado-pill si">${icono('check', 13)}${n === 1 ? 'Publicada' : `${n} versiones`}</span>` : ''}
        ${curso ? '<span class="estado-pill">En curso</span>' : ''}
        <span class="espaciador"></span>
        <a class="btn btn-chico btn-fantasma" href="#/muro?dinamica=s7&item=${encodeURIComponent(t.item_id)}">Versiones</a>
        <a class="btn btn-chico btn-primario" href="${href}">${curso ? 'Seguir' : n ? 'Otra versión' : 'Reescribir'}</a>
      </div>
    </article>`;
  };

  cont.innerHTML = `
  <div class="contenedor s7-portada" style="--acento:${ACENTO}">
    <span class="rotulo">S+7 · Oulipo</span>
    <h1 class="saludo">Elija un texto</h1>
    <p class="s7-portada-intro">Cambie sus palabras por otras de la misma clase, tomadas del diccionario: un sustantivo por un sustantivo, un verbo por un verbo. La <strong>★</strong> marca la que está siete entradas después.</p>
    <div class="fm-rejilla">${textos.map(tarjeta).join('')}</div>
  </div>`;
}
