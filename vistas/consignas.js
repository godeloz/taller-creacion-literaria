// Consignas de escritura: lista, escritura de la consigna y textos del grupo.
// También arma la franja del inicio.
import { estado, esTutor, miModo, soyVisible } from '../nucleo/estado.js';
import { esc, local, copiar, textoDeHTML, $ } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { tarjetaEntrega, vacio } from '../nucleo/componentes.js';
import { montarEscritorio } from '../nucleo/escritorio.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { descargarTXT, imprimir } from '../nucleo/exportar.js';
import {
  panelConsigna, anexosConsigna, miAsignacion, estadoDe, cuandoCierra, fechaHoraLarga, fechaCortaHora,
  formato, textoPlano, ACENTO_CONSIGNA, ETIQUETA_ESTADO,
} from '../nucleo/consignas.js';

export default async function consignas(cont, { params, query }) {
  if (params[0]) return detalle(cont, params[0], query);
  return lista(cont);
}

// ---------------------------------------------------------------------
// Datos comunes
// ---------------------------------------------------------------------
async function borradorDe(id) {
  const clave = `consigna:${id}`;
  const loc = local(`borrador:${estado.yo.id}:${clave}`);
  let nube = null;
  try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
  const b = [loc, nube].filter(x => x && textoDeHTML(x.html || '').trim())
    .sort((x, y) => (y._actualizado || '').localeCompare(x._actualizado || ''))[0];
  return b || null;
}

// Consignas de mi grupo con su asignación, mi texto (si lo hay), borrador y conteo.
async function misConsignas({ detalles = true } = {}) {
  const [todas, mias] = await Promise.all([
    estado.api.consignas(),
    estado.api.entregas({ dinamica: 'consignas', autor: estado.yo.id, incluirOcultas: true }).catch(() => []),
  ]);
  const ahora = new Date().toISOString();
  const filas = todas.map(c => ({ c, a: miAsignacion(c) })).filter(x => x.a && estadoDe(x.a, ahora) !== 'programada');
  for (const x of filas) {
    x.estado = estadoDe(x.a, ahora);
    x.mia = mias.find(e => e.item_id === x.c.id) || null;
  }
  const abiertas = filas.filter(x => x.estado === 'abierta').sort((p, q) => p.a.cierre.localeCompare(q.a.cierre));
  const cerradas = filas.filter(x => x.estado === 'cerrada').sort((p, q) => q.a.cierre.localeCompare(p.a.cierre));
  if (detalles) {
    await Promise.all(abiertas.map(async x => {
      x.conteo = await estado.api.conteoConsigna(x.c.id).catch(() => 0);
      x.borrador = x.mia ? null : await borradorDe(x.c.id);
    }));
  }
  return { abiertas, cerradas };
}

function conteoTexto(n, mia) {
  const otros = mia && miModo() === 'participante' ? n - 1 : n;
  if (otros <= 0) return mia ? 'Todavía nadie más ha publicado' : 'Nadie ha publicado todavía';
  return `${otros} ${otros === 1 ? 'compañero ya publicó' : 'compañeros ya publicaron'}`;
}

function pillMio(x) {
  if (x.mia) return `<span class="pill-consigna hecha">${icono('check', 14)}Publicado</span>`;
  if (x.borrador) return `<span class="pill-consigna borrador">${icono('lapiz', 14)}Borrador guardado</span>`;
  if (x.estado === 'cerrada') return '<span class="pill-consigna">No lo publicó</span>';
  return '<span class="pill-consigna">Sin empezar</span>';
}

function extracto(c, n = 220) {
  const t = textoPlano(c.instrucciones);
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
}

