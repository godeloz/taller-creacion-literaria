// Consignas de escritura: lista, escritura de la consigna y textos del grupo.
// También arma la franja del inicio.
import { estado, esTutor, miModo, soyVisible } from '../nucleo/estado.js';
import { esc, local, copiar, textoDeHTML, modal, $ } from '../nucleo/ui.js';
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
  return lista(cont, query);
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

// Consignas de mi grupo: abiertas y cerradas (con mi texto, borrador y conteo) y programadas
// (solo título y fechas). Las que el tutor oculta no llegan. De la más reciente a la más antigua.
async function misConsignas({ detalles = true } = {}) {
  const [todas, mias, programadas] = await Promise.all([
    estado.api.consignas(),
    estado.api.entregas({ dinamica: 'consignas', autor: estado.yo.id, incluirOcultas: true }).catch(() => []),
    estado.api.consignasProgramadas().catch(() => []),
  ]);
  const ahora = new Date().toISOString();
  const filas = todas.map(c => ({ c, a: miAsignacion(c) })).filter(x => x.a && ['abierta', 'cerrada'].includes(estadoDe(x.a, ahora)));
  for (const x of filas) {
    x.estado = estadoDe(x.a, ahora);
    x.mia = mias.find(e => e.item_id === x.c.id) || null;
  }
  const abiertas = filas.filter(x => x.estado === 'abierta').sort((p, q) => q.a.apertura.localeCompare(p.a.apertura));
  const cerradas = filas.filter(x => x.estado === 'cerrada').sort((p, q) => q.a.cierre.localeCompare(p.a.cierre));
  if (detalles) {
    await Promise.all(abiertas.map(async x => {
      x.conteo = await estado.api.conteoConsigna(x.c.id).catch(() => 0);
      x.borrador = x.mia ? null : await borradorDe(x.c.id);
    }));
  }
  // Las programadas, de la que abre primero a la que abre después.
  programadas.sort((p, q) => p.apertura.localeCompare(q.apertura));
  return { abiertas, cerradas, programadas };
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

// Agrega una marca («Ya comentó», «Revisado») al pie de las tarjetas de esos textos.
function marcarTarjetas(raiz, ids, html) {
  for (const id of ids) {
    const pie = raiz.querySelector(`a.entrada-tarjeta[href="#/entrega/${id}"] .entrada-pie`);
    if (pie) pie.insertAdjacentHTML('afterbegin', html);
  }
}

function extracto(c, n = 220) {
  const t = textoPlano(c.instrucciones);
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
}

// ---------------------------------------------------------------------
// Franja del inicio y panel flotante de la consigna
// ---------------------------------------------------------------------
// Lo que se necesita para abrir el panel flotante de cada consigna que está en la franja.
const enFranja = new Map();

function accionDe(x) {
  const modo = miModo();
  return x.mia ? (modo === 'privado' ? 'Ver su texto' : 'Leer los textos del grupo')
    : x.borrador ? 'Seguir escribiendo' : 'Escribir el texto';
}

export async function franjaInicio() {
  enFranja.clear();
  if (esTutor()) return franjaTutor();
  const { abiertas } = await misConsignas();
  if (!abiertas.length) return '';
  const x = abiertas[0];
  enFranja.set(x.c.id, x);
  const modo = miModo();
  const meta = [
    modo === 'privado' ? 'Su texto solo lo lee el tutor' : conteoTexto(x.conteo || 0, x.mia),
    x.c.limite_palabras ? `Máximo ${x.c.limite_palabras} palabras` : '',
  ].filter(Boolean).join(' · ');
  return `<section class="consigna-franja cf-clic" role="button" tabindex="0" data-abrir-consigna="${esc(x.c.id)}" aria-label="Ver la consigna «${esc(x.c.titulo)}»">
    <div class="cf-cuerpo">
      <span class="rotulo">${icono('pluma', 15)}Consigna de escritura · ${esc(cuandoCierra(x.a.cierre))}</span>
      <h2>${esc(x.c.titulo)}</h2>
      <p>${esc(extracto(x.c))}</p>
    </div>
    <div class="cf-accion">
      ${pillMio(x)}
      <span class="btn btn-lima">${icono('ojo', 18)}Ver la consigna</span>
      <span class="cf-meta">${esc(meta)}</span>
      ${abiertas.length > 1 ? `<a class="cf-mas" href="#/consignas">Hay ${abiertas.length} consignas abiertas · ver todas</a>` : ''}
    </div>
  </section>`;
}

async function franjaTutor() {
  const todas = await estado.api.consignas();
  const ahora = new Date().toISOString();
  const abiertas = todas.filter(c => !c.archivada && (c.grupos || []).some(a => estadoDe(a, ahora) === 'abierta'))
    .sort((p, q) => ultimaApertura(q, ahora).localeCompare(ultimaApertura(p, ahora)));
  if (!abiertas.length) return '';
  const filas = [];
  for (const c of abiertas.slice(0, 4)) {
    const grupos = c.grupos.filter(a => estadoDe(a, ahora) === 'abierta');
    const conteos = await Promise.all(grupos.map(a => estado.api.conteoConsigna(c.id, a.grupo_id).catch(() => 0)));
    enFranja.set(c.id, { c, tutor: true });
    filas.push(`<div class="cf-fila cf-clic" role="button" tabindex="0" data-abrir-consigna="${esc(c.id)}" aria-label="Ver la consigna «${esc(c.titulo)}»">
      <b>${esc(c.titulo)}</b>
      <span>${grupos.map((a, i) => `${esc(estado.grupos.find(g => g.id === a.grupo_id)?.nombre || 'Grupo')}: ${conteos[i]} ${conteos[i] === 1 ? 'texto' : 'textos'} · ${esc(cuandoCierra(a.cierre))}`).join('<br>')}</span>
    </div>`);
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

// El inicio llama a esta función después de pintar la franja: al tocarla se abre el panel flotante.
export function activarFranja(raiz) {
  raiz.querySelectorAll('[data-abrir-consigna]').forEach(el => {
    const abrir = ev => {
      if (ev.target.closest('a')) return;   // los enlaces de la franja siguen su camino
      const x = enFranja.get(el.dataset.abrirConsigna);
      if (x) panelFlotante(x);
    };
    el.addEventListener('click', abrir);
    el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(ev); } });
  });
}

