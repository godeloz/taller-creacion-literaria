// Utilidades de interfaz compartidas por toda la app.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Texto plano con enlaces clicables (seguro: escapa primero).
export function enlazar(texto) {
  return esc(texto).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)»])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function contarPalabras(t) {
  const s = String(t ?? '').trim();
  return s ? s.split(/\s+/).length : 0;
}

// ---------- fechas (hora de Bogotá) ----------
const TZ = 'America/Bogota';
export function hoyISO(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}
export function sumarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function fechaLarga(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
export function fechaCorta(iso) {
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00Z' : iso);
  return new Intl.DateTimeFormat('es-CO', { timeZone: iso.length <= 10 ? 'UTC' : TZ, day: 'numeric', month: 'short' }).format(d);
}
export function fechaHora(iso) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
export function hace(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return fechaCorta(iso);
}
export function saludo() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// ---------- sanitizar HTML de entregas ----------
const PERMITIDAS = new Set(['p', 'br', 'em', 'strong', 'i', 'b', 'span', 'div', 'h1', 'h2', 'h3', 'h4',
  'blockquote', 'ul', 'ol', 'li', 'pre', 'small', 'hr', 'u', 's', 'figure', 'figcaption']);
// Dibujos (La forma de las historias): solo formas simples, sin enlaces ni scripts.
const SVG_PERMITIDAS = new Set(['svg', 'g', 'path', 'circle', 'line', 'rect', 'text', 'tspan', 'defs',
  'lineargradient', 'stop', 'polyline', 'title']);
const SVG_ATRIBUTOS = new Set(['viewbox', 'width', 'height', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'fill-opacity', 'stroke-opacity', 'offset', 'stop-color', 'gradientunits', 'id', 'text-anchor', 'font-size',
  'font-family', 'letter-spacing', 'points', 'rx', 'ry', 'role', 'aria-label', 'xmlns', 'preserveaspectratio']);
const PELIGROSAS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'math', 'template', 'link', 'meta',
  'form', 'input', 'button', 'textarea', 'select', 'img', 'video', 'audio', 'noscript', 'foreignobject', 'a', 'use', 'image']);

