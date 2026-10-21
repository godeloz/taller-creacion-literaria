// Mi archivo: los textos que cada persona borró. Desde aquí los vuelve a publicar
// o los borra definitivamente.
import { estado } from '../nucleo/estado.js';
import { esc, fechaHora } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { etiquetaDinamica, vacio } from '../nucleo/componentes.js';
import { accionesArchivo, activarArchivo, irA } from '../nucleo/archivo.js';

export default async function vistaArchivo(cont, { query }) {
  const lista = (await estado.api.entregas({ autor: estado.yo.id, archivo: 'mio', incluirOcultas: true, limite: 1000 }))
    .sort((a, b) => (b.archivada_en || '').localeCompare(a.archivada_en || ''));
  const recien = query.archivado && lista.some(e => e.id === query.archivado);

  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho">
    <a class="btn btn-fantasma btn-chico" href="#/perfil" style="margin-bottom:16px">${icono('izquierda', 16)}Mi perfil</a>
    ${recien ? `<div class="aviso-publicado">${icono('check', 18)}<span>Su texto quedó archivado. Puede volver a publicarlo o borrarlo definitivamente desde aquí.</span></div>` : ''}
    <h1 class="saludo" style="margin-bottom:6px">Mi archivo</h1>
    <p class="tenue" style="margin:0 0 24px">Los textos que usted borró. Nadie más los ve en el taller. Puede volver a publicarlos o borrarlos definitivamente.</p>
    ${lista.length ? `<div class="archivo-lista">${lista.map(fila).join('')}</div>`
      : vacio('Su archivo está vacío', 'Cuando borre un texto, quedará aquí.')}
  </div>`;

  // Al marcar el texto recién archivado, que se note dónde quedó.
  if (recien) cont.querySelector(`[data-fila="${CSS.escape(query.archivado)}"]`)?.classList.add('reciente');
  // Al volver a publicar, se abre el texto; al borrarlo definitivamente, se queda en el archivo.
  activarArchivo(cont.firstElementChild, id => lista.find(e => e.id === id), (accion, e) => {
    if (accion === 'publicar') location.hash = `#/entrega/${encodeURIComponent(e.id)}`;
    else irA('#/archivo');
  });
}

function fila(e) {
  const t = (e.texto || '').trim();
  const extracto = t.length > 220 ? t.slice(0, 220).replace(/\s+\S*$/, '') + '…' : t;
  return `<article class="archivo-fila" data-fila="${esc(e.id)}">
    <div class="fila" style="gap:10px">
      ${etiquetaDinamica(e.dinamica)}
      <span class="tenue" style="font-size:13.5px">Archivado el ${esc(fechaHora(e.archivada_en))}${e.archivada_por && e.archivada_por !== e.autor ? ' · lo archivó el tutor' : ''}</span>
    </div>
    <h3>${esc(e.titulo || 'Sin título')}</h3>
    ${extracto ? `<p class="archivo-extracto">${esc(extracto)}</p>` : ''}
    <div class="fila" style="gap:8px">${accionesArchivo(e, { leer: true })}<span class="espaciador"></span><span class="tenue" style="font-size:13px">${e.palabras ?? 0} palabras</span></div>
  </article>`;
}