// ---------------------------------------------------------------------
// Franja del inicio
// ---------------------------------------------------------------------
export async function franjaInicio() {
  if (esTutor()) return franjaTutor();
  const { abiertas } = await misConsignas();
  if (!abiertas.length) return '';
  const x = abiertas[0];
  const modo = miModo();
  const accion = x.mia ? (modo === 'privado' ? 'Ver su texto' : 'Leer los textos del grupo')
    : x.borrador ? 'Seguir escribiendo' : 'Escribir';
  const meta = [
    modo === 'privado' ? 'Su texto solo lo lee el tutor' : conteoTexto(x.conteo || 0, x.mia),
    x.c.limite_palabras ? `Máximo ${x.c.limite_palabras} palabras` : '',
  ].filter(Boolean).join(' · ');
  return `<section class="consigna-franja" aria-label="Consigna de escritura">
    <div class="cf-cuerpo">
      <span class="rotulo">${icono('pluma', 15)}Consigna de escritura · ${esc(cuandoCierra(x.a.cierre))}</span>
      <h2>${esc(x.c.titulo)}</h2>
      <p>${esc(extracto(x.c))}</p>
    </div>
    <div class="cf-accion">
      ${pillMio(x)}
      <a class="btn btn-lima" href="#/consignas/${esc(x.c.id)}">${icono(x.mia ? 'ojo' : 'lapiz', 18)}${accion}</a>
      <span class="cf-meta">${esc(meta)}</span>
      ${abiertas.length > 1 ? `<a class="cf-mas" href="#/consignas">Hay ${abiertas.length} consignas abiertas · ver todas</a>` : ''}
    </div>
  </section>`;
}

