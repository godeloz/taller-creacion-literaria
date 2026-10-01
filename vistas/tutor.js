// Panel del tutor: estudiantes, entregas, clase en vivo, retos, contenido y dinámicas.
import { estado, esTutor, dinamica, estaAbierta, claseActiva, recargarBase, MODOS, ROLES } from '../nucleo/estado.js';
import { esc, hoyISO, sumarDias, fechaCorta, fechaHora, fechaLarga, aviso, errorAviso, confirmar, descargarArchivo, $ } from '../nucleo/ui.js';
import { icono, llama } from '../nucleo/iconos.js';
import { avatar, etiquetaDinamica, vacio } from '../nucleo/componentes.js';
import { MODULOS } from '../modulos/registro.js';
import { descargarTXT, imprimir } from '../nucleo/exportar.js';
import { seccionPersonas, pillModo } from './personas.js';
import { seccionConsignas } from './tutor-consignas.js';

const SECCIONES = [
  ['estudiantes', 'medalla', 'Seguimiento'],
  ['personas', 'usuarios', 'Personas y grupos'],
  ['consignas', 'pagina', 'Consignas'],
  ['entregas', 'muro', 'Entregas'],
  ['clase', 'envivo', 'Clase en vivo'],
  ['retos', 'calendario', 'Calendario de retos'],
  ['contenido', 'subir', 'Contenido'],
  ['dinamicas', 'ajustes', 'Dinámicas'],
];
const CON_CONTENIDO = ['reto', 'maraton', 'poema', 'cutup', 's7', 'forma', 'fallar'];
const CLAVE_PAQUETE = { reto: 'retos', maraton: 'cartas', poema: 'poemas', cutup: 'juegos', s7: 'textos', forma: 'consignas', fallar: 'textos' };

export default async function tutor(cont, { params, query }) {
  if (!esTutor()) { cont.innerHTML = `<div class="contenedor">${vacio('Esta sección es solo para el tutor')}</div>`; return; }
  const sec = params[0] || 'estudiantes';
  cont.innerHTML = `
  <div class="contenedor">
    <h1 class="saludo" style="margin-bottom:0">Panel del tutor</h1>
    <nav class="pestanas" aria-label="Secciones del panel">
      ${SECCIONES.map(([s, ico, t]) => `<a class="chip ${s === sec ? 'activo' : ''}" href="#/tutor/${s}">${icono(ico, 16)}${t}</a>`).join('')}
    </nav>
    <div id="seccion"><div class="cargando">Cargando</div></div>
  </div>`;
  const cuerpo = $('#seccion', cont);
  const f = { estudiantes, personas: seccionPersonas, consignas: seccionConsignas, entregas, clase, retos, contenido, dinamicas }[sec] || estudiantes;
  await f(cuerpo, query);
}

// Grupo elegido en los filtros del panel ('' = todos). Se recuerda entre secciones.
let grupoElegido = null;
function grupoDe(query) {
  if (query.grupo !== undefined) grupoElegido = query.grupo === 'todos' ? '' : query.grupo;
  if (grupoElegido === null) grupoElegido = estado.yo.grupo_id || '';
  return grupoElegido;
}
function chipsGrupo(seccion, g, extra = {}) {
  if (estado.grupos.length < 2) return '';
  const url = v => `#/tutor/${seccion}?` + new URLSearchParams(Object.entries({ ...extra, grupo: v }).filter(([, x]) => x)).toString();
  return `<div class="filtros" style="margin-top:0">
    <a class="chip ${!g ? 'activo' : ''}" href="${url('todos')}">Todos los grupos</a>
    ${estado.grupos.filter(x => x.activo !== false || x.id === g).map(x => `<a class="chip ${x.id === g ? 'activo' : ''}" href="${url(x.id)}">${esc(x.nombre)}</a>`).join('')}
  </div>`;
}
const personasDe = g => estado.perfiles.filter(p => p.rol !== 'tutor' && (!g || p.grupo_id === g));

