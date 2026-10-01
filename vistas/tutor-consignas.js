// Panel del tutor · Consignas de escritura: banco, editor, grupos y fechas, seguimiento.
import { estado, recargarBase, MODOS } from '../nucleo/estado.js';
import { esc, aviso, errorAviso, confirmar, debounce, fechaHora, modal, $, $$ } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { avatar, vacio } from '../nucleo/componentes.js';
import { descargarTXT, imprimir } from '../nucleo/exportar.js';
import {
  panelConsigna, estadoDe, estadoPorFechas, aCampo, deCampo, fechaCortaHora, ETIQUETA_ESTADO, ACENTO_CONSIGNA, cuandoCierra,
} from '../nucleo/consignas.js';

const nombreGrupo = id => estado.grupos.find(g => g.id === id)?.nombre || 'Grupo';
const pillEstado = (a, ahora) => `<span class="pill-consigna estado-${estadoDe(a, ahora)}">${ETIQUETA_ESTADO[estadoDe(a, ahora)]}</span>`;

export async function seccionConsignas(c, query) {
  if (query.editar) return editor(c, query.editar === 'nueva' ? null : query.editar);
  if (query.ver) return seguimiento(c, query.ver, query);
  return banco(c, query);
}

// ---------------------------------------------------------------------
// Banco de consignas
// ---------------------------------------------------------------------
async function banco(c, query) {
  const [todas, textos] = await Promise.all([
    estado.api.consignas(),
    estado.api.entregas({ dinamica: 'consignas', incluirOcultas: true, limite: 5000 }).catch(() => []),
  ]);
  const ahora = new Date().toISOString();
  const archivadas = query.archivadas !== undefined;
  const lista = todas.filter(x => !!x.archivada === archivadas);
  const nArch = todas.filter(x => x.archivada).length;
  c.innerHTML = `
    <div class="fila" style="margin-bottom:6px">
      <p class="tenue" style="margin:0;max-width:70ch">Cree consignas, asígnelas a cada grupo con sus propias fechas y siga quién publicó. Una consigna se puede usar con varios grupos en momentos distintos.</p>
      <span class="espaciador"></span>
      <a class="btn btn-primario" href="#/tutor/consignas?editar=nueva">${icono('mas', 18)}Nueva consigna</a>
    </div>
    <div class="filtros">
      <a class="chip ${!archivadas ? 'activo' : ''}" href="#/tutor/consignas">Activas <span class="chip-n">${todas.length - nArch}</span></a>
      <a class="chip ${archivadas ? 'activo' : ''}" href="#/tutor/consignas?archivadas">Archivadas <span class="chip-n">${nArch}</span></a>
    </div>
    ${lista.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Consigna</th><th>Grupos y fechas</th><th class="num">Textos</th><th></th></tr></thead>
      <tbody>${lista.map(x => {
        const n = textos.filter(e => e.item_id === x.id).length;
        return `<tr>
          <td><b>${esc(x.titulo)}</b><br><span class="tenue" style="font-size:13px">${x.limite_palabras ? `Máximo ${x.limite_palabras} palabras` : 'Sin límite de palabras'}</span></td>
          <td>${(x.grupos || []).length ? x.grupos.map(a => `<div class="cg-linea">${pillEstado(a, ahora)} <b>${esc(nombreGrupo(a.grupo_id))}</b>
            <span class="tenue">${esc(fechaCortaHora(a.apertura))} → ${esc(fechaCortaHora(a.cierre))}</span></div>`).join('') : '<span class="tenue">Sin asignar</span>'}</td>
          <td class="num">${n || ''}</td>
          <td style="white-space:nowrap">
            <a class="btn btn-chico" href="#/tutor/consignas?editar=${esc(x.id)}">${icono('lapiz', 15)}Editar y asignar</a>
            <a class="btn btn-chico btn-fantasma" href="#/tutor/consignas?ver=${esc(x.id)}">${icono('medalla', 15)}Seguimiento</a>
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>`
      : vacio(archivadas ? 'No hay consignas archivadas' : 'Todavía no hay consignas', archivadas ? '' : 'Cree la primera y asígnela a un grupo.',
        archivadas ? '' : '<a class="btn btn-primario" href="#/tutor/consignas?editar=nueva">Nueva consigna</a>')}`;
}

