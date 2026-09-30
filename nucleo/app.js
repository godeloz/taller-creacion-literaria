// Arranque, cabecera, franja de clase en vivo y enrutador.
import { CONFIG } from '../config.js';
import { crearApi } from './api.js';
import { estado, esTutor, recargarBase, claseActiva, dinamica } from './estado.js';
import { $, esc, errorAviso, confirmar } from './ui.js';
import { icono } from './iconos.js';
import { avatar } from './componentes.js';
import { MODULOS } from '../modulos/registro.js';

const app = document.getElementById('app');
let limpiarVista = null;
let relojClase = null;

async function iniciar() {
  try {
    estado.api = await crearApi();
    const yo = await estado.api.sesion();
    if (!yo) return mostrarIngreso();
    await entrar(yo);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="contenedor contenedor-estrecho"><div class="tarjeta"><h1 class="titulo-seccion">No se pudo abrir el taller</h1><p>${esc(e.message)}</p><div class="fila"><button class="btn" onclick="location.reload()">Intentar de nuevo</button><button class="btn btn-fantasma" onclick="localStorage.removeItem('taller-sesion');location.reload()">Cerrar sesión</button></div></div></div>`;
  }
}

async function mostrarIngreso() {
  const { default: ingreso } = await import('../vistas/ingreso.js');
  app.innerHTML = '';
  await ingreso(app, { alEntrar: entrar });
}

async function entrar(yo) {
  estado.yo = yo;
  await recargarBase();
  try { estado.sesionClase = await estado.api.sesionClase(); } catch { estado.sesionClase = null; }
  pintarMarco();
  estado.api.alCambiarSesion?.(u => { if (!u) location.reload(); });
  estado.api.suscribir('sesion_clase', async () => {
    try { estado.sesionClase = await estado.api.sesionClase(); } catch { /* sin cambios */ }
    pintarFranja();
  });
  window.addEventListener('hashchange', enrutar);
  if (/access_token|type=recovery/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/');
  await enrutar();
  if (estado.api.enRecuperacion?.()) pedirNuevaClave();
}

async function pedirNuevaClave() {
  const { modal, aviso } = await import('./ui.js');
  await modal({
    titulo: 'Cree una contraseña nueva',
    cuerpo: `<div class="campo"><label for="n1">Nueva contraseña</label><input class="entrada" type="password" id="n1" minlength="8" autocomplete="new-password"></div>
      <p class="nota-campo">Mínimo 8 caracteres.</p>`,
    acciones: [{
      texto: 'Guardar', clase: 'btn-primario', accion: async v => {
        const c = v.querySelector('#n1').value;
        if (c.length < 8) { aviso('La contraseña debe tener al menos 8 caracteres.', 'error'); return false; }
        try { await estado.api.cambiarContrasena(c); aviso('Contraseña actualizada.', 'exito'); } catch (e) { errorAviso(e); return false; }
      },
    }],
  });
}

function pintarMarco() {
  const yo = estado.yo;
  const nav = [
    ['', 'inicio', 'Inicio'],
    ['dinamicas', 'dinamicas', 'Dinámicas'],
    ['muro', 'muro', 'Muro'],
    ['cuaderno', 'cuaderno', 'Cuaderno'],
  ];
  if (esTutor()) nav.push(['tutor', 'tutor', 'Tutor']);
  app.innerHTML = `
    <header class="cabecera">
      <div class="cabecera-in">
        <a class="marca" href="#/">
          <span class="marca-sello">${icono('pluma', 24, { grosor: 2 })}</span>
          <span class="marca-nombre">${esc(CONFIG.titulo)}</span>
        </a>
        <nav class="nav" aria-label="Secciones">
          ${nav.map(([ruta, ico, txt]) => `<a href="#/${ruta}" data-ruta="${ruta}">${icono(ico, 18)}<span class="txt">${txt}</span></a>`).join('')}
        </nav>
        <a class="usuario" href="#/perfil" title="Mi perfil">
          <span class="usuario-texto"><span class="usuario-nombre">${esc(yo.nombre)}</span><span class="usuario-rol">${yo.rol === 'tutor' ? 'Tutor' : 'Creador'}</span></span>
          <span id="avatar-cabecera">${avatar(yo, 42)}</span>
        </a>
      </div>
    </header>
    <div id="franja"></div>
    <main id="vista"></main>
    ${estado.api.modo === 'demo' ? `<div class="bandera-demo">Modo demostración · <button id="reiniciar-demo" style="background:none;border:0;color:inherit;text-decoration:underline;padding:0">reiniciar</button> · <button id="salir-demo" style="background:none;border:0;color:inherit;text-decoration:underline;padding:0">cambiar de usuario</button></div>` : ''}
  `;
  $('#reiniciar-demo')?.addEventListener('click', async () => {
    if (await confirmar('¿Borrar todos los datos de la demostración y empezar de cero?', { si: 'Reiniciar', peligro: true })) estado.api.reiniciarDemo();
  });
  $('#salir-demo')?.addEventListener('click', async () => { await estado.api.cerrarSesion(); location.hash = '#/'; location.reload(); });
  pintarFranja();
}

export function refrescarAvatarCabecera() {
  const c = $('#avatar-cabecera');
  if (c) c.innerHTML = avatar(estado.yo, 42);
}

function restante(s) {
  if (!s?.minutos || !s.inicia) return null;
  const fin = new Date(s.inicia).getTime() + s.minutos * 60000;
  return Math.max(0, Math.round((fin - Date.now()) / 1000));
}
export function formatoReloj(seg) {
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function enlaceClase(s) {
  if (!s) return '#/';
  if (s.dinamica === 'reto') return '#/reto';
  return `#/d/${s.dinamica}${s.item_id ? '/' + encodeURIComponent(s.item_id) : ''}`;
}

function pintarFranja() {
  const cont = $('#franja');
  if (!cont) return;
  clearInterval(relojClase);
  const s = claseActiva();
  if (!s) { cont.innerHTML = ''; return; }
  const d = dinamica(s.dinamica);
  cont.innerHTML = `
    <div class="franja-clase"><div class="franja-clase-in">
      <span class="pulso"></span>
      <span class="rotulo" style="color:var(--tinta)">En clase ahora</span>
      <b>${esc(s.titulo || d?.nombre || 'Ejercicio')}</b>
      <span class="reloj" id="reloj-clase"></span>
      <span class="espaciador"></span>
      ${esTutor() ? `<a class="btn btn-chico" href="#/proyectar">${icono('proyectar', 16)}Proyectar</a>` : ''}
      <a class="btn btn-primario btn-chico" href="${enlaceClase(s)}">Entrar al ejercicio</a>
    </div></div>`;
  const tic = () => {
    const r = restante(s);
    const el = $('#reloj-clase');
    if (el) el.textContent = r === null ? '' : r > 0 ? `${formatoReloj(r)} restantes` : 'Tiempo cumplido';
  };
  tic();
  relojClase = setInterval(tic, 1000);
}

async function enrutar() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [ruta, qs] = hash.split('?');
  const partes = ruta.split('/').map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  document.body.classList.remove('enfoque');
  if (typeof limpiarVista === 'function') { try { limpiarVista(); } catch { /* nada */ } }
  limpiarVista = null;

  document.querySelectorAll('.nav a').forEach(a => {
    const r = a.dataset.ruta;
    const activo = r === partes[0] || (r === '' && ['', 'reto'].includes(partes[0])) || (r === 'dinamicas' && partes[0] === 'd') || (r === 'muro' && partes[0] === 'entrega');
    a.classList.toggle('activo', activo);
  });

  const vista = document.getElementById('vista');
  vista.innerHTML = '<div class="cargando">Cargando</div>';
  window.scrollTo(0, 0);

  try {
    let cargar;
    const ctx = { params: partes.slice(1), query };
    switch (partes[0]) {
      case '': cargar = () => import('../vistas/inicio.js'); break;
      case 'dinamicas': cargar = () => import('../vistas/dinamicas.js'); break;
      case 'muro': cargar = () => import('../vistas/muro.js'); break;
      case 'entrega': cargar = () => import('../vistas/entrega.js'); break;
      case 'perfil': cargar = () => import('../vistas/perfil.js'); break;
      case 'cuaderno': cargar = () => import('../vistas/cuaderno.js'); break;
      case 'tutor': cargar = () => import('../vistas/tutor.js'); break;
      case 'proyectar': cargar = () => import('../vistas/proyeccion.js'); break;
      case 'reto': return abrirModulo(vista, 'reto', { ...ctx });
      case 'd': return abrirModulo(vista, partes[1], { item_id: partes[2] || null, query });
      case 'editar': return abrirEdicion(vista, partes[1]);
      default: cargar = () => import('../vistas/inicio.js');
    }
    const { default: render } = await cargar();
    vista.innerHTML = '';
    limpiarVista = await render(vista, ctx);
  } catch (e) {
    errorAviso(e);
    vista.innerHTML = `<div class="contenedor"><div class="tarjeta"><p>${esc(e.message)}</p><a class="btn" href="#/">Volver al inicio</a></div></div>`;
  }
}