// Panel flotante con toda la consigna: instrucciones, fechas, límite, ejemplos y referentes, y el botón para escribir.
async function panelFlotante(x) {
  const c = x.c;
  const destino = `#/consignas/${encodeURIComponent(c.id)}`;
  let cuerpo, acciones;
  if (x.tutor) {
    const ahora = new Date().toISOString();
    const mia = (await estado.api.entregas({ dinamica: 'consignas', item_id: c.id, autor: estado.yo.id, incluirOcultas: true }).catch(() => []))[0];
    const grupos = (c.grupos || []).map(a => `<span class="pill-consigna estado-${estadoDe(a, ahora)}">${esc(estado.grupos.find(g => g.id === a.grupo_id)?.nombre || 'Grupo')} · ${ETIQUETA_ESTADO[estadoDe(a, ahora)]}</span>`).join(' ');
    cuerpo = `<div class="consigna-panel consigna-flotante" style="--acento:${ACENTO_CONSIGNA}">
      ${panelConsigna(c, { extra: grupos ? `<span class="fila" style="gap:6px">${grupos}</span>` : '' })}</div>`;
    acciones = [
      { texto: 'Cerrar', clase: 'btn-fantasma', valor: null },
      mia ? null : { texto: 'Escribir mi texto', clase: '', accion: () => { location.hash = `${destino}?escribir`; } },
      { texto: 'Leer los textos', clase: 'btn-primario', accion: () => { location.hash = destino; } },
    ].filter(Boolean);
  } else {
    const modo = miModo();
    const extra = [
      `<span class="linea-ico">${pillMio(x)}<span>${esc(modo === 'privado' ? 'Su texto solo lo lee el tutor.' : conteoTexto(x.conteo || 0, x.mia) + '.')}</span></span>`,
      x.mia ? '' : modo === 'participante' ? `<span class="linea-ico">${icono('candado', 16)}Los textos del grupo se abren cuando publique el suyo o cuando la consigna cierre.</span>` : '',
    ].join('');
    cuerpo = `<div class="consigna-panel consigna-flotante" style="--acento:${ACENTO_CONSIGNA}">${panelConsigna(c, { asignacion: x.a, extra })}</div>`;
    acciones = [
      { texto: 'Cerrar', clase: 'btn-fantasma', valor: null },
      { texto: accionDe(x), clase: 'btn-primario', accion: () => { location.hash = destino; } },
    ];
  }
  // El panel se abre desde arriba (el foco en el botón no debe llevarlo al final en pantallas pequeñas).
  await modal({ cuerpo, ancho: 720, acciones, alAbrir: velo => setTimeout(() => { const d = velo.querySelector('.dialogo'); if (d) d.scrollTop = 0; }, 90) });
}

