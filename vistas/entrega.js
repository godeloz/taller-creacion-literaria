// Lectura de una entrega: texto, consigna, reacciones y comentarios.
import { estado, esTutor, dinamica } from '../nucleo/estado.js';
import { esc, sanitizar, parrafos, fechaHora, fechaLarga, errorAviso, confirmar, aviso, copiar } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { avatar, etiquetaDinamica, barraReacciones, activarReacciones, montarComentarios, vacio, etiquetaSoloTutor } from '../nucleo/componentes.js';
import { descargarTXT, imprimir } from '../nucleo/exportar.js';

export default async function vistaEntrega(cont, { params }) {
  const id = params[0];
  const e = await estado.api.entrega(id);
  if (!e) {
    cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este texto no está disponible',
      'Puede que haya sido ocultado, o que sea un reto de hoy: esos se abren cuando usted publica el suyo.',
      '<a class="btn" href="#/muro">Volver al muro</a>')}</div>`;
    return;
  }
  const d = dinamica(e.dinamica);
  let consigna = '';
  let conFinal = false;
  if (e.dinamica === 'consignas' && e.item_id) {
    const cs = await estado.api.consigna(e.item_id).catch(() => null);
    if (cs) consigna = `<div class="consigna-ref"><b>Consigna</b>${esc(cs.titulo)}${enlaceRespuestas(e)}</div>`;
  } else if (e.item_id) {
    try {
      const c = await estado.api.contenido(e.dinamica, e.item_id);
      if (c) {
        conFinal = !!c.datos.con_final;
        const etiqueta = e.dinamica === 'reto' ? `Reto del ${fechaLarga(e.reto_fecha)}`
          : e.dinamica === 'maraton' ? 'Carta del Maratón'
          : e.dinamica === 'poema' ? 'Poema fuente'
          : e.dinamica === 'cutup' ? 'Juego de frases'
          : e.dinamica === 's7' ? 'Texto original'
          : e.dinamica === 'forma' ? 'Consigna'
          : e.dinamica === 'fallar' ? 'Borrador revisado' : d?.nombre || '';
        consigna = `<div class="consigna-ref"><b>${esc(etiqueta)}</b>${esc(c.datos.titulo || c.datos.nombre || '')}${c.datos.autor ? `, de ${esc(c.datos.autor)}` : ''}${enlaceRespuestas(e)}</div>`;
      }
    } catch { /* la consigna es opcional */ }
  }
  if (!consigna && e.dinamica === 'fallar' && e.item_id?.startsWith('propio-')) {
    consigna = `<div class="consigna-ref"><b>Texto propio</b>${esc(e.datos?.base_titulo || 'Revisión de un texto de quien escribe')}</div>`;
  }
  const reacciones = await estado.api.reacciones([e.id]).catch(() => []);
  const mia = e.autor === estado.yo.id;
  const puedeDescargar = mia || esTutor();

  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho">
    <div class="fila" style="margin-bottom:16px">
      ${e.dinamica === 'consignas' && e.item_id ? `<a class="btn btn-fantasma btn-chico" href="#/consignas/${encodeURIComponent(e.item_id)}">${icono('izquierda', 16)}Consigna</a>`
        : `<a class="btn btn-fantasma btn-chico" href="#/muro">${icono('izquierda', 16)}Muro</a>`}
      <span class="espaciador"></span>
      ${mia && e.dinamica === 'fallar' && conFinal ? `<a class="btn btn-chico btn-fantasma" href="#/d/fallar/${encodeURIComponent(e.item_id)}?autora">${icono('libro', 16)}Versión final</a>` : ''}
      ${mia && e.dinamica !== 'consignas' ? `<a class="btn btn-chico" href="#/editar/${e.id}">${icono('lapiz', 16)}${e.dinamica === 'fallar' && !e.item_id?.startsWith('propio-') ? 'Explicaciones' : 'Editar'}</a>` : ''}
      ${puedeDescargar ? `<button class="btn btn-chico btn-fantasma" id="b-copiar">${icono('copiar', 16)}Copiar</button>
        <button class="btn btn-chico btn-fantasma" id="b-txt">${icono('descargar', 16)}.txt</button>
        <button class="btn btn-chico btn-fantasma" id="b-pdf">${icono('imprimir', 16)}PDF</button>` : ''}
      ${esTutor() ? `<button class="btn btn-chico" id="b-ocultar">${icono(e.estado === 'oculta' ? 'ojo' : 'ojoNo', 16)}${e.estado === 'oculta' ? 'Mostrar' : 'Ocultar'}</button>
        <button class="btn btn-chico btn-peligro" id="b-borrar">${icono('basura', 16)}Borrar</button>` : ''}
    </div>
    <article class="hoja">
      <div class="hoja-cab">
        <a href="#/perfil/${e.autor}" style="display:flex;gap:12px;align-items:center;text-decoration:none">
          ${avatar(e.perfil, 48)}
          <div><div class="autor-nombre" style="font-size:17px">${esc(e.perfil?.nombre || '')}</div>
          <div class="autor-meta">${esc(fechaHora(e.creado))}${e.editada ? ` · <span class="marca-editada">editado</span>` : ''}${e.estado === 'oculta' ? ' · oculto para el grupo' : ''}</div>
          ${etiquetaSoloTutor(e.perfil) ? `<div style="margin-top:4px">${etiquetaSoloTutor(e.perfil)}</div>` : ''}</div>
        </a>
        <span class="espaciador"></span>
        ${etiquetaDinamica(e.dinamica)}
      </div>
      ${e.titulo ? `<h1>${esc(e.titulo)}</h1>` : ''}
      ${consigna}
      <div class="lectura">${e.vista ? sanitizar(e.vista) : parrafos(e.texto)}</div>
      <div class="tenue" style="font-size:13px;margin-top:22px">${e.palabras} palabras</div>
    </article>
    <div style="margin-top:18px" id="reacciones">${barraReacciones(e.id, reacciones)}</div>
    <div class="comentarios" id="comentarios"></div>
  </div>`;

  activarReacciones(cont.querySelector('#reacciones'), reacciones);
  await montarComentarios(cont.querySelector('#comentarios'), e);

  const nombre = `${e.perfil?.nombre || 'texto'} ${e.titulo || d?.nombre || ''}`;
  cont.querySelector('#b-copiar')?.addEventListener('click', () => copiar([e.titulo, e.texto].filter(Boolean).join('\n\n')));
  cont.querySelector('#b-txt')?.addEventListener('click', () => descargarTXT([e], nombre));
  cont.querySelector('#b-pdf')?.addEventListener('click', () => imprimir([e], e.titulo || d?.nombre || 'Texto', e.perfil?.nombre || ''));
  cont.querySelector('#b-ocultar')?.addEventListener('click', async () => {
    try {
      await estado.api.cambiarEstadoEntrega(e.id, e.estado === 'oculta' ? 'publicada' : 'oculta');
      aviso(e.estado === 'oculta' ? 'El texto vuelve a estar visible.' : 'El texto quedó oculto para el grupo.');
      location.reload();
    } catch (err) { errorAviso(err); }
  });
  cont.querySelector('#b-borrar')?.addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar este texto de forma definitiva? No se puede recuperar.', { si: 'Borrar', peligro: true }))) return;
    try { await estado.api.borrarEntrega(e.id); aviso('Texto borrado.'); location.hash = '#/muro'; } catch (err) { errorAviso(err); }
  });
}

// Enlace a todas las respuestas a la misma consigna (texto, carta, poema o reto del día).
function enlaceRespuestas(e) {
  if (e.dinamica === 'consignas' && e.item_id) return `<a class="enlace-respuestas" href="#/consignas/${encodeURIComponent(e.item_id)}">Ver los textos de esta consigna</a>`;
  const href = e.dinamica === 'reto' && e.reto_fecha ? `#/muro?reto=${e.reto_fecha}`
    : e.item_id && !e.item_id.startsWith('propio-') ? `#/muro?dinamica=${encodeURIComponent(e.dinamica)}&item=${encodeURIComponent(e.item_id)}` : '';
  const a = { reto: 'a este reto', maraton: 'a esta carta', poema: 'a este poema', s7: 'a este texto', fallar: 'a este texto' }[e.dinamica] || 'a esta consigna';
  return href ? `<a class="enlace-respuestas" href="${href}">Ver todas las respuestas ${a}</a>` : '';
}
