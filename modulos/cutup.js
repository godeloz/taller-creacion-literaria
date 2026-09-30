// Módulo: Escritura Cut Up. El procedimiento de Burroughs invertido: se reciben
// frases ya cortadas, de fuentes distintas, y se escribe la sintaxis que las acoge.
import { estado, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, debounce, contarPalabras, confirmar, aviso, errorAviso, hace, barajar } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const ACENTO = '#00A884';
const POSICIONES = { inicio: ['Inicio', 'la frase abre'], mitad: ['Mitad', 'la frase parte el párrafo'], final: ['Final', 'la frase cierra'] };

export default {
  slug: 'cutup',
  nombre: 'Cut Up',
  version: '1.0',

  async abrir(cont, ctx) {
    const juegos = await estado.api.contenidos('cutup');
    const editando = ctx.entrega || null;
    let juego;
    if (editando) {
      juego = juegos.find(j => j.item_id === editando.item_id) || await estado.api.contenido('cutup', editando.item_id);
      if (!juego) { cont.innerHTML = `<div class="contenedor">${vacio('El juego de frases ya no está disponible')}</div>`; return; }
    } else {
      if (!juegos.length) { cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No hay frases cargadas', 'El tutor todavía no ha cargado un juego de frases para esta dinámica.')}</div>`; return; }
      const id = ctx.item_id || ctx.sesion?.item_id;
      juego = juegos.find(j => j.item_id === id);
      if (!juego) { location.replace(`#/d/cutup/${encodeURIComponent(juegos[0].item_id)}`); return; }
    }
    const J = juego.datos;
    const N_PARRAFOS = J.parrafos || 4;
    const MIN_FRASES = Math.min(J.frases_minimas ?? 3, N_PARRAFOS);
    const MIN_PALABRAS = J.palabras_minimas ?? 40;
    const TAM_PANEL = Math.min(J.fuentes.length, 6);
    const BANCO = [];
    J.fuentes.forEach(f => f.frases.forEach((t, i) => BANCO.push({ id: `${f.id}:${i}`, fuente: f.id, texto: t })));
    const PORID = Object.fromEntries(BANCO.map(b => [b.id, b]));
    const fuenteDe = id => J.fuentes.find(f => f.id === id);
    const clave = `cutup:${juego.item_id}`;
    const claveLocal = `borrador:${estado.yo.id}:${clave}`;

    // ---------- estado ----------
    const nuevo = () => ({ titulo: '', panel: [], barajadas: 0, parrafos: Array.from({ length: N_PARRAFOS }, () => ({ frase: null, pos: null, antes: '', despues: '' })) });
    let E = nuevo();
    let notaBorrador = '';
    const limpiarEstado = d => {
      const e = nuevo();
      e.titulo = d.titulo || '';
      e.barajadas = d.barajadas || 0;
      e.panel = (d.panel || []).filter(id => PORID[id]);
      (d.parrafos || []).slice(0, N_PARRAFOS).forEach((p, i) => {
        e.parrafos[i] = { frase: p.frase && PORID[p.frase] ? p.frase : null, pos: p.frase && PORID[p.frase] ? p.pos : null, antes: p.antes || '', despues: p.despues || '' };
      });
      return e;
    };
    if (editando) {
      const d = editando.datos || {};
      E = limpiarEstado({ titulo: editando.titulo, barajadas: d.barajadas, parrafos: (d.parrafos || []).map(p => ({ frase: p.frase_id, pos: p.pos, antes: p.antes, despues: p.despues })) });
    } else {
      const loc = local(claveLocal);
      let nube = null;
      try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
      const b = [loc, nube].filter(Boolean).sort((a, c) => (c._actualizado || '').localeCompare(a._actualizado || ''))[0];
      if (b?.estado) { E = limpiarEstado(b.estado); notaBorrador = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`; }
    }
    let elegida = null;

    const colocadas = () => E.parrafos.filter(p => p.frase).map(p => p.frase);
    function barajarPanel() {
      const puestas = colocadas(), previas = [...E.panel], salida = [];
      for (const f of barajar(J.fuentes).slice(0, TAM_PANEL)) {
        let libres = BANCO.filter(x => x.fuente === f.id && !puestas.includes(x.id) && !previas.includes(x.id));
        if (!libres.length) libres = BANCO.filter(x => x.fuente === f.id && !puestas.includes(x.id));
        if (libres.length) salida.push(libres[Math.floor(Math.random() * libres.length)].id);
      }
      E.panel = barajar(salida);
      elegida = null;
    }
    if (!E.panel.length) barajarPanel();

    // ---------- estructura ----------
    cont.innerHTML = `
    <div class="contenedor" style="max-width:1400px">
      <div class="escritorio" style="--acento:${ACENTO}">
        <aside class="consigna-panel">
          <span class="rotulo">Escritura Cut Up</span>
          <h1>Composición por injerto</h1>
          <div class="consigna-texto">
            <p>El <strong>cut-up</strong> es el procedimiento que William Burroughs tomó del pintor Brion Gysin: cortar textos y recombinar sus fragmentos hasta que el azar produzca asociaciones que ninguna intención habría alcanzado.</p>
            <p>Aquí se invierte. Usted recibe frases ya cortadas, de procedencias distintas, y construye alrededor de ellas un relato que las sostenga. <strong>La frase ajena no se puede modificar</strong>: lo que usted escribe es la sintaxis capaz de acogerla.</p>
          </div>
          ${juegos.length > 1 && !editando ? `<label class="sr" for="elegir-juego">Juego de frases</label><select class="selector" id="elegir-juego" style="margin-top:6px">${juegos.map(j => `<option value="${esc(j.item_id)}" ${j.item_id === juego.item_id ? 'selected' : ''}>${esc(j.datos.nombre)}</option>`).join('')}</select>` : ''}
          <div class="fila" style="margin-top:18px"><span class="rotulo">Frases disponibles</span><span class="espaciador"></span><span class="tenue" id="restantes" style="font-size:13px"></span></div>
          <div class="pila-frases" id="pila"></div>
          <div class="fila" style="margin-top:10px"><button type="button" class="btn btn-chico" id="b-barajar">${icono('barajar', 16)}Barajar frases</button><span class="tenue" id="barajadas" style="font-size:13px"></span></div>
          <div class="consigna-extra" id="requisitos"></div>
        </aside>
        <section class="mesa">
          <div class="mesa-barra">
            <span class="rotulo">${esc(J.nombre || 'Cut Up')}</span>
            <span class="espaciador"></span>
            <span class="guardado" id="guardado">${esc(notaBorrador)}</span>
            <button type="button" class="herr" id="enfoque" title="Modo enfoque" aria-label="Modo enfoque">${icono('enfoque', 18)}</button>
          </div>
          <div class="hoja-escribir">
            <input class="titulo-escribir" id="titulo" placeholder="Título del relato" maxlength="140" value="${esc(E.titulo)}">
            <div id="tablero"></div>
          </div>
          <div class="mesa-pie">
            <span class="contador" id="contador"></span>
            <span class="espaciador"></span>
            <button type="button" class="btn btn-primario" id="publicar" disabled>${icono(editando ? 'check' : 'enviar', 18)}${editando ? 'Guardar cambios' : 'Publicar relato'}</button>
          </div>
        </section>
      </div>
    </div>`;

    const $ = s => cont.querySelector(s);
    const elGuardado = $('#guardado');
    const propias = p => contarPalabras(p.antes) + contarPalabras(p.despues);

    // ---------- guardado ----------
    const guardarNube = debounce(async () => {
      if (editando) return;
      try { await estado.api.guardarBorrador(clave, { estado: E }); elGuardado.textContent = 'Guardado'; }
      catch { elGuardado.textContent = 'Guardado en este dispositivo'; }
    }, 3000);
    function cambio() {
      if (editando) { elGuardado.textContent = 'Cambios sin guardar'; return; }
      local(claveLocal, { estado: E, _actualizado: new Date().toISOString() });
      elGuardado.textContent = 'Guardando…';
      guardarNube();
    }

    // ---------- pintado ----------
    function pintarPila() {
      const pila = $('#pila');
      pila.innerHTML = E.panel.map(id => `<div class="frase-carta${elegida === id ? ' elegida' : ''}" draggable="true" tabindex="0" role="button" data-id="${esc(id)}">${esc(PORID[id].texto)}</div>`).join('')
        + Array.from({ length: Math.max(0, TAM_PANEL - E.panel.length) }, () => '<div class="frase-hueco">Ranura libre</div>').join('');
      $('#restantes').textContent = `${BANCO.length - colocadas().length - E.panel.length} en el banco`;
      $('#barajadas').textContent = E.barajadas ? `Barajadas: ${E.barajadas}` : '';
    }

    function pintarTablero() {
      $('#tablero').innerHTML = E.parrafos.map((p, i) => {
        const cab = `<div class="parrafo-cab"><span>Párrafo ${i + 1}${p.frase ? ' · frase al ' + POSICIONES[p.pos][0].toLowerCase() : ''}</span>${p.frase ? `<span class="cuenta${propias(p) >= MIN_PALABRAS ? ' ok' : ''}" data-cuenta="${i}">${propias(p)} / ${MIN_PALABRAS} palabras propias</span>` : ''}</div>`;
        if (!p.frase) {
          const reserva = propias(p) ? `<div class="reserva">Texto conservado (${propias(p)} palabras). Coloque una frase en este párrafo para seguir editándolo.</div>` : '';
          return `<div class="parrafo-cu" data-p="${i}">${cab}${reserva}<div class="ranuras">${Object.entries(POSICIONES).map(([pos, [n, pista]]) =>
            `<button type="button" class="ranura" data-p="${i}" data-pos="${pos}">${n}<small>${pista}</small></button>`).join('')}</div></div>`;
        }
        const area = (campo, ph) => `<textarea class="escritura" data-p="${i}" data-campo="${campo}" placeholder="${ph}" aria-label="Texto propio del párrafo ${i + 1}">${esc(p[campo])}</textarea>`;
        return `<div class="parrafo-cu activo" data-p="${i}">${cab}
          ${p.pos !== 'inicio' ? area('antes', 'Escriba lo que antecede a la frase…') : ''}
          <div class="injerto">${esc(PORID[p.frase].texto)}<button type="button" class="quitar-injerto" data-quitar="${i}" aria-label="Quitar la frase de este párrafo" title="Quitar la frase">${icono('x', 15)}</button></div>
          ${p.pos !== 'final' ? area('despues', 'Escriba lo que sigue a la frase…') : ''}
        </div>`;
      }).join('');
      cont.querySelectorAll('.escritura').forEach(crecer);
    }
    const crecer = t => { t.style.height = 'auto'; t.style.height = Math.max(76, t.scrollHeight) + 'px'; };

    function condiciones() {
      const con = E.parrafos.filter(p => p.frase);
      return {
        titulo: !!E.titulo.trim(),
        frases: con.length >= MIN_FRASES,
        palabras: con.length > 0 && con.every(p => propias(p) >= MIN_PALABRAS),
      };
    }
    function validar() {
      const c = condiciones();
      const item = (ok, t) => `<span class="linea-ico" style="${ok ? 'color:var(--verde);font-weight:600' : ''}">${icono(ok ? 'check' : 'info', 16)}${t}</span>`;
      $('#requisitos').innerHTML = `<span class="rotulo">Para publicar</span>
        ${item(c.titulo, 'Escribir un título')}
        ${item(c.frases, `Colocar al menos ${MIN_FRASES} frases`)}
        ${item(c.palabras, `${MIN_PALABRAS} palabras propias como mínimo en cada párrafo con frase`)}`;
      $('#publicar').disabled = !(c.titulo && c.frases && c.palabras);
      const total = E.parrafos.reduce((s, p) => s + propias(p), 0);
      $('#contador').textContent = `${total} palabras propias`;
    }
    function pintar() { pintarPila(); pintarTablero(); validar(); }

    // ---------- colocar y quitar ----------
    function colocar(id, i, pos) {
      const p = E.parrafos[i];
      if (p.frase) { aviso('Ese párrafo ya tiene una frase.'); return; }
      const todo = [p.antes, p.despues].filter(s => s && s.trim()).join(' ').trim();
      if (pos === 'inicio') { p.antes = ''; p.despues = todo; }
      else if (pos === 'final') { p.antes = todo; p.despues = ''; }
      else if (!p.antes && todo) { p.antes = todo; p.despues = ''; }
      p.frase = id; p.pos = pos;
      E.panel = E.panel.filter(x => x !== id);
      elegida = null;
      pintar(); cambio();
      cont.querySelector(`.escritura[data-p="${i}"]`)?.focus();
    }
    function quitar(i) {
      const p = E.parrafos[i];
      if (!p.frase) return;
      const id = p.frase;
      p.frase = null; p.pos = null;
      if (E.panel.length < TAM_PANEL) E.panel.push(id);
      else aviso('La frase regresó al banco: el panel ya estaba completo.');
      pintar(); cambio();
    }

    // ---------- eventos ----------
    const pila = $('#pila');
    pila.addEventListener('click', ev => {
      const c = ev.target.closest('.frase-carta');
      if (!c) return;
      elegida = elegida === c.dataset.id ? null : c.dataset.id;
      pintarPila();
    });
    pila.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('.frase-carta')) { ev.preventDefault(); ev.target.click(); } });
    pila.addEventListener('dragstart', ev => {
      const c = ev.target.closest('.frase-carta');
      if (!c) return;
      ev.dataTransfer.setData('text/plain', c.dataset.id);
      ev.dataTransfer.effectAllowed = 'move';
    });
    const tablero = $('#tablero');
    tablero.addEventListener('dragover', ev => { const r = ev.target.closest('.ranura'); if (r) { ev.preventDefault(); r.classList.add('encima'); } });
    tablero.addEventListener('dragleave', ev => { ev.target.closest('.ranura')?.classList.remove('encima'); });
    tablero.addEventListener('drop', ev => {
      const r = ev.target.closest('.ranura');
      if (!r) return;
      ev.preventDefault();
      const id = ev.dataTransfer.getData('text/plain');
      if (PORID[id] && E.panel.includes(id)) colocar(id, +r.dataset.p, r.dataset.pos);
    });
    tablero.addEventListener('click', ev => {
      const q = ev.target.closest('[data-quitar]');
      if (q) { quitar(+q.dataset.quitar); return; }
      const r = ev.target.closest('.ranura');
      if (!r) return;
      if (elegida) colocar(elegida, +r.dataset.p, r.dataset.pos);
      else aviso('Elija primero una frase del panel.');
    });
    tablero.addEventListener('input', ev => {
      const t = ev.target.closest('.escritura');
      if (!t) return;
      E.parrafos[+t.dataset.p][t.dataset.campo] = t.value;
      crecer(t);
      const p = E.parrafos[+t.dataset.p];
      const cuenta = cont.querySelector(`[data-cuenta="${t.dataset.p}"]`);
      if (cuenta) { cuenta.textContent = `${propias(p)} / ${MIN_PALABRAS} palabras propias`; cuenta.classList.toggle('ok', propias(p) >= MIN_PALABRAS); }
      validar(); cambio();
    });
    $('#titulo').addEventListener('input', ev => { E.titulo = ev.target.value; validar(); cambio(); });
    $('#b-barajar').addEventListener('click', () => { barajarPanel(); E.barajadas++; pintarPila(); cambio(); });
    $('#elegir-juego')?.addEventListener('change', ev => { location.hash = `#/d/cutup/${encodeURIComponent(ev.target.value)}`; });
    $('#enfoque').addEventListener('click', ev => { ev.currentTarget.classList.toggle('on', document.body.classList.toggle('enfoque')); });
    const tecla = ev => { if (ev.key === 'Escape' && elegida) { elegida = null; pintarPila(); } };
    document.addEventListener('keydown', tecla);

    // ---------- publicar ----------
    $('#publicar').addEventListener('click', async () => {
      const usados = E.parrafos.filter(p => p.frase).map(p => ({ ...p, antes: p.antes.trim(), despues: p.despues.trim(), f: PORID[p.frase] }));
      const vista = `<div class="v-cutup">${usados.map(p => `<p>${p.antes ? esc(p.antes) + ' ' : ''}<span class="v-injerto">${esc(p.f.texto)}</span>${p.despues ? ' ' + esc(p.despues) : ''}</p>`).join('')}</div>
        <div class="v-procedencia"><p class="v-credito">Procedencia de las frases</p>${usados.map(p => { const f = fuenteDe(p.f.fuente); return `<p class="v-credito">«${esc(p.f.texto)}» — ${esc(f?.titulo || '')}, de ${esc(f?.autor || '')}</p>`; }).join('')}</div>`;
      const texto = usados.map(p => [p.antes, p.f.texto, p.despues].filter(Boolean).join(' ')).join('\n\n');
      if (!editando && !(await confirmar(avisoPublicar('su relato'), { si: 'Publicar', no: 'Seguir escribiendo' }))) return;
      const b = $('#publicar');
      b.disabled = true;
      try {
        await publicarEntrega({
          dinamica: 'cutup', item_id: juego.item_id, titulo: E.titulo.trim(), texto, vista, modulo_version: '1.0',
          datos: { barajadas: E.barajadas, parrafos: usados.map(p => ({ frase_id: p.frase, frase: p.f.texto, fuente: p.f.fuente, pos: p.pos, antes: p.antes, despues: p.despues })) },
        }, { entregaExistente: editando });
        guardarNube.cancelar();
        if (!editando) { local(claveLocal, null); estado.api.borrarBorrador(clave).catch(() => {}); }
      } catch (e) { errorAviso(e); b.disabled = false; }
    });

    pintar();
    return () => {
      document.removeEventListener('keydown', tecla);
      if (!editando && E.parrafos.some(p => p.frase || p.antes || p.despues)) guardarNube.ahora();
    };
  },

  paquete: {
    plantilla: 'plantillas/cutup.json',
    describir: d => `${d.nombre} · ${d.fuentes?.reduce((s, f) => s + f.frases.length, 0) || 0} frases`,
    validar(json) {
      const errores = [];
      const lista = Array.isArray(json) ? json : json?.juegos;
      if (!Array.isArray(lista)) return { items: [], errores: ['El archivo debe tener una lista "juegos": [ … ].'] };
      const vistos = new Set();
      const items = [];
      lista.forEach((j, i) => {
        const n = `Juego ${i + 1}`;
        if (!j || typeof j !== 'object') { errores.push(`${n}: no es un objeto.`); return; }
        const id = String(j.id || '').trim();
        if (!id) errores.push(`${n}: falta "id".`);
        else if (vistos.has(id)) errores.push(`${n}: el id "${id}" está repetido.`);
        vistos.add(id);
        if (!String(j.nombre || '').trim()) errores.push(`${n} (${id}): falta "nombre".`);
        if (!Array.isArray(j.fuentes) || j.fuentes.length < 2) errores.push(`${n} (${id}): necesita al menos 2 "fuentes".`);
        const idsF = new Set();
        (j.fuentes || []).forEach((f, k) => {
          const nf = `${n}, fuente ${k + 1}`;
          if (!String(f.id || '').trim()) errores.push(`${nf}: falta "id".`);
          else if (idsF.has(f.id)) errores.push(`${nf}: el id "${f.id}" está repetido.`);
          idsF.add(f.id);
          if (!String(f.titulo || '').trim()) errores.push(`${nf}: falta "titulo".`);
          if (!String(f.autor || '').trim()) errores.push(`${nf}: falta "autor".`);
          if (!Array.isArray(f.frases) || !f.frases.filter(x => typeof x === 'string' && x.trim()).length) errores.push(`${nf}: necesita una lista "frases".`);
        });
        const par = j.parrafos ?? 4;
        if (!Number.isInteger(par) || par < 1 || par > 10) errores.push(`${n} (${id}): "parrafos" debe ser un número entre 1 y 10.`);
        items.push({
          item_id: id,
          datos: {
            nombre: String(j.nombre || '').trim(), parrafos: par,
            frases_minimas: j.frases_minimas ?? 3, palabras_minimas: j.palabras_minimas ?? 40,
            fuentes: (j.fuentes || []).map(f => ({ id: String(f.id), titulo: String(f.titulo || ''), autor: String(f.autor || ''), frases: (f.frases || []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) })),
          },
        });
      });
      return { items, errores };
    },
  },
};
