// Descarga de entregas: texto plano (.txt) y documento imprimible (PDF desde el navegador).
import { estado, dinamica } from './estado.js';
import { esc, sanitizar, parrafos, fechaHora, descargarArchivo, abrirImprimible, nombreArchivo } from './ui.js';

async function consignaDe(e, cache = {}) {
  if (!e.item_id) return '';
  const k = e.dinamica + ':' + e.item_id;
  if (!(k in cache)) {
    try {
      const c = await estado.api.contenido(e.dinamica, e.item_id);
      cache[k] = c ? (c.datos.titulo || '') + (c.datos.autor ? `, de ${c.datos.autor}` : '') : '';
    } catch { cache[k] = ''; }
  }
  return cache[k];
}

function autor(e) {
  return e.perfil?.nombre || estado.perfiles.find(p => p.id === e.autor)?.nombre || '';
}

export async function completar(entregas) {
  // Asegura que cada entrega tenga su vista (el muro las trae sin ella).
  const faltan = entregas.filter(e => e.vista === undefined);
  for (const e of faltan) {
    const full = await estado.api.entrega(e.id);
    if (full) Object.assign(e, full);
  }
  return entregas;
}

export async function descargarTXT(entregas, nombre) {
  const cache = {};
  const partes = [];
  for (const e of entregas) {
    const d = dinamica(e.dinamica);
    const c = await consignaDe(e, cache);
    partes.push([
      (e.titulo || c || d?.nombre || 'Texto').toUpperCase(),
      `${autor(e)} · ${d?.nombre || e.dinamica}${c ? ' · ' + c : ''} · ${fechaHora(e.creado)}${e.editada ? ' · editado' : ''}`,
      '',
      e.texto || '',
    ].join('\n'));
  }
  descargarArchivo(`${nombreArchivo(nombre)}.txt`, partes.join('\n\n\n———\n\n\n') + '\n');
}

export async function imprimir(entregas, titulo, subtitulo = '') {
  await completar(entregas);
  const cache = {};
  let cuerpo = `<h1>${esc(titulo)}</h1><div class="meta">${esc(subtitulo)}</div><br>`;
  for (const e of entregas) {
    const d = dinamica(e.dinamica);
    const c = await consignaDe(e, cache);
    cuerpo += `<section class="pieza">
      <div class="meta">${esc(d?.nombre || e.dinamica)}${c ? ' · ' + esc(c) : ''}</div>
      <h2>${esc(e.titulo || c || 'Sin título')}</h2>
      <div class="meta">${esc(autor(e))} · ${esc(fechaHora(e.creado))}${e.editada ? ' · editado' : ''}</div>
      <div style="margin-top:16px">${e.vista ? sanitizar(e.vista) : parrafos(e.texto)}</div>
    </section>`;
  }
  abrirImprimible(titulo, cuerpo);
}
