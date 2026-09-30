// Módulo: S+7 (Oulipo). Reescribir un cuento cambiando palabras por otras de la
// misma clase gramatical, tomadas del diccionario. La ★ marca la regla clásica de
// Jean Lescure: la entrada que está siete lugares después.
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

export default {
  slug: 's7',
  nombre: 'S+7',
  version: '1.0',

  async abrir(cont, ctx) {
    const todos = await estado.api.contenidos('s7');
    const dicItem = todos.find(c => c.item_id === DICC_ID) || await estado.api.contenido('s7', DICC_ID).catch(() => null);
    const textos = todos.filter(c => c.item_id !== DICC_ID);
    const editando = ctx.entrega || null;
    let texto;
    if (editando) {
      texto = textos.find(t => t.item_id === editando.item_id) || await estado.api.contenido('s7', editando.item_id);
      if (!texto) { cont.innerHTML = `<div class="contenedor">${vacio('El texto original ya no está disponible')}</div>`; return; }
    } else {
      if (!textos.length) { cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No hay textos cargados', 'El tutor todavía no ha cargado un texto para esta dinámica.')}</div>`; return; }
      const id = ctx.item_id || ctx.sesion?.item_id;
      texto = textos.find(t => t.item_id === id);
      if (!texto) { location.replace(`#/d/s7/${encodeURIComponent(textos[0].item_id)}`); return; }
    }
    const T = texto.datos;
    const POS = Object.fromEntries(Object.entries(T.clases || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const DICC = {};
    for (const k of ['sust', 'adj', 'verb', 'adv']) {
      DICC[k] = [...new Set((dicItem?.datos?.[k] || []).map(w => String(w).toLowerCase().trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    }
    const clave = `s7:${texto.item_id}`;
    const claveLocal = `borrador:${estado.yo.id}:${clave}`;

    // ---------- tokens ----------
    const parrafos = (T.parrafos || []).map((p, ip) => {
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
    const TOK = {};
    parrafos.flat().filter(x => x.t === 'pal').forEach(x => { TOK[x.clave] = x; });
    const totalSignificativas = Object.values(TOK).filter(x => x.clase !== 'otra').length;

    // ---------- estado ----------
    let cambios = {};
    let titulo = '';
    let seleccion = null;
    let claseVista = null;
    let notaBorrador = '';
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
            ${textos.length > 1 && !editando ? `<label class="sr" for="elegir-texto">Texto</label><select class="selector" id="elegir-texto" style="width:auto;min-height:36px;font-size:14px">${textos.map(t => `<option value="${esc(t.item_id)}" ${t.item_id === texto.item_id ? 'selected' : ''}>${esc(t.datos.titulo)}</option>`).join('')}</select>` : `<span class="rotulo">${esc(T.titulo)} · ${esc(T.autor || '')}</span>`}
            <span class="espaciador"></span>
            <span class="guardado" id="guardado">${esc(notaBorrador)}</span>
            <button type="button" class="herr" id="comparar" title="Comparar con el original" aria-label="Comparar con el original">${icono('libro', 18)}</button>
          </div>
          <div class="hoja-escribir">
            <input class="titulo-escribir" id="titulo" placeholder="Título de la nueva versión (opcional)" maxlength="140" value="${esc(titulo)}">
            <div class="s7-cuento" id="cuento"></div>
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
        <h1>Reescriba el cuento con el diccionario</h1>
        <div class="consigna-texto"><p>Haga clic en una palabra del cuento y cámbiela por otra de la misma clase gramatical, tomada cerca de ella en el diccionario. La opción marcada con <strong>★</strong> está exactamente siete entradas después: es la regla clásica de Jean Lescure. Ajuste el género, el número o la conjugación para que la frase se sostenga.</p></div>`;
      let herramientas;
      if (!seleccion) {
        herramientas = '<p class="tenue" style="font-size:14.5px">Elija una palabra del cuento para ver el diccionario.</p>';
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
        if (x.t === 'sep') return esc(x.texto);
        const cambiada = cambios[x.clave] !== undefined;
        return `<span class="pal pal-${x.clase}${cambiada ? ' cambiada' : ''}${seleccion === x.clave ? ' elegida' : ''}" data-k="${x.clave}" ${cambiada ? `title="Original: ${esc(x.texto)}"` : ''}>${esc(actual(x.clave))}</span>`;
      }).join('')}</p>`).join('');
      const n = Object.keys(cambios).length;
      $('#contador').textContent = `${n} ${n === 1 ? 'palabra cambiada' : 'palabras cambiadas'} · ${totalSignificativas} con significado propio`;
      $('#publicar').disabled = n === 0;
      if (!$('#comparacion').classList.contains('oculto')) pintarComparacion();
    }

    function pintarComparacion() {
      const col = usarActual => parrafos.map(ps => `<p>${ps.map(x => x.t === 'sep' ? esc(x.texto)
        : usarActual && cambios[x.clave] !== undefined ? `<span class="v-cambiada">${esc(actual(x.clave))}</span>` : esc(x.texto)).join('')}</p>`).join('');
      $('#comparacion').innerHTML = `<div class="columnas-s7"><div><div class="rotulo">Original</div>${col(false)}</div><div><div class="rotulo">Nueva versión</div>${col(true)}</div></div>`;
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
    $('#elegir-texto')?.addEventListener('change', ev => { location.hash = `#/d/s7/${encodeURIComponent(ev.target.value)}`; });
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
      const vista = `<div class="v-s7">${parrafos.map(ps => `<p>${ps.map(x => x.t === 'sep' ? esc(x.texto)
        : cambios[x.clave] !== undefined ? `<span class="v-cambiada">${esc(actual(x.clave))}</span>` : esc(x.texto)).join('')}</p>`).join('')}</div><p class="v-credito">${esc(credito)}</p>`;
      const plano = parrafos.map(ps => ps.map(x => x.t === 'sep' ? x.texto : actual(x.clave)).join('')).join('\n\n') + `\n\n${credito}`;
      if (!editando && !(await confirmar(avisoPublicar('su versión', 'la'), { si: 'Publicar', no: 'Seguir cambiando' }))) return;
      const b = $('#publicar');
      b.disabled = true;
      try {
        await publicarEntrega({ dinamica: 's7', item_id: texto.item_id, titulo: titulo.trim(), texto: plano, vista, modulo_version: '1.0', datos: { cambios, n_cambios: n } }, { entregaExistente: editando });
        guardarNube.cancelar();
        if (!editando) { local(claveLocal, null); estado.api.borrarBorrador(clave).catch(() => {}); }
      } catch (e) { errorAviso(e); b.disabled = false; }
    });

    pintarPanel();
    pintarCuento();
    return () => { if (!editando && Object.keys(cambios).length) guardarNube.ahora(); };
  },

  paquete: {
    plantilla: 'plantillas/s7.json',
    describir: d => d.tipo === 'diccionario'
      ? `Diccionario · ${['sust', 'adj', 'verb', 'adv'].reduce((s, k) => s + (d[k]?.length || 0), 0)} palabras`
      : `${d.titulo} · ${d.autor || ''}`,
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
        const par = Array.isArray(t?.parrafos) ? t.parrafos.filter(p => typeof p === 'string' && p.trim()) : [];
        if (!par.length) errores.push(`${n} (${id}): necesita "parrafos" (una lista de textos).`);
        const clases = {};
        for (const [k, v] of Object.entries(t?.clases || {})) {
          if (!validas.has(v)) errores.push(`${n} (${id}): la palabra "${k}" tiene una clase desconocida ("${v}"). Use sust, adj, verb o adv.`);
          else if (v !== 'otra') clases[k.toLowerCase()] = v;
        }
        items.push({ item_id: id, datos: { titulo: String(t?.titulo || '').trim(), autor: String(t?.autor || '').trim(), parrafos: par, clases } });
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