function valorSeguro(v) {
  const t = String(v).toLowerCase().replace(/\s+/g, '');
  if (/javascript:|data:|vbscript:|expression\(/.test(t)) return false;
  if (t.includes('url(') && !/^url\(#[\w-]+\)$/.test(t)) return false;
  return true;
}

function limpiar(nodo, enSvg = false) {
  for (const hijo of [...nodo.childNodes]) {
    if (hijo.nodeType === 3) continue;
    if (hijo.nodeType !== 1) { hijo.remove(); continue; }
    const tag = hijo.tagName.toLowerCase();
    if (PELIGROSAS.has(tag)) { hijo.remove(); continue; }
    const esSvg = enSvg || tag === 'svg';
    if (esSvg) {
      if (!SVG_PERMITIDAS.has(tag)) { hijo.remove(); continue; }
      for (const a of [...hijo.attributes]) {
        const n = a.name.toLowerCase();
        if ((SVG_ATRIBUTOS.has(n) || (n === 'class' && /^[\w\s-]*$/.test(a.value))) && valorSeguro(a.value)) continue;
        hijo.removeAttribute(a.name);
      }
      limpiar(hijo, true);
      continue;
    }
    if (!PERMITIDAS.has(tag)) {
      limpiar(hijo);
      hijo.replaceWith(...hijo.childNodes);
      continue;
    }
    for (const a of [...hijo.attributes]) {
      if (a.name === 'class' && /^[\w\s-]*$/.test(a.value)) continue;
      hijo.removeAttribute(a.name);
    }
    limpiar(hijo);
  }
}
export function sanitizar(html) {
  const doc = new DOMParser().parseFromString(`<div>${html ?? ''}</div>`, 'text/html');
  const raiz = doc.body.firstElementChild;
  if (!raiz) return '';
  limpiar(raiz);
  return raiz.innerHTML;
}

// Convierte texto plano en párrafos HTML.
export function parrafos(texto) {
  return String(texto ?? '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

// ---------- avisos ----------
export function aviso(texto, tipo = 'info', ms = 3200) {
  const cont = document.getElementById('avisos');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.textContent = texto;
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add('ver'));
  setTimeout(() => { el.classList.remove('ver'); setTimeout(() => el.remove(), 300); }, ms);
}

export function errorAviso(e) {
  console.error(e);
  aviso(e?.message || 'Algo salió mal. Intente de nuevo.', 'error', 5000);
}

// ---------- modales ----------
export function modal({ titulo = '', cuerpo = '', acciones = [], ancho = 560, alAbrir } = {}) {
  return new Promise(resolve => {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = `
      <div class="dialogo" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:${ancho}px">
        ${titulo ? `<h2 class="dialogo-titulo">${esc(titulo)}</h2>` : ''}
        <div class="dialogo-cuerpo">${cuerpo}</div>
        ${acciones.length ? `<div class="dialogo-acciones">${acciones.map((a, i) =>
          `<button type="button" class="btn ${a.clase || ''}" data-i="${i}">${esc(a.texto)}</button>`).join('')}</div>` : ''}
      </div>`;
    const cerrar = valor => {
      document.removeEventListener('keydown', tecla);
      velo.classList.remove('ver');
      setTimeout(() => velo.remove(), 180);
      resolve(valor);
    };
    const tecla = e => { if (e.key === 'Escape') cerrar(null); };
    velo.addEventListener('click', async e => {
      if (e.target === velo) return cerrar(null);
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const acc = acciones[Number(b.dataset.i)];
      if (acc.accion) {
        const r = await acc.accion(velo);
        if (r === false) return;
        return cerrar(r ?? ('valor' in acc ? acc.valor : true));
      }
      cerrar('valor' in acc ? acc.valor : true);
    });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(velo);
    requestAnimationFrame(() => velo.classList.add('ver'));
    velo.cerrar = cerrar;
    if (alAbrir) alAbrir(velo, cerrar);
    const foco = velo.querySelector('input, textarea, select, .btn-primario');
    if (foco) setTimeout(() => foco.focus(), 60);
  });
}

export function confirmar(texto, { si = 'Sí', no = 'Cancelar', peligro = false } = {}) {
  return modal({
    cuerpo: `<p>${esc(texto)}</p>`,
    acciones: [
      { texto: no, valor: false, clase: 'btn-fantasma' },
      { texto: si, valor: true, clase: peligro ? 'btn-peligro' : 'btn-primario' },
    ],
  }).then(v => v === true);
}

// ---------- descargas ----------
export function descargarArchivo(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function nombreArchivo(s) {
  return String(s || 'texto').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'texto';
}

// Abre un documento imprimible (el navegador permite guardarlo como PDF).
export function abrirImprimible(titulo, cuerpoHTML) {
  const w = window.open('', '_blank');
  if (!w) { aviso('El navegador bloqueó la ventana. Permita ventanas emergentes para este sitio.', 'error', 5000); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Manrope:wght@500;700&display=swap" rel="stylesheet">
<style>
  body{font-family:'Literata',Georgia,serif;color:#16141C;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.65;font-size:12pt}
  h1{font-size:22pt;margin:0 0 4px;font-weight:600} .meta{font-family:'Manrope',sans-serif;font-size:9pt;color:#555;letter-spacing:.04em;text-transform:uppercase}
  .pieza{page-break-inside:auto;margin:0 0 36px;padding-bottom:28px;border-bottom:1px solid #ccc}
  .pieza + .pieza{page-break-before:always;border:0}
  h2{font-size:16pt;margin:14px 0 6px;font-weight:600} .consigna{font-size:10pt;color:#444;font-style:italic;margin:0 0 16px}
  .al-centro{text-align:center}.al-der{text-align:right}.v-verso{margin:0;min-height:1.3em}.v-credito{font-size:9pt;color:#555;margin-top:18px}
  .editada{font-family:'Manrope',sans-serif;font-size:8pt;color:#777}
  @media print{body{margin:0 auto}}
</style></head><body>${cuerpoHTML}<script>setTimeout(()=>window.print(),600)<\/script></body></html>`);
  w.document.close();
}

// ---------- varios ----------
export function debounce(fn, ms) {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.ahora = (...a) => { clearTimeout(t); return fn(...a); };
  f.cancelar = () => clearTimeout(t);
  return f;
}

export function local(clave, valor) {
  try {
    if (valor === undefined) return JSON.parse(localStorage.getItem(clave) ?? 'null');
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch { return null; }
}

export function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function textoDeHTML(html) {
  const limpio = sanitizar(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|blockquote|pre)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  const t = document.createElement('textarea');
  t.innerHTML = limpio;
  return t.value.replace(/\n{3,}/g, '\n\n').trim();
}