// ---------------------------------------------------------------------
// Editor y asignación a grupos
// ---------------------------------------------------------------------
function bloqueEjemplo(e = {}) {
  return `<div class="ejemplo-editor">
    <div class="ejemplo-editor-fila">
      <input class="entrada" data-k="titulo" placeholder="Título del ejemplo" value="${esc(e.titulo || '')}" aria-label="Título del ejemplo">
      <input class="entrada" data-k="autor" placeholder="Autor (opcional)" value="${esc(e.autor || '')}" aria-label="Autor">
      <button type="button" class="btn btn-fantasma btn-icono" data-quitar title="Quitar ejemplo" aria-label="Quitar ejemplo">${icono('basura', 17)}</button>
    </div>
    <input class="entrada" data-k="enlace" placeholder="Enlace (opcional): https://…" value="${esc(e.enlace || '')}" aria-label="Enlace">
    <textarea class="area" data-k="texto" placeholder="Texto del ejemplo (opcional): un cuento, un fragmento, una muestra…" aria-label="Texto del ejemplo">${esc(e.texto || '')}</textarea>
  </div>`;
}

// Campos de una consigna (los usa el editor del panel y el material que se edita desde la vista de la consigna).
function camposConsigna(cons, { hayTextos = false } = {}) {
  return `<div class="campo"><label for="k-titulo">Título</label><input class="entrada" id="k-titulo" maxlength="140" value="${esc(cons.titulo)}" placeholder="Por ejemplo: Un minuto que no se acaba"></div>
        <div class="campo"><label for="k-instr">Instrucciones</label>
          <textarea class="area" id="k-instr" style="min-height:190px" placeholder="Escriba la consigna en frases breves.&#10;&#10;1. Primer paso&#10;2. Segundo paso">${esc(cons.instrucciones)}</textarea>
          <span class="nota-campo">Una línea en blanco separa párrafos. Pasos con «1.», «2.»; viñetas con «-». **negrita**, *cursiva*. Los enlaces se activan solos.</span></div>
        <div class="campo"><label for="k-limite">Límite de palabras</label>
          <input class="entrada" id="k-limite" type="number" min="10" max="20000" step="10" value="${cons.limite_palabras || ''}" placeholder="Sin límite" style="max-width:200px">
          <span class="nota-campo">Nadie podrá publicar un texto más largo. Déjelo vacío si no hay límite.${hayTextos ? ' Los textos ya publicados no cambian.' : ''}</span></div>
        <div class="campo"><label>Ejemplos y lecturas</label>
          <div id="k-ejemplos">${(cons.ejemplos || []).map(bloqueEjemplo).join('')}</div>
          <button type="button" class="btn btn-chico" id="k-mas">${icono('mas', 15)}Agregar ejemplo</button>
          <span class="nota-campo">Cuentos, fragmentos o enlaces que inspiran la consigna. El grupo los abre junto al espacio de escritura.</span></div>
        <div class="campo"><label for="k-ref">Referentes</label>
          <textarea class="area" id="k-ref" style="min-height:90px" placeholder="Una referencia por línea">${esc(cons.referentes || '')}</textarea>
          <span class="nota-campo">Una por línea. *Cursiva* para los títulos; los enlaces se activan solos.</span></div>`;
}
function leerCampos(raiz) {
  return {
    titulo: $('#k-titulo', raiz).value.trim(),
    instrucciones: $('#k-instr', raiz).value.trim(),
    limite_palabras: Number($('#k-limite', raiz).value) || null,
    referentes: $('#k-ref', raiz).value.trim(),
    ejemplos: $$('.ejemplo-editor', $('#k-ejemplos', raiz)).map(b => Object.fromEntries($$('[data-k]', b).map(x => [x.dataset.k, x.value.trim()])))
      .filter(e => e.titulo || e.texto || e.enlace),
  };
}
function validarCampos(d) {
  if (!d.titulo) { aviso('Escriba un título para la consigna.', 'error'); return false; }
  if (!d.instrucciones) { aviso('Escriba las instrucciones de la consigna.', 'error'); return false; }
  if (d.limite_palabras && (d.limite_palabras < 10 || d.limite_palabras > 20000)) { aviso('El límite debe estar entre 10 y 20.000 palabras.', 'error'); return false; }
  if (d.ejemplos.some(e => e.enlace && !/^https?:\/\//i.test(e.enlace))) { aviso('Los enlaces de los ejemplos deben empezar por http:// o https://', 'error'); return false; }
  return true;
}
function activarEjemplos(raiz, alCambiar = () => {}) {
  const ejemplos = $('#k-ejemplos', raiz);
  $('#k-mas', raiz).onclick = () => { ejemplos.insertAdjacentHTML('beforeend', bloqueEjemplo()); ejemplos.lastElementChild.querySelector('input').focus(); };
  ejemplos.addEventListener('click', ev => {
    const b = ev.target.closest('[data-quitar]');
    if (!b) return;
    b.closest('.ejemplo-editor').remove();
    alCambiar();
  });
}

// Editar el material de una consigna (instrucciones, ejemplos, referentes, límite) en un panel flotante,
// sin salir de la vista donde el tutor lee los textos. Devuelve true si guardó.
export async function modalMaterial(cons) {
  const r = await modal({
    titulo: 'Material de la consigna', ancho: 760,
    cuerpo: `<p class="tenue" style="margin-top:0">Corrija las instrucciones o agregue ejemplos y referentes. Los cambios se ven en todos los grupos que tienen esta consigna.</p>
      <div class="material-consigna">${camposConsigna(cons)}</div>`,
    alAbrir: velo => activarEjemplos(velo),
    acciones: [
      { texto: 'Cancelar', clase: 'btn-fantasma', valor: null },
      {
        texto: 'Guardar cambios', clase: 'btn-primario', accion: async v => {
          const d = leerCampos(v);
          if (!validarCampos(d)) return false;
          try { await estado.api.guardarConsigna({ ...d, id: cons.id, archivada: !!cons.archivada }); return true; }
          catch (e) { errorAviso(e); return false; }
        },
      },
    ],
  });
  if (r === true) aviso('Material guardado.', 'exito');
  return r === true;
}

async function editor(c, id) {
  await recargarBase();
  const cons = id ? await estado.api.consigna(id) : { titulo: '', instrucciones: '', ejemplos: [], referentes: '', limite_palabras: null, grupos: [] };
  if (!cons) { c.innerHTML = vacio('No se encontró la consigna', '', '<a class="btn" href="#/tutor/consignas">Volver</a>'); return; }
  const textos = id ? await estado.api.entregas({ dinamica: 'consignas', item_id: id, incluirOcultas: true, limite: 5000 }).catch(() => []) : [];
  const ahora = new Date().toISOString();
  const asignadas = cons.grupos || [];
  const libres = estado.grupos.filter(g => g.activo !== false && !asignadas.some(a => a.grupo_id === g.id));
  const nTextos = g => textos.filter(e => e.grupo_id === g || e.perfil?.grupo_id === g).length;
  const hoy0 = new Date();
  const finSemana = new Date(Date.now() + 7 * 864e5);
  const abreDefecto = aCampo(hoy0.toISOString());
  const cierraDefecto = aCampo(finSemana.toISOString()).slice(0, 10) + 'T23:59';

  c.innerHTML = `
    <div class="fila" style="margin-bottom:14px">
      <a class="btn btn-fantasma btn-chico" href="#/tutor/consignas">${icono('izquierda', 16)}Consignas</a>
      <span class="espaciador"></span>
      ${id ? `<a class="btn btn-chico btn-fantasma" href="#/tutor/consignas?ver=${esc(id)}">${icono('medalla', 15)}Seguimiento</a>
        <a class="btn btn-chico btn-fantasma" href="#/consignas/${esc(id)}">${icono('libro', 15)}Leer los textos</a>` : ''}
    </div>
    <div class="editor-consigna">
      <section class="bloque">
        <h3>${id ? 'Editar consigna' : 'Nueva consigna'}${cons.archivada ? ' <span class="estado-pill">Archivada</span>' : ''}</h3>
        ${camposConsigna(cons, { hayTextos: textos.length > 0 })}
        <div class="fila">
          <button class="btn btn-primario" id="k-guardar">${icono('check', 18)}${id ? 'Guardar cambios' : 'Crear consigna'}</button>
          <span class="espaciador"></span>
          ${id ? `<button class="btn btn-fantasma btn-chico" id="k-duplicar" title="Crea una copia sin grupos, para hacer una variante">${icono('copiar', 15)}Duplicar</button>` : ''}
          ${id ? `<button class="btn btn-fantasma btn-chico" id="k-archivar">${cons.archivada ? 'Sacar del archivo' : 'Archivar'}</button>` : ''}
        </div>
        ${id && asignadas.length ? '<p class="nota-campo" style="margin-top:10px">Los cambios se ven en todos los grupos que tienen esta consigna.</p>' : ''}
      </section>
      <aside class="previa-consigna">
        <div class="rotulo" style="margin-bottom:10px">Vista previa · así la ve el grupo</div>
        <div class="consigna-panel" id="k-previa" style="--acento:${ACENTO_CONSIGNA};position:static;max-height:none"></div>
      </aside>
    </div>

    ${id ? `<section class="bloque" id="k-grupos">
      <h3>Grupos y fechas</h3>
      <p class="tenue" style="margin-top:0">Cada grupo tiene su apertura y su cierre, en hora de Colombia. El estado sale de las fechas: programada, abierta o cerrada. Al cerrar, los textos se abren para todo el grupo y ya no se puede publicar. Con <b>Oculta</b>, ese grupo deja de ver la consigna hasta que usted la vuelva a mostrar; no se borra nada.</p>
      ${asignadas.length ? `<div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Grupo</th><th>Abre</th><th>Cierra</th><th>Estado</th><th class="num">Textos</th><th></th></tr></thead>
        <tbody>${asignadas.map(a => `<tr data-grupo="${a.grupo_id}">
          <td><b>${esc(nombreGrupo(a.grupo_id))}</b></td>
          <td><input class="entrada" type="datetime-local" data-k="apertura" value="${aCampo(a.apertura)}" aria-label="Abre"></td>
          <td><input class="entrada" type="datetime-local" data-k="cierre" value="${aCampo(a.cierre)}" aria-label="Cierra"></td>
          <td><select class="selector estado-grupo estado-${estadoDe(a, ahora)}" data-estado aria-label="Estado para ${esc(nombreGrupo(a.grupo_id))}">
              <option value="auto" ${a.oculta ? '' : 'selected'}>${ETIQUETA_ESTADO[estadoPorFechas(a, ahora)]} (por fechas)</option>
              <option value="oculta" ${a.oculta ? 'selected' : ''}>Oculta</option>
            </select>${estadoDe(a, ahora) === 'abierta' ? `<br><span class="tenue" style="font-size:12.5px">${esc(cuandoCierra(a.cierre))}</span>` : a.oculta ? '<br><span class="tenue" style="font-size:12.5px">El grupo no la ve</span>' : ''}</td>
          <td class="num">${nTextos(a.grupo_id) || ''}</td>
          <td style="white-space:nowrap"><button class="btn btn-chico" data-fechas>${icono('check', 15)}Guardar fechas</button>
            ${nTextos(a.grupo_id) ? '' : `<button class="btn btn-chico btn-fantasma btn-icono" data-quitar-grupo title="Quitar este grupo" aria-label="Quitar este grupo">${icono('x', 15)}</button>`}</td>
        </tr>`).join('')}</tbody></table></div>` : '<p>Todavía no está asignada a ningún grupo.</p>'}
      ${libres.length ? `<div class="asignar-grupo">
        <div class="campo"><label for="n-grupo">Asignar a</label><select class="selector" id="n-grupo">${libres.map(g => `<option value="${g.id}">${esc(g.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="n-abre">Abre</label><input class="entrada" type="datetime-local" id="n-abre" value="${abreDefecto}"></div>
        <div class="campo"><label for="n-cierra">Cierra</label><input class="entrada" type="datetime-local" id="n-cierra" value="${cierraDefecto}"></div>
        <button class="btn btn-primario" id="n-asignar">${icono('calendario', 18)}Asignar</button>
      </div>` : ''}
    </section>` : '<p class="tenue">Cuando cree la consigna podrá asignarla a uno o varios grupos, con sus fechas.</p>'}`;

  const leer = () => ({ id: id || undefined, archivada: !!cons.archivada, ...leerCampos(c) });
  const previa = $('#k-previa', c);
  const pintarPrevia = () => {
    const d = leer();
    previa.innerHTML = panelConsigna({ ...d, titulo: d.titulo || 'Título de la consigna' }, { asignacion: asignadas.find(a => estadoDe(a, ahora) === 'abierta') || null });
  };
  pintarPrevia();
  const alCambiar = debounce(pintarPrevia, 250);
  c.querySelector('.editor-consigna').addEventListener('input', alCambiar);
  activarEjemplos(c, pintarPrevia);

  $('#k-guardar', c).onclick = async () => {
    const d = leer();
    if (!validarCampos(d)) return;
    try {
      const r = await estado.api.guardarConsigna(d);
      if (!id) { aviso('Consigna creada. Ahora asígnela a un grupo.', 'exito', 4500); location.hash = `#/tutor/consignas?editar=${r.id}`; return; }
      aviso('Cambios guardados.', 'exito');
      await editor(c, id);
    } catch (e) { errorAviso(e); }
  };
  // Duplicar: una copia de la versión guardada, sin grupos ni textos, para hacer una variante.
  $('#k-duplicar', c)?.addEventListener('click', async () => {
    if (!(await confirmar('Se creará una copia de esta consigna (la versión guardada), sin grupos asignados. Los cambios que haga en la copia no afectan a la original. ¿Duplicar?', { si: 'Duplicar' }))) return;
    try {
      const r = await estado.api.guardarConsigna({
        titulo: `${cons.titulo} (copia)`.slice(0, 140), instrucciones: cons.instrucciones, ejemplos: cons.ejemplos || [],
        referentes: cons.referentes || '', limite_palabras: cons.limite_palabras || null, archivada: false,
      });
      aviso('Copia creada. Ajústela y asígnela a un grupo.', 'exito', 4500);
      location.hash = `#/tutor/consignas?editar=${r.id}`;
    } catch (e) { errorAviso(e); }
  });
  $('#k-archivar', c)?.addEventListener('click', async () => {
    try {
      await estado.api.guardarConsigna({ ...leer(), archivada: !cons.archivada });
      aviso(cons.archivada ? 'La consigna volvió a las activas.' : 'Consigna archivada. Los grupos que la usaron la siguen viendo.', 'exito', 4500);
      location.hash = '#/tutor/consignas';
    } catch (e) { errorAviso(e); }
  });

  // ---------- grupos ----------
  const validar = (ab, ci) => {
    const a = deCampo(ab), z = deCampo(ci);
    if (!a || !z) { aviso('Revise las fechas de apertura y cierre.', 'error'); return null; }
    if (z <= a) { aviso('El cierre tiene que ser después de la apertura.', 'error'); return null; }
    return [a, z];
  };
  $('#n-asignar', c)?.addEventListener('click', async () => {
    const f = validar($('#n-abre', c).value, $('#n-cierra', c).value);
    if (!f) return;
    try {
      await estado.api.asignarConsigna(id, $('#n-grupo', c).value, ...f);
      aviso('Consigna asignada.', 'exito');
      await editor(c, id);
    } catch (e) { errorAviso(e); }
  });
  $('#k-grupos', c)?.addEventListener('change', async ev => {
    const sel = ev.target.closest('[data-estado]');
    const fila = sel?.closest('tr[data-grupo]');
    if (!fila) return;
    const ocultar = sel.value === 'oculta';
    try {
      await estado.api.ocultarConsigna(id, fila.dataset.grupo, ocultar);
      aviso(ocultar ? `${nombreGrupo(fila.dataset.grupo)} ya no ve esta consigna.` : `La consigna vuelve a verse en ${nombreGrupo(fila.dataset.grupo)}.`, 'exito', 4200);
      await editor(c, id);
    } catch (e) { errorAviso(e); await editor(c, id); }
  });
  $('#k-grupos', c)?.addEventListener('click', async ev => {
    const fila = ev.target.closest('tr[data-grupo]');
    if (!fila) return;
    const g = fila.dataset.grupo;
    if (ev.target.closest('[data-fechas]')) {
      const f = validar(fila.querySelector('[data-k=apertura]').value, fila.querySelector('[data-k=cierre]').value);
      if (!f) return;
      try { await estado.api.asignarConsigna(id, g, ...f); aviso('Fechas guardadas.', 'exito'); await editor(c, id); } catch (e) { errorAviso(e); }
    } else if (ev.target.closest('[data-quitar-grupo]')) {
      if (!(await confirmar(`¿Quitar esta consigna a ${nombreGrupo(g)}? El grupo dejará de verla.`, { si: 'Quitar', peligro: true }))) return;
      try { await estado.api.quitarAsignacion(id, g); aviso('Grupo quitado.'); await editor(c, id); } catch (e) { errorAviso(e); }
    }
  });
}

// ---------------------------------------------------------------------
// Seguimiento por grupo
// ---------------------------------------------------------------------
async function seguimiento(c, id, query) {
  await recargarBase();
  const cons = await estado.api.consigna(id);
  if (!cons) { c.innerHTML = vacio('No se encontró la consigna', '', '<a class="btn" href="#/tutor/consignas">Volver</a>'); return; }
  const ahora = new Date().toISOString();
  const asignadas = cons.grupos || [];
  if (!asignadas.length) {
    c.innerHTML = vacio('Esta consigna no está asignada a ningún grupo', '', `<a class="btn btn-primario" href="#/tutor/consignas?editar=${esc(id)}">Asignarla</a>`);
    return;
  }
  const g = asignadas.some(a => a.grupo_id === query.grupo) ? query.grupo : asignadas[0].grupo_id;
  const a = asignadas.find(x => x.grupo_id === g);
  const textos = (await estado.api.entregas({ dinamica: 'consignas', item_id: id, incluirOcultas: true, limite: 5000 }))
    .filter(e => e.grupo_id === g || (e.grupo_id === undefined && e.perfil?.grupo_id === g));
  const personas = estado.perfiles.filter(p => p.rol !== 'tutor' && p.grupo_id === g).sort((x, y) => x.nombre.localeCompare(y.nombre));
  const revisados = new Set((await estado.api.revisiones(textos.map(e => e.id)).catch(() => [])).map(r => r.entrega_id));
  const deQuien = p => textos.find(e => e.autor === p.id);
  const publicaron = personas.filter(deQuien).length;
  c.innerHTML = `
    <div class="fila" style="margin-bottom:14px">
      <a class="btn btn-fantasma btn-chico" href="#/tutor/consignas">${icono('izquierda', 16)}Consignas</a>
      <span class="espaciador"></span>
      <a class="btn btn-chico btn-fantasma" href="#/tutor/consignas?editar=${esc(id)}">${icono('lapiz', 15)}Editar y asignar</a>
    </div>
    <div class="display" style="font-size:32px;margin-bottom:8px">${esc(cons.titulo)}</div>
    ${asignadas.length > 1 ? `<div class="filtros" style="margin-top:6px">${asignadas.map(x => `<a class="chip ${x.grupo_id === g ? 'activo' : ''}" href="#/tutor/consignas?ver=${esc(id)}&grupo=${x.grupo_id}">${esc(nombreGrupo(x.grupo_id))} · ${ETIQUETA_ESTADO[estadoDe(x, ahora)]}</a>`).join('')}</div>` : ''}
    <div class="fila" style="margin:8px 0 16px">
      ${pillEstado(a, ahora)}
      <span class="tenue">${esc(nombreGrupo(g))} · abre ${esc(fechaCortaHora(a.apertura))} · cierra ${esc(fechaCortaHora(a.cierre))}</span>
      <span class="espaciador"></span>
      <b>${publicaron} de ${personas.length} publicaron</b>${textos.length ? `<span class="tenue">· ${textos.filter(e => revisados.has(e.id)).length} revisados</span>` : ''}
      <a class="btn btn-chico" href="#/consignas/${esc(id)}?grupo=${g}">${icono('libro', 15)}Leer los textos</a>
      ${textos.length ? `<button class="btn btn-chico btn-fantasma" id="s-pdf">${icono('imprimir', 15)}PDF</button><button class="btn btn-chico btn-fantasma" id="s-txt">${icono('descargar', 15)}.txt</button>` : ''}
    </div>
    ${personas.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Persona</th><th>Modo</th><th>Estado</th><th class="num">Palabras</th><th class="num">Coment.</th><th>Revisión</th><th></th></tr></thead>
      <tbody>${personas.map(p => {
        const e = deQuien(p);
        return `<tr>
          <td><span style="display:flex;align-items:center;gap:10px;font-weight:700">${avatar(p, 30)}${esc(p.nombre)}</span></td>
          <td><span class="tenue" style="font-size:13.5px">${esc(MODOS[p.modo || 'participante']?.nombre || '')}</span></td>
          <td>${e ? `<span class="estado-pill si">Publicado</span> <span class="tenue" style="font-size:13px">${esc(fechaHora(e.creado))}</span>${e.estado === 'oculta' ? ' <span class="estado-pill no">Oculto</span>' : ''}` : '<span class="estado-pill">Pendiente</span>'}</td>
          <td class="num">${e ? e.palabras : ''}</td>
          <td class="num">${e?.n_comentarios || ''}</td>
          <td>${e ? (revisados.has(e.id) ? '<span class="estado-pill si">Revisado</span>' : '<span class="estado-pill">Por revisar</span>') : ''}</td>
          <td>${e ? `<a class="btn btn-chico" href="#/entrega/${e.id}">${revisados.has(e.id) ? 'Leer' : 'Revisar'}</a>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : vacio('Este grupo no tiene personas con cuenta')}`;
  const titulo = `${cons.titulo} · ${nombreGrupo(g)}`;
  $('#s-pdf', c)?.addEventListener('click', () => imprimir([...textos].reverse(), titulo, 'Consigna de escritura'));
  $('#s-txt', c)?.addEventListener('click', () => descargarTXT([...textos].reverse(), titulo));
}
