// Cambios sugeridos, dentro de la lectura crítica (vistas/lectura-critica.js).
//
// Tutor: «Sugerir cambios» abre un modo edición sobre el texto, que solo él ve. Los cambios se
// guardan solos como borrador; «Enviar al autor» (con un mensaje opcional) los deja ver al autor.
// Mientras el autor no decida nada, el tutor puede volver a editarlos. Cuando el autor termina, el
// tutor ve cuántos aceptó.
// Autor: su texto se lee tal como lo dejó; si hay cambios por revisar, aparece «Cambios sugeridos · N»
// y, al abrirlo, el texto muestra lo quitado tachado y lo agregado en color, con «Aceptar» y «Rechazar».
// Nadie más ve nada de esto.
import { estado, esTutor } from '../nucleo/estado.js';
import { esc, aviso, errorAviso, confirmar, modal, debounce, fechaHora } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import {
  piezasDe, cambiosDe, aplicarHTML, marcarHTML, baseDeEntrega, reanclarCambios, decidir, pendientes, NO_EDITABLE,
} from '../nucleo/sugerencias.js';
import { reubicarNotas } from '../nucleo/anclas.js';

const ESTADOS = { pendiente: 'Por revisar', aceptado: 'Aceptado', rechazado: 'Rechazado', caduco: 'Ya no aplica' };
const corto = (t, n = 90) => { const s = String(t || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Un cambio en una línea: «antes» tachado → «después».
function cambioHTML(c) {
  const a = c.antes.replace(/\n/g, ' ').trim() ? `<del>${esc(corto(c.antes))}</del>` : '';
  const d = c.despues.replace(/\n/g, ' ').trim() ? `<ins>${esc(corto(c.despues))}</ins>` : '';
  const que = a && d ? `${a}<span class="sg-flecha">→</span>${d}` : a ? `${a}<span class="sg-que">se quita</span>` : d ? `${d}<span class="sg-que">se agrega</span>` : '<span class="sg-que">espacio</span>';
  return `<span class="sg-cambio">${que}</span>`;
}

export async function montarSugerencias({ cont, e, textoEl, notasEl, slot, control, abrir = false }) {
  const api = estado.api;
  const yo = estado.yo.id;
  const tutorYo = esTutor() && e.autor !== yo;
  const autorYo = e.autor === yo;
  if (!tutorYo && !autorYo) return () => {};

  let rondas = [];
  let modo = null;          // null | 'editar' | 'ver' (tutor) | 'revisar' (autor)
  let quitarEscuchas = () => {};
  const abierta = () => rondas.find(r => r.estado === 'borrador' || r.estado === 'enviada') || null;
  const ultima = () => rondas[0] || null;

  async function cargar() {
    rondas = await api.sugerencias(e.id).catch(err => { console.warn(err); return []; });
    rondas.sort((a, b) => b.creado.localeCompare(a.creado));
  }

  // ---------- botón en la barra ----------
  function pintarBoton() {
    if (modo) { slot.innerHTML = ''; return; }
    const r = abierta();
    if (tutorYo) {
      if (e.archivada_en) { slot.innerHTML = ''; return; }
      if (!r) {
        const u = ultima();
        const n = u?.cambios?.length || 0, ac = (u?.cambios || []).filter(c => c.estado === 'aceptado').length;
        slot.innerHTML = `<button type="button" class="btn btn-chico" data-sg-accion="editar">${icono('lapiz', 15)}Sugerir cambios</button>
          ${u ? `<button type="button" class="sg-resumen" data-sg-accion="ver" title="Ver la última ronda">Última ronda: aceptó ${ac} de ${n}</button>` : ''}`;
      } else if (r.estado === 'borrador') {
        slot.innerHTML = `<button type="button" class="btn btn-chico btn-lima" data-sg-accion="editar">${icono('lapiz', 15)}Seguir sugiriendo · ${r.cambios.length}</button>`;
      } else {
        const p = pendientes(r).length;
        slot.innerHTML = `<button type="button" class="btn btn-chico" data-sg-accion="ver">${icono('enviar', 15)}Sugerencias enviadas · ${p} por revisar</button>`;
      }
    } else {
      // si el autor editó su texto después, se cuentan solo los cambios que todavía aplican
      const p = r?.estado === 'enviada' ? reanclarCambios(pendientes(r), r.base, baseDeEntrega(e)).filter(c => c.estado === 'pendiente').length : 0;
      slot.innerHTML = p ? `<button type="button" class="btn btn-chico btn-coral sg-boton-autor" data-sg-accion="revisar">${icono('lapiz', 15)}Cambios sugeridos · ${p}</button>` : '';
    }
  }

  // ---------- entrar y salir ----------
  function banda(html) {
    cont.querySelector('.sg-banda')?.remove();
    if (html) textoEl.insertAdjacentHTML('beforebegin', `<div class="sg-banda" role="status">${html}</div>`);
  }
  function entrar(m) {
    modo = m;
    control.tomar();
    cont.classList.add('sg-activo');
    pintarBoton();
  }
  function salir() {
    quitarEscuchas(); quitarEscuchas = () => {};
    textoEl.removeAttribute('contenteditable');
    textoEl.classList.remove('sg-editor', 'sg-marcado');
    banda('');
    modo = null;
    cont.classList.remove('sg-activo');
    control.soltar();
    pintarBoton();
  }

  // ---------- tutor: modo edición ----------
  async function editar() {
    let r = abierta();
    if (r?.estado === 'enviada') {
      if (r.cambios.some(c => c.estado === 'aceptado' || c.estado === 'rechazado')) { aviso('El autor ya empezó a revisar estos cambios.'); return; }
      try { r = await api.guardarSugerencia({ id: r.id, estado: 'borrador' }); await cargar(); r = abierta(); }
      catch (err) { errorAviso(err); return; }
    }
    const baseHTML = control.baseHTML();
    const base = baseDeEntrega(e);
    // si el autor editó el texto desde que se hizo el borrador, los cambios se mueven con él
    let iniciales = r ? reanclarCambios(r.cambios.map(c => ({ ...c, estado: 'pendiente' })), r.base, base).filter(c => c.estado === 'pendiente') : [];
    entrar('editar');
    textoEl.classList.add('sg-editor');
    textoEl.innerHTML = aplicarHTML(baseHTML, iniciales);
    textoEl.querySelectorAll(NO_EDITABLE).forEach(x => x.setAttribute('contenteditable', 'false'));
    textoEl.setAttribute('contenteditable', 'true');
    textoEl.setAttribute('spellcheck', 'true');
    textoEl.setAttribute('lang', 'es');
    banda(`${icono('lapiz', 15)}<span><b>Modo edición.</b> Solo usted ve estos cambios hasta que los envíe. Corrija palabras y puntuación; los párrafos no se parten ni se juntan.</span>`);

    let cambios = iniciales;
    let guardado = r ? 'Borrador guardado' : '';
    const leer = () => cambiosDe(base, piezasDe(textoEl).texto);
    function pintarPanel() {
      notasEl.innerHTML = `<div class="sg-panel">
        <div class="lc-notas-cab"><span class="rotulo">Cambios sugeridos${cambios.length ? ` · ${cambios.length}` : ''}</span><span class="espaciador"></span><span class="tenue sg-guardado">${esc(guardado)}</span></div>
        ${cambios.length ? `<ol class="sg-lista">${cambios.map((c, k) => `<li class="sg-item"><span class="lc-num">${k + 1}</span>${cambioHTML(c)}
          <button type="button" class="btn btn-fantasma btn-chico btn-icono" data-sg-deshacer="${k}" title="Deshacer este cambio" aria-label="Deshacer este cambio">${icono('deshacer', 15)}</button></li>`).join('')}</ol>`
          : '<div class="lc-vacio"><p>Escriba sobre el texto: cada corrección aparecerá aquí. Al autor le llegan solo cuando usted las envíe.</p></div>'}
        <div class="sg-acciones">
          <button type="button" class="btn btn-primario" data-sg-enviar ${cambios.length ? '' : 'disabled'}>${icono('enviar', 16)}Enviar al autor</button>
          <button type="button" class="btn" data-sg-salir>${icono('check', 16)}Guardar y salir</button>
          ${cambios.length || r ? `<button type="button" class="btn btn-fantasma" data-sg-descartar>${icono('basura', 16)}Descartar los cambios</button>` : ''}
        </div>
      </div>`;
    }
    pintarPanel();

    async function guardar(extra = {}) {
      const datos = { entrega_id: e.id, base, cambios: cambios.map((c, k) => ({ id: `c${k + 1}`, inicio: c.inicio, fin: c.fin, antes: c.antes, despues: c.despues, estado: 'pendiente' })), ...extra };
      if (!r && !datos.cambios.length && !extra.estado) return;
      r = await api.guardarSugerencia(r ? { id: r.id, ...datos } : { estado: 'borrador', ...datos });
      guardado = 'Borrador guardado';
    }
    let vivo = true;   // al salir del modo edición, lo que estaba en espera ya no se pinta ni se guarda
    const guardarLuego = debounce(() => { if (vivo) guardar().then(() => vivo && pintarPanel()).catch(errorAviso); }, 1200);
    const alEscribir = debounce(() => { if (!vivo) return; cambios = leer(); guardado = 'Guardando…'; pintarPanel(); guardarLuego(); }, 250);

    // Lo que no se puede hacer en el modo edición: partir o juntar párrafos, dar formato.
    const avisoParrafos = () => aviso('En el modo edición los párrafos no se parten ni se juntan: corrija dentro de cada párrafo.');
    const bloque = n => (n.nodeType === 3 ? n.parentElement : n)?.closest('p, li, blockquote, h1, h2, h3, div:not(#lc-texto)');
    const antesDeEscribir = ev => {
      const t = ev.inputType || '';
      if (t === 'insertParagraph' || t === 'insertLineBreak') { ev.preventDefault(); avisoParrafos(); return; }
      if (t.startsWith('format')) { ev.preventDefault(); return; }
      // una selección que toma dos párrafos los juntaría al escribir encima
      const sel0 = getSelection();
      if (sel0.rangeCount && !sel0.isCollapsed) {
        const r0 = sel0.getRangeAt(0);
        if (bloque(r0.startContainer) !== bloque(r0.endContainer)) { ev.preventDefault(); avisoParrafos(); return; }
      }
      if (t === 'insertFromPaste' || t === 'insertFromDrop') {
        ev.preventDefault();
        const txt = (ev.dataTransfer?.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ');
        if (txt) document.execCommand('insertText', false, txt);
        return;
      }
      if (t.startsWith('delete')) {
        const sel = getSelection();
        const rs = [...(ev.getTargetRanges?.() || [])];
        if (sel.rangeCount) rs.push(sel.getRangeAt(0));
        if (rs.some(x => bloque(x.startContainer) !== bloque(x.endContainer))) { ev.preventDefault(); avisoParrafos(); return; }
        // borrar al principio o al final de un párrafo los juntaría
        if (sel.rangeCount && sel.isCollapsed) {
          const r = sel.getRangeAt(0), b = bloque(r.startContainer);
          if (!b) return;
          const hasta = document.createRange();
          if (t.includes('Backward')) { hasta.setStart(b, 0); hasta.setEnd(r.startContainer, r.startOffset); }
          else { hasta.setStart(r.startContainer, r.startOffset); hasta.setEnd(b, b.childNodes.length); }
          if (!hasta.toString().length) { ev.preventDefault(); avisoParrafos(); }
        }
      }
    };
    textoEl.addEventListener('beforeinput', antesDeEscribir);
    textoEl.addEventListener('input', alEscribir);
    const alClicPanel = async ev => {
      const d = ev.target.closest('[data-sg-deshacer]');
      if (d) {
        const k = Number(d.dataset.sgDeshacer);
        const quedan = cambios.filter((_, i) => i !== k);
        textoEl.innerHTML = aplicarHTML(baseHTML, quedan);
        textoEl.querySelectorAll(NO_EDITABLE).forEach(x => x.setAttribute('contenteditable', 'false'));
        cambios = leer();
        pintarPanel();
        guardarLuego();
        return;
      }
      if (ev.target.closest('[data-sg-salir]')) {
        alEscribir.cancelar(); guardarLuego.cancelar();
        try { cambios = leer(); await guardar(); } catch (err) { errorAviso(err); return; }
        await cargar(); salir();
        if (cambios.length) aviso('Los cambios quedaron guardados. El autor no los ve hasta que usted los envíe.', 'exito');
        return;
      }
      if (ev.target.closest('[data-sg-descartar]')) {
        alEscribir.cancelar(); guardarLuego.cancelar();
        if (!(await confirmar('¿Descartar todos los cambios de esta ronda? El autor nunca los verá.', { si: 'Descartar', peligro: true }))) return;
        try { if (r) await api.descartarSugerencia(r.id); } catch (err) { errorAviso(err); return; }
        r = null; await cargar(); salir();
        aviso('Se descartaron los cambios.');
        return;
      }
      if (ev.target.closest('[data-sg-enviar]')) {
        alEscribir.cancelar(); guardarLuego.cancelar();
        cambios = leer();
        if (!cambios.length) return;
        const msj = await modal({
          titulo: 'Enviar los cambios al autor',
          cuerpo: `<p style="margin-top:0">${esc(e.perfil?.nombre || 'El autor')} verá ${plural(cambios.length, 'cambio sugerido', 'cambios sugeridos')} y podrá aceptarlos o rechazarlos uno por uno. Nadie más los verá.</p>
            <div class="campo"><label for="sg-mensaje">Mensaje para el autor (opcional)</label>
            <textarea class="area" id="sg-mensaje" placeholder="Por ejemplo: revise la puntuación de los diálogos.">${esc(r?.mensaje || '')}</textarea></div>`,
          acciones: [
            { texto: 'Cancelar', clase: 'btn-fantasma', valor: null },
            { texto: 'Enviar', clase: 'btn-primario', accion: v => ({ mensaje: v.querySelector('#sg-mensaje').value.trim() }) },
          ],
        });
        if (!msj) return;
        try { await guardar({ estado: 'enviada', mensaje: msj.mensaje || null }); } catch (err) { errorAviso(err); return; }
        await cargar(); salir();
        aviso('Cambios enviados al autor.', 'exito');
      }
    };
    notasEl.addEventListener('click', alClicPanel);
    quitarEscuchas = () => {
      vivo = false; alEscribir.cancelar(); guardarLuego.cancelar();
      textoEl.removeEventListener('beforeinput', antesDeEscribir);
      textoEl.removeEventListener('input', alEscribir);
      notasEl.removeEventListener('click', alClicPanel);
    };
    textoEl.focus();
  }

  // ---------- tutor: ver lo enviado o la última ronda ----------
  function ver() {
    const r = abierta() || ultima();
    if (!r) return;
    entrar('ver');
    const p = pendientes(r);
    const decidido = r.cambios.some(c => c.estado === 'aceptado' || c.estado === 'rechazado');
    const base = baseDeEntrega(e);
    const vigentes = r.estado === 'enviada' ? reanclarCambios(p, r.base, base).filter(c => c.estado === 'pendiente') : [];
    textoEl.classList.add('sg-marcado');
    textoEl.innerHTML = marcarHTML(control.baseHTML(), vigentes);
    const ac = r.cambios.filter(c => c.estado === 'aceptado').length;
    banda(r.estado === 'enviada'
      ? `${icono('enviar', 15)}<span><b>Enviados ${r.enviada_en ? esc(fechaHora(r.enviada_en)) : ''}.</b> ${p.length ? `El autor tiene ${plural(p.length, 'cambio', 'cambios')} por revisar.` : ''} Lo tachado y lo agregado solo lo ven usted y el autor.</span>`
      : `${icono('check', 15)}<span><b>Ronda terminada${r.resuelta_en ? ` · ${esc(fechaHora(r.resuelta_en))}` : ''}.</b> El autor aceptó ${ac} de ${r.cambios.length}. Lo aceptado ya está en el texto.</span>`);
    notasEl.innerHTML = `<div class="sg-panel">
      <div class="lc-notas-cab"><span class="rotulo">Cambios sugeridos · ${r.cambios.length}</span></div>
      ${r.mensaje ? `<blockquote class="sg-mensaje"><b>Su mensaje</b>${esc(r.mensaje)}</blockquote>` : ''}
      <ol class="sg-lista">${r.cambios.map((c, k) => `<li class="sg-item e-${c.estado}" data-sg-item="${esc(c.id)}"><span class="lc-num">${k + 1}</span>${cambioHTML(c)}<span class="sg-estado">${ESTADOS[c.estado] || ''}</span></li>`).join('')}</ol>
      <div class="sg-acciones">
        ${r.estado === 'enviada' && !decidido ? `<button type="button" class="btn" data-sg-volver>${icono('lapiz', 16)}Volver a editar</button>` : ''}
        ${r.estado === 'resuelta' ? `<button type="button" class="btn" data-sg-nueva>${icono('lapiz', 16)}Sugerir más cambios</button>` : ''}
        <button type="button" class="btn btn-fantasma" data-sg-cerrar>${icono('x', 16)}Cerrar</button>
      </div></div>`;
    const alClic = async ev => {
      if (ev.target.closest('[data-sg-cerrar]')) { salir(); return; }
      if (ev.target.closest('[data-sg-volver]') || ev.target.closest('[data-sg-nueva]')) { salir(); editar(); }
    };
    notasEl.addEventListener('click', alClic);
    quitarEscuchas = () => notasEl.removeEventListener('click', alClic);
  }

  // ---------- autor: revisar ----------
  async function revisar() {
    let r = abierta();
    if (!r || r.estado !== 'enviada') return;
    // si el autor editó su texto después, los cambios se acomodan (o quedan «ya no aplica»)
    const base = baseDeEntrega(e);
    if (r.base !== base) {
      try {
        const cambios = reanclarCambios(r.cambios, r.base, base);
        await api.resolverSugerencia(r.id, { cambios, base });
        await cargar(); r = abierta();
        if (!r) { aviso('Los cambios sugeridos ya no aplican: el texto cambió.'); pintarBoton(); return; }
      } catch (err) { errorAviso(err); return; }
    }
    entrar('revisar');
    let ocupado = false;
    function pintar() {
      const p = pendientes(r);
      textoEl.classList.add('sg-marcado');
      textoEl.innerHTML = marcarHTML(control.baseHTML(), p);
      banda(`${icono('lapiz', 15)}<span><b>Cambios que le sugiere el tutor.</b> Lo tachado se quitaría y lo de color se agregaría. Solo usted y el tutor los ven; lo que acepte pasa a su texto.</span>`);
      notasEl.innerHTML = `<div class="sg-panel">
        <div class="lc-notas-cab"><span class="rotulo">Cambios sugeridos · ${p.length}</span></div>
        ${r.mensaje ? `<blockquote class="sg-mensaje"><b>Mensaje del tutor</b>${esc(r.mensaje)}</blockquote>` : ''}
        ${p.length > 1 ? `<div class="sg-todos"><button type="button" class="btn btn-chico btn-primario" data-sg-todos="aceptar">${icono('check', 15)}Aceptar todos</button>
          <button type="button" class="btn btn-chico" data-sg-todos="rechazar">${icono('x', 15)}Rechazar todos</button></div>` : ''}
        <ol class="sg-lista">${p.map((c, k) => `<li class="sg-item" data-sg-item="${esc(c.id)}"><span class="lc-num">${k + 1}</span>${cambioHTML(c)}
          <span class="sg-decidir"><button type="button" class="btn btn-chico btn-lima" data-sg-aceptar="${esc(c.id)}">${icono('check', 14)}Aceptar</button>
          <button type="button" class="btn btn-chico btn-fantasma" data-sg-rechazar="${esc(c.id)}">${icono('x', 14)}Rechazar</button></span></li>`).join('')}</ol>
        <div class="sg-acciones"><button type="button" class="btn btn-fantasma" data-sg-cerrar>${icono('izquierda', 16)}Volver a mi texto</button></div>
      </div>`;
    }
    pintar();
    async function aplicar(dec) {
      if (ocupado) return;
      ocupado = true;
      try {
        const vieja = { ...e };
        const { cambios, base: nb, entrega } = await decidir(e, r, dec);
        await api.resolverSugerencia(r.id, { cambios, base: nb, ...(entrega || {}) });
        if (entrega) {
          Object.assign(e, entrega, { editada: true });
          await reubicarNotas(vieja, entrega.vista, entrega.texto);   // las notas siguen al texto
          await control.textoCambio();
        }
        await cargar();
        r = rondas.find(x => x.id === r.id) || r;
        if (!pendientes(r).length || r.estado !== 'enviada') {
          salir();
          aviso('Revisó todos los cambios sugeridos.', 'exito');
        } else {
          pintar();
          if (dec.aceptar?.length) aviso(dec.aceptar.length > 1 ? 'Cambios aceptados.' : 'Cambio aceptado.', 'exito');
        }
      } catch (err) { errorAviso(err); }
      ocupado = false;
    }
    const alClic = async ev => {
      const a = ev.target.closest('[data-sg-aceptar]');
      if (a) return aplicar({ aceptar: [a.dataset.sgAceptar] });
      const x = ev.target.closest('[data-sg-rechazar]');
      if (x) return aplicar({ rechazar: [x.dataset.sgRechazar] });
      const t = ev.target.closest('[data-sg-todos]');
      if (t) {
        const ids = pendientes(r).map(c => c.id);
        const si = t.dataset.sgTodos === 'aceptar';
        if (!(await confirmar(si ? `¿Aceptar los ${ids.length} cambios? Pasarán a su texto.` : `¿Rechazar los ${ids.length} cambios? Su texto queda como está.`, { si: si ? 'Aceptar todos' : 'Rechazar todos' }))) return;
        return aplicar(si ? { aceptar: ids } : { rechazar: ids });
      }
      if (ev.target.closest('[data-sg-cerrar]')) salir();
    };
    // tocar un cambio en el texto lleva a su tarjeta
    const alTocarTexto = ev => {
      const m = ev.target.closest('[data-sg]');
      if (!m) return;
      const it = notasEl.querySelector(`[data-sg-item="${CSS.escape(m.dataset.sg)}"]`);
      if (!it) return;
      it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      it.classList.add('resalta');
      setTimeout(() => it.classList.remove('resalta'), 1400);
    };
    notasEl.addEventListener('click', alClic);
    textoEl.addEventListener('click', alTocarTexto);
    quitarEscuchas = () => { notasEl.removeEventListener('click', alClic); textoEl.removeEventListener('click', alTocarTexto); };
  }

  // tocar los cambios en el texto también funciona en la vista del tutor
  const alClicSlot = ev => {
    const b = ev.target.closest('[data-sg-accion]');
    if (!b) return;
    const a = b.dataset.sgAccion;
    if (a === 'editar') editar();
    else if (a === 'ver') ver();
    else if (a === 'revisar') revisar();
  };
  slot.addEventListener('click', alClicSlot);

  await cargar();
  pintarBoton();
  if (abrir && autorYo && abierta()?.estado === 'enviada') revisar();

  // las sugerencias pueden llegar mientras se lee
  const quitarRT = api.suscribir?.('sugerencias', async p => {
    if ((p.new?.entrega_id || p.old?.entrega_id) !== e.id || modo) return;
    await cargar(); pintarBoton();
  });
  return () => { quitarEscuchas(); slot.removeEventListener('click', alClicSlot); quitarRT?.(); };
}
