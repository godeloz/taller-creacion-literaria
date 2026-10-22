// Centro de notificaciones: la campana de la cabecera y su panel.
//
// · La campana muestra un círculo coral con lo nuevo desde la última vez que se abrió el panel.
// · Al abrir el panel, el círculo vuelve a cero; cada aviso conserva su punto hasta que se le da clic
//   o se abre por cuenta propia lo que avisa (el texto, la consigna, el reto, el perfil).
// · La lista se pide al entrar, cada 5 minutos, al volver a la pestaña y cuando llega un aviso nuevo.
// · Si la base todavía no tiene 13-notificaciones.sql, la campana no aparece.
import { estado, esTutor, MODOS } from './estado.js';
import { esc, hace, errorAviso } from './ui.js';
import { icono } from './iconos.js';

const TZ = 'America/Bogota';
const CADA = 5 * 60 * 1000;

let datos = { visto_en: null, coment_estudiantes: false, lista: [] };
let cargado = false;
let disponible = true;
let abierto = false;
let antesNuevas = 0;
let rutaPendiente = null;
let insignias = null;
let tRefresco = null;

const ms = t => (t ? new Date(t).getTime() : 0);
const noLeida = n => !n.leida_en;
const nueva = n => noLeida(n) && ms(n.actualizado) > ms(datos.visto_en);
const cuantasNuevas = () => datos.lista.filter(nueva).length;

// ---------- textos ----------
const b = t => `<b>${esc(t)}</b>`;
const comillas = t => `<b>«${esc(t)}»</b>`;
function quien(a) {
  if (!a) return 'Alguien';
  return a.rol === 'tutor' ? 'El tutor' : b(a.nombre);
}
function varios(n) {
  const a = n.actores || [];
  if (a.length <= 1) return { sujeto: quien(a[0]), plural: false };
  if (a.length === 2) return { sujeto: `${quien(a[0])} y ${a[1].rol === 'tutor' ? 'el tutor' : b(a[1].nombre)}`, plural: true };
  return { sujeto: `${quien(a[0])} y ${a.length - 1} personas más`, plural: true };
}
// «su texto «El huevo»», «su reto», «el texto de Ana»…
function texto(n) {
  const mio = n.entrega_autor === estado.yo.id;
  if (n.entrega_titulo) return mio ? `su texto ${comillas(n.entrega_titulo)}` : comillas(n.entrega_titulo);
  if (mio) return n.entrega_dinamica === 'reto' ? 'su reto' : 'su texto sin título';
  return `el texto de ${b(n.entrega_autor_nombre || 'otra persona')}`;
}
const consigna = n => comillas(n.consigna_titulo || 'la consigna');
function fechaCierre(iso) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
function nombreInsignia(slug) {
  return insignias?.find(i => i.slug === slug)?.nombre || 'nueva';
}