async function franjaTutor() {
  const todas = await estado.api.consignas();
  const ahora = new Date().toISOString();
  const abiertas = todas.filter(c => !c.archivada && (c.grupos || []).some(a => estadoDe(a, ahora) === 'abierta'));
  if (!abiertas.length) return '';
  const filas = [];
  for (const c of abiertas.slice(0, 4)) {
    const grupos = c.grupos.filter(a => estadoDe(a, ahora) === 'abierta');
    const conteos = await Promise.all(grupos.map(a => estado.api.conteoConsigna(c.id, a.grupo_id).catch(() => 0)));
    filas.push(`<a class="cf-fila" href="#/consignas/${esc(c.id)}">
      <b>${esc(c.titulo)}</b>
      <span>${grupos.map((a, i) => `${esc(estado.grupos.find(g => g.id === a.grupo_id)?.nombre || 'Grupo')}: ${conteos[i]} ${conteos[i] === 1 ? 'texto' : 'textos'} · ${esc(cuandoCierra(a.cierre))}`).join('<br>')}</span>
    </a>`);
  }
  return `<section class="consigna-franja consigna-franja-tutor" aria-label="Consignas abiertas">
    <div class="cf-cuerpo">
      <span class="rotulo">${icono('pluma', 15)}${abiertas.length === 1 ? 'Consigna abierta' : `${abiertas.length} consignas abiertas`}</span>
      <div class="cf-filas">${filas.join('')}</div>
    </div>
    <div class="cf-accion">
      <a class="btn btn-lima" href="#/tutor/consignas">${icono('ajustes', 18)}Panel de consignas</a>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------
async function lista(cont) {
  if (esTutor()) return listaTutor(cont);
  const { abiertas, cerradas } = await misConsignas();
  const modo = miModo();
  cont.innerHTML = `
  <div class="contenedor">
    <h1 class="saludo" style="margin-bottom:6px">Consignas</h1>
    <p class="tenue" style="margin:0 0 26px;max-width:62ch">Ejercicios de escritura que el tutor propone cada semana. Escriba, guarde su borrador y publique antes del cierre. ${modo === 'privado' ? 'En modo privado, su texto solo lo lee el tutor.' : 'Los textos del grupo se abren cuando publica el suyo o cuando la consigna cierra.'}</p>
    ${abiertas.length ? `<h2 class="titulo-seccion" style="margin-bottom:14px">Abiertas</h2>
      <div class="consignas-abiertas">${abiertas.map(x => `
        <a class="consigna-tarjeta" href="#/consignas/${esc(x.c.id)}">
          <span class="rotulo">${esc(cuandoCierra(x.a.cierre))}</span>
          <h2>${esc(x.c.titulo)}</h2>
          <p>${esc(extracto(x.c, 260))}</p>
          <div class="fila">${pillMio(x)}<span class="tenue" style="font-size:14px">${esc(modo === 'privado' ? 'Su texto solo lo lee el tutor' : conteoTexto(x.conteo || 0, x.mia))}${x.c.limite_palabras ? ` · Máximo ${x.c.limite_palabras} palabras` : ''}</span></div>
        </a>`).join('')}</div>` : vacio('No hay consignas abiertas', cerradas.length ? 'Las anteriores están abajo.' : 'Cuando el tutor abra la primera, aparecerá aquí y en el inicio.')}
    ${cerradas.length ? `<h2 class="titulo-seccion" style="margin:40px 0 14px">Anteriores</h2>
      <div class="consignas-cerradas">${cerradas.map(x => `
        <a class="consigna-fila" href="#/consignas/${esc(x.c.id)}">
          <span class="cfi-titulo"><b>${esc(x.c.titulo)}</b><span class="tenue">Cerró el ${esc(fechaCortaHora(x.a.cierre))}</span></span>
          ${pillMio(x)}
          ${icono('derecha', 18)}
        </a>`).join('')}</div>` : ''}
  </div>`;
}

async function listaTutor(cont) {
  const [todas, textos] = await Promise.all([
    estado.api.consignas(),
    estado.api.entregas({ dinamica: 'consignas', incluirOcultas: true, limite: 5000 }).catch(() => []),
  ]);
  const ahora = new Date().toISOString();
  const activas = todas.filter(c => !c.archivada);
  const nombreG = id => estado.grupos.find(g => g.id === id)?.nombre || 'Grupo';
  cont.innerHTML = `
  <div class="contenedor">
    <div class="fila" style="align-items:flex-end;margin-bottom:22px">
      <div><h1 class="saludo" style="margin-bottom:6px">Consignas</h1>
      <p class="tenue" style="margin:0">Como tutor ve todas las consignas y los textos de todos los grupos.</p></div>
      <span class="espaciador"></span>
      <a class="btn btn-primario" href="#/tutor/consignas">${icono('ajustes', 18)}Gestionar consignas</a>
    </div>
    ${activas.length ? `<div class="consignas-abiertas">${activas.map(c => {
      const n = textos.filter(e => e.item_id === c.id).length;
      return `<a class="consigna-tarjeta" href="#/consignas/${esc(c.id)}">
        <span class="rotulo">${n} ${n === 1 ? 'texto' : 'textos'}</span>
        <h2>${esc(c.titulo)}</h2>
        <p>${esc(extracto(c, 200))}</p>
        <div class="fila" style="gap:6px">${(c.grupos || []).length ? c.grupos.map(a => `<span class="pill-consigna estado-${estadoDe(a, ahora)}">${esc(nombreG(a.grupo_id))} · ${ETIQUETA_ESTADO[estadoDe(a, ahora)]}</span>`).join('') : '<span class="pill-consigna">Sin asignar</span>'}</div>
      </a>`;
    }).join('')}</div>` : vacio('Todavía no hay consignas', 'Créelas en el panel del tutor.', '<a class="btn btn-primario" href="#/tutor/consignas?editar=nueva">Nueva consigna</a>')}
  </div>`;
}

// ---------------------------------------------------------------------
// Detalle: escribir o leer
// ---------------------------------------------------------------------
async function detalle(cont, id, query) {
  const c = await estado.api.consigna(id);
  if (!c) {
    cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Esta consigna no está disponible', 'Puede que todavía no haya abierto para su grupo.', '<a class="btn" href="#/consignas">Ver las consignas</a>')}</div>`;
    return;
  }
  if (esTutor()) return lecturaTutor(cont, c, query);
  const a = miAsignacion(c);
  const est = estadoDe(a);
  const mia = (await estado.api.entregas({ dinamica: 'consignas', item_id: id, autor: estado.yo.id, incluirOcultas: true }))[0] || null;
  if (est === 'abierta' && !mia && query.leer === undefined) return escribir(cont, c, a);
  return lectura(cont, c, a, est, mia, query);
}

