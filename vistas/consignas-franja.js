// Franja de la consigna en el inicio y su panel flotante, más los datos comunes de Consignas.
// Vive aparte de vistas/consignas.js para que el inicio no cargue el escritorio, la publicación ni los exportes.
import { estado, esTutor, miModo } from '../nucleo/estado.js';
import { esc, local, textoDeHTML, modal } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import {
  panelConsigna, miAsignacion, estadoDe, cuandoCierra, textoPlano, ACENTO_CONSIGNA, ETIQUETA_ESTADO,
} from '../nucleo/consignas.js';

// ---------------------------------------------------------------------
// Datos comunes
// ---------------------------------------------------------------------
export async function borradorDe(id) {
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
export async function misConsignas({ detalles = true } = {}) {
  const [todas, mias, programadas, borradas] = await Promise.all([
    estado.api.consignas(),
    estado.api.entregas({ dinamica: 'consignas', autor: estado.yo.id, incluirOcultas: true, archivo: 'incluir' }).catch(() => []),
    estado.api.consignasProgramadas().catch(() => []),
    estado.api.misBorradas().catch(() => []),
  ]);
  const ahora = new Date().toISOString();
  const filas = todas.map(c => ({ c, a: miAsignacion(c) })).filter(x => x.a && ['abierta', 'cerrada'].includes(estadoDe(x.a, ahora)));
  for (const x of filas) {
    x.estado = estadoDe(x.a, ahora);
    x.mia = mias.find(e => e.item_id === x.c.id) || null;
    // Si lo borró de su archivo, ya lo escribió: no se le ofrece escribir otro.
    x.borrada = !x.mia && borradas.some(b => b.dinamica === 'consignas' && b.item_id === x.c.id);
  }
  const abiertas = filas.filter(x => x.estado === 'abierta').sort((p, q) => q.a.apertura.localeCompare(p.a.apertura));
  const cerradas = filas.filter(x => x.estado === 'cerrada').sort((p, q) => q.a.cierre.localeCompare(p.a.cierre));
  if (detalles) {
    await Promise.all(abiertas.map(async x => {
      x.conteo = await estado.api.conteoConsigna(x.c.id).catch(() => 0);
      x.borrador = x.mia || x.borrada ? null : await borradorDe(x.c.id);
    }));
  }
  // Las programadas, de la que abre primero a la que abre después.
  programadas.sort((p, q) => p.apertura.localeCompare(q.apertura));
  return { abiertas, cerradas, programadas };
}

export function conteoTexto(n, mia) {
  const otros = mia && !mia.archivada_en && miModo() === 'participante' ? n - 1 : n;
  if (otros <= 0) return mia ? 'Todavía nadie más ha publicado' : 'Nadie ha publicado todavía';
  return `${otros} ${otros === 1 ? 'compañero ya publicó' : 'compañeros ya publicaron'}`;
}

export function pillMio(x) {
  if (x.mia?.archivada_en) return `<span class="pill-consigna">${icono('archivo', 14)}En su archivo</span>`;
  if (x.mia) return `<span class="pill-consigna hecha">${icono('check', 14)}Publicado</span>`;
  if (x.borrada) return '<span class="pill-consigna">Lo borró</span>';
  if (x.borrador) return `<span class="pill-consigna borrador">${icono('lapiz', 14)}Borrador guardado</span>`;
  if (x.estado === 'cerrada') return '<span class="pill-consigna">No lo publicó</span>';
  return '<span class="pill-consigna">Sin empezar</span>';
}

// Agrega una marca («Ya comentó», «Revisado») al pie de las tarjetas de esos textos.
export function marcarTarjetas(raiz, ids, html) {
  for (const id of ids) {
    const pie = raiz.querySelector(`a.entrada-tarjeta[href="#/entrega/${id}"] .entrada-pie`);
    if (pie) pie.insertAdjacentHTML('afterbegin', html);
  }
}

export function extracto(c, n = 220) {
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
  return x.mia || x.borrada ? (modo === 'privado' ? 'Ver su texto' : 'Leer los textos del grupo')
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
    const mia = (await estado.api.entregas({ dinamica: 'consignas', item_id: c.id, autor: estado.yo.id, incluirOcultas: true, archivo: 'incluir' }).catch(() => []))[0];
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
      x.mia || x.borrada ? '' : modo === 'participante' ? `<span class="linea-ico">${icono('candado', 16)}Los textos del grupo se abren cuando publique el suyo o cuando la consigna cierre.</span>` : '',
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
export function ultimaApertura(c, ahora, g = '') {
  const as = (c.grupos || []).filter(a => !g || a.grupo_id === g).map(a => a.apertura).sort();
  return as[as.length - 1] || c.creado || ahora;
}