// Qué dice cada aviso, con qué icono y a dónde lleva.
function describir(n) {
  const d = n.datos || {};
  const aTexto = `#/entrega/${n.entrega_id}`;
  const aNota = n.comentario_id ? `${aTexto}?nota=${n.comentario_id}` : aTexto;
  const aConsigna = esTutor() && n.grupo_id ? `#/consignas/${n.consigna_id}?grupo=${n.grupo_id}` : `#/consignas/${n.consigna_id}`;
  const a0 = (n.actores || [])[0];
  switch (n.tipo) {
    case 'comentario':
      if (a0?.rol === 'tutor') return { ico: 'comentario', href: aNota, html: n.n > 1 ? `El tutor dejó ${n.n} notas en ${texto(n)}` : `El tutor comentó ${texto(n)}` };
      return { ico: 'comentario', href: aNota, html: n.n > 1 ? `${quien(a0)} dejó ${n.n} comentarios en ${texto(n)}` : `${quien(a0)} comentó ${texto(n)}` };
    case 'devolucion':
      return { ico: 'pluma', href: aNota, html: `El tutor escribió la devolución de ${texto(n)}` };
    case 'respuesta':
      return { ico: 'comentario', href: aNota, html: n.n > 1 ? `${quien(a0)} respondió ${n.n} veces a sus notas en ${texto(n)}` : `${quien(a0)} respondió su nota en ${texto(n)}` };
    case 'reaccion': {
      const v = varios(n);
      return { ico: 'gusta', href: aTexto, html: `${v.sujeto} ${v.plural ? 'reaccionaron' : 'reaccionó'} a ${texto(n)}` };
    }
    case 'coincido': {
      const v = varios(n);
      return { ico: 'check', href: aNota, html: `${v.sujeto} ${v.plural ? 'coincidieron con sus notas' : 'coincidió con su nota'} en ${texto(n)}` };
    }
    case 'revisado':
      return { ico: 'check', href: aTexto, html: `El tutor marcó como revisado ${texto(n)}` };
    case 'insignia':
      return { ico: 'medalla', href: '#/perfil', html: a0?.rol === 'tutor'
        ? `El tutor le dio la insignia ${comillas(nombreInsignia(d.insignia))}`
        : `Ganó la insignia ${comillas(nombreInsignia(d.insignia))}` };
    case 'insignia-nueva':
      return { ico: 'estrella', href: '#/perfil', html: `Hay una insignia nueva en el taller: ${comillas(nombreInsignia(d.insignia))}` };
    case 'consigna-abierta':
      return { ico: 'pagina', href: aConsigna, html: `Se abrió la consigna ${consigna(n)}`, extra: d.cierre ? `Cierra el ${fechaCierre(d.cierre)}` : '' };
    case 'consigna-cierre':
      return { ico: 'reloj', href: aConsigna, html: `Quedan menos de 24 horas para el cierre de ${consigna(n)} y aún no ha escrito su texto`, extra: d.cierre ? `Cierra el ${fechaCierre(d.cierre)}` : '' };
    case 'consigna-plazo': {
      const html = d.reabierta ? `Se volvió a abrir la consigna ${consigna(n)}`
        : ms(d.cierre) > ms(d.antes) ? `Se amplió el plazo de ${consigna(n)}`
        : `Cambió el cierre de ${consigna(n)}`;
      return { ico: 'calendario', href: aConsigna, html, extra: d.cierre ? `Ahora cierra el ${fechaCierre(d.cierre)}` : '' };
    }
    case 'consigna-lectura':
      return { ico: 'libro', href: aConsigna, html: `Cerró la consigna ${consigna(n)}: ya puede leer los textos del grupo` };
    case 'racha-riesgo':
      return { ico: 'llama', href: '#/reto', html: d.comodin
        ? `Si hoy no publica el reto, usará el comodín de la semana para no perder su racha de ${b(d.actual + (d.actual === 1 ? ' día' : ' días'))}`
        : `Su racha de ${b(d.actual + (d.actual === 1 ? ' día' : ' días'))} se pierde hoy a medianoche. Publique el reto para mantenerla` };
    case 'racha-perdida':
      return { ico: 'llama', href: '#/reto', html: `Perdió su racha de ${b(d.n + (d.n === 1 ? ' día' : ' días'))}. Escriba el reto de hoy para empezar otra` };
    case 'archivo-enviado':
      return { ico: 'archivo', href: aTexto, html: `El tutor envió ${texto(n)} a su archivo` };
    case 'archivo-publicado':
      return { ico: 'archivo', href: aTexto, html: `El tutor volvió a publicar ${texto(n)}` };
    case 'archivo-devuelto':
      return { ico: 'archivo', href: aTexto, html: `El tutor devolvió ${texto(n)} a su archivo` };
    case 'modo':
      return { ico: MODOS[d.modo]?.ico || 'usuarios', href: '#/perfil', html: `Su modo de participación ahora es ${comillas(MODOS[d.modo]?.nombre || d.modo)}`, extra: MODOS[d.modo]?.corto || '' };
    case 'grupo':
      return { ico: 'usuarios', href: '#/perfil', html: `Ahora está en el grupo ${comillas(n.grupo_nombre || 'nuevo')}` };
    case 'tut-textos':
      return { ico: 'pagina', href: aConsigna, html: n.n > 1 ? `${n.n} textos nuevos en ${consigna(n)}` : `${quien(a0)} publicó su texto en ${consigna(n)}`, grupo: true };
    case 'tut-cierre':
      return { ico: 'reloj', href: `#/tutor/consignas?ver=${n.consigna_id}&grupo=${n.grupo_id}`,
        html: `Cerró ${consigna(n)}: ${d.escribieron} de ${d.total} escribieron`,
        extra: d.sin_revisar ? `${d.sin_revisar} ${d.sin_revisar === 1 ? 'texto' : 'textos'} sin revisar` : 'Todos los textos están revisados', grupo: true };
    case 'tut-coment':
      return { ico: 'comentario', href: aNota, html: n.n > 1
        ? `${n.n} comentarios nuevos en el texto de ${b(n.entrega_autor_nombre || '')}`
        : `${quien(a0)} comentó el texto de ${b(n.entrega_autor_nombre || '')}`, extra: n.consigna_titulo ? `Consigna «${n.consigna_titulo}»` : '', grupo: true };
    default:
      return null;
  }
}

// ---------- campana ----------
export function campanaHTML() {
  return `<button type="button" class="campana" id="campana" hidden aria-haspopup="dialog" aria-expanded="false" aria-controls="panel-notif" aria-label="Notificaciones">
    ${icono('campana', 21)}<span class="campana-num" hidden></span></button>`;
}