async function escribir(cont, c, a) {
  const conteo = await estado.api.conteoConsigna(c.id).catch(() => 0);
  const modo = miModo();
  const extra = [
    modo === 'privado' ? `<span class="linea-ico">${icono('candado', 16)}Participa en modo privado: su texto solo lo lee el tutor.</span>`
      : modo === 'observador' ? `<span class="linea-ico">${icono('ojo', 16)}<span>Como observador puede <a href="#/consignas/${esc(c.id)}?leer">leer los textos del grupo</a> cuando quiera. Su texto solo lo ve el tutor.</span></span>`
      : `<span class="linea-ico">${icono('candado', 16)}Los textos del grupo se abren cuando publique el suyo.${conteo ? ` Ya hay ${conteo}.` : ''}</span>`,
    `<span class="linea-ico">${icono('lapiz', 16)}Al publicar, su texto queda fijo: ya no se puede editar.</span>`,
  ].join('');
  const esc_ = montarEscritorio(cont, {
    acento: ACENTO_CONSIGNA, panelHTML: panelConsigna(c, { asignacion: a, extra }), clave: `consigna:${c.id}`,
    limite: c.limite_palabras || null, botonGuardar: true,
    placeholder: 'Empiece aquí. El borrador se guarda solo mientras escribe.',
    textoBoton: 'Publicar',
    avisoPublicar: soyVisible()
      ? 'Al publicar, su texto queda fijo: ya no podrá editarlo ni borrarlo. Su grupo podrá leerlo y usted podrá leer los de sus compañeros.'
      : 'Al publicar, su texto queda fijo: ya no podrá editarlo ni borrarlo. Solo el tutor podrá leerlo.',
    alPublicar: d => publicarEntrega(
      { dinamica: 'consignas', item_id: c.id, titulo: d.titulo, texto: d.texto, vista: d.html, datos: {}, modulo_version: '1.0' },
      { irA: `#/consignas/${encodeURIComponent(c.id)}?publicado` }),
  });
  return () => esc_.destruir();
}

function cabecera(c, a, est) {
  const linea = est === 'abierta' ? `Abierta · ${cuandoCierra(a.cierre)}`
    : est === 'cerrada' ? `Cerró el ${fechaHoraLarga(a.cierre)}`
    : est === 'programada' ? `Abre el ${fechaHoraLarga(a.apertura)}` : '';
  return `<section class="consigna-cabeza" style="--acento:${ACENTO_CONSIGNA}">
    <span class="rotulo">Consigna de escritura${linea ? ` · ${esc(linea)}` : ''}</span>
    <h1>${esc(c.titulo)}</h1>
    <details class="consigna-ver">
      <summary>${icono('info', 16)}Ver la consigna${(c.ejemplos || []).length || c.referentes ? ', ejemplos y referentes' : ''}</summary>
      <div class="consigna-texto">${formato(c.instrucciones)}</div>
      ${c.limite_palabras ? `<p class="tenue" style="font-size:14px">Máximo ${c.limite_palabras} palabras.</p>` : ''}
      ${anexosConsigna(c)}
    </details>
  </section>`;
}