// ---------------------------------------------------------------------
async function estudiantes(c, query) {
  await recargarBase();
  const g = grupoDe(query);
  const creadores = personasDe(g).sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre) : a.rol === 'creador' ? -1 : 1));
  const todas = await estado.api.entregas({ incluirOcultas: true, limite: 5000 });
  const rachas = await Promise.all(creadores.map(p => estado.api.racha(p.id).catch(() => ({ actual: 0, mejor: 0 }))));
  const hoy = hoyISO();
  const nEst = creadores.filter(p => p.rol === 'creador').length, nInv = creadores.length - nEst;
  c.innerHTML = `
    ${chipsGrupo('estudiantes', g)}
    <div class="fila" style="margin-bottom:14px"><p class="tenue" style="margin:0">${nEst} estudiantes${nInv ? ` y ${nInv} invitados` : ''} con cuenta. Haga clic en un nombre para ver su perfil, sus textos y descargar su portafolio.</p>
      <span class="espaciador"></span><a class="btn btn-chico" href="#/tutor/personas${g ? `?grupo=${g}` : ''}">${icono('mas', 15)}Agregar personas</a></div>
    ${creadores.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Persona</th><th>Modo</th><th class="num">Textos</th><th class="num">Retos</th><th class="num">Palabras</th><th class="num">Racha</th><th class="num">Mejor</th><th>Reto de hoy</th><th>Última publicación</th></tr></thead>
      <tbody>${creadores.map((p, i) => {
        const suyas = todas.filter(e => e.autor === p.id);
        const ultima = suyas[0];
        const hizoHoy = suyas.some(e => e.reto_fecha === hoy);
        return `<tr>
          <td><a href="#/perfil/${p.id}" style="display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:700">${avatar(p, 32)}<span>${esc(p.nombre)}${p.rol === 'invitado' ? ' <span class="estado-pill">Invitado</span>' : ''}${!g && estado.grupos.length > 1 ? `<br><span class="tenue" style="font-weight:500;font-size:13px">${esc(estado.grupos.find(x => x.id === p.grupo_id)?.nombre || 'Sin grupo')}</span>` : ''}</span></a></td>
          <td>${pillModo(p.modo || 'participante')}</td>
          <td class="num">${suyas.length}</td>
          <td class="num">${suyas.filter(e => e.dinamica === 'reto').length}</td>
          <td class="num">${suyas.reduce((s, e) => s + (e.palabras || 0), 0).toLocaleString('es-CO')}</td>
          <td class="num">${rachas[i].actual ? `<span style="display:inline-flex;gap:3px;align-items:center">${llama(14)}${rachas[i].actual}</span>` : '—'}</td>
          <td class="num">${rachas[i].mejor || '—'}</td>
          <td>${hizoHoy ? '<span class="estado-pill si">Publicado</span>' : '<span class="estado-pill">Pendiente</span>'}</td>
          <td class="tenue">${ultima ? fechaHora(ultima.creado) : 'Nunca'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : vacio('No hay personas con cuenta en este grupo', 'Agréguelas en «Personas y grupos».')}`;
}

// ---------------------------------------------------------------------
async function entregas(c, query) {
  const g = grupoDe(query);
  const f = { dinamica: query.dinamica || '', autor: query.autor || '' };
  const creadores = personasDe(g);
  if (f.autor && !creadores.some(p => p.id === f.autor)) f.autor = '';
  const lista = (await estado.api.entregas({ ...f, incluirOcultas: true, limite: 5000 }))
    .filter(e => !g || e.perfil?.rol === 'tutor' || (e.perfil?.grupo_id ?? e.grupo_id) === g);
  const dinamicas = estado.dinamicas.filter(d => d.slug === 'reto' || d.slug === 'consignas' || d.en_menu);
  const hash = cambios => '#/tutor/entregas?' + new URLSearchParams(Object.entries({ ...f, ...cambios }).filter(([, v]) => v)).toString();
  c.innerHTML = `
    ${chipsGrupo('entregas', g, f)}
    <div class="filtros" style="margin-top:0">
      <select class="selector" id="f-din" style="width:auto;min-height:40px"><option value="">Todas las dinámicas</option>${dinamicas.map(d => `<option value="${d.slug}" ${d.slug === f.dinamica ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>
      <select class="selector" id="f-aut" style="width:auto;min-height:40px"><option value="">Todas las personas</option>${creadores.map(p => `<option value="${p.id}" ${p.id === f.autor ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>
      <span class="espaciador"></span>
      <span class="tenue">${lista.length} textos</span>
      ${lista.length ? `<button class="btn btn-chico" id="d-pdf">${icono('imprimir', 16)}PDF de esta lista</button><button class="btn btn-chico btn-fantasma" id="d-txt">${icono('descargar', 16)}.txt</button>` : ''}
    </div>
    ${lista.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Autor</th><th>Dinámica</th><th>Título</th><th class="num">Palabras</th><th class="num">Coment.</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map(e => `<tr>
        <td class="tenue" style="white-space:nowrap">${fechaHora(e.creado)}</td>
        <td>${esc(e.perfil?.nombre || '')}${e.perfil && e.perfil.rol !== 'tutor' && e.perfil.modo && e.perfil.modo !== 'participante' ? ` <span class="etiqueta-solo-tutor" title="${esc(MODOS[e.perfil.modo].corto)}">${icono(MODOS[e.perfil.modo].ico, 12)}${esc(MODOS[e.perfil.modo].nombre)}</span>` : ''}</td>
        <td>${etiquetaDinamica(e.dinamica)}</td>
        <td>${esc(e.titulo || '—')}${e.editada ? ' <span class="marca-editada">editado</span>' : ''}</td>
        <td class="num">${e.palabras}</td>
        <td class="num">${e.n_comentarios || ''}</td>
        <td>${e.estado === 'oculta' ? '<span class="estado-pill no">Oculto</span>' : '<span class="estado-pill si">Visible</span>'}</td>
        <td style="white-space:nowrap"><a class="btn btn-chico" href="#/entrega/${e.id}">Leer</a>
          <button class="btn btn-chico btn-fantasma btn-icono" data-ocultar="${e.id}" data-estado="${e.estado}" title="${e.estado === 'oculta' ? 'Mostrar' : 'Ocultar'}" aria-label="${e.estado === 'oculta' ? 'Mostrar' : 'Ocultar'}">${icono(e.estado === 'oculta' ? 'ojo' : 'ojoNo', 16)}</button></td>
      </tr>`).join('')}</tbody></table></div>` : vacio('No hay textos con estos filtros')}`;
  $('#f-din', c).onchange = ev => { location.hash = hash({ dinamica: ev.target.value }); };
  $('#f-aut', c).onchange = ev => { location.hash = hash({ autor: ev.target.value }); };
  const titulo = [dinamica(f.dinamica)?.nombre, estado.perfiles.find(p => p.id === f.autor)?.nombre].filter(Boolean).join(' · ') || 'Todas las entregas';
  $('#d-pdf', c)?.addEventListener('click', () => imprimir([...lista].reverse(), titulo, 'Taller de Creación Literaria'));
  $('#d-txt', c)?.addEventListener('click', () => descargarTXT([...lista].reverse(), titulo));
  c.onclick = async ev => {
    const b = ev.target.closest('[data-ocultar]');
    if (!b) return;
    try {
      await estado.api.cambiarEstadoEntrega(b.dataset.ocultar, b.dataset.estado === 'oculta' ? 'publicada' : 'oculta');
      await entregas(c, query);
    } catch (e) { errorAviso(e); }
  };
}

// ---------------------------------------------------------------------
async function clase(c, query) {
  let g = grupoDe(query) || estado.yo.grupo_id;
  if (!estado.grupos.some(x => x.id === g)) g = estado.grupos[0]?.id || estado.yo.grupo_id;
  const sesion = await estado.api.sesionClase(g).catch(() => null);
  if (g === estado.yo.grupo_id) estado.sesionClase = sesion;
  const s = sesion && sesion.activa ? sesion : null;
  const nombreG = estado.grupos.find(x => x.id === g)?.nombre || '';
  const abiertas = estado.dinamicas.filter(d => estaAbierta(d) && (d.slug === 'reto' || MODULOS[d.slug]));
  c.innerHTML = `
    ${estado.grupos.length > 1 ? `<div class="filtros" style="margin-top:0"><span class="etiqueta" style="margin:0">Grupo</span>${estado.grupos.filter(x => x.activo !== false || x.id === g).map(x => `<a class="chip ${x.id === g ? 'activo' : ''}" href="#/tutor/clase?grupo=${x.id}">${esc(x.nombre)}</a>`).join('')}</div>` : ''}
    <div class="dos-col">
      <section class="bloque">
        <h3>${s ? 'Cambiar el ejercicio de la clase' : 'Activar un ejercicio para la clase'}</h3>
        <p class="tenue" style="margin-top:0">A ${estado.grupos.length > 1 ? `todas las personas de <b>${esc(nombreG)}</b>` : 'todo el grupo'} les aparecerá un aviso para entrar. Lo que publiquen durante la clase queda agrupado y se puede proyectar en vivo.</p>
        <div class="campo"><label for="c-din">Dinámica</label>
          <select class="selector" id="c-din">${abiertas.map(d => `<option value="${d.slug}">${esc(d.nombre)}</option>`).join('')}</select></div>
        <div class="campo" id="campo-item"><label for="c-item">Contenido</label><select class="selector" id="c-item"></select>
          <span class="nota-campo">Si fija un contenido, todos trabajan con el mismo (la misma carta, el mismo poema).</span></div>
        <div class="campo"><label for="c-tit">Título para la clase (opcional)</label><input class="entrada" id="c-tit" placeholder="Por ejemplo: Ejercicio 1 · Sesión 5"></div>
        <div class="campo"><label for="c-min">Minutos (opcional)</label><input class="entrada" id="c-min" type="number" min="1" max="180" placeholder="Sin límite de tiempo" style="max-width:220px"></div>
        <button class="btn btn-primario" id="c-activar">${icono('envivo', 18)}${s ? 'Cambiar ejercicio' : 'Activar ejercicio'}</button>
      </section>
      <section class="bloque" style="${s ? 'background:var(--lima)' : ''}">
        <h3>Estado</h3>
        ${s ? `
          <p style="margin-top:0"><b>En curso:</b> ${esc(s.titulo || dinamica(s.dinamica)?.nombre || '')}<br>
          <span class="tenue" style="color:var(--tinta-2)">${esc(dinamica(s.dinamica)?.nombre || '')} · desde ${fechaHora(s.inicia)}${s.minutos ? ` · ${s.minutos} minutos` : ''}</span></p>
          <div class="fila">
            <a class="btn btn-primario" href="#/proyectar?grupo=${g}">${icono('proyectar', 18)}Proyectar muro de la clase</a>
            <a class="btn" href="#/muro?sesion=${s.id}">Ver en el muro</a>
            <button class="btn btn-peligro" id="c-terminar">Terminar</button>
          </div>` : '<p class="tenue" style="margin:0">No hay ningún ejercicio activo.</p>'}
      </section>
    </div>`;

  const selDin = $('#c-din', c), selItem = $('#c-item', c);
  const cargarItems = async () => {
    const slug = selDin.value;
    if (slug === 'reto') { $('#campo-item', c).classList.add('oculto'); return; }
    $('#campo-item', c).classList.remove('oculto');
    const items = (await estado.api.contenidos(slug)).filter(i => !i.item_id.startsWith('_'));
    const mod = await MODULOS[slug]?.();
    selItem.innerHTML = `<option value="">Libre: cada quien elige</option>` + items.map(i => `<option value="${esc(i.item_id)}">${esc(mod?.default.paquete?.describir(i.datos) || i.item_id)}</option>`).join('');
  };
  selDin.onchange = cargarItems;
  await cargarItems();
  $('#c-activar', c).onclick = async () => {
    try {
      const d = dinamica(selDin.value);
      const itemSel = selDin.value === 'reto' ? null : selItem.value || null;
      await estado.api.activarClase({
        dinamica: selDin.value, item_id: itemSel, grupo_id: g,
        titulo: $('#c-tit', c).value.trim() || (itemSel ? selItem.selectedOptions[0].textContent : d?.nombre),
        minutos: Number($('#c-min', c).value) || null,
      });
      aviso('Ejercicio activado. El grupo ya ve el aviso.', 'exito');
      if (g === estado.yo.grupo_id) location.reload(); else await clase(c, { grupo: g });
    } catch (e) { errorAviso(e); }
  };
  $('#c-terminar', c)?.addEventListener('click', async () => {
    if (!(await confirmar('¿Terminar el ejercicio de la clase? Los textos publicados se conservan.', { si: 'Terminar' }))) return;
    try {
      await estado.api.terminarClase(g);
      if (g === estado.yo.grupo_id) location.reload(); else await clase(c, { grupo: g });
    } catch (e) { errorAviso(e); }
  });
}

// ---------------------------------------------------------------------
async function retos(c) {
  const hoy = hoyISO();
  const d0 = new Date(hoy + 'T12:00:00Z');
  const lunes = sumarDias(hoy, -((d0.getUTCDay() + 6) % 7));
  const desde = sumarDias(lunes, -7);
  const hasta = sumarDias(lunes, 34);
  const [banco, cal] = await Promise.all([estado.api.contenidos('reto', { todos: true }), estado.api.calendario(desde, hasta)]);
  const titulo = id => banco.find(b => b.item_id === id)?.datos.titulo || id;
  const usos = id => cal.asignados.filter(a => a.item_id === id).length;
  const dias = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  const activos = banco.filter(b => b.activo);
  c.innerHTML = `
    <p class="tenue" style="margin-top:0">Programe qué reto cae cada día. Los días sin programar toman el reto menos usado del banco (sin repetir hasta agotarlo). Una vez que un día empieza, su reto queda fijo.</p>
    <div class="calendario" style="margin-bottom:8px">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => `<div class="rotulo" style="text-align:center">${d}</div>`).join('')}</div>
    <div class="calendario">${dias.map(d => {
      const asig = cal.asignados.find(a => a.fecha === d);
      const prog = cal.programados.find(p => p.fecha === d);
      const pasado = d < hoy;
      let cuerpo;
      if (asig) cuerpo = `<b>${esc(titulo(asig.item_id))}</b><span class="tenue">${pasado ? 'Fue el reto' : 'Reto de hoy'}</span>${pasado || d === hoy ? `<a href="#/muro?reto=${d}" style="font-size:12.5px">Ver respuestas</a>` : ''}`;
      else if (pasado) cuerpo = '<span class="tenue">Sin reto</span>';
      else cuerpo = `<select data-fecha="${d}" aria-label="Reto del ${fechaLarga(d)}"><option value="">Automático</option>${activos.map(b => `<option value="${esc(b.item_id)}" ${prog?.item_id === b.item_id ? 'selected' : ''}>${esc(b.datos.titulo)}</option>`).join('')}</select>${prog ? '<span style="font-size:12px;color:var(--violeta);font-weight:700">Programado</span>' : ''}`;
      return `<div class="cal-dia ${d === hoy ? 'hoy' : ''} ${pasado ? 'pasado' : ''}"><span class="fecha">${fechaCorta(d)}</span>${cuerpo}</div>`;
    }).join('')}</div>

    <section class="bloque" style="margin-top:24px">
      <div class="fila"><h3 style="margin:0">Banco de retos</h3><span class="espaciador"></span>
        <a class="btn btn-chico" href="#/tutor/contenido?din=reto">${icono('subir', 16)}Subir más retos</a></div>
      <p class="tenue">${activos.length} activos de ${banco.length}. Desactive un reto para que no vuelva a salir.</p>
      <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Reto</th><th>Id</th><th class="num">Veces usado</th><th>Activo</th></tr></thead>
      <tbody>${banco.map(b => `<tr><td>${esc(b.datos.titulo)}</td><td class="tenue" style="font-family:var(--f-mono);font-size:12.5px">${esc(b.item_id)}</td><td class="num">${usos(b.item_id)}</td>
        <td><label class="fila" style="gap:6px"><input type="checkbox" data-activo="${esc(b.item_id)}" ${b.activo ? 'checked' : ''}> ${b.activo ? 'Sí' : 'No'}</label></td></tr>`).join('')}</tbody></table></div>
    </section>`;

  c.onchange = async ev => {
    const s = ev.target.closest('select[data-fecha]');
    const a = ev.target.closest('[data-activo]');
    try {
      if (s) {
        if (s.value) await estado.api.programarReto(s.dataset.fecha, s.value);
        else await estado.api.quitarProgramado(s.dataset.fecha);
        aviso('Calendario actualizado.', 'exito');
        await retos(c);
      } else if (a) {
        await estado.api.activarContenido('reto', a.dataset.activo, a.checked);
        await retos(c);
      }
    } catch (e) { errorAviso(e); }
  };
}

// ---------------------------------------------------------------------
async function contenido(c, query) {
  const din = CON_CONTENIDO.includes(query.din) ? query.din : 'reto';
  const mod = (await MODULOS[din]()).default;
  const items = await estado.api.contenidos(din, { todos: true });
  const historial = await estado.api.paquetes(din).catch(() => []);
  c.innerHTML = `
    <div class="filtros" style="margin-top:0">${CON_CONTENIDO.map(s => `<a class="chip ${s === din ? 'activo' : ''}" href="#/tutor/contenido?din=${s}"><span class="punto" style="background:${esc(dinamica(s)?.color || '#999')}"></span>${esc(dinamica(s)?.nombre || s)}</a>`).join('')}</div>
    <div class="dos-col">
      <section class="bloque">
        <h3>Subir un paquete</h3>
        <p class="tenue" style="margin-top:0">Un paquete es un archivo <b>.json</b> con elementos nuevos o corregidos. Los que tienen un <code>id</code> nuevo se agregan; los que repiten un <code>id</code> existente se actualizan. Nada se borra.</p>
        <div class="fila" style="margin-bottom:14px">
          <button class="btn btn-chico" id="p-plantilla">${icono('descargar', 16)}Descargar plantilla</button>
          <button class="btn btn-chico btn-fantasma" id="p-exportar">${icono('copiar', 16)}Exportar contenido actual</button>
        </div>
        <div class="campo"><label for="p-archivo">Archivo .json</label><input class="entrada" type="file" id="p-archivo" accept=".json,application/json"></div>
        <div class="campo"><label for="p-texto">…o pegue aquí el contenido</label><textarea class="area" id="p-texto" style="font-family:var(--f-mono);font-size:13px;min-height:160px" placeholder='{ "${CLAVE_PAQUETE[din]}": [ … ] }'></textarea></div>
        <button class="btn btn-primario" id="p-revisar">Revisar paquete</button>
        <div id="p-resultado" style="margin-top:16px"></div>
      </section>
      <section class="bloque">
        <h3>${esc(dinamica(din)?.nombre || din)} · ${items.length} elementos</h3>
        <div class="tabla-envoltura" style="max-height:520px;overflow:auto"><table class="tabla"><thead><tr><th>Elemento</th><th>Activo</th></tr></thead>
          <tbody>${items.map(i => `<tr><td>${esc(mod.paquete.describir(i.datos))}<br><span class="tenue" style="font-family:var(--f-mono);font-size:12px">${esc(i.item_id)}</span></td>
            <td><input type="checkbox" data-activo="${esc(i.item_id)}" ${i.activo ? 'checked' : ''} aria-label="Activo"></td></tr>`).join('')}</tbody></table></div>
        ${historial.length ? `<h3 style="margin-top:22px;font-size:19px">Paquetes subidos</h3>${historial.map(h => `<div class="tenue" style="font-size:14px;padding:4px 0">${fechaHora(h.creado)} · ${esc(h.nombre || 'Sin nombre')} · ${h.items} elementos</div>`).join('')}` : ''}
      </section>
    </div>`;

  let pendiente = null;
  const resultado = $('#p-resultado', c);
  $('#p-archivo', c).onchange = async ev => {
    const f = ev.target.files[0];
    if (f) $('#p-texto', c).value = await f.text();
  };
  $('#p-revisar', c).onclick = () => {
    pendiente = null;
    const bruto = $('#p-texto', c).value.trim();
    if (!bruto) { resultado.innerHTML = '<div class="errores">Elija un archivo o pegue el contenido.</div>'; return; }
    let json;
    try { json = JSON.parse(bruto); } catch (e) {
      resultado.innerHTML = `<div class="errores"><b>El archivo no es un JSON válido.</b><br>${esc(e.message)}<br>Revise comas, comillas y corchetes.</div>`;
      return;
    }
    const { items: nuevos, errores } = mod.paquete.validar(json);
    if (errores.length) {
      resultado.innerHTML = `<div class="errores"><b>Hay ${errores.length} problema${errores.length > 1 ? 's' : ''}. Corríjalos y vuelva a revisar:</b><ul>${errores.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
      return;
    }
    const existentes = new Set(items.map(i => i.item_id));
    const agrega = nuevos.filter(n => !existentes.has(n.item_id));
    const actualiza = nuevos.filter(n => existentes.has(n.item_id));
    pendiente = { json, nuevos };
    resultado.innerHTML = `<div class="exito"><b>Todo en orden.</b> Se agregarán ${agrega.length} y se actualizarán ${actualiza.length}.</div>
      <div class="vista-previa" style="margin-top:10px">${nuevos.map(n => `<div>${existentes.has(n.item_id) ? '<span class="estado-pill">Actualiza</span>' : '<span class="estado-pill si">Nuevo</span>'} ${esc(mod.paquete.describir(n.datos))}</div>`).join('')}</div>
      <div class="campo" style="margin-top:12px"><label for="p-nombre">Nombre del paquete (para el historial)</label><input class="entrada" id="p-nombre" value="${esc(json.nombre || '')}"></div>
      <button class="btn btn-primario" id="p-aplicar">${icono('check', 18)}Aplicar paquete</button>`;
    $('#p-aplicar', c).onclick = async () => {
      try {
        const r = await estado.api.aplicarPaquete(din, $('#p-nombre', c).value.trim() || 'Paquete', pendiente.json, pendiente.nuevos);
        aviso(`Listo: ${r.nuevos} nuevos, ${r.actualizados} actualizados.`, 'exito', 4500);
        await contenido(c, query);
      } catch (e) { errorAviso(e); }
    };
  };
  $('#p-plantilla', c).onclick = async () => {
    const t = await (await fetch(mod.paquete.plantilla)).text();
    descargarArchivo(`plantilla-${din}.json`, t, 'application/json');
  };
  $('#p-exportar', c).onclick = () => {
    const tipo = CLAVE_PAQUETE[din];
    if (mod.paquete.exportar) {
      descargarArchivo(`contenido-${din}-${hoyISO()}.json`, JSON.stringify({ tipo, nombre: `${dinamica(din)?.nombre} (${hoyISO()})`, ...mod.paquete.exportar(items) }, null, 2), 'application/json');
      return;
    }
    const lista = items.filter(i => !i.item_id.startsWith('_')).map(i => ({ id: i.item_id, ...i.datos }));
    const extra = {};
    const dic = items.find(i => i.item_id === '_diccionario');
    if (dic) { const { tipo: _t, ...resto } = dic.datos; extra.diccionario = resto; }
    descargarArchivo(`contenido-${din}-${hoyISO()}.json`, JSON.stringify({ tipo, nombre: `${dinamica(din)?.nombre} (${hoyISO()})`, [tipo]: lista, ...extra }, null, 2), 'application/json');
  };
  c.querySelectorAll('[data-activo]').forEach(ch => ch.addEventListener('change', async () => {
    try { await estado.api.activarContenido(din, ch.dataset.activo, ch.checked); aviso(ch.checked ? 'Activado.' : 'Desactivado: ya no aparecerá a los estudiantes.'); }
    catch (e) { errorAviso(e); ch.checked = !ch.checked; }
  }));
}

// ---------------------------------------------------------------------
async function dinamicas(c) {
  await recargarBase();
  const lista = estado.dinamicas;
  c.innerHTML = `
    <p class="tenue" style="margin-top:0">Abra o cierre dinámicas, o programe la fecha en que se desbloquean. Una dinámica «próximamente» con fecha se abre sola ese día. Las dinámicas nuevas se agregan al código de la app (carpeta <code>modulos/</code>) y aquí aparecen para abrirlas.</p>
    <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Dinámica</th><th>Estado</th><th>Se desbloquea</th><th>Orden</th><th>Módulo en la app</th></tr></thead>
    <tbody>${lista.map(d => `<tr>
      <td><span style="display:flex;gap:8px;align-items:center;font-weight:700"><span class="punto" style="background:${esc(d.color)}"></span>${esc(d.nombre)}</span></td>
      <td><select class="selector" data-campo="estado" data-slug="${d.slug}" style="min-height:38px">${['abierta', 'proximamente', 'oculta'].map(e => `<option value="${e}" ${d.estado === e ? 'selected' : ''}>${{ abierta: 'Abierta', proximamente: 'Próximamente', oculta: 'Oculta' }[e]}</option>`).join('')}</select></td>
      <td><input class="entrada" type="date" data-campo="desbloqueo" data-slug="${d.slug}" value="${d.desbloqueo || ''}" style="min-height:38px"></td>
      <td><input class="entrada" type="number" data-campo="orden" data-slug="${d.slug}" value="${d.orden}" style="min-height:38px;width:80px"></td>
      <td>${MODULOS[d.slug] || d.slug === 'reto' || d.slug === 'consignas' ? '<span class="estado-pill si">Instalado</span>' : '<span class="estado-pill">Pendiente</span>'}</td>
    </tr>`).join('')}</tbody></table></div>`;
  c.onchange = async ev => {
    const el = ev.target.closest('[data-campo]');
    if (!el) return;
    const campo = el.dataset.campo;
    let valor = el.value;
    if (campo === 'orden') valor = Number(valor) || 0;
    if (campo === 'desbloqueo') valor = valor || null;
    try {
      if (campo === 'estado' && valor === 'abierta' && !MODULOS[el.dataset.slug] && !['reto', 'consignas'].includes(el.dataset.slug)) {
        aviso('Ojo: esta dinámica aún no tiene módulo en la app. Los estudiantes la verán, pero no podrán usarla.', 'error', 6000);
      }
      await estado.api.actualizarDinamica(el.dataset.slug, { [campo]: valor });
      await recargarBase();
      aviso('Guardado.', 'exito');
    } catch (e) { errorAviso(e); }
  };
}