function pintarCampana() {
  const c = document.getElementById('campana');
  if (!c) return;
  c.hidden = !disponible;
  const n = cuantasNuevas();
  const num = c.querySelector('.campana-num');
  num.hidden = !n;
  num.textContent = n > 9 ? '9+' : String(n);
  c.classList.toggle('con-nuevas', !!n);
  c.setAttribute('aria-label', n ? `Notificaciones: ${n === 1 ? 'una nueva' : `${n} nuevas`}` : 'Notificaciones');
  if (cargado && n > antesNuevas) {
    c.classList.remove('sacudir');
    void c.offsetWidth;
    c.classList.add('sacudir');
  }
  antesNuevas = n;
}

async function refrescar() {
  try {
    datos = await estado.api.notificaciones();
    datos.lista = datos.lista || [];
    disponible = true;
    if (!insignias && datos.lista.some(n => n.tipo.startsWith('insignia'))) insignias = await estado.api.insignias().catch(() => []);
  } catch (e) {
    // Sin 13-notificaciones.sql la campana no aparece (al tutor ya le avisa la franja de SQL pendientes).
    if (/notificaciones|schema cache|does not exist|PGRST20\d|42883|42P01/i.test(e?.message || '')) disponible = false;
    else console.warn('Notificaciones:', e);
  }
  const primera = !cargado;
  cargado = true;
  if (primera) antesNuevas = cuantasNuevas();
  pintarCampana();
  if (abierto) pintarPanel();
  if (rutaPendiente) { const r = rutaPendiente; rutaPendiente = null; marcarPorRuta(...r); }
}
const refrescarPronto = () => { clearTimeout(tRefresco); tRefresco = setTimeout(refrescar, 700); };

// ---------- panel ----------
function itemHTML(n) {
  const x = describir(n);
  if (!x) return '';
  const meta = [hace(n.cuando || n.actualizado), x.extra, x.grupo && esTutor() && estado.grupos.length > 1 ? n.grupo_nombre : ''].filter(Boolean).map(esc).join(' · ');
  return `<a class="notif ${noLeida(n) ? 'no-leida' : 'leida'}" href="${esc(x.href)}" data-notif="${esc(n.id)}">
    <span class="notif-ico">${icono(x.ico, 18)}</span>
    <span class="notif-cuerpo"><span class="notif-texto">${x.html}</span><span class="notif-meta">${meta}</span></span>
    ${noLeida(n) ? '<span class="notif-punto" aria-label="Sin leer"></span>' : ''}
  </a>`;
}

function pintarPanel() {
  const p = document.getElementById('panel-notif');
  if (!p) return;
  const porFecha = (a, z) => ms(z.cuando) - ms(a.cuando);
  const visibles = datos.lista.filter(n => describir(n));
  const sinLeer = visibles.filter(noLeida).sort(porFecha);
  const leidas = visibles.filter(n => !noLeida(n)).sort(porFecha);
  p.innerHTML = `
    <div class="notif-asa" aria-hidden="true"></div>
    <div class="notif-cab">
      <h2>Notificaciones</h2>
      <span class="espaciador"></span>
      ${sinLeer.length ? '<button type="button" class="btn btn-fantasma btn-chico" data-leer-todo>Marcar todo como leído</button>' : ''}
      <button type="button" class="btn btn-fantasma btn-chico btn-icono notif-cerrar" data-cerrar-notif aria-label="Cerrar">${icono('x', 18)}</button>
    </div>
    <div class="notif-lista">
      ${!visibles.length ? `<div class="notif-vacio">${icono('campana', 28)}<b>No tiene notificaciones</b>
        <span>Aquí verá los comentarios a sus textos, las consignas que se abren y el estado de su racha.</span></div>` : ''}
      ${sinLeer.length && leidas.length ? '<div class="rotulo notif-rotulo">Sin leer</div>' : ''}
      ${sinLeer.map(itemHTML).join('')}
      ${sinLeer.length && leidas.length ? '<div class="rotulo notif-rotulo">Anteriores</div>' : ''}
      ${leidas.map(itemHTML).join('')}
    </div>
    ${esTutor() ? `<label class="notif-pie"><input type="checkbox" data-pref-coment ${datos.coment_estudiantes ? 'checked' : ''}>
      Avisarme también de los comentarios entre estudiantes en las consignas</label>` : ''}`;
}

function ubicarPanel() {
  const p = document.getElementById('panel-notif');
  const c = document.getElementById('campana');
  if (!p || !c) return;
  if (innerWidth <= 760) { p.style.top = ''; p.style.right = ''; return; }
  const r = c.getBoundingClientRect();
  p.style.top = `${Math.round(r.bottom + 10)}px`;
  p.style.right = `${Math.max(16, Math.round(innerWidth - r.right - 12))}px`;
}