async function lectura(cont, c, a, est, mia, query) {
  const modo = miModo();
  const puedeLeer = !!mia || est === 'cerrada' || modo === 'observador';
  let textos = [];
  if (puedeLeer && modo !== 'privado') textos = await estado.api.entregas({ dinamica: 'consignas', item_id: c.id }).catch(() => []);
  const otros = textos.filter(e => e.autor !== estado.yo.id);
  const reacciones = await estado.api.reacciones(otros.map(e => e.id)).catch(() => []);
  const borrador = !mia ? await borradorDe(c.id) : null;

  let suyo;
  if (mia) {
    suyo = `<section class="tarjeta su-texto">
      <div class="rotulo">${icono('check', 14)} Su texto · publicado ${esc(fechaCortaHora(mia.creado))}</div>
      <h3>${esc(mia.titulo || 'Sin título')}</h3>
      <p class="tenue" style="margin:0 0 14px">${mia.palabras} palabras${mia.n_comentarios ? ` · ${mia.n_comentarios} ${mia.n_comentarios === 1 ? 'comentario' : 'comentarios'}` : ''}${modo !== 'participante' ? ' · Solo lo lee el tutor' : ''}</p>
      <div class="fila">
        <a class="btn btn-primario btn-chico" href="#/entrega/${mia.id}">${icono('libro', 16)}Leer</a>
        <button class="btn btn-chico" id="s-copiar">${icono('copiar', 16)}Copiar</button>
        <button class="btn btn-chico btn-fantasma" id="s-txt">${icono('descargar', 16)}.txt</button>
        <button class="btn btn-chico btn-fantasma" id="s-pdf">${icono('imprimir', 16)}PDF</button>
      </div>
    </section>`;
  } else if (est === 'cerrada') {
    suyo = `<section class="tarjeta su-texto">
      <div class="rotulo">Su texto</div>
      <p style="margin:0 0 ${borrador ? 14 : 0}px">La consigna cerró sin su texto.${borrador ? ' Su borrador quedó guardado: puede copiarlo para seguir trabajándolo en el Cuaderno.' : ''}</p>
      ${borrador ? `<button class="btn btn-chico" id="s-borrador">${icono('copiar', 16)}Copiar borrador</button>` : ''}
    </section>`;
  } else {
    suyo = `<section class="tarjeta su-texto">
      <div class="rotulo">Su texto</div>
      <p style="margin:0 0 14px">Todavía no ha publicado su texto${borrador ? ', pero tiene un borrador guardado' : ''}.</p>
      <a class="btn btn-primario btn-chico" href="#/consignas/${esc(c.id)}">${icono('lapiz', 16)}${borrador ? 'Seguir escribiendo' : 'Escribir mi texto'}</a>
    </section>`;
  }

  let grupo;
  if (modo === 'privado') {
    grupo = `<p class="tenue">Participa en modo privado: no ve los textos del grupo. Su texto lo lee el tutor.</p>`;
  } else if (!otros.length) {
    grupo = vacio('Todavía nadie más ha publicado', est === 'abierta' ? 'Cuando sus compañeros publiquen, sus textos aparecerán aquí.' : '');
  } else {
    grupo = `<div class="muro">${otros.map(e => tarjetaEntrega(e, reacciones)).join('')}</div>`;
  }

  cont.innerHTML = `
  <div class="contenedor">
    <a class="btn btn-fantasma btn-chico" href="#/consignas" style="margin-bottom:16px">${icono('izquierda', 16)}Consignas</a>
    ${query.publicado !== undefined && mia ? `<div class="aviso-publicado">${icono('check', 18)}<span>Su texto quedó publicado.${modo === 'participante' ? ' Ya puede leer los de sus compañeros.' : ''}</span></div>` : ''}
    ${cabecera(c, a, est)}
    <div class="consigna-cuerpo">
      <div>
        <div class="fila" style="align-items:baseline;margin-bottom:14px">
          <h2 class="titulo-seccion">Textos del grupo</h2><span class="espaciador"></span>
          ${modo !== 'privado' ? `<span class="tenue">${otros.length} ${otros.length === 1 ? 'texto' : 'textos'}</span>` : ''}
        </div>
        ${est === 'cerrada' && !mia && otros.length ? '<p class="tenue" style="margin:-4px 0 16px">La consigna cerró: los textos del grupo quedaron abiertos para todos.</p>' : ''}
        ${grupo}
      </div>
      <aside>${suyo}</aside>
    </div>
  </div>`;

  if (mia) {
    const completa = async () => (await estado.api.entrega(mia.id)) || mia;
    $('#s-copiar', cont).onclick = async () => { const e = await completa(); copiar([e.titulo, e.texto].filter(Boolean).join('\n\n')); };
    $('#s-txt', cont).onclick = async () => descargarTXT([await completa()], `${c.titulo} ${mia.titulo || ''}`);
    $('#s-pdf', cont).onclick = async () => imprimir([await completa()], mia.titulo || c.titulo, estado.yo.nombre);
  }
  $('#s-borrador', cont)?.addEventListener('click', () => copiar([borrador.titulo, textoDeHTML(borrador.html || '')].filter(Boolean).join('\n\n')));
}

