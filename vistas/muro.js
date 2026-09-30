// Muro: todo lo publicado por el grupo, con filtros.
import { estado, esTutor, estaAbierta, miModo } from '../nucleo/estado.js';
import { esc, hoyISO, fechaLarga } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { tarjetaEntrega, vacio } from '../nucleo/componentes.js';

export default async function muro(cont, { query }) {
  const f = {
    dinamica: query.dinamica || '',
    autor: query.autor || '',
    reto_fecha: query.reto || '',
    sesion_id: query.sesion || '',
  };
  // El tutor puede ver el muro de un grupo en particular.
  const grupoF = esTutor() && estado.grupos.length > 1 ? (query.grupo || '') : '';
  if (f.reto_fecha) f.dinamica = 'reto';

  const armarHash = cambios => {
    const q = { dinamica: f.dinamica, autor: f.autor, reto: f.reto_fecha, sesion: f.sesion_id, grupo: grupoF, ...cambios };
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
    return '#/muro' + (qs ? '?' + qs : '');
  };

  const dinamicas = estado.dinamicas.filter(d => d.slug === 'reto' || (d.en_menu && estaAbierta(d)));
  const modo = miModo();
  const creadores = estado.perfiles.filter(p => p.rol !== 'tutor' && (!grupoF || p.grupo_id === grupoF)
    && (esTutor() || p.id === estado.yo.id || p.modo === 'participante'))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  let encabezado = '';
  let bloqueado = false;
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
      <a class="chip ${!f.dinamica && !f.sesion_id ? 'activo' : ''}" href="${armarHash({ dinamica: '', reto: '', sesion: '' })}">Todo</a>
      ${dinamicas.map(d => `<a class="chip ${f.dinamica === d.slug ? 'activo' : ''}" href="${armarHash({ dinamica: d.slug, reto: '', sesion: '' })}"><span class="punto" style="background:${esc(d.color)}"></span>${esc(d.nombre)}</a>`).join('')}
      <a class="chip ${f.reto_fecha === hoyISO() ? 'activo' : ''}" href="${armarHash({ dinamica: 'reto', reto: hoyISO(), sesion: '' })}">${icono('chispa', 16)}Reto de hoy</a>
      <span class="espaciador"></span>
      <label class="sr" for="filtro-autor">Filtrar por persona</label>
      <select class="selector" id="filtro-autor" style="width:auto;min-height:38px;border-radius:999px">
        <option value="">Todas las personas</option>
        ${creadores.map(p => `<option value="${p.id}" ${p.id === f.autor ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
      </select>
    </div>
    ${encabezado}
    <div id="nuevas"></div>
    <div id="lista"><div class="cargando">Cargando</div></div>
  </div>`;

  cont.querySelector('#filtro-autor').addEventListener('change', ev => { location.hash = armarHash({ autor: ev.target.value }); });

  const lista = cont.querySelector('#lista');
  const pintar = async () => {
    if (bloqueado) {
      lista.innerHTML = vacio('Las respuestas están cerradas por ahora', 'Publique su propio reto de hoy y se abrirán las de todo el grupo.', '<a class="btn btn-primario" href="#/reto">Escribir el reto</a>');
      return;
    }
    let entregas = await estado.api.entregas({ ...f, incluirOcultas: esTutor() });
    if (grupoF) entregas = entregas.filter(e => e.perfil?.rol === 'tutor' || (e.perfil?.grupo_id ?? e.grupo_id) === grupoF);
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