// Fecha que ordena una consigna en las listas del tutor: la apertura más reciente entre sus grupos.
function ultimaApertura(c, ahora, g = '') {
  const as = (c.grupos || []).filter(a => !g || a.grupo_id === g).map(a => a.apertura).sort();
  return as[as.length - 1] || c.creado || ahora;
}

// ---------------------------------------------------------------------
// Lista: abiertas, programadas y cerradas, cada una en su zona
// ---------------------------------------------------------------------
async function lista(cont, query = {}) {
  if (esTutor()) return listaTutor(cont, query);
  const { abiertas, cerradas, programadas } = await misConsignas();
  const modo = miModo();
  const nada = !abiertas.length && !cerradas.length && !programadas.length;
  cont.innerHTML = `
  <div class="contenedor">
    <h1 class="saludo" style="margin-bottom:6px">Consignas</h1>
    <p class="tenue" style="margin:0 0 26px;max-width:62ch">Ejercicios de escritura que el tutor propone cada semana. Escriba, guarde su borrador y publique antes del cierre. ${modo === 'privado' ? 'En modo privado, su texto solo lo lee el tutor.' : 'Los textos del grupo se abren cuando publica el suyo o cuando la consigna cierra.'}</p>
    ${nada ? vacio('Todavía no hay consignas', 'Cuando el tutor abra la primera, aparecerá aquí y en el inicio.') : ''}
    ${abiertas.length ? `<h2 class="titulo-seccion" style="margin-bottom:14px">Abiertas</h2>
      <div class="consignas-abiertas">${abiertas.map(x => `
        <a class="consigna-tarjeta" href="#/consignas/${esc(x.c.id)}">
          <span class="rotulo">${esc(cuandoCierra(x.a.cierre))}</span>
          <h2>${esc(x.c.titulo)}</h2>
          <p>${esc(extracto(x.c, 260))}</p>
          <div class="fila">${pillMio(x)}<span class="tenue" style="font-size:14px">${esc(modo === 'privado' ? 'Su texto solo lo lee el tutor' : conteoTexto(x.conteo || 0, x.mia))}${x.c.limite_palabras ? ` · Máximo ${x.c.limite_palabras} palabras` : ''}</span></div>
        </a>`).join('')}</div>` : nada ? '' : `<h2 class="titulo-seccion" style="margin-bottom:14px">Abiertas</h2><p class="tenue" style="margin:0">Ahora no hay ninguna consigna abierta.</p>`}
    ${programadas.length ? `<h2 class="titulo-seccion" style="margin:40px 0 6px">Programadas</h2>
      <p class="tenue" style="margin:0 0 14px">Las instrucciones se muestran el día en que abren.</p>
      <div class="consignas-cerradas">${programadas.map(p => `
        <div class="consigna-fila programada">
          <span class="cfi-titulo"><b>${esc(p.titulo)}</b><span class="tenue">Abre el ${esc(fechaHoraLarga(p.apertura))} · cierra el ${esc(fechaCortaHora(p.cierre))}</span></span>
          <span class="pill-consigna estado-programada">${icono('calendario', 14)}Programada</span>
        </div>`).join('')}</div>` : ''}
    ${cerradas.length ? `<h2 class="titulo-seccion" style="margin:40px 0 14px">Cerradas</h2>
      <div class="consignas-cerradas">${cerradas.map(x => `
        <a class="consigna-fila" href="#/consignas/${esc(x.c.id)}">
          <span class="cfi-titulo"><b>${esc(x.c.titulo)}</b><span class="tenue">Cerró el ${esc(fechaCortaHora(x.a.cierre))}</span></span>
          ${pillMio(x)}
          ${icono('derecha', 18)}
        </a>`).join('')}</div>` : ''}
  </div>`;
}

