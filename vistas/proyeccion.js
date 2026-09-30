// Proyección en vivo: el muro de la clase activa, a pantalla completa.
import { estado, claseActiva, dinamica } from '../nucleo/estado.js';
import { esc, hace } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { avatar, vacio } from '../nucleo/componentes.js';
import { formatoReloj } from '../nucleo/app.js';

export default async function proyeccion(cont) {
  document.body.classList.add('enfoque');
  estado.sesionClase = await estado.api.sesionClase().catch(() => null);
  const s = claseActiva();
  if (!s) {
    cont.innerHTML = `<div class="proyeccion">${vacio('No hay un ejercicio activo', 'Actívelo desde el panel del tutor.', '<a class="btn btn-blanco" href="#/tutor/clase">Ir al panel</a>')}</div>`;
    return;
  }
  const d = dinamica(s.dinamica);
  cont.innerHTML = `
    <div class="proyeccion">
      <div class="proyeccion-cab">
        <span class="pulso" style="background:var(--lima)"></span>
        <div><div class="rotulo" style="color:#A39DB0">${esc(d?.nombre || '')} · en vivo</div><h1>${esc(s.titulo || d?.nombre || '')}</h1></div>
        <span class="espaciador"></span>
        <span class="tenue" id="cuenta" style="color:#A39DB0;font-size:18px"></span>
        ${s.minutos ? '<span class="reloj-grande" id="reloj"></span>' : ''}
        <a class="btn btn-blanco btn-chico" href="#/tutor/clase">${icono('x', 16)}Salir</a>
      </div>
      <div id="tablero"></div>
    </div>`;

  const pintar = async () => {
    if (!cont.querySelector('#tablero')) return;
    const lista = await estado.api.entregas({ sesion_id: s.id });
    if (!$('tablero')) return;
    $('cuenta').textContent = `${lista.length} ${lista.length === 1 ? 'texto publicado' : 'textos publicados'}`;
    $('tablero').innerHTML = lista.length ? `<div class="muro">${lista.map(e => `
      <a class="entrada-tarjeta" href="#/entrega/${e.id}">
        <div class="autor-linea">${avatar(e.perfil, 40)}<div><div class="autor-nombre">${esc(e.perfil?.nombre || '')}</div><div class="autor-meta">${hace(e.creado)}</div></div></div>
        ${e.titulo ? `<div class="entrada-titulo">${esc(e.titulo)}</div>` : ''}
        <div class="entrada-extracto">${esc(e.texto)}</div>
      </a>`).join('')}</div>`
      : `<p style="color:#A39DB0;font-size:22px;font-family:var(--f-display)">Esperando las primeras publicaciones…</p>`;
  };
  const $ = id => cont.querySelector('#' + id);
  await pintar();
  const quitar = estado.api.suscribir('entregas', () => pintar());
  const sondeo = setInterval(pintar, 20000);
  const tic = setInterval(() => {
    const r = $('reloj');
    if (!r) return;
    const seg = Math.max(0, Math.round((new Date(s.inicia).getTime() + s.minutos * 60000 - Date.now()) / 1000));
    r.textContent = seg > 0 ? formatoReloj(seg) : 'Tiempo';
  }, 1000);
  return () => { quitar(); clearInterval(sondeo); clearInterval(tic); document.body.classList.remove('enfoque'); };
}
