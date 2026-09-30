// Escritorio: espacio de escritura compartido por las dinámicas de texto.
// La consigna queda siempre visible junto al editor.
import { estado, avisoPublicar as avisoGeneral } from './estado.js';
import { esc, contarPalabras, sanitizar, local, debounce, confirmar, errorAviso, hace } from './ui.js';
import { icono } from './iconos.js';

export function montarEscritorio(cont, op) {
  const {
    acento = 'var(--coral)', panelHTML = '', clave, limite = null, cronometroMin = null,
    pedirTitulo = true, titulo = '', html = '', placeholder = 'Escriba aquí…',
    textoBoton = 'Publicar', editando = false, alPublicar, avisoPublicar,
  } = op;

  const claveLocal = `borrador:${estado.yo.id}:${clave}`;
  cont.innerHTML = `
  <div class="contenedor" style="max-width:1400px">
    <div class="escritorio" style="--acento:${acento}">
      <aside class="consigna-panel">${panelHTML}</aside>
      <section class="mesa">
        <div class="mesa-barra">
          <button type="button" class="herr" data-cmd="italic" title="Cursiva (Ctrl+I)" aria-label="Cursiva">${icono('cursiva', 18)}</button>
          <button type="button" class="herr" data-cmd="bold" title="Negrita (Ctrl+B)" aria-label="Negrita">${icono('negrita', 18)}</button>
          <span class="sep"></span>
          <button type="button" class="cronometro" id="crono" title="Cronómetro">${icono('reloj', 17)}<span>${cronometroMin ? `${cronometroMin}:00` : 'Cronómetro'}</span></button>
          <span class="espaciador"></span>
          <span class="guardado" id="guardado"></span>
          <button type="button" class="herr" id="enfoque" title="Modo enfoque: oculta todo menos la consigna y el texto" aria-label="Modo enfoque">${icono('enfoque', 18)}</button>
        </div>
        <div class="hoja-escribir">
          ${pedirTitulo ? `<input class="titulo-escribir" id="titulo" placeholder="Título (opcional)" maxlength="140" value="${esc(titulo)}">` : ''}
          <div class="editor" id="editor" contenteditable="true" spellcheck="true" lang="es" data-ph="${esc(placeholder)}" role="textbox" aria-multiline="true" aria-label="Texto"></div>
        </div>
        <div class="mesa-pie">
          <span class="contador" id="contador">0 palabras</span>
          <span class="espaciador"></span>
          <button type="button" class="btn btn-primario" id="publicar" disabled>${icono(editando ? 'check' : 'enviar', 18)}${esc(textoBoton)}</button>
        </div>
      </section>
    </div>
  </div>`;

  const ed = cont.querySelector('#editor');
  const tit = cont.querySelector('#titulo');
  const contador = cont.querySelector('#contador');
  const guardado = cont.querySelector('#guardado');
  const botonPublicar = cont.querySelector('#publicar');
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* opcional */ }

  const leer = () => ({ titulo: tit?.value.trim() || '', html: sanitizar(ed.innerHTML), texto: ed.innerText.replace(/\n{3,}/g, '\n\n').trim() });

  function actualizarContador() {
    const n = contarPalabras(ed.innerText);
    contador.textContent = limite ? `${n} / ${limite} palabras` : `${n} ${n === 1 ? 'palabra' : 'palabras'}`;
    contador.classList.toggle('cerca', !!limite && n > limite * 0.9 && n <= limite);
    contador.classList.toggle('pasado', !!limite && n > limite);
    botonPublicar.disabled = n === 0 || (!!limite && n > limite);
    botonPublicar.title = limite && n > limite ? `Supera el límite de ${limite} palabras` : '';
  }

  // ---------- carga inicial: texto editado, o el borrador más reciente ----------
  async function cargar() {
    if (editando) { ed.innerHTML = sanitizar(html); actualizarContador(); return; }
    const loc = local(claveLocal);
    let nube = null;
    try { nube = await estado.api.borrador(clave); } catch { /* sin conexión: queda el local */ }
    const elegir = [loc, nube].filter(Boolean).sort((a, b) => (b._actualizado || '').localeCompare(a._actualizado || ''))[0];
    if (elegir) {
      ed.innerHTML = sanitizar(elegir.html || '');
      if (tit && elegir.titulo) tit.value = elegir.titulo;
      guardado.textContent = `Borrador recuperado · ${hace(elegir._actualizado || new Date().toISOString())}`;
    } else if (html) {
      ed.innerHTML = sanitizar(html);
    }
    actualizarContador();
  }

  // ---------- autoguardado ----------
  const guardarNube = debounce(async () => {
    const { titulo: t, html: h } = leer();
    try { await estado.api.guardarBorrador(clave, { titulo: t, html: h }); guardado.textContent = 'Guardado'; }
    catch { guardado.textContent = 'Guardado en este dispositivo'; }
  }, 3500);
  function alEscribir() {
    actualizarContador();
    const { titulo: t, html: h } = leer();
    local(claveLocal, { titulo: t, html: h, _actualizado: new Date().toISOString() });
    guardado.textContent = 'Guardando…';
    if (!editando) guardarNube();
    else guardado.textContent = 'Cambios sin publicar';
  }
  ed.addEventListener('focus', () => {
    if (!ed.innerHTML.trim()) {
      ed.innerHTML = '<p><br></p>';
      const r = document.createRange(); r.setStart(ed.firstChild, 0); r.collapse(true);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  });
  ed.addEventListener('blur', () => { if (!ed.innerText.trim()) ed.innerHTML = ''; });
  ed.addEventListener('input', alEscribir);
  tit?.addEventListener('input', alEscribir);
  ed.addEventListener('paste', ev => {
    ev.preventDefault();
    const t = ev.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, t);
  });
  ed.addEventListener('keydown', ev => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardarNube.ahora?.(); }
  });

  // ---------- formato ----------
  const estadoFormato = () => cont.querySelectorAll('[data-cmd]').forEach(b => {
    let on = false; try { on = document.queryCommandState(b.dataset.cmd); } catch { /* nada */ }
    b.classList.toggle('on', on);
  });
  cont.querySelectorAll('[data-cmd]').forEach(b => {
    b.addEventListener('mousedown', ev => ev.preventDefault());
    b.addEventListener('click', () => { document.execCommand(b.dataset.cmd); ed.focus(); estadoFormato(); alEscribir(); });
  });
  ed.addEventListener('keyup', estadoFormato);
  ed.addEventListener('mouseup', estadoFormato);

  // ---------- cronómetro ----------
  const crono = cont.querySelector('#crono');
  const opciones = cronometroMin ? [cronometroMin] : [5, 10, 15];
  let idx = -1, resto = 0, tic = null;
  const pintaCrono = () => { crono.querySelector('span').textContent = `${Math.floor(resto / 60)}:${String(resto % 60).padStart(2, '0')}`; };
  crono.addEventListener('click', () => {
    if (tic) { clearInterval(tic); tic = null; crono.classList.remove('corre'); return; }
    if (resto <= 0) {
      idx = cronometroMin ? 0 : (idx + 1) % (opciones.length + 1);
      if (idx === opciones.length) { idx = -1; crono.className = 'cronometro'; crono.querySelector('span').textContent = 'Cronómetro'; return; }
      resto = opciones[idx] * 60;
      pintaCrono();
    }
    crono.className = 'cronometro corre';
    tic = setInterval(() => {
      resto--; pintaCrono();
      if (resto <= 0) { clearInterval(tic); tic = null; crono.className = 'cronometro fin'; crono.querySelector('span').textContent = 'Tiempo'; }
    }, 1000);
  });

  // ---------- enfoque ----------
  cont.querySelector('#enfoque').addEventListener('click', ev => {
    const on = document.body.classList.toggle('enfoque');
    ev.currentTarget.classList.toggle('on', on);
    ed.focus();
  });

  // ---------- publicar ----------
  botonPublicar.addEventListener('click', async () => {
    const datos = leer();
    datos.palabras = contarPalabras(datos.texto);
    if (!datos.palabras) return;
    if (!editando) {
      const ok = await confirmar(avisoPublicar || avisoGeneral(), { si: 'Publicar', no: 'Seguir escribiendo' });
      if (!ok) return;
    }
    botonPublicar.disabled = true;
    try {
      await alPublicar(datos);
      guardarNube.cancelar();
      local(claveLocal, null);
      if (!editando) estado.api.borrarBorrador(clave).catch(() => {});
    } catch (e) {
      errorAviso(e);
      botonPublicar.disabled = false;
    }
  });

  cargar().then(() => { if (!editando) ed.focus(); });

  return {
    destruir() {
      clearInterval(tic);
      if (!editando && ed.innerText.trim()) guardarNube.ahora?.();
      document.body.classList.remove('enfoque');
    },
  };
}