async function cargarModulo(slug) {
  const cargar = MODULOS[slug];
  if (!cargar) throw new Error('Esta dinámica todavía no existe en la app.');
  return (await cargar()).default;
}

async function abrirModulo(vista, slug, ctx) {
  const d = dinamica(slug);
  const { estaAbierta } = await import('./estado.js');
  if (!d || (!estaAbierta(d) && !esTutor())) {
    vista.innerHTML = `<div class="contenedor"><div class="tarjeta"><h1 class="titulo-seccion">Esta dinámica aún no está abierta</h1><p class="tenue">Pronto aparecerá en el menú.</p><a class="btn" href="#/dinamicas">Ver dinámicas</a></div></div>`;
    return;
  }
  try {
    const modulo = await cargarModulo(slug);
    vista.innerHTML = '';
    const s = claseActiva();
    limpiarVista = await modulo.abrir(vista, { ...ctx, sesion: s && s.dinamica === slug ? s : null });
  } catch (e) {
    errorAviso(e);
    vista.innerHTML = `<div class="contenedor"><div class="tarjeta"><p>${esc(e.message)}</p><a class="btn" href="#/">Volver al inicio</a></div></div>`;
  }
}

async function abrirEdicion(vista, id) {
  try {
    const e = await estado.api.entrega(id);
    if (!e) throw new Error('No se encontró el texto.');
    if (e.autor !== estado.yo.id) throw new Error('Solo puede editar sus propios textos.');
    const modulo = await cargarModulo(e.dinamica);
    vista.innerHTML = '';
    limpiarVista = await modulo.abrir(vista, { entrega: e, item_id: e.item_id });
  } catch (err) {
    errorAviso(err);
    vista.innerHTML = `<div class="contenedor"><div class="tarjeta"><p>${esc(err.message)}</p><a class="btn" href="#/">Volver al inicio</a></div></div>`;
  }
}

iniciar();
