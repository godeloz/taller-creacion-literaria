// Cuaderno privado: proyectos y notas que solo ve su dueño.
import { estado } from '../nucleo/estado.js';
import { esc, modal, confirmar, errorAviso, debounce, hace, descargarArchivo, nombreArchivo } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';

const COLORES = ['#FF6B4A', '#4D7CFF', '#FF4F7B', '#00A884', '#FFB547', '#B18CFF', '#C6F24E', '#16141C'];

export default async function cuaderno(cont) {
  let proyectos = await estado.api.proyectos();
  let notas = await estado.api.notas();
  let filtro = 'todas';
  let actual = null;

  cont.innerHTML = `
  <div class="contenedor" style="max-width:1400px">
    <div class="fila" style="align-items:flex-end;margin-bottom:22px">
      <div><h1 class="saludo" style="margin:0 0 6px">Cuaderno</h1>
      <span class="privado-sello">${icono('candado', 14)}Privado: solo usted lo ve</span></div>
      <span class="espaciador"></span>
      <button class="btn btn-chico btn-fantasma" id="b-exportar">${icono('descargar', 16)}Descargar todo</button>
    </div>
    <div class="cuaderno">
      <aside class="cuaderno-col">
        <div class="fila"><span class="rotulo">Proyectos</span><span class="espaciador"></span>
          <button class="btn btn-chico btn-icono btn-fantasma" id="b-proyecto" aria-label="Nuevo proyecto" title="Nuevo proyecto">${icono('mas', 18)}</button></div>
        <div class="cuaderno-lista" id="proyectos"></div>
      </aside>
      <section class="cuaderno-col cuaderno-notas">
        <div class="fila"><span class="rotulo" id="titulo-lista">Notas</span><span class="espaciador"></span>
          <button class="btn btn-chico btn-primario" id="b-nota">${icono('mas', 16)}Nota</button></div>
        <div class="cuaderno-lista" id="notas"></div>
      </section>
      <section id="editor-nota"></section>
    </div>
  </div>`;

  const elProy = cont.querySelector('#proyectos');
  const elNotas = cont.querySelector('#notas');
  const elEditor = cont.querySelector('#editor-nota');

  const visibles = () => notas.filter(n => filtro === 'todas' || (filtro === 'sin' ? !n.proyecto_id : n.proyecto_id === filtro));

  function pintarProyectos() {
    const cuenta = f => notas.filter(n => f === 'todas' || (f === 'sin' ? !n.proyecto_id : n.proyecto_id === f)).length;
    elProy.innerHTML = `
      <button class="cuaderno-item ${filtro === 'todas' ? 'activo' : ''}" data-f="todas">${icono('cuaderno', 18)}Todas las notas<small>${cuenta('todas')}</small></button>
      ${proyectos.map(p => `<button class="cuaderno-item ${filtro === p.id ? 'activo' : ''}" data-f="${p.id}"><span class="punto" style="background:${esc(p.color || '#16141C')};width:12px;height:12px"></span>${esc(p.titulo)}<small>${cuenta(p.id)}</small></button>`).join('')}
      <button class="cuaderno-item ${filtro === 'sin' ? 'activo' : ''}" data-f="sin">${icono('pagina', 18)}Sueltas<small>${cuenta('sin')}</small></button>`;
    const p = proyectos.find(x => x.id === filtro);
    cont.querySelector('#titulo-lista').innerHTML = p ? `${esc(p.titulo)} <button class="btn btn-fantasma btn-chico btn-icono" id="b-editar-proy" aria-label="Editar proyecto" title="Editar proyecto">${icono('lapiz', 15)}</button>` : filtro === 'sin' ? 'Notas sueltas' : 'Notas';
    cont.querySelector('#b-editar-proy')?.addEventListener('click', () => editarProyecto(p));
  }

  function pintarNotas() {
    const lista = visibles();
    elNotas.innerHTML = lista.length ? lista.map(n => `
      <button class="nota-item ${actual?.id === n.id ? 'activo' : ''}" data-n="${n.id}">
        <b>${esc(n.titulo || 'Sin título')}</b>
        <span>${esc((n.cuerpo || '').slice(0, 80) || 'Vacía')}</span>
        <span style="font-size:12px">${hace(n.actualizado)}</span>
      </button>`).join('') : '<p class="tenue" style="padding:10px;font-size:14px">No hay notas aquí. Cree la primera.</p>';
  }

  let sucio = false;
  const guardarDiferido = debounce(async () => {
    if (!actual || !sucio) return;
    sucio = false;
    const estadoEl = elEditor.querySelector('#estado-nota');
    try {
      const g = await estado.api.guardarNota(actual);
      Object.assign(actual, g);
      const i = notas.findIndex(n => n.id === g.id);
      if (i >= 0) notas[i] = actual;
      if (estadoEl) estadoEl.textContent = 'Guardado';
      pintarNotas();
      pintarProyectos();
    } catch (e) { errorAviso(e); if (estadoEl) estadoEl.textContent = 'No se pudo guardar'; }
  }, 800);

  function pintarEditor() {
    if (!actual) {
      elEditor.innerHTML = `<div class="nota-editor" style="align-items:center;justify-content:center;color:var(--tenue);padding:40px;text-align:center">
        ${icono('cuaderno', 40)}<p>Elija una nota o cree una nueva.<br>Aquí puede guardar ideas, borradores de proyectos, apuntes de clase.</p></div>`;
      return;
    }
    elEditor.innerHTML = `
      <div class="nota-editor">
        <div class="fila" style="padding:14px 20px 0;gap:8px">
          <label class="sr" for="nota-proy">Proyecto</label>
          <select class="selector" id="nota-proy" style="width:auto;min-height:36px;font-size:14px">
            <option value="">Sin proyecto</option>
            ${proyectos.map(p => `<option value="${p.id}" ${actual.proyecto_id === p.id ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('')}
          </select>
          <span class="espaciador"></span>
          <span class="guardado" id="estado-nota"></span>
          <button class="btn btn-fantasma btn-chico btn-icono" id="b-borrar-nota" aria-label="Borrar nota" title="Borrar nota">${icono('basura', 17)}</button>
        </div>
        <input class="titulo-escribir" id="nota-titulo" placeholder="Título de la nota" value="${esc(actual.titulo)}">
        <textarea id="nota-cuerpo" placeholder="Escriba aquí…">${esc(actual.cuerpo)}</textarea>
      </div>`;
    const marcar = () => { sucio = true; elEditor.querySelector('#estado-nota').textContent = 'Guardando…'; guardarDiferido(); };
    elEditor.querySelector('#nota-titulo').addEventListener('input', ev => { actual.titulo = ev.target.value; marcar(); });
    elEditor.querySelector('#nota-cuerpo').addEventListener('input', ev => { actual.cuerpo = ev.target.value; marcar(); });
    elEditor.querySelector('#nota-proy').addEventListener('change', ev => { actual.proyecto_id = ev.target.value || null; marcar(); });
    elEditor.querySelector('#b-borrar-nota').addEventListener('click', async () => {
      if (!(await confirmar('¿Borrar esta nota? No se puede recuperar.', { si: 'Borrar', peligro: true }))) return;
      try {
        guardarDiferido.cancelar();
        await estado.api.borrarNota(actual.id);
        notas = notas.filter(n => n.id !== actual.id);
        actual = null;
        pintarTodo();
      } catch (e) { errorAviso(e); }
    });
  }

  function pintarTodo() { pintarProyectos(); pintarNotas(); pintarEditor(); }

  async function editarProyecto(p) {
    let color = p?.color || COLORES[proyectos.length % COLORES.length];
    const r = await modal({
      titulo: p ? 'Editar proyecto' : 'Nuevo proyecto',
      cuerpo: `<div class="campo"><label for="p-tit">Nombre</label><input class="entrada" id="p-tit" value="${esc(p?.titulo || '')}" placeholder="Mi novela, poemario, cuentos…"></div>
        <div class="campo"><label for="p-desc">Descripción (opcional)</label><textarea class="area" id="p-desc">${esc(p?.descripcion || '')}</textarea></div>
        <div class="etiqueta" style="margin-bottom:8px">Color</div>
        <div class="fila" id="p-colores">${COLORES.map(c => `<button type="button" data-c="${c}" aria-label="Color ${c}" style="width:34px;height:34px;border-radius:50%;background:${c};border:3px solid ${c === color ? '#16141C' : 'transparent'};outline:2px solid #fff;outline-offset:-5px"></button>`).join('')}</div>`,
      acciones: [
        ...(p ? [{ texto: 'Borrar proyecto', clase: 'btn-peligro', valor: 'borrar' }] : []),
        { texto: 'Cancelar', clase: 'btn-fantasma', valor: null },
        { texto: 'Guardar', clase: 'btn-primario', accion: v => {
          const titulo = v.querySelector('#p-tit').value.trim();
          if (!titulo) return false;
          return { titulo, descripcion: v.querySelector('#p-desc').value.trim(), color };
        } },
      ],
      alAbrir: v => v.querySelector('#p-colores').addEventListener('click', ev => {
        const b = ev.target.closest('[data-c]');
        if (!b) return;
        color = b.dataset.c;
        v.querySelectorAll('[data-c]').forEach(x => { x.style.borderColor = x === b ? '#16141C' : 'transparent'; });
      }),
    });
    try {
      if (r === 'borrar') {
        if (!(await confirmar('¿Borrar el proyecto? Sus notas no se borran: quedan como notas sueltas.', { si: 'Borrar', peligro: true }))) return;
        await estado.api.borrarProyecto(p.id);
        proyectos = proyectos.filter(x => x.id !== p.id);
        notas.forEach(n => { if (n.proyecto_id === p.id) n.proyecto_id = null; });
        filtro = 'todas';
      } else if (r && typeof r === 'object') {
        const g = await estado.api.guardarProyecto({ ...p, ...r });
        if (p) Object.assign(p, g); else { proyectos.push(g); filtro = g.id; }
      }
      pintarTodo();
    } catch (e) { errorAviso(e); }
  }

  elProy.addEventListener('click', ev => {
    const b = ev.target.closest('[data-f]');
    if (!b) return;
    filtro = b.dataset.f;
    pintarProyectos(); pintarNotas();
  });
  elNotas.addEventListener('click', ev => {
    const b = ev.target.closest('[data-n]');
    if (!b) return;
    guardarDiferido.ahora();
    actual = notas.find(n => n.id === b.dataset.n);
    pintarNotas(); pintarEditor();
    elEditor.querySelector('#nota-cuerpo')?.focus();
  });
  cont.querySelector('#b-proyecto').addEventListener('click', () => editarProyecto(null));
  cont.querySelector('#b-nota').addEventListener('click', async () => {
    try {
      guardarDiferido.ahora();
      const pid = filtro !== 'todas' && filtro !== 'sin' ? filtro : null;
      const n = await estado.api.guardarNota({ titulo: '', cuerpo: '', proyecto_id: pid });
      notas.unshift(n);
      actual = n;
      pintarTodo();
      elEditor.querySelector('#nota-titulo').focus();
    } catch (e) { errorAviso(e); }
  });
  cont.querySelector('#b-exportar').addEventListener('click', () => {
    const nombreP = id => proyectos.find(p => p.id === id)?.titulo || 'Notas sueltas';
    const txt = notas.map(n => `${(n.titulo || 'Sin título').toUpperCase()}\n[${nombreP(n.proyecto_id)}]\n\n${n.cuerpo}`).join('\n\n\n———\n\n\n');
    descargarArchivo(`cuaderno-${nombreArchivo(estado.yo.nombre)}.txt`, txt);
  });

  pintarTodo();
  return () => guardarDiferido.ahora();
}
