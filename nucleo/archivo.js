// Archivo de textos: «Borrar» manda un texto al archivo de su autor; desde allí se
// vuelve a publicar o se borra definitivamente (el tutor lo conserva en su Archivo).
// El tutor puede además devolver al archivo un texto borrado y borrarlo para siempre.
// Las reglas viven en la base de datos (supabase/11-archivo.sql); aquí, los botones y mensajes.
import { estado, esTutor } from './estado.js';
import { esc, aviso, errorAviso, confirmar, fechaHora } from './ui.js';
import { icono } from './iconos.js';

const nombreAutor = e => e.perfil?.nombre || estado.perfiles.find(p => p.id === e.autor)?.nombre || 'Su autor';

// Vuelve a pintar la vista actual (o va a otra).
export function irA(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

// Botón «Borrar» para un texto publicado: lo ven su autor y el tutor.
export function botonBorrar(e) {
  if (!e || e.archivada_en) return '';
  if (e.autor !== estado.yo.id && !esTutor()) return '';
  return `<button class="btn btn-chico btn-fantasma" data-archivo="archivar" data-id="${esc(e.id)}">${icono('basura', 16)}Borrar</button>`;
}

// Acciones posibles sobre un texto archivado, según quién mira.
export function accionesArchivo(e, { leer = false } = {}) {
  if (!e?.archivada_en) return '';
  const yo = estado.yo.id;
  const b = (accion, texto, clase = 'btn-fantasma', ico = '') =>
    `<button class="btn btn-chico ${clase}" data-archivo="${accion}" data-id="${esc(e.id)}">${ico ? icono(ico, 15) : ''}${texto}</button>`;
  const partes = [];
  if (leer) partes.push(`<a class="btn btn-chico" href="#/entrega/${esc(e.id)}">${icono('libro', 15)}Leer</a>`);
  if (e.borrada_en) {
    if (esTutor()) partes.push(b('devolver', 'Devolver a su archivo', '', 'reiniciar'), b('eliminar', 'Borrar para siempre', 'btn-peligro', 'basura'));
  } else {
    if (e.autor === yo || (esTutor() && e.archivada_por === yo)) partes.push(b('publicar', 'Volver a publicar', 'btn-primario', 'enviar'));
    if (e.autor === yo) partes.push(b('definitivo', 'Borrar definitivamente', 'btn-fantasma', 'basura'));
    if (esTutor() && e.autor !== yo) partes.push(b('eliminar', 'Borrar para siempre', 'btn-peligro', 'basura'));
  }
  return partes.join('');
}

// Qué pasó con un texto archivado, en una línea.
export function estadoArchivo(e) {
  if (!e?.archivada_en) return '';
  const yo = estado.yo.id;
  if (e.borrada_en) return `${nombreAutor(e)} lo borró de su archivo (${fechaHora(e.borrada_en)}). Solo usted lo ve.`;
  if (e.autor === yo) {
    return `Está en su archivo (${fechaHora(e.archivada_en)}). Nadie más lo ve en el taller.${e.archivada_por && e.archivada_por !== yo ? ' Lo archivó el tutor.' : ''}`;
  }
  return `${e.archivada_por === yo ? 'Usted lo envió' : `${nombreAutor(e)} lo envió`} al archivo (${fechaHora(e.archivada_en)}). Solo lo ven su autor y usted.`;
}

// Franja sobre un texto archivado, con sus acciones.
export function franjaArchivo(e) {
  if (!e?.archivada_en) return '';
  return `<div class="franja-archivo${e.borrada_en ? ' borrada' : ''}">
    <span class="franja-archivo-txt">${icono('archivo', 18)}<span><b>${e.borrada_en ? 'Borrado por su autor' : 'En el archivo'}</b> · ${esc(estadoArchivo(e))}</span></span>
    <span class="fila">${accionesArchivo(e)}</span>
  </div>`;
}

// Ejecuta una acción del archivo. Devuelve true si se hizo.
export async function accionArchivo(accion, e) {
  const api = estado.api;
  const mia = e.autor === estado.yo.id;
  try {
    if (accion === 'archivar') {
      const ok = await confirmar(mia
        ? '¿Está seguro de que quiere borrar este texto? Dejará de verse en el taller y quedará en su archivo, donde podrá recuperarlo.'
        : '¿Enviar este texto al archivo? Deja de verse en el taller. Su autor lo encontrará en su archivo y podrá volver a publicarlo.',
      { si: mia ? 'Borrar' : 'Enviar al archivo', peligro: true });
      if (!ok) return false;
      await api.archivarEntrega(e.id);
      if (mia) irA(`#/archivo?archivado=${encodeURIComponent(e.id)}`);
      else { aviso('El texto pasó al archivo.', 'exito'); irA('#/tutor/archivo'); }
      return true;
    }
    if (accion === 'publicar') {
      await api.recuperarEntrega(e.id);
      aviso(mia ? 'Su texto volvió a publicarse.' : 'El texto volvió a publicarse.', 'exito');
      return true;
    }
    if (accion === 'definitivo') {
      const ok = await confirmar('¿Borrar definitivamente este texto? Se borrará de su archivo y ya no podrá recuperarlo. El tutor conserva una copia como registro del taller.',
        { si: 'Borrar definitivamente', peligro: true });
      if (!ok) return false;
      await api.borrarDeMiArchivo(e.id);
      aviso('El texto se borró de su archivo.', 'exito');
      return true;
    }
    if (accion === 'devolver') {
      await api.devolverAlArchivo(e.id);
      aviso('El texto volvió al archivo de su autor.', 'exito');
      return true;
    }
    if (accion === 'eliminar') {
      if (!(await confirmar('¿Borrar para siempre este texto? Se borran también sus comentarios y reacciones.', { si: 'Continuar', peligro: true }))) return false;
      if (!(await confirmar('Última confirmación: nadie podrá recuperar este texto, tampoco usted.', { si: 'Borrar para siempre', peligro: true }))) return false;
      await api.borrarEntrega(e.id);
      aviso('Texto borrado para siempre.', 'exito');
      return true;
    }
  } catch (err) { errorAviso(err); }
  return false;
}

// Activa los botones [data-archivo] dentro de raiz (un elemento que la vista acaba de crear,
// no el contenedor general, para que los oyentes no se acumulen entre vistas). buscar(id) devuelve la entrega;
// despues(accion, e) decide qué mostrar al terminar (por defecto, vuelve a pintar la vista).
export function activarArchivo(raiz, buscar, despues = null) {
  // Un solo oyente por contenedor, aunque la vista se vuelva a pintar.
  if (raiz._archivoClick) raiz.removeEventListener('click', raiz._archivoClick);
  raiz._archivoClick = async ev => {
    const b = ev.target.closest('[data-archivo]');
    if (!b || !raiz.contains(b)) return;
    ev.preventDefault();
    const e = await buscar(b.dataset.id);
    if (!e) return;
    b.disabled = true;
    const hecho = await accionArchivo(b.dataset.archivo, e);
    b.disabled = false;
    if (!hecho || b.dataset.archivo === 'archivar') return;
    if (despues) despues(b.dataset.archivo, e);
    else irA(location.hash);
  };
  raiz.addEventListener('click', raiz._archivoClick);
}