// ---------------------------------------------------------------------
// Tutor: todos los textos, con filtro por grupo
// ---------------------------------------------------------------------
async function lecturaTutor(cont, c, query) {
  const ahora = new Date().toISOString();
  const asignados = (c.grupos || []).map(a => ({ ...a, nombre: estado.grupos.find(g => g.id === a.grupo_id)?.nombre || 'Grupo' }));
  const g = query.grupo && asignados.some(a => a.grupo_id === query.grupo) ? query.grupo : '';
  const textos = (await estado.api.entregas({ dinamica: 'consignas', item_id: c.id, incluirOcultas: true }).catch(() => []))
    .filter(e => !g || (e.perfil?.grupo_id ?? e.grupo_id) === g || e.grupo_id === g);
  const reacciones = await estado.api.reacciones(textos.map(e => e.id)).catch(() => []);
  const sel = asignados.find(a => a.grupo_id === g);
  cont.innerHTML = `
  <div class="contenedor">
    <div class="fila" style="margin-bottom:16px">
      <a class="btn btn-fantasma btn-chico" href="#/consignas">${icono('izquierda', 16)}Consignas</a>
      <span class="espaciador"></span>
      <a class="btn btn-chico" href="#/tutor/consignas?ver=${encodeURIComponent(c.id)}${g ? `&grupo=${g}` : ''}">${icono('medalla', 16)}Seguimiento</a>
      <a class="btn btn-chico" href="#/tutor/consignas?editar=${encodeURIComponent(c.id)}">${icono('lapiz', 16)}Editar</a>
    </div>
    ${cabecera(c, sel || null, sel ? estadoDe(sel, ahora) : '')}
    ${asignados.length ? `<div class="filtros">
      <a class="chip ${!g ? 'activo' : ''}" href="#/consignas/${esc(c.id)}">Todos los grupos</a>
      ${asignados.map(a => `<a class="chip ${a.grupo_id === g ? 'activo' : ''}" href="#/consignas/${esc(c.id)}?grupo=${a.grupo_id}">${esc(a.nombre)} · ${ETIQUETA_ESTADO[estadoDe(a, ahora)]}</a>`).join('')}
    </div>` : '<p class="tenue">Esta consigna todavía no está asignada a ningún grupo.</p>'}
    <div class="fila" style="align-items:baseline;margin:10px 0 14px">
      <h2 class="titulo-seccion">Textos</h2><span class="espaciador"></span>
      <span class="tenue">${textos.length} ${textos.length === 1 ? 'texto' : 'textos'}</span>
      ${textos.length ? `<button class="btn btn-chico" id="t-pdf">${icono('imprimir', 16)}PDF</button><button class="btn btn-chico btn-fantasma" id="t-txt">${icono('descargar', 16)}.txt</button>` : ''}
    </div>
    ${textos.length ? `<div class="muro">${textos.map(e => tarjetaEntrega(e, reacciones)).join('')}</div>` : vacio('Todavía no hay textos', g ? 'Nadie de este grupo ha publicado.' : 'Nadie ha publicado en esta consigna.')}
  </div>`;
  const titulo = `${c.titulo}${sel ? ` · ${sel.nombre}` : ''}`;
  $('#t-pdf', cont)?.addEventListener('click', () => imprimir([...textos].reverse(), titulo, 'Consigna de escritura'));
  $('#t-txt', cont)?.addEventListener('click', () => descargarTXT([...textos].reverse(), titulo));
}