async function abrir() {
  if (abierto) return;
  abierto = true;
  const c = document.getElementById('campana');
  const velo = document.createElement('div');
  velo.className = 'notif-velo';
  velo.id = 'notif-velo';
  const p = document.createElement('div');
  p.className = 'panel-notif';
  p.id = 'panel-notif';
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-label', 'Notificaciones');
  document.body.append(velo, p);
  pintarPanel();
  ubicarPanel();
  requestAnimationFrame(() => { velo.classList.add('ver'); p.classList.add('ver'); });
  c?.setAttribute('aria-expanded', 'true');
  setTimeout(() => p.querySelector('.notif, [data-leer-todo], [data-cerrar-notif]')?.focus({ preventScroll: true }), 60);

  // Abrir el panel pone el círculo en cero.
  datos.visto_en = new Date().toISOString();
  pintarCampana();
  estado.api.verNotificaciones().catch(() => {});

  p.addEventListener('click', async ev => {
    if (ev.target.closest('[data-cerrar-notif]')) { cerrar(); return; }
    if (ev.target.closest('[data-leer-todo]')) {
      const ahora = new Date().toISOString();
      datos.lista.forEach(n => { if (noLeida(n)) n.leida_en = ahora; });
      pintarPanel(); pintarCampana();
      estado.api.leerNotificaciones(null).catch(errorAviso);
      return;
    }
    const a = ev.target.closest('[data-notif]');
    if (a) {
      const n = datos.lista.find(x => x.id === a.dataset.notif);
      if (n && noLeida(n)) { n.leida_en = new Date().toISOString(); estado.api.leerNotificaciones([n.id]).catch(() => {}); }
      cerrar({ foco: false });
      // Si el enlace lleva a la pantalla en la que ya se está, se vuelve a abrir igual.
      if (location.hash === a.getAttribute('href')) { ev.preventDefault(); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    }
  });
  p.addEventListener('change', ev => {
    const t = ev.target.closest('[data-pref-coment]');
    if (!t) return;
    datos.coment_estudiantes = t.checked;
    estado.api.preferenciaNotificaciones(t.checked).catch(errorAviso);
  });
  velo.addEventListener('click', () => cerrar());
}

function cerrar({ foco = true } = {}) {
  if (!abierto) return;
  abierto = false;
  const p = document.getElementById('panel-notif');
  const velo = document.getElementById('notif-velo');
  p?.classList.remove('ver');
  velo?.classList.remove('ver');
  setTimeout(() => { p?.remove(); velo?.remove(); }, 180);
  const c = document.getElementById('campana');
  c?.setAttribute('aria-expanded', 'false');
  if (foco) c?.focus({ preventScroll: true });
}

// ---------- marcar como leído lo que se abre ----------
// Se llama desde el enrutador con la ruta nueva.
export function marcarPorRuta(partes, query = {}) {
  if (!cargado) { rutaPendiente = [partes, query]; return; }
  const [r, id] = partes;
  const yo = estado.yo?.id;
  const coincide = n => {
    if (r === 'entrega') return n.entrega_id === id;
    if (r === 'consignas' && id) return n.consigna_id === id && !n.entrega_id && n.tipo !== 'tut-cierre';
    if (r === 'tutor' && id === 'consignas' && query.ver) return n.tipo === 'tut-cierre' && n.consigna_id === query.ver && (!query.grupo || n.grupo_id === query.grupo);
    if (r === 'reto') return n.tipo.startsWith('racha-');
    if (r === 'perfil' && (!id || id === yo)) return ['insignia', 'insignia-nueva', 'modo', 'grupo'].includes(n.tipo);
    return false;
  };
  const ids = datos.lista.filter(n => noLeida(n) && coincide(n)).map(n => n.id);
  if (!ids.length) return;
  const ahora = new Date().toISOString();
  datos.lista.forEach(n => { if (ids.includes(n.id)) n.leida_en = ahora; });
  pintarCampana();
  estado.api.leerNotificaciones(ids).catch(() => {});
}

// ---------- arranque ----------
let iniciado = false;
export function iniciarNotificaciones() {
  const c = document.getElementById('campana');
  c?.addEventListener('click', () => (abierto ? cerrar() : abrir()));
  if (iniciado) { pintarCampana(); return; }
  iniciado = true;
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && abierto) cerrar(); });
  window.addEventListener('resize', () => { if (abierto) ubicarPanel(); });
  window.addEventListener('hashchange', () => { if (abierto) cerrar({ foco: false }); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refrescarPronto(); });
  setInterval(() => { if (document.visibilityState === 'visible') refrescar(); }, CADA);
  try { estado.api.suscribir('notificaciones', refrescarPronto, `usuario=eq.${estado.yo.id}`); } catch { /* sin tiempo real */ }
  refrescar();
}