// El tutor ve las mismas zonas, de todos los grupos o de uno, más las ocultas y las que no ha asignado.
async function listaTutor(cont, query) {
  const [todas, textos] = await Promise.all([
    estado.api.consignas(),
    estado.api.entregas({ dinamica: 'consignas', incluirOcultas: true, limite: 5000 }).catch(() => []),
  ]);
  const ahora = new Date().toISOString();
  const nombreG = id => estado.grupos.find(g => g.id === id)?.nombre || 'Grupo';
  const conGrupos = estado.grupos.filter(g => todas.some(c => (c.grupos || []).some(a => a.grupo_id === g.id)));
  const g = conGrupos.some(x => x.id === query.grupo) ? query.grupo : '';
  // Zona de cada consigna: con un grupo elegido, el estado de ese grupo; con todos, el más «vivo» que tenga.
  const zonaDe = c => {
    const estados = (c.grupos || []).filter(a => !g || a.grupo_id === g).map(a => estadoDe(a, ahora));
    if (g && !estados.length) return null;
    return ['abierta', 'programada', 'cerrada'].find(e => estados.includes(e)) || 'oculta';
  };
  const zonas = { abierta: [], programada: [], cerrada: [], oculta: [] };
  for (const c of todas.filter(x => !x.archivada)) { const z = zonaDe(c); if (z) zonas[z].push(c); }
  const fecha = c => ultimaApertura(c, ahora, g);
  zonas.abierta.sort((p, q) => fecha(q).localeCompare(fecha(p)));
  zonas.cerrada.sort((p, q) => fecha(q).localeCompare(fecha(p)));
  zonas.oculta.sort((p, q) => fecha(q).localeCompare(fecha(p)));
  zonas.programada.sort((p, q) => fecha(p).localeCompare(fecha(q)));
  const tarjeta = c => {
    const n = textos.filter(e => e.item_id === c.id).length;
    return `<a class="consigna-tarjeta" href="#/consignas/${esc(c.id)}${g ? `?grupo=${g}` : ''}">
      <span class="rotulo">${n} ${n === 1 ? 'texto' : 'textos'}</span>
      <h2>${esc(c.titulo)}</h2>
      <p>${esc(extracto(c, 200))}</p>
      <div class="fila" style="gap:6px">${(c.grupos || []).length ? c.grupos.map(a => `<span class="pill-consigna estado-${estadoDe(a, ahora)}">${esc(nombreG(a.grupo_id))} · ${ETIQUETA_ESTADO[estadoDe(a, ahora)]}</span>`).join('') : '<span class="pill-consigna">Sin asignar</span>'}</div>
    </a>`;
  };
  const zona = (titulo, lista, nota = '') => lista.length ? `<h2 class="titulo-seccion" style="margin:34px 0 ${nota ? 6 : 14}px">${titulo} <span class="tenue" style="font-family:var(--f-ui);font-size:15px">${lista.length}</span></h2>
    ${nota ? `<p class="tenue" style="margin:0 0 14px">${nota}</p>` : ''}
    <div class="consignas-abiertas">${lista.map(tarjeta).join('')}</div>` : '';
  const total = Object.values(zonas).reduce((s, l) => s + l.length, 0);
  cont.innerHTML = `
  <div class="contenedor">
    <div class="fila" style="align-items:flex-end;margin-bottom:10px">
      <div><h1 class="saludo" style="margin-bottom:6px">Consignas</h1>
      <p class="tenue" style="margin:0">Como tutor ve todas las consignas y los textos de todos los grupos. Abra una para leer, escribir su propio texto o agregarle material.</p></div>
      <span class="espaciador"></span>
      <a class="btn btn-primario" href="#/tutor/consignas">${icono('ajustes', 18)}Gestionar consignas</a>
    </div>
    ${conGrupos.length > 1 ? `<div class="filtros">
      <a class="chip ${!g ? 'activo' : ''}" href="#/consignas">Todos los grupos</a>
      ${conGrupos.map(x => `<a class="chip ${x.id === g ? 'activo' : ''}" href="#/consignas?grupo=${x.id}">${esc(x.nombre)}</a>`).join('')}
    </div>` : ''}
    ${total ? `
      ${zona('Abiertas', zonas.abierta)}
      ${zona('Programadas', zonas.programada, 'El grupo ve el título y la fecha; las instrucciones, cuando abran.')}
      ${zona('Cerradas', zonas.cerrada)}
      ${zona(g ? 'Ocultas' : 'Ocultas o sin asignar', zonas.oculta, 'Solo usted las ve.')}`
      : vacio(g ? 'Este grupo no tiene consignas' : 'Todavía no hay consignas', 'Créelas y asígnelas en el panel del tutor.', '<a class="btn btn-primario" href="#/tutor/consignas?editar=nueva">Nueva consigna</a>')}
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
  const mia = (await estado.api.entregas({ dinamica: 'consignas', item_id: id, autor: estado.yo.id, incluirOcultas: true }))[0] || null;
  if (esTutor()) {
    if (query.escribir !== undefined && !mia) return escribir(cont, c, null);
    return lecturaTutor(cont, c, query, mia);
  }
  const a = miAsignacion(c);
  const est = estadoDe(a);
  if (est === 'abierta' && !mia && query.leer === undefined) return escribir(cont, c, a);
  return lectura(cont, c, a, est, mia, query);
}

async function escribir(cont, c, a) {
  const conteo = esTutor() ? 0 : await estado.api.conteoConsigna(c.id).catch(() => 0);
  const modo = miModo();
  const extra = esTutor() ? [
    `<span class="linea-ico">${icono('usuarios', 16)}Su texto lo verán los grupos que tienen esta consigna: cada persona, cuando publique el suyo o cuando cierre.</span>`,
    `<span class="linea-ico">${icono('lapiz', 16)}Al publicar, su texto queda fijo: ya no se puede editar.</span>`,
  ].join('') : [
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
    avisoPublicar: esTutor()
      ? 'Al publicar, su texto queda fijo: ya no podrá editarlo. Lo leerán los grupos que tienen esta consigna, con la misma regla que los demás textos.'
      : soyVisible()
      ? 'Al publicar, su texto queda fijo: ya no podrá editarlo ni borrarlo. Su grupo podrá leerlo y usted podrá leer los de sus compañeros.'
      : 'Al publicar, su texto queda fijo: ya no podrá editarlo ni borrarlo. Solo el tutor podrá leerlo.',
    alPublicar: d => publicarEntrega(
      { dinamica: 'consignas', item_id: c.id, titulo: d.titulo, texto: d.texto, vista: d.html, datos: {}, modulo_version: '1.0' },
      { irA: `#/consignas/${encodeURIComponent(c.id)}?publicado` }),
  });
  return () => esc_.destruir();
}

