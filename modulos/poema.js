// Módulo: El poema desarmado. Escribir un poema nuevo solo con las palabras de otro.
import { estado } from '../nucleo/estado.js';
import { esc, local, debounce, barajar, confirmar, aviso, errorAviso, hace } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const RE_FICHA = /[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;
const ES_PUNT = t => !/[\p{L}\p{N}]/u.test(t);
const SIN_ESPACIO_ANTES = new Set([',', '.', ';', ':', '?', '!', ')', ']', '»', '…', "'", '”']);
const SIN_ESPACIO_DESPUES = new Set(['¿', '¡', '(', '[', '«', '“']);

function unir(textos) {
  let s = '', prev = null;
  for (const t of textos) {
    if (s === '') s = t;
    else if (SIN_ESPACIO_ANTES.has(t) || SIN_ESPACIO_DESPUES.has(prev)) s += t;
    else s += ' ' + t;
    prev = t;
  }
  return s;
}

export default {
  slug: 'poema',
  nombre: 'El poema desarmado',
  version: '1.0',

  async abrir(cont, ctx) {
    const poemas = await estado.api.contenidos('poema');
    const editando = ctx.entrega || null;
    let poema;
    if (editando) {
      poema = poemas.find(p => p.item_id === editando.item_id) || await estado.api.contenido('poema', editando.item_id);
      if (!poema) { cont.innerHTML = `<div class="contenedor">${vacio('El poema fuente ya no está disponible')}</div>`; return; }
    } else {
      if (!poemas.length) { cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No hay poemas cargados', 'El tutor todavía no ha cargado poemas para esta dinámica.')}</div>`; return; }
      const id = ctx.item_id || ctx.sesion?.item_id;
      poema = poemas.find(p => p.item_id === id);
      if (!poema) { location.replace(`#/d/poema/${encodeURIComponent(poemas[Math.floor(Math.random() * poemas.length)].item_id)}`); return; }
    }
    const P = poema.datos;
    const clave = `poema:${poema.item_id}`;
    const claveLocal = `borrador:${estado.yo.id}:${clave}`;

    // ---------- estado ----------
    let fichas = [], versos = [], lienzo = [], enLienzo = new Set();
    let revuelto = false, ordenRevuelto = [], activo = 0;
    const lineas = String(P.texto || '').split('\n').map(l => l.trim());
    lineas.forEach((linea, iv) => {
      const ids = [];
      (linea.match(RE_FICHA) || []).forEach(t => { const id = fichas.length; fichas.push({ id, texto: t, verso: iv, punt: ES_PUNT(t) }); ids.push(id); });
      versos.push(ids);
    });
    const vacioLienzo = () => versos.map(() => ({ align: 'left', fichas: [] }));
    lienzo = vacioLienzo();

    // Reconstruye una composición a partir de los textos guardados.
    function restaurar(renglones) {
      lienzo = vacioLienzo();
      enLienzo = new Set();
      (renglones || []).forEach((r, i) => {
        if (!lienzo[i]) lienzo[i] = { align: 'left', fichas: [] };
        lienzo[i].align = r.align || 'left';
        (r.textos || []).forEach(t => {
          const f = fichas.find(x => x.texto === t && !enLienzo.has(x.id));
          if (f) { lienzo[i].fichas.push(f.id); enLienzo.add(f.id); }
        });
      });
    }
    const serializar = () => lienzo.map(r => ({ align: r.align, textos: r.fichas.map(id => fichas[id].texto) }));

    let tituloInicial = '';
    let notaBorrador = '';
    if (editando) {
      restaurar(editando.datos?.renglones);
      tituloInicial = editando.titulo || '';
    } else {
      const loc = local(claveLocal);
      let nube = null;
      try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
      const b = [loc, nube].filter(Boolean).sort((a, c) => (c._actualizado || '').localeCompare(a._actualizado || ''))[0];
      if (b?.renglones?.some(r => r.textos?.length)) {
        restaurar(b.renglones);
        tituloInicial = b.titulo || '';
        notaBorrador = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`;
      }
    }

    // ---------- estructura ----------
    cont.innerHTML = `
    <div class="contenedor" style="max-width:1400px">
      <div class="fila" style="align-items:flex-end;margin-bottom:6px">
        <div>
          <span class="rotulo">El poema desarmado</span>
          <h1 class="saludo" style="margin:4px 0 0;font-size:clamp(32px,4vw,46px)">${editando ? 'Editar poema' : 'Escriba otro poema con estas palabras'}</h1>
        </div>
      </div>
      <p class="tenue" style="max-width:70ch;margin:8px 0 18px">No puede añadir palabras: solo elegir, omitir y reordenar las del poema fuente. Arrastre las fichas a los renglones, o haga clic en una ficha para enviarla al renglón activo (y clic otra vez para devolverla).</p>
      <div class="poema-barra">
        ${editando ? '' : `<label class="sr" for="elegir-poema">Poema fuente</label>
        <select class="selector" id="elegir-poema" style="width:auto;min-height:40px;border-radius:999px">
          ${poemas.map(p => `<option value="${esc(p.item_id)}" ${p.item_id === poema.item_id ? 'selected' : ''}>${esc(p.datos.titulo)} · ${esc(p.datos.autor || '')}</option>`).join('')}
        </select>`}
        <button class="btn btn-chico" id="b-desordenar">${icono('barajar', 16)}Desordenar</button>
        <button class="btn btn-chico btn-fantasma" id="b-ordenar">${icono('ordenar', 16)}Orden original</button>
        <button class="btn btn-chico btn-fantasma" id="b-reiniciar">${icono('reiniciar', 16)}Vaciar lienzo</button>
        <span class="espaciador"></span>
        <span class="guardado" id="guardado">${esc(notaBorrador)}</span>
        <span class="contador" id="contador"></span>
        <button class="btn btn-primario" id="b-publicar">${icono(editando ? 'check' : 'enviar', 18)}${editando ? 'Guardar cambios' : 'Publicar poema'}</button>
      </div>
      <div class="tablero-poema">
        <section class="panel-poema">
          <div class="panel-poema-cab"><span class="rotulo">Poema fuente</span><span class="tenue" id="estado-fuente" style="font-size:13px"></span></div>
          <div class="fuente-poema" id="fuente"></div>
        </section>
        <section class="panel-poema">
          <div class="panel-poema-cab"><span class="rotulo">Poema nuevo</span><span class="tenue" id="estado-lienzo" style="font-size:13px"></span></div>
          <div style="padding:16px 20px 0;background:var(--papel)"><input class="titulo-escribir" id="titulo" placeholder="Título (opcional)" maxlength="140" value="${esc(tituloInicial)}" style="width:100%;margin:0"></div>
          <div class="lienzo-poema" id="lienzo"></div>
        </section>
      </div>
    </div>`;

    const elFuente = cont.querySelector('#fuente');
    const elLienzo = cont.querySelector('#lienzo');
    const elTitulo = cont.querySelector('#titulo');
    const elGuardado = cont.querySelector('#guardado');
    const fichaHTML = id => `<span class="ficha${fichas[id].punt ? ' punt' : ''}" data-id="${id}">${esc(fichas[id].texto)}</span>`;

    function pintarFuente() {
      let h = `<div class="poema-titulo">${esc(P.titulo)}</div><div class="poema-autor">${esc(P.autor || '')}</div>`;
      if (revuelto) h += `<div class="flujo">${ordenRevuelto.filter(id => !enLienzo.has(id)).map(fichaHTML).join('')}</div>`;
      else h += versos.map(ids => `<div class="verso${ids.length ? '' : ' vacio'}">${ids.filter(id => !enLienzo.has(id)).map(fichaHTML).join('')}</div>`).join('');
      elFuente.innerHTML = h;
      cont.querySelector('#estado-fuente').textContent = revuelto ? 'palabras desordenadas' : 'orden original';
    }
    const ALIN = { left: ['alinIzq', 'flex-start', 'izquierda'], center: ['alinCen', 'center', 'centro'], right: ['alinDer', 'flex-end', 'derecha'] };
    function pintarLienzo() {
      elLienzo.innerHTML = lienzo.map((r, i) => `
        <div class="renglon${i === activo ? ' activo' : ''}" data-renglon="${i}">
          <span class="num">${i + 1}</span>
          <div class="interior" style="justify-content:${ALIN[r.align][1]}">${r.fichas.map(fichaHTML).join('')}</div>
          <div class="alins">${Object.entries(ALIN).map(([k, [ico, , nom]]) => `<button type="button" class="${r.align === k ? 'on' : ''}" data-alin="${k}" data-renglon="${i}" title="Alinear a la ${nom}" aria-label="Alinear renglón ${i + 1} a la ${nom}">${icono(ico, 16)}</button>`).join('')}</div>
        </div>`).join('') +
        `<p class="pista">Clic en un renglón para activarlo. Los renglones corresponden a los versos del poema fuente; puede dejar renglones vacíos para separar estrofas.</p>`;
      cont.querySelector('#estado-lienzo').textContent = `renglón activo: ${activo + 1}`;
    }
    function pintarContador() { cont.querySelector('#contador').textContent = `${enLienzo.size} de ${fichas.length} fichas`; }
    function pintar() { pintarFuente(); pintarLienzo(); pintarContador(); }

    // ---------- guardado ----------
    const guardarNube = debounce(async () => {
      if (editando) return;
      try { await estado.api.guardarBorrador(clave, { titulo: elTitulo.value.trim(), renglones: serializar() }); elGuardado.textContent = 'Guardado'; }
      catch { elGuardado.textContent = 'Guardado en este dispositivo'; }
    }, 3000);
    function cambio() {
      if (editando) { elGuardado.textContent = 'Cambios sin guardar'; return; }
      local(claveLocal, { titulo: elTitulo.value.trim(), renglones: serializar(), _actualizado: new Date().toISOString() });
      elGuardado.textContent = 'Guardando…';
      guardarNube();
    }
    elTitulo.addEventListener('input', cambio);

    // ---------- movimientos ----------
    function quitarDelLienzo(id) { for (const r of lienzo) { const i = r.fichas.indexOf(id); if (i >= 0) { r.fichas.splice(i, 1); return; } } }
    function aLienzo(id, ir, pos) {
      quitarDelLienzo(id);
      const arr = lienzo[ir].fichas;
      arr.splice(Math.max(0, Math.min(pos, arr.length)), 0, id);
      enLienzo.add(id); activo = ir; pintar(); cambio();
    }
    function aFuente(id) {
      if (!enLienzo.has(id)) return;
      quitarDelLienzo(id); enLienzo.delete(id);
      if (revuelto && !ordenRevuelto.includes(id)) ordenRevuelto.splice(Math.floor(Math.random() * (ordenRevuelto.length + 1)), 0, id);
      pintar(); cambio();
    }

    // ---------- arrastre (ratón y pantalla táctil) ----------
    const ctrl = new AbortController();
    const op = { signal: ctrl.signal };
    let arr = null;
    const cursor = document.createElement('span');
    cursor.className = 'cursor-ins';
    const limpiarCursor = () => cursor.remove();

    document.addEventListener('pointerdown', e => {
      const el = e.target.closest('.ficha');
      if (!el || !cont.contains(el) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      arr = { id: +el.dataset.id, el, x0: e.clientX, y0: e.clientY, activo: false, fantasma: null, dx: 0, dy: 0, diana: null };
      try { el.setPointerCapture(e.pointerId); } catch { /* nada */ }
    }, op);

    function evaluarDiana(x, y) {
      cont.querySelectorAll('.renglon.diana').forEach(n => n.classList.remove('diana'));
      elFuente.classList.remove('resaltada');
      limpiarCursor();
      arr.diana = null;
      const bajo = document.elementFromPoint(x, y);
      if (!bajo) return;
      if (bajo.closest('#fuente')) { if (enLienzo.has(arr.id)) elFuente.classList.add('resaltada'); arr.diana = { tipo: 'fuente' }; return; }
      let renglon = bajo.closest('.renglon');
      if (!renglon && bajo.closest('#lienzo')) {
        let mejor = null, dist = Infinity;
        cont.querySelectorAll('.renglon').forEach(n => { const r = n.getBoundingClientRect(); const d = Math.abs(y - (r.top + r.height / 2)); if (d < dist) { dist = d; mejor = n; } });
        renglon = mejor;
      }
      if (!renglon) return;
      const interior = renglon.querySelector('.interior');
      const sueltas = [...interior.querySelectorAll('.ficha')].filter(n => !n.classList.contains('arrastrando'));
      let pos = sueltas.length;
      for (let i = 0; i < sueltas.length; i++) { const r = sueltas[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { pos = i; break; } }
      renglon.classList.add('diana');
      interior.insertBefore(cursor, sueltas[pos] || null);
      arr.diana = { tipo: 'renglon', i: +renglon.dataset.renglon, pos };
    }

    document.addEventListener('pointermove', e => {
      if (!arr) return;
      if (!arr.activo) {
        if (Math.hypot(e.clientX - arr.x0, e.clientY - arr.y0) < 6) return;
        const r = arr.el.getBoundingClientRect();
        const g = arr.el.cloneNode(true);
        g.classList.add('fantasma');
        g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
        document.body.appendChild(g);
        arr.fantasma = g; arr.dx = e.clientX - r.left; arr.dy = e.clientY - r.top;
        arr.el.classList.add('arrastrando');
        arr.activo = true;
      }
      e.preventDefault();
      arr.fantasma.style.left = (e.clientX - arr.dx) + 'px';
      arr.fantasma.style.top = (e.clientY - arr.dy) + 'px';
      if (e.clientY < 80) window.scrollBy(0, -14); else if (e.clientY > innerHeight - 80) window.scrollBy(0, 14);
      evaluarDiana(e.clientX, e.clientY);
    }, op);

    function soltar() {
      if (!arr) return;
      const a = arr; arr = null;
      cont.querySelectorAll('.renglon.diana').forEach(n => n.classList.remove('diana'));
      elFuente.classList.remove('resaltada');
      limpiarCursor();
      a.fantasma?.remove();
      a.el.classList.remove('arrastrando');
      if (!a.activo) {
        // Clic simple: la ficha va al renglón activo o regresa al poema fuente.
        if (enLienzo.has(a.id)) aFuente(a.id); else aLienzo(a.id, activo, lienzo[activo].fichas.length);
        return;
      }
      if (!a.diana) { pintar(); return; }
      if (a.diana.tipo === 'fuente') aFuente(a.id); else aLienzo(a.id, a.diana.i, a.diana.pos);
    }
    document.addEventListener('pointerup', soltar, op);
    document.addEventListener('pointercancel', soltar, op);

    elLienzo.addEventListener('click', e => {
      const b = e.target.closest('[data-alin]');
      if (b) { lienzo[+b.dataset.renglon].align = b.dataset.alin; activo = +b.dataset.renglon; pintarLienzo(); cambio(); return; }
      if (e.target.closest('.ficha')) return;
      const r = e.target.closest('.renglon');
      if (r) { activo = +r.dataset.renglon; pintarLienzo(); }
    });

    // ---------- controles ----------
    cont.querySelector('#elegir-poema')?.addEventListener('change', ev => { location.hash = `#/d/poema/${encodeURIComponent(ev.target.value)}`; });
    cont.querySelector('#b-desordenar').addEventListener('click', () => {
      ordenRevuelto = barajar(fichas.map(f => f.id).filter(id => !enLienzo.has(id)));
      revuelto = true; pintarFuente();
    });
    cont.querySelector('#b-ordenar').addEventListener('click', () => { revuelto = false; pintarFuente(); });
    cont.querySelector('#b-reiniciar').addEventListener('click', async () => {
      if (enLienzo.size && !(await confirmar('¿Vaciar el poema nuevo y devolver todas las fichas?', { si: 'Vaciar', peligro: true }))) return;
      lienzo = vacioLienzo(); enLienzo = new Set(); activo = 0; pintar(); cambio();
    });

    // ---------- publicar ----------
    cont.querySelector('#b-publicar').addEventListener('click', async () => {
      const lineasNuevas = lienzo.map(r => ({ txt: unir(r.fichas.map(id => fichas[id].texto)), align: r.align }));
      let ini = lineasNuevas.findIndex(l => l.txt);
      let fin = lineasNuevas.length - 1 - [...lineasNuevas].reverse().findIndex(l => l.txt);
      if (ini < 0) { aviso('El poema nuevo está vacío. Lleve algunas palabras al lienzo.', 'error'); return; }
      const usadas = lineasNuevas.slice(ini, fin + 1);
      const clase = { left: '', center: ' al-centro', right: ' al-der' };
      const credito = `Compuesto solo con palabras de «${P.titulo}»${P.autor ? `, de ${P.autor}` : ''}.`;
      const vista = `<div class="v-poema">${usadas.map(l => `<p class="v-verso${clase[l.align]}">${esc(l.txt)}</p>`).join('')}</div><p class="v-credito">${esc(credito)}</p>`;
      const texto = usadas.map(l => l.txt).join('\n') + `\n\n${credito}`;
      if (!editando && !(await confirmar('Al publicar, el grupo podrá leer su poema. Después podrá editarlo, pero no borrarlo.', { si: 'Publicar', no: 'Seguir componiendo' }))) return;
      const boton = cont.querySelector('#b-publicar');
      boton.disabled = true;
      try {
        await publicarEntrega({
          dinamica: 'poema', item_id: poema.item_id, titulo: elTitulo.value.trim(), texto, vista,
          datos: { renglones: serializar() }, modulo_version: '1.0',
        }, { entregaExistente: editando });
        guardarNube.cancelar();
        if (!editando) { local(claveLocal, null); estado.api.borrarBorrador(clave).catch(() => {}); }
      } catch (e) { errorAviso(e); boton.disabled = false; }
    });

    pintar();
    return () => {
      ctrl.abort();
      document.querySelectorAll('.ficha.fantasma').forEach(n => n.remove());
      if (!editando && enLienzo.size) guardarNube.ahora();
    };
  },

  paquete: {
    plantilla: 'plantillas/poemas.json',
    describir: d => `${d.titulo} · ${d.autor || ''}`,
    validar(json) {
      const errores = [];
      const lista = Array.isArray(json) ? json : json?.poemas;
      if (!Array.isArray(lista)) return { items: [], errores: ['El archivo debe tener una lista "poemas": [ … ].'] };
      const vistos = new Set();
      const items = [];
      lista.forEach((p, i) => {
        const n = `Poema ${i + 1}`;
        if (!p || typeof p !== 'object') { errores.push(`${n}: no es un objeto.`); return; }
        const id = String(p.id || '').trim();
        if (!id) errores.push(`${n}: falta "id".`);
        else if (vistos.has(id)) errores.push(`${n}: el id "${id}" está repetido.`);
        vistos.add(id);
        if (!String(p.titulo || '').trim()) errores.push(`${n} (${id}): falta "titulo".`);
        if (!String(p.texto || '').trim()) errores.push(`${n} (${id}): falta "texto". Use \\n para separar versos.`);
        const palabras = (String(p.texto || '').match(RE_FICHA) || []).length;
        if (palabras > 400) errores.push(`${n} (${id}): tiene ${palabras} fichas; el máximo recomendado es 400.`);
        items.push({ item_id: id, datos: { titulo: String(p.titulo || '').trim(), autor: String(p.autor || '').trim(), texto: String(p.texto || '').replace(/\r\n/g, '\n') } });
      });
      return { items, errores };
    },
  },
};
