// Muro: todo lo publicado por el grupo, con filtros.
import { estado, esTutor, estaAbierta, miModo } from '../nucleo/estado.js';
import { esc, hoyISO, fechaLarga } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { tarjetaEntrega, vacio, ICONO_DINAMICA, colorTexto } from '../nucleo/componentes.js';
import { miAsignacion, estadoDe } from '../nucleo/consignas.js';

// Segundo nivel del muro: las respuestas a un mismo elemento de una dinámica.
const TODOS = { reto: 'Todos los días', maraton: 'Todas las cartas', poema: 'Todos los poemas', cutup: 'Todos los juegos', s7: 'Todos los textos', forma: 'Todas las consignas', fallar: 'Todos los textos', pliegues: 'Todos los textos', consignas: 'Todas las consignas' };
const PROPIOS = '_propios';
// En estas dinámicas, las respuestas a un texto se abren cuando uno publica la suya.
const A_CIEGAS = ['fallar', 'consignas'];

export default async function muro(cont, { query }) {
  const f = {
    dinamica: query.dinamica || '',
    autor: query.autor || '',
    reto_fecha: query.reto || '',
    sesion_id: query.sesion || '',
    item_id: query.item && query.item !== PROPIOS ? query.item : '',
  };
  const soloPropios = query.item === PROPIOS;
  // El tutor puede ver el muro de un grupo en particular.
  const grupoF = esTutor() && estado.grupos.length > 1 ? (query.grupo || '') : '';
  if (f.reto_fecha) f.dinamica = 'reto';

  const armarHash = cambios => {
    const q = { dinamica: f.dinamica, item: query.item || '', autor: f.autor, reto: f.reto_fecha, sesion: f.sesion_id, grupo: grupoF, ...cambios };
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
    return '#/muro' + (qs ? '?' + qs : '');
  };

  const dinamicas = estado.dinamicas.filter(d => d.slug === 'reto' || (d.slug === 'consignas' && estaAbierta(d)) || (d.en_menu && estaAbierta(d)));
  const modo = miModo();
  const creadores = estado.perfiles.filter(p => p.rol !== 'tutor' && (!grupoF || p.grupo_id === grupoF)
    && (esTutor() || p.id === estado.yo.id || p.modo === 'participante'))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  let encabezado = '';
  let bloqueado = false;
  let cerrado = null;
  const deGrupo = e => !grupoF || e.perfil?.rol === 'tutor' || (e.perfil?.grupo_id ?? e.grupo_id) === grupoF;

  // ---------- segundo nivel: elementos de la dinámica elegida ----------
  let segundo = '';
  if (f.dinamica) {
    // Las consignas viven en su propia tabla; las demás dinámicas, en contenidos.
    const cerradas = new Set();
    const [items, deLaDinamica] = await Promise.all([
      f.dinamica === 'consignas'
        ? estado.api.consignas().then(cs => cs.map(c => {
          if (estadoDe(miAsignacion(c)) === 'cerrada') cerradas.add(c.id);
          return { item_id: c.id, datos: { titulo: c.titulo } };
        })).catch(() => [])
        : estado.api.contenidos(f.dinamica).catch(() => []),
      estado.api.entregas({ dinamica: f.dinamica, incluirOcultas: esTutor() }).catch(() => []),
    ]);
    const visibles = deLaDinamica.filter(deGrupo);
    const nombre = c => c?.datos?.titulo || c?.datos?.nombre || '';
    if (f.dinamica === 'reto') {
      const titulos = Object.fromEntries(items.map(c => [c.item_id, nombre(c)]));
      const fechas = [...new Map(visibles.filter(e => e.reto_fecha).map(e => [e.reto_fecha, e.item_id])).entries()]
        .sort((a, b) => b[0].localeCompare(a[0]));
      if (f.reto_fecha && !fechas.some(x => x[0] === f.reto_fecha)) fechas.unshift([f.reto_fecha, null]);
      if (fechas.length) {
        segundo = `<div class="filtros filtros-2"><label class="sr" for="filtro-item">Día del reto</label>
          <select class="selector" id="filtro-item" style="width:auto;min-height:38px;border-radius:999px">
            <option value="">${TODOS.reto}</option>
            ${fechas.map(([fe, it]) => `<option value="${fe}" ${fe === f.reto_fecha ? 'selected' : ''}>${esc(fechaLarga(fe))}${titulos[it] ? ` · ${esc(titulos[it])}` : ''}</option>`).join('')}
          </select></div>`;
      }
    } else {
      const conteo = {};
      visibles.forEach(e => { if (e.item_id) conteo[e.item_id] = (conteo[e.item_id] || 0) + 1; });
      const mios = new Set(deLaDinamica.filter(e => e.autor === estado.yo.id).map(e => e.item_id));
      const aCiegas = id => A_CIEGAS.includes(f.dinamica) && !esTutor() && miModo() === 'participante' && !mios.has(id) && !cerradas.has(id);
      const opciones = items.filter(c => !c.item_id.startsWith('_'))
        .filter(c => conteo[c.item_id] || aCiegas(c.item_id) || c.item_id === f.item_id)
        .map(c => ({ id: c.item_id, nombre: nombre(c) || c.item_id, n: conteo[c.item_id] || 0, candado: aCiegas(c.item_id) }));
      if (f.dinamica === 'fallar' || f.dinamica === 'pliegues') {
        const n = visibles.filter(e => e.item_id?.startsWith('propio-')).length;
        if (n || soloPropios) opciones.push({ id: PROPIOS, nombre: 'Textos propios', n });
      }
      const actual = soloPropios ? PROPIOS : f.item_id;
      if (opciones.length > 8) {
        segundo = `<div class="filtros filtros-2"><label class="sr" for="filtro-item">Elemento</label>
          <select class="selector" id="filtro-item" style="width:auto;max-width:100%;min-height:38px;border-radius:999px">
            <option value="">${TODOS[f.dinamica] || 'Todos'}</option>
            ${opciones.map(o => `<option value="${esc(o.id)}" ${o.id === actual ? 'selected' : ''}>${esc(o.nombre)}${o.candado ? ' 🔒' : o.n ? ` (${o.n})` : ''}</option>`).join('')}
          </select></div>`;
      } else if (opciones.length) {
        segundo = `<div class="filtros filtros-2">
          <a class="chip ${!actual ? 'activo' : ''}" href="${armarHash({ item: '' })}">${TODOS[f.dinamica] || 'Todos'}</a>
          ${opciones.map(o => `<a class="chip ${o.id === actual ? 'activo' : ''}" href="${armarHash({ item: o.id })}">${o.candado ? icono('candado', 14) : ''}${esc(o.nombre)}${o.n ? ` <span class="chip-n">${o.n}</span>` : ''}</a>`).join('')}
        </div>`;
      }
      if (actual) {
        const din = estado.dinamicas.find(d => d.slug === f.dinamica);
        const color = din?.color || '#5B3DF5';
        const titulo = soloPropios ? 'Textos propios' : nombre(items.find(c => c.item_id === f.item_id)) || f.item_id;
        encabezado = `<div class="tarjeta" style="margin-bottom:18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <span class="din-sello" style="background:${esc(color)};color:${colorTexto(color)};width:48px;height:48px;border-radius:14px;display:grid;place-items:center">${icono(ICONO_DINAMICA[f.dinamica] || 'chispa', 24)}</span>
          <div><div class="rotulo">${esc(din?.nombre || '')}</div><div class="display" style="font-size:28px">${esc(titulo)}</div></div>
        </div>`;
        if (!soloPropios && aCiegas(f.item_id)) {
          cerrado = f.dinamica === 'consignas'
            ? vacio('Los textos están cerrados por ahora', 'Publique el suyo y se abrirán los del grupo.',
              `<a class="btn btn-primario" href="#/consignas/${encodeURIComponent(f.item_id)}">Ir a la consigna</a>`)
            : vacio('Las respuestas están cerradas por ahora', 'Publique su versión de este texto y se abrirán las del grupo.',
              `<a class="btn btn-primario" href="#/d/${encodeURIComponent(f.dinamica)}/${encodeURIComponent(f.item_id)}">Revisar el texto</a>`);
        }
      }
    }
  }
  if (f.reto_fecha) {
    const hoy = f.reto_fecha === hoyISO();
    let titulo = '';
    if (hoy) {
      const [reto, mio] = await Promise.all([estado.api.retoDelDia(), estado.api.miRetoHoy()]);
      titulo = reto?.datos?.titulo || '';
      bloqueado = !mio && !esTutor() && modo === 'participante';
    }
    encabezado = `<div class="tarjeta" style="margin-bottom:18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <span class="din-sello" style="background:var(--coral);width:48px;height:48px;border-radius:14px;display:grid;place-items:center">${icono('chispa', 24)}</span>
      <div><div class="rotulo">Reto del ${esc(fechaLarga(f.reto_fecha))}</div><div class="display" style="font-size:28px">${esc(titulo || 'Respuestas del grupo')}</div></div>
    </div>`;
  }

  cont.innerHTML = `
  <div class="contenedor">
    <h1 class="saludo" style="margin-bottom:6px">Muro</h1>
    <p class="tenue" style="margin:0">${esTutor() ? 'Todo lo publicado, incluidos los textos de observadores y participantes privados (marcados «Solo lo ve el tutor»).'
      : modo === 'privado' ? 'Participa en modo privado: aquí ve sus propios textos y los del tutor. Lo suyo solo lo lee el tutor.'
      : modo === 'observador' ? 'Lo que el grupo ha publicado. Como observador puede leer y reaccionar; sus textos y comentarios solo los ve el tutor.'
      : 'Lo que el grupo ha publicado. Lea, reaccione y comente.'}</p>
    ${grupoF !== '' || (esTutor() && estado.grupos.length > 1) ? `<div class="filtros" style="margin-bottom:0">
      <a class="chip ${!grupoF ? 'activo' : ''}" href="${armarHash({ grupo: '', autor: '' })}">Todos los grupos</a>
      ${estado.grupos.map(g => `<a class="chip ${grupoF === g.id ? 'activo' : ''}" href="${armarHash({ grupo: g.id, autor: '' })}">${esc(g.nombre)}</a>`).join('')}
    </div>` : ''}
    <div class="filtros">
      <a class="chip ${!f.dinamica && !f.sesion_id ? 'activo' : ''}" href="${armarHash({ dinamica: '', item: '', reto: '', sesion: '' })}">Todo</a>
      ${dinamicas.map(d => `<a class="chip ${f.dinamica === d.slug && !(d.slug === 'reto' && f.reto_fecha === hoyISO()) ? 'activo' : ''}" href="${armarHash({ dinamica: d.slug, item: '', reto: '', sesion: '' })}"><span class="punto" style="background:${esc(d.color)}"></span>${esc(d.nombre)}</a>`).join('')}
      <a class="chip ${f.reto_fecha === hoyISO() ? 'activo' : ''}" href="${armarHash({ dinamica: 'reto', item: '', reto: hoyISO(), sesion: '' })}">${icono('chispa', 16)}Reto de hoy</a>
      <span class="espaciador"></span>
      <label class="sr" for="filtro-autor">Filtrar por persona</label>
      <select class="selector" id="filtro-autor" style="width:auto;min-height:38px;border-radius:999px">
        <option value="">Todas las personas</option>
        ${creadores.map(p => `<option value="${p.id}" ${p.id === f.autor ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
      </select>
    </div>
    ${segundo}
    ${encabezado}
    <div id="nuevas"></div>
    <div id="lista"><div class="cargando">Cargando</div></div>
  </div>`;

  cont.querySelector('#filtro-autor').addEventListener('change', ev => { location.hash = armarHash({ autor: ev.target.value }); });
  cont.querySelector('#filtro-item')?.addEventListener('change', ev => {
    location.hash = f.dinamica === 'reto' ? armarHash({ dinamica: 'reto', item: '', reto: ev.target.value }) : armarHash({ item: ev.target.value });
  });

  const lista = cont.querySelector('#lista');
  const pintar = async () => {
    if (cerrado) { lista.innerHTML = cerrado; return; }
    if (bloqueado) {
      lista.innerHTML = vacio('Las respuestas están cerradas por ahora', 'Publique su propio reto de hoy y se abrirán las de todo el grupo.', '<a class="btn btn-primario" href="#/reto">Escribir el reto</a>');
      return;
    }
    let entregas = await estado.api.entregas({ ...f, incluirOcultas: esTutor() });
    entregas = entregas.filter(deGrupo);
    if (soloPropios) entregas = entregas.filter(e => e.item_id?.startsWith('propio-'));
    // Pliegues: la tarjeta resalta lo que viene del texto de origen (va en datos, que la lista no trae).
    if (entregas.some(e => e.dinamica === 'pliegues' && !e.datos)) {
      const conDatos = await estado.api.entregas({ ...f, dinamica: 'pliegues', conVista: true, incluirOcultas: esTutor() }).catch(() => []);
      const datos = new Map(conDatos.map(x => [x.id, x.datos]));
      entregas.forEach(e => { if (datos.has(e.id)) e.datos = datos.get(e.id); });
    }
    const reacciones = await estado.api.reacciones(entregas.map(e => e.id));
    lista.innerHTML = entregas.length
      ? `<div class="muro">${entregas.map(e => tarjetaEntrega(e, reacciones)).join('')}</div>`
      : vacio('Todavía no hay nada aquí', 'Cuando alguien publique con estos filtros, aparecerá en el muro.');
  };
  await pintar();

  const quitar = estado.api.suscribir('entregas', p => {
    if (p.eventType !== 'INSERT' && p.eventType !== 'UPDATE') return;
    const n = cont.querySelector('#nuevas');
    if (!n || n.innerHTML) return;
    n.innerHTML = `<button class="btn btn-coral" style="margin-bottom:16px">${icono('reiniciar', 18)}Hay publicaciones nuevas · actualizar</button>`;
    n.querySelector('button').onclick = async () => { n.innerHTML = ''; await pintar(); };
  });
  return quitar;
}