function cabecera(c, a, est, { abierta = false } = {}) {
  const linea = est === 'abierta' ? `Abierta · ${cuandoCierra(a.cierre)}`
    : est === 'cerrada' ? `Cerró el ${fechaHoraLarga(a.cierre)}`
    : est === 'programada' ? `Abre el ${fechaHoraLarga(a.apertura)}` : '';
  return `<section class="consigna-cabeza" style="--acento:${ACENTO_CONSIGNA}">
    <span class="rotulo">Consigna de escritura${linea ? ` · ${esc(linea)}` : ''}</span>
    <h1>${esc(c.titulo)}</h1>
    <details class="consigna-ver" ${abierta ? 'open' : ''}>
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
  const comentadas = await estado.api.comentadas(otros.map(e => e.id)).catch(() => []);
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
          ${modo !== 'privado' && otros.length ? `<span class="tenue">Ha comentado ${comentadas.length} de ${otros.length}</span>` : ''}
        </div>
        ${est === 'cerrada' && !mia && otros.length ? '<p class="tenue" style="margin:-4px 0 16px">La consigna cerró: los textos del grupo quedaron abiertos para todos.</p>' : ''}
        ${grupo}
      </div>
      <aside>${suyo}</aside>
    </div>
  </div>`;
  marcarTarjetas(cont, comentadas, `<span class="ya-comente">${icono('check', 13)}Ya comentó</span>`);

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
async function lecturaTutor(cont, c, query, mia = null) {
  const ahora = new Date().toISOString();
  const asignados = (c.grupos || []).map(a => ({ ...a, nombre: estado.grupos.find(g => g.id === a.grupo_id)?.nombre || 'Grupo' }));
  const g = query.grupo && asignados.some(a => a.grupo_id === query.grupo) ? query.grupo : '';
  const textos = (await estado.api.entregas({ dinamica: 'consignas', item_id: c.id, incluirOcultas: true }).catch(() => []))
    .filter(e => !g || e.autor === estado.yo.id || (e.perfil?.grupo_id ?? e.grupo_id) === g || e.grupo_id === g);
  const reacciones = await estado.api.reacciones(textos.map(e => e.id)).catch(() => []);
  const revisados = (await estado.api.revisiones(textos.map(e => e.id)).catch(() => [])).map(r => r.entrega_id);
  const sel = asignados.find(a => a.grupo_id === g);
  cont.innerHTML = `
  <div class="contenedor">
    <div class="fila" style="margin-bottom:16px">
      <a class="btn btn-fantasma btn-chico" href="#/consignas">${icono('izquierda', 16)}Consignas</a>
      <span class="espaciador"></span>
      ${mia ? `<a class="btn btn-chico btn-fantasma" href="#/entrega/${mia.id}">${icono('libro', 16)}Mi texto</a>`
        : `<a class="btn btn-chico btn-primario" href="#/consignas/${encodeURIComponent(c.id)}?escribir">${icono('lapiz', 16)}Escribir mi texto</a>`}
      <button class="btn btn-chico" id="t-material">${icono('mas', 16)}Agregar material</button>
      <a class="btn btn-chico btn-fantasma" href="#/tutor/consignas?ver=${encodeURIComponent(c.id)}${g ? `&grupo=${g}` : ''}">${icono('medalla', 16)}Seguimiento</a>
      <a class="btn btn-chico btn-fantasma" href="#/tutor/consignas?editar=${encodeURIComponent(c.id)}">${icono('calendario', 16)}Grupos y fechas</a>
    </div>
    ${query.publicado !== undefined && mia ? `<div class="aviso-publicado">${icono('check', 18)}<span>Su texto quedó publicado.</span></div>` : ''}
    ${cabecera(c, sel || null, sel ? estadoDe(sel, ahora) : '', { abierta: query.material !== undefined })}
    ${asignados.length ? `<div class="filtros">
      <a class="chip ${!g ? 'activo' : ''}" href="#/consignas/${esc(c.id)}">Todos los grupos</a>
      ${asignados.map(a => `<a class="chip ${a.grupo_id === g ? 'activo' : ''}" href="#/consignas/${esc(c.id)}?grupo=${a.grupo_id}">${esc(a.nombre)} · ${ETIQUETA_ESTADO[estadoDe(a, ahora)]}</a>`).join('')}
    </div>` : '<p class="tenue">Esta consigna todavía no está asignada a ningún grupo.</p>'}
    <div class="fila" style="align-items:baseline;margin:10px 0 14px">
      <h2 class="titulo-seccion">Textos</h2><span class="espaciador"></span>
      <span class="tenue">${textos.length} ${textos.length === 1 ? 'texto' : 'textos'}${textos.length ? ` · ${revisados.length} revisados` : ''}</span>
      ${textos.length ? `<button class="btn btn-chico" id="t-pdf">${icono('imprimir', 16)}PDF</button><button class="btn btn-chico btn-fantasma" id="t-txt">${icono('descargar', 16)}.txt</button>` : ''}
    </div>
    ${textos.length ? `<div class="muro">${textos.map(e => tarjetaEntrega(e, reacciones)).join('')}</div>` : vacio('Todavía no hay textos', g ? 'Nadie de este grupo ha publicado.' : 'Nadie ha publicado en esta consigna.')}
  </div>`;
  marcarTarjetas(cont, revisados, `<span class="ya-comente">${icono('check', 13)}Revisado</span>`);
  // Agregar o corregir instrucciones, ejemplos y referentes sin salir de esta vista.
  $('#t-material', cont).onclick = async () => {
    const { modalMaterial } = await import('./tutor-consignas.js');
    if (!(await modalMaterial(c))) return;
    const nueva = await estado.api.consigna(c.id);
    await lecturaTutor(cont, nueva || c, { ...query, material: '' }, mia);
  };
  const titulo = `${c.titulo}${sel ? ` · ${sel.nombre}` : ''}`;
  $('#t-pdf', cont)?.addEventListener('click', () => imprimir([...textos].reverse(), titulo, 'Consigna de escritura'));
  $('#t-txt', cont)?.addEventListener('click', () => descargarTXT([...textos].reverse(), titulo));
}
