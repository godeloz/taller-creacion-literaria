// Módulo: Partituras. La longitud de las frases y su puntuación, leídas como una partitura.
// (Etapa 1: el ritmo por la extensión de las frases y los párrafos.)
//
// Cuatro formas de entrar:
//   · Escribir (item 'libre'): se escribe (o se pega un texto propio) y, al cerrar cada frase, aparece su nota.
//   · Analizar un texto (ruta '_analizar'): un texto ajeno se pega y se lee con su partitura. Se queda solo en
//     este navegador (localStorage): no va a la nube ni se publica.
//   · Banco de partituras (items del paquete): textos de otros autores que se leen con su partitura (?leer).
//   · Escribir sobre una partitura (el id de un texto del banco, o 'analizado'): las notas del modelo, en gris,
//     son la pauta; cada frase busca la longitud de la suya. Se publica con 300 palabras o con la partitura completa.
// El análisis y el dibujo están en nucleo/ritmo.js.
//
// Borradores: 'partituras:libre', 'partituras:<id del modelo>' y 'partituras:analizado' → { E }
//   E = { titulo, texto, margen (2 | 0), modelo (solo en 'analizado': { titulo, autor, notas }) }
// Entrega: texto = lo escrito (+ el crédito, si es sobre un modelo) · vista = el texto con sus frases marcadas
//   (.v-partituras, un span .pt-f por frase con el color de su racha) + crédito + la partitura en renglones (.v-pt-svg, para el PDF)
//   datos = { modo: 'libre' | 'modelo', texto, modelo: { id, titulo, autor, anio, obra, traductor, notas } | null,
//             margen, comparadas, en_lugar, pct, completa, firma }
import { estado, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, debounce, confirmar, aviso, errorAviso, hace, modal } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';
import {
  analizar, partituraSVG, sistemasSVG, minimapaSVG, deNotas, notasDe, firmaDe, fraseEn, resumen,
  FIGURAS, PATRONES, LABERINTO,
} from '../nucleo/ritmo.js';

const SLUG = 'partituras';
const ACENTO = '#2E4A7D';
const VERSION = '1.0';
const MIN_PALABRAS = 300;     // para publicar sobre un modelo sin completarlo
const MIN_FRASES_BANCO = 3;
const MAX_BANCO = 80000;      // caracteres de un texto del banco
const CODIGO = { monotonia: 'm', rafaga: 'r', caudal: 'c', alternancia: 'a' };

const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
const crecer = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
const href = (id, q = '') => `#/d/${SLUG}/${encodeURIComponent(id)}${q}`;
const minutos = n => Math.max(1, Math.round(n / 240));

// ---------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------
const PASOS_LIBRE = [
  'Cada frase que cierra con punto se vuelve una nota: más palabras, más arriba.',
  'Cada párrafo suena abajo, en la clave de fa.',
  'Cuando las frases se agrupan, la partitura y el texto toman un color.',
  'Mire la línea: alterne, deje que suba y baje.',
];
const PASOS_MODELO = [
  'Escriba un texto suyo que dibuje la misma partitura.',
  'Cada frase busca la longitud de la nota gris que le toca.',
  'Los párrafos del modelo se ven, pero no hay que seguirlos.',
  `Puede publicar desde ${MIN_PALABRAS} palabras o con la partitura completa.`,
];

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
// El texto con sus frases marcadas: el color de la racha (capa del editor) o un span por frase (vista y lector).
function marcadoHTML(texto, an, { conColor = true, resalte = null, clase = 'pt-c', caret = null } = {}) {
  const T = String(texto ?? '');
  const tramos = an.frases.map(f => ({ a: f.a, b: f.b, i: f.i, pat: f.pat }));
  if (an.abierta) tramos.push({ a: an.abierta.a, b: an.abierta.b, i: an.frases.length, abierta: true });
  let html = '';
  let pos = 0;
  const trozo = (a, b) => {
    if (caret !== null && caret >= a && caret <= b) return esc(T.slice(a, caret)) + '<span class="pt-caret"></span>' + esc(T.slice(caret, b));
    return esc(T.slice(a, b));
  };
  for (const t of tramos) {
    html += trozo(pos, t.a);
    const cl = [conColor && t.pat ? `${clase}-${CODIGO[t.pat]}` : '', resalte === t.i ? 'pt-hl' : '', t.abierta ? 'pt-abierta' : ''].filter(Boolean).join(' ');
    html += `<span data-i="${t.i}"${cl ? ` class="${cl}"` : ''}>${trozo(t.a, t.b)}</span>`;
    pos = t.b;
  }
  html += trozo(pos, T.length);
  return html;
}

// La vista publicada: un <p> por párrafo y un span por frase (con su racha); las secciones, con su separador.
function parrafosHTML(texto, an) {
  return an.parrafos.map(p => {
    let h = '';
    let pos = p.a;
    for (const i of p.frases) {
      const f = an.frases[i];
      h += esc(texto.slice(pos, f.a)) + `<span class="pt-f${f.pat ? ` pt-c-${CODIGO[f.pat]}` : ''}">${esc(texto.slice(f.a, f.b))}</span>`;
      pos = f.b;
    }
    h += esc(texto.slice(pos, p.b));
    return `${p.seccion ? '<p class="pt-seccion">* * *</p>' : ''}<p>${h}</p>`;
  }).join('');
}

// Texto limpio: párrafos separados por una línea en blanco; los separadores de sección se conservan.
function limpiarTexto(t) {
  return String(t ?? '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
}

export function creditoDe(d) {
  const m = d?.modelo;
  if (!m) return '';
  const de = m.titulo ? `«${m.titulo}»${m.autor ? `, de ${m.autor}` : ''}` : 'otro texto';
  return d.completa || d.pct >= 100 ? `Texto creado sobre la partitura completa de ${de}.` : `Texto creado a partir del ${d.pct} % de la partitura de ${de}.`;
}

// Coincidencia con el modelo.
function comparar(an, M, margen) {
  const comparadas = Math.min(an.frases.length, M.frases.length);
  let en_lugar = 0;
  let cubiertas = 0;
  for (let i = 0; i < comparadas; i++) {
    if (Math.abs(an.frases[i].w - M.frases[i].w) <= margen) en_lugar++;
    cubiertas += M.frases[i].w;
  }
  const total = M.palabras || 1;
  return { comparadas, en_lugar, pct: Math.min(100, Math.round(100 * cubiertas / total)), completa: an.frases.length >= M.frases.length };
}

// Una línea por racha, para el panel: «Monotonía · frases 1–4».
function chipsRachas(an) {
  const r = resumen(an);
  const out = [];
  for (const k of ['monotonia', 'rafaga', 'caudal', 'alternancia']) {
    if (!r[k].frases) continue;
    const rs = r[k].rachas;
    const donde = rs.length === 1 ? `frases ${rs[0].desde + 1}–${rs[0].hasta + 1}` : cuenta(rs.length, 'racha', 'rachas');
    out.push(`<span class="pt-chip"><i style="background:${PATRONES[k].banda}"></i>${PATRONES[k].nombre} · ${donde}</span>`);
  }
  return out.join('');
}

async function leerBorrador(clave) {
  const loc = local(`borrador:${estado.yo.id}:${clave}`);
  let nube = null;
  try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
  return [loc, nube].filter(Boolean).sort((a, c) => (c._actualizado || '').localeCompare(a._actualizado || ''))[0] || null;
}
function quitarBorrador(clave) {
  local(`borrador:${estado.yo.id}:${clave}`, null);
  estado.api.borrarBorrador(clave).catch(() => {});
}
const claveAnalizar = () => `${SLUG}-analizar:${estado.yo.id}`;

// ---------------------------------------------------------------------
// La leyenda (en el panel de la consigna y en la portada)
// ---------------------------------------------------------------------
function muestra(ws, { pausas = [], fines = [], dial = [], rachas = [] } = {}) {
  const frases = ws.map((w, i) => ({
    i, a: 0, b: 0, t: '', w, p: 0, dial: !!dial[i], pausas: { coma: 0, pc: 0, dp: 0, par: 0, raya: 0, ...(pausas[i] || {}) },
    tot: Object.values(pausas[i] || {}).reduce((s, v) => s + v, 0), fin: fines[i] || '.', fig: FIGURAS.findIndex(f => w <= f.hasta), pat: null,
  }));
  for (const r of rachas) for (let k = r.desde; k <= r.hasta; k++) frases[k].pat = r.pat;
  const an = { frases, parrafos: [], rachas, abierta: null, palabras: 0 };
  return partituraSVG(an, { sp: 8, ancho: 30 + ws.length * 44 + 26, clave: false, bajo: false, k: { kMin: 0.01, kMax: 0.01 }, minRanura: 44 }).svg;
}
function leyendaHTML() {
  const fila = (sig, nombre, desc) => `<li><span class="pt-ley-sig">${sig}</span><span><b>${nombre}</b> ${desc}</span></li>`;
  return `
  <div class="pt-ley">
    <h3>Figuras: cuánto mide la frase</h3>
    <div class="pt-ley-svg">${muestra([4, 8, 15, 28, 45])}</div>
    <ol class="pt-ley-figuras">${FIGURAS.map(f => `<li><b>${f.nombre}</b> ${f.rango} palabras</li>`).join('')}</ol>
    <p>La altura marca el número exacto de palabras: más arriba, más larga. El ancho de cada nota es proporcional a sus palabras.</p>
    <h3>Rachas: cómo se agrupan</h3>
    <ul class="pt-ley-lista">
      ${['monotonia', 'rafaga', 'caudal', 'alternancia'].map(k => `<li><span class="pt-ley-sig"><i style="background:${PATRONES[k].banda}"></i></span><span><b style="color:${PATRONES[k].texto}">${PATRONES[k].nombre}.</b> ${esc(PATRONES[k].regla)}</span></li>`).join('')}
      <li><span class="pt-ley-sig"><i style="background:#16141C"></i></span><span><b>Sin color.</b> Ninguna racha: frases sueltas.</span></li>
    </ul>
    <p class="tenue">Si una racha cumple dos reglas, manda la monotonía; después, la ráfaga y el caudal.</p>
    <h3>Pausas internas: cómo respira la frase</h3>
    <ul class="pt-ley-lista">
      ${fila(',', 'Coma.', 'Una respiración, como el signo de respirar en música. Desde cuatro: «,×5».')}
      ${fila('//', 'Punto y coma.', 'Una cesura: la pausa más honda.')}
      ${fila(':', 'Dos puntos.', 'Un anuncio: la frase se abre a lo que sigue.')}
      ${fila('( )', 'Paréntesis.', 'Un inciso.')}
      ${fila('—', 'Raya.', 'Un inciso entre rayas. En el diálogo, la raya del narrador no cuenta.')}
      ${fila('<i>tr</i>〜', 'Laberinto.', `${LABERINTO} pausas o más. Si los signos no caben sobre la nota, se ve el número de pausas.`)}
    </ul>
    <h3>Cómo cierra</h3>
    <div class="pt-ley-svg">${muestra([12, 12, 12], { fines: ['?', '!', '…'] })}</div>
    <p>Pregunta, exclamación (un acento) y puntos suspensivos (un calderón: la nota se sostiene). El punto no lleva signo.</p>
    <h3>Diálogo</h3>
    <div class="pt-ley-svg">${muestra([6, 14, 26], { dial: [1, 1, 1] })}</div>
    <p>Las frases de un párrafo que empieza con raya llevan la cabeza en rombo.</p>
    <h3>Párrafos</h3>
    <p>Abajo, en la clave de fa, cada párrafo es una nota sostenida: su altura dice cuántas palabras tiene (el número, a la derecha) y su largo, cuánto ocupa. Las barras de compás separan párrafos; la doble barra cierra el texto. Una línea con <b>* * *</b> separa secciones.</p>
    <h3>Al escribir y al leer</h3>
    <ul class="pt-ley-lista">
      ${fila('<span style="color:#FF6B4A">|</span>', 'Cabezal.', 'La frase donde está el cursor o la lectura.')}
      ${fila('◌', 'Nota punteada.', 'La frase que se está escribiendo: crece hasta el punto.')}
      ${fila('<span style="color:#B8B1A5">●</span>', 'Nota gris.', 'La nota del modelo que hay que alcanzar.')}
      ${fila('<span style="color:#00896B">✓</span>', 'En su lugar.', 'La frase quedó a 2 palabras o menos de la del modelo (o exacta).')}
    </ul>
  </div>`;
}

// ---------------------------------------------------------------------
// El panel de la partitura (escribir, leer y la entrega)
// ---------------------------------------------------------------------
// opciones: { reducible, compacto (empieza reducido), alPasar(i | null), alElegir(i), fija }
export function panelPartitura(raiz, op = {}) {
  raiz.classList.add('pt-panel');
  raiz.innerHTML = `
    <div class="pt-panel-cab">
      <span class="pt-panel-tit">${icono('partitura', 18)}Partitura</span>
      <span class="pt-chips" aria-live="polite"></span>
      <span class="espaciador"></span>
      <div class="conmutador pt-vista" role="tablist" aria-label="Vista">
        <button type="button" role="tab" data-v="partitura" class="on" aria-selected="true">Partitura</button>
        <button type="button" role="tab" data-v="barras" aria-selected="false">Barras</button>
      </div>
      ${op.reducible ? `<button type="button" class="herr pt-reducir" aria-expanded="true" aria-label="Reducir la partitura" title="Reducir la partitura">${icono('abajo', 18)}</button>` : ''}
    </div>
    <div class="pt-mm-caja" hidden></div>
    <div class="pt-scroll" tabindex="-1"><div class="pt-lienzo"></div></div>
    <div class="pt-tip" role="tooltip" hidden></div>`;
  const $ = s => raiz.querySelector(s);
  const scroll = $('.pt-scroll');
  const lienzo = $('.pt-lienzo');
  const tip = $('.pt-tip');
  const mmCaja = $('.pt-mm-caja');
  const S = { an: null, M: null, margen: 2, barras: false, reducido: !!op.compacto, res: null, mm: null, cab: null, res_i: null, final: false };

  const sp = () => (S.reducido ? 7 : window.innerWidth < 640 ? 8.5 : 11);

  function textoTip(i) {
    const F = S.an?.frases || [];
    const f = F[i];
    const m = S.M?.frases[i];
    const lineas = [];
    if (f) {
      const fig = FIGURAS[f.fig].nombre.toLowerCase();
      lineas.push(`<b>Frase ${i + 1} · ${plural(f.w, 'palabra')} · ${fig}</b>`);
      const pz = f.pausas;
      const partes = [pz.coma && plural(pz.coma, 'coma'), pz.pc && `${pz.pc} punto y coma`, pz.dp && `${pz.dp} dos puntos`, pz.par && `${pz.par} paréntesis`, pz.raya && plural(pz.raya, 'inciso')].filter(Boolean);
      if (partes.length) lineas.push(`Pausas: ${partes.join(', ')}${f.tot >= LABERINTO ? ' · laberinto' : ''}`);
      else lineas.push('De un aliento: sin pausas');
      const extra = [f.dial ? 'Diálogo' : '', `Párrafo ${f.p + 1}`].filter(Boolean).join(' · ');
      lineas.push(extra);
      if (f.pat) {
        const r = S.an.rachas.find(x => i >= x.desde && i <= x.hasta);
        lineas.push(`<span style="color:${PATRONES[f.pat].texto}">${PATRONES[f.pat].nombre}${r ? ` (frases ${r.desde + 1}–${r.hasta + 1})` : ''}</span>`);
      }
      if (m) lineas.push(`El modelo: ${plural(m.w, 'palabra')} · ${Math.abs(f.w - m.w) <= S.margen ? '<span style="color:#00896B">en su lugar ✓</span>' : `faltan o sobran ${Math.abs(f.w - m.w) - S.margen}`}`);
    } else if (S.an?.abierta && i === F.length) {
      lineas.push(`<b>Frase ${i + 1}, en curso · ${plural(S.an.abierta.w, 'palabra')}</b>`);
      if (m) lineas.push(`El modelo: ${plural(m.w, 'palabra')}`);
    } else if (m) {
      lineas.push(`<b>Frase ${i + 1} del modelo · ${plural(m.w, 'palabra')}</b>`, FIGURAS[m.fig].nombre);
    }
    return lineas.join('<br>');
  }
  function mostrarTip(g) {
    const i = Number(g.dataset.i);
    tip.innerHTML = textoTip(i);
    tip.hidden = false;
    const r = g.getBoundingClientRect();
    const rr = raiz.getBoundingClientRect();
    const w = tip.offsetWidth;
    const x = Math.min(Math.max(r.left + r.width / 2 - rr.left - w / 2, 6), rr.width - w - 6);
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(4, scroll.offsetTop - tip.offsetHeight + 34)}px`;
  }
  function ocultarTip() { tip.hidden = true; }

  function pintar(an, extra = {}) {
    Object.assign(S, { an }, extra);
    if (!an) return;
    const ancho = Math.max(240, scroll.clientWidth);
    const o = { sp: sp(), ancho, modelo: S.M, margen: S.margen, interactivo: true, barras: S.barras, bajo: !S.reducido, marcas: !S.reducido, final: S.final };
    S.res = partituraSVG(an, o);
    // si se pasa por poco, se aprieta para que quepa (sin desplazar por unos pocos píxeles)
    if (S.res.ancho > ancho + 1 && S.res.ancho < ancho * 1.3) S.res = partituraSVG(an, { ...o, k: { kMin: 0.02 } });
    lienzo.innerHTML = S.res.svg;
    lienzo.querySelectorAll('.pt-n').forEach(g => {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      const i = Number(g.dataset.i);
      const f = an.frases[i] || (S.M?.frases[i]);
      if (f) g.setAttribute('aria-label', `Frase ${i + 1}: ${plural(f.w, 'palabra')}`);
    });
    $('.pt-chips').innerHTML = chipsRachas(an);
    // la miniatura, si la partitura no cabe
    const desborda = S.res.ancho > ancho + 40;
    mmCaja.hidden = !desborda;
    if (desborda) {
      S.mm = minimapaSVG(an, { ancho: Math.round(mmCaja.clientWidth || ancho), alto: 34, modelo: S.M });
      mmCaja.innerHTML = S.mm.svg;
      ventana();
    }
    if (S.res_i !== null) resaltar(S.res_i);
    if (S.cab !== null) cabezal(S.cab, false);
  }
  function xDe(i) { return S.res?.xs[Math.min(i, S.res.xs.length - 1)] ?? null; }
  function cabezal(i, mover = true) {
    S.cab = i;
    const g = lienzo.querySelector('.pt-cabezal');
    const x = xDe(i);
    if (!g || x === null) return;
    g.setAttribute('transform', `translate(${x} 0)`);
    g.setAttribute('opacity', '1');
    if (mover) centrar(i, false);
    if (S.mm) {
      const l = mmCaja.querySelector('.pt-mm-cabezal');
      const t = S.mm.xs[Math.min(i, S.mm.xs.length - 1)];
      if (l && t) { const cx = (t[0] + t[1]) / 2; l.setAttribute('x1', cx); l.setAttribute('x2', cx); }
    }
  }
  function resaltar(i) {
    S.res_i = i;
    const r = lienzo.querySelector('.pt-resalte');
    if (!r) return;
    if (i === null || !S.res?.bordes[i]) { r.setAttribute('width', '0'); return; }
    const [a, b] = S.res.bordes[i];
    r.setAttribute('x', a + 1);
    r.setAttribute('width', Math.max(0, b - a - 2));
  }
  // Lleva la nota a la vista (al centro, si se pide; si no, solo si está fuera).
  function centrar(i, siempre = true) {
    const x = xDe(i);
    if (x === null) return;
    const izq = scroll.scrollLeft, w = scroll.clientWidth;
    if (!siempre && x > izq + 40 && x < izq + w - 40) return;
    scroll.scrollTo({ left: Math.max(0, x - w / 2), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function ventana() {
    if (!S.mm || !S.res) return;
    const izq = scroll.scrollLeft, der = izq + scroll.clientWidth;
    const b = S.res.bordes;
    let i0 = b.findIndex(x => x[1] > izq);
    let i1 = b.length - 1 - [...b].reverse().findIndex(x => x[0] < der);
    i0 = Math.max(0, Math.min(i0, S.mm.xs.length - 1));
    i1 = Math.max(i0, Math.min(i1, S.mm.xs.length - 1));
    const r = mmCaja.querySelector('.pt-mm-ventana');
    if (r && S.mm.xs[i0]) { r.setAttribute('x', S.mm.xs[i0][0]); r.setAttribute('width', Math.max(4, S.mm.xs[i1][1] - S.mm.xs[i0][0])); }
  }

  scroll.addEventListener('scroll', () => requestAnimationFrame(ventana), { passive: true });
  mmCaja.addEventListener('click', ev => {
    if (!S.mm) return;
    const r = mmCaja.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (S.mm.xs.length ? (mmCaja.querySelector('svg').viewBox.baseVal.width / r.width) : 1);
    const i = S.mm.xs.findIndex(t => x >= t[0] && x <= t[1]);
    if (i >= 0) { centrar(i); op.alElegir?.(i, { desdeMinimapa: true }); }
  });
  let tTip = null;
  lienzo.addEventListener('pointerover', ev => {
    const g = ev.target.closest('.pt-n');
    if (!g || ev.pointerType === 'touch') return;
    mostrarTip(g);
    resaltar(Number(g.dataset.i));
    op.alPasar?.(Number(g.dataset.i));
  });
  lienzo.addEventListener('pointerleave', () => { ocultarTip(); resaltar(null); op.alPasar?.(null); });
  lienzo.addEventListener('focusin', ev => { const g = ev.target.closest('.pt-n'); if (g) { mostrarTip(g); resaltar(Number(g.dataset.i)); op.alPasar?.(Number(g.dataset.i)); } });
  lienzo.addEventListener('focusout', () => { ocultarTip(); resaltar(null); op.alPasar?.(null); });
  lienzo.addEventListener('click', ev => {
    const g = ev.target.closest('.pt-n');
    if (!g) return;
    mostrarTip(g);
    clearTimeout(tTip);
    if (ev.pointerType === 'touch') tTip = setTimeout(ocultarTip, 4000);   // en pantallas táctiles no hay «salir con el puntero»
    op.alElegir?.(Number(g.dataset.i));
  });
  lienzo.addEventListener('keydown', ev => {
    const g = ev.target.closest('.pt-n');
    if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); op.alElegir?.(Number(g.dataset.i)); }
  });
  raiz.querySelector('.pt-vista').addEventListener('click', ev => {
    const b = ev.target.closest('[data-v]');
    if (!b) return;
    S.barras = b.dataset.v === 'barras';
    raiz.querySelectorAll('.pt-vista button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    pintar(S.an);
  });
  const reducir = $('.pt-reducir');
  const marcarReducido = () => {
    raiz.classList.toggle('reducido', S.reducido);
    if (!reducir) return;
    reducir.setAttribute('aria-expanded', String(!S.reducido));
    reducir.setAttribute('aria-label', S.reducido ? 'Ampliar la partitura' : 'Reducir la partitura');
    reducir.title = reducir.getAttribute('aria-label');
    reducir.innerHTML = icono(S.reducido ? 'arriba' : 'abajo', 18);
  };
  reducir?.addEventListener('click', () => { S.reducido = !S.reducido; marcarReducido(); pintar(S.an); op.alCambiarTamano?.(); });
  marcarReducido();
  const alto = debounce(() => pintar(S.an), 150);
  const ro = new ResizeObserver(alto);
  ro.observe(scroll);
  return {
    pintar, cabezal, resaltar, centrar,
    alto: () => raiz.offsetHeight,
    destruir() { ro.disconnect(); alto.cancelar?.(); clearTimeout(tTip); },
  };
}

// ---------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------
export default {
  slug: SLUG,
  nombre: 'Partituras',
  version: VERSION,

  async abrir(cont, ctx) {
    if (ctx.entrega) return escritorio(cont, { entrega: ctx.entrega });
    const id = ctx.item_id || ctx.sesion?.item_id || null;
    if (!id) return portada(cont);
    if (id === 'libre') return escritorio(cont, { itemId: 'libre' });
    if (id === '_analizar') return analizarTexto(cont);
    if (id === 'analizado') return escritorio(cont, { itemId: 'analizado' });
    if (ctx.query && 'leer' in ctx.query) return lector(cont, id);
    return escritorio(cont, { itemId: id, fija: !ctx.item_id && !!ctx.sesion?.item_id });
  },

  paquete: {
    plantilla: 'plantillas/partituras.json',
    describir: d => `${d.titulo || 'Un texto'}${d.autor ? ` — ${d.autor}` : ''}`,
    validar(json) {
      const errores = [];
      const items = [];
      const lista = Array.isArray(json) ? json : Array.isArray(json?.partituras) ? json.partituras : null;
      if (!lista || !lista.length) return { items, errores: ['El archivo debe tener una lista "partituras": [ … ] con al menos un texto.'] };
      const vistos = new Set();
      const txt = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
      lista.forEach((t, i) => {
        const id = txt(t?.id);
        const n = `Texto ${i + 1}${id ? ` (${id})` : ''}`;
        if (!id) errores.push(`Texto ${i + 1}: falta "id".`);
        else if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id === 'libre' || id === 'analizado') errores.push(`${n}: el id solo puede tener minúsculas sin tildes, números y guiones (y no puede ser «libre» ni «analizado»).`);
        else if (vistos.has(id)) errores.push(`${n}: el id está repetido.`);
        vistos.add(id);
        const titulo = txt(t?.titulo);
        if (!titulo) errores.push(`${n}: falta "titulo".`);
        let parrafos = Array.isArray(t?.parrafos) ? t.parrafos : typeof t?.texto === 'string' ? t.texto.split(/\n+/) : null;
        if (!parrafos) { errores.push(`${n}: falta el texto ("parrafos": [ … ] o "texto": "…").`); return; }
        parrafos = parrafos.map(p => (typeof p === 'string' ? p.replace(/\s+/g, ' ').trim() : '')).filter(Boolean);
        const largo = parrafos.join('\n').length;
        if (largo > MAX_BANCO) errores.push(`${n}: tiene ${largo} caracteres; el máximo es ${MAX_BANCO}.`);
        const an = analizar(parrafos.join('\n'));
        if (an.frases.length < MIN_FRASES_BANCO) errores.push(`${n}: tiene ${plural(an.frases.length, 'frase')}; el mínimo es ${MIN_FRASES_BANCO}.`);
        items.push({
          item_id: id,
          datos: { titulo: titulo || `Texto ${i + 1}`, autor: txt(t?.autor), anio: txt(t?.anio), obra: txt(t?.obra), traductor: txt(t?.traductor), nota: txt(t?.nota), parrafos },
        });
      });
      return { items, errores };
    },
    exportar(items) {
      return {
        partituras: items.map(({ item_id, datos: d }) => ({
          id: item_id, titulo: d.titulo,
          ...(d.autor ? { autor: d.autor } : {}), ...(d.anio ? { anio: d.anio } : {}), ...(d.obra ? { obra: d.obra } : {}),
          ...(d.traductor ? { traductor: d.traductor } : {}), ...(d.nota ? { nota: d.nota } : {}),
          parrafos: d.parrafos || [],
        })),
      };
    },
  },
};

const textoDe = d => (d?.parrafos || []).join('\n');
const modeloDe = (id, d) => ({ id, titulo: d.titulo || '', autor: d.autor || '', anio: d.anio || '', obra: d.obra || '', traductor: d.traductor || '', notas: notasDe(analizar(textoDe(d))) });
const quienEs = d => `${d.autor ? esc(d.autor) : ''}${d.anio ? `${d.autor ? ' · ' : ''}${esc(d.anio)}` : ''}${d.traductor ? ` · traducción de ${esc(d.traductor)}` : ''}`;

// ---------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------
async function portada(cont) {
  const yo = estado.yo.id;
  const [todos, mias] = await Promise.all([
    estado.api.contenidos(SLUG).catch(() => []),
    estado.api.entregas({ dinamica: SLUG, autor: yo }).catch(() => []),
  ]);
  const banco = todos.filter(c => !c.item_id.startsWith('_') && c.datos?.parrafos?.length);
  const claves = ['libre', 'analizado', ...banco.map(c => c.item_id)];
  const borr = await Promise.all(claves.map(k => leerBorrador(`${SLUG}:${k}`).catch(() => null)));
  const enCurso = Object.fromEntries(claves.map((k, i) => [k, borr[i]?.E?.texto?.trim() ? borr[i] : null]));
  const pegado = local(claveAnalizar());
  const mis = mias.filter(e => e.autor === yo);

  const firma = d => {
    const an = analizar(textoDe(d));
    return { svg: partituraSVG(an, { sp: 5, ancho: 520, clave: false, bajo: false, marcas: false, k: { kMin: 0.2, kMax: 2 } }).svg, an };
  };
  const tarjetaBanco = c => {
    const { svg, an } = firma(c.datos);
    const curso = enCurso[c.item_id];
    const n = mis.filter(e => e.item_id === c.item_id).length;
    return `<article class="pt-tarjeta">
      <span class="rotulo">${quienEs(c.datos) || 'Texto del banco'}</span>
      <h3>${esc(c.datos.titulo)}</h3>
      <div class="pt-firma">${svg}</div>
      <span class="pt-tarjeta-meta">${plural(an.palabras, 'palabra')} · ${plural(an.frases.length, 'frase')} · ${cuenta(an.parrafos.length, 'párrafo', 'párrafos')}</span>
      <div class="pt-tarjeta-pie">
        ${curso ? '<span class="estado-pill">En curso</span>' : ''}${n ? `<span class="estado-pill si">${icono('check', 13)}${n === 1 ? 'Publicado' : `${n} textos`}</span>` : ''}
        <span class="espaciador"></span>
        <a class="btn btn-chico btn-fantasma" href="${href(c.item_id, '?leer')}">${icono('ojo', 16)}Leer con la partitura</a>
        <a class="btn btn-chico btn-primario" href="${href(c.item_id)}">${curso ? 'Seguir' : 'Escribir sobre ella'}</a>
      </div>
    </article>`;
  };
  const entrada = (ico, titulo, desc, a, boton, extra = '') => `<article class="pt-entrada">
    <span class="pt-sello">${icono(ico, 24)}</span>
    <h2>${titulo}</h2><p>${desc}</p>${extra}
    <a class="btn btn-primario" href="${a}">${boton}</a></article>`;
  const libre = enCurso.libre;
  const analizado = enCurso.analizado;

  cont.innerHTML = `
  <div class="contenedor pt-portada" style="--acento:${ACENTO}">
    <section class="pt-intro">
      <span class="pt-sello pt-sello-grande">${icono('partitura', 32)}</span>
      <div><span class="rotulo">Partituras</span><h1 class="saludo">Lea su ritmo como una partitura</h1>
      <p>Cada frase es una nota: su altura, cuántas palabras tiene; sus signos, cómo respira. Abajo, cada párrafo. Mire dónde se acelera el texto, dónde se estanca y dónde alterna.</p></div>
    </section>
    <div class="pt-entradas">
      ${entrada('lapiz', 'Escribir', 'Escriba, o pegue un texto suyo, y vea su partitura nota por nota.', href('libre'), libre ? 'Seguir escribiendo' : 'Escribir',
        libre ? `<p class="pt-en-curso">${icono('reloj', 14)}En curso${libre.E.titulo ? `: «${esc(libre.E.titulo)}»` : ''} · ${hace(libre._actualizado || new Date().toISOString())}</p>` : '')}
      ${entrada('ojo', 'Analizar un texto', 'Pegue un texto de otra persona para ver su partitura. Se queda solo en este navegador y no se publica.', href('_analizar'), pegado?.texto ? 'Ver el texto pegado' : 'Pegar un texto')}
      ${entrada('libro', 'Banco de partituras', 'Lea textos de otros autores con su partitura y escriba uno suyo sobre la misma.', '#pt-banco', banco.length ? 'Ver el banco' : 'Ver el banco')}
    </div>
    ${analizado ? `<div class="pt-aviso-curso">${icono('lapiz', 16)}<span>Tiene un texto en curso sobre la partitura de ${analizado.E.modelo?.titulo ? `«${esc(analizado.E.modelo.titulo)}»` : 'un texto pegado'}.</span><a class="btn btn-chico btn-primario" href="${href('analizado')}">Seguir</a></div>` : ''}
    <section class="pt-banco" id="pt-banco">
      <div class="pt-sec-cab"><h2 class="titulo-seccion">Banco de partituras</h2>${mis.length ? `<a class="btn btn-chico btn-fantasma" href="#/muro?dinamica=${SLUG}&autor=${encodeURIComponent(yo)}">Sus partituras publicadas · ${mis.length}</a>` : ''}</div>
      ${banco.length ? `<div class="pt-rejilla">${banco.map(tarjetaBanco).join('')}</div>` : vacio('Todavía no hay textos en el banco', 'El tutor los carga desde el panel. Mientras tanto, puede escribir o analizar un texto.')}
    </section>
    <details class="pt-detalle pt-leyenda-portada"><summary>${icono('info', 16)}Cómo se lee la partitura</summary>${leyendaHTML()}</details>
  </div>`;
  cont.querySelector('a[href="#pt-banco"]')?.addEventListener('click', ev => { ev.preventDefault(); cont.querySelector('#pt-banco').scrollIntoView({ behavior: 'smooth' }); });
}

// ---------------------------------------------------------------------
// Lector: un texto del banco (o el texto pegado) con su partitura
// ---------------------------------------------------------------------
async function lector(cont, id, { pegado = null } = {}) {
  let d;
  if (pegado) d = pegado;
  else {
    const c = await estado.api.contenido(SLUG, id).catch(() => null);
    if (!c?.datos?.parrafos?.length) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este texto no está disponible', 'Puede que el tutor lo haya retirado.', `<a class="btn" href="#/d/${SLUG}">Volver a Partituras</a>`)}</div>`;
      return;
    }
    d = c.datos;
  }
  const texto = textoDe(d);
  const an = analizar(texto);
  const escribirHref = pegado ? null : href(id);
  cont.innerHTML = `
  <div class="contenedor pt-lector" style="--acento:${ACENTO}">
    <a class="btn btn-fantasma btn-chico" href="${pegado ? href('_analizar', '?cambiar') : `#/d/${SLUG}`}">${icono('izquierda', 16)}${pegado ? 'Cambiar el texto' : 'Partituras'}</a>
    <header class="pt-lector-cab">
      <div>
        <span class="rotulo">${pegado ? 'Texto pegado · solo en este navegador' : 'Partitura modelo'}</span>
        <h1 class="saludo">${esc(d.titulo || 'Sin título')}</h1>
        ${quienEs(d) ? `<p class="pt-quien">${quienEs(d)}</p>` : ''}
        <p class="pt-cifras">${plural(an.palabras, 'palabra')} · ${plural(an.frases.length, 'frase')} · ${cuenta(an.parrafos.length, 'párrafo', 'párrafos')} · ${an.frases.length ? Math.round(an.palabras / an.frases.length) : 0} palabras por frase en promedio · ~${minutos(an.palabras)} min de lectura</p>
        ${d.nota ? `<p class="pt-nota">${esc(d.nota)}</p>` : ''}
      </div>
      <div class="pt-lector-acciones">
        ${pegado ? `<button type="button" class="btn btn-primario" id="pt-escribir-sobre">${icono('lapiz', 18)}Escribir sobre esta partitura</button>`
          : `<a class="btn btn-primario" href="${escribirHref}">${icono('lapiz', 18)}Escribir sobre esta partitura</a>`}
      </div>
    </header>
    <article class="pt-lector-hoja">
      <div class="lectura pt-lector-texto" id="pt-texto">${an.parrafos.map(p => `${p.seccion ? '<p class="pt-seccion">* * *</p>' : ''}<p>${p.frases.map(i => {
        const f = an.frases[i];
        return `<span class="pt-f${f.pat ? ` pt-c-${CODIGO[f.pat]}` : ''}" data-i="${i}" tabindex="-1">${esc(f.t)}</span>`;
      }).join(' ')}</p>`).join('')}</div>
    </article>
    <div class="pt-lector-panel" id="pt-panel"></div>
  </div>`;
  const textoEl = cont.querySelector('#pt-texto');
  const spans = () => [...textoEl.querySelectorAll('.pt-f')];
  let marcado = null;
  const marcar = i => {
    if (marcado !== null) spans()[marcado]?.classList.remove('pt-hl');
    marcado = i;
    if (i !== null) spans()[i]?.classList.add('pt-hl');
  };
  const panel = panelPartitura(cont.querySelector('#pt-panel'), {
    reducible: true,
    compacto: window.innerWidth < 640 || window.innerHeight < 820,
    alPasar: i => marcar(i),
    alElegir: i => {
      const s = spans()[i];
      if (!s) return;
      s.scrollIntoView({ block: 'center', behavior: 'smooth' });
      marcar(i);
      panel.cabezal(i);
    },
  });
  panel.pintar(an, { final: true });
  // el cabezal sigue la lectura: la frase en el centro de lo que se ve (sin el panel)
  const seguir = () => {
    const alto = window.innerHeight - panel.alto();
    const centro = alto / 2;
    let mejor = null, dist = Infinity;
    for (const s of spans()) {
      const r = s.getBoundingClientRect();
      if (r.bottom < 0 || r.top > alto) continue;
      const dd = Math.abs((r.top + r.bottom) / 2 - centro);
      if (dd < dist) { dist = dd; mejor = Number(s.dataset.i); }
    }
    if (mejor !== null) panel.cabezal(mejor);
  };
  let pend = false;
  const alDesplazar = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; seguir(); }); };
  window.addEventListener('scroll', alDesplazar, { passive: true });
  textoEl.addEventListener('click', ev => {
    if (window.getSelection()?.toString()) return;
    const s = ev.target.closest('.pt-f');
    if (!s) return;
    const i = Number(s.dataset.i);
    marcar(i);
    panel.cabezal(i);
    panel.centrar(i);
  });
  cont.querySelector('#pt-escribir-sobre')?.addEventListener('click', () => escribirSobrePegado(pegado));
  requestAnimationFrame(seguir);
  return () => { window.removeEventListener('scroll', alDesplazar); panel.destruir(); };
}

// ---------------------------------------------------------------------
// Analizar un texto ajeno (solo en este navegador)
// ---------------------------------------------------------------------
async function analizarTexto(cont) {
  const guardado = local(claveAnalizar());
  if (guardado?.texto && !location.hash.includes('cambiar')) return lector(cont, '_analizar', { pegado: { titulo: guardado.titulo, autor: guardado.autor, parrafos: guardado.texto.split('\n').filter(Boolean) } });
  cont.innerHTML = `
  <div class="contenedor contenedor-estrecho pt-analizar" style="--acento:${ACENTO}">
    <a class="btn btn-fantasma btn-chico" href="#/d/${SLUG}">${icono('izquierda', 16)}Partituras</a>
    <h1 class="saludo">Analizar un texto</h1>
    <p class="pt-analizar-nota">${icono('candado', 16)}<span>Pegue el texto de otra persona para ver su partitura. Se queda solo en este navegador: no se guarda en la nube ni se publica. Si después escribe sobre su partitura, de este texto solo se guardan los números (cuántas palabras tiene cada frase).</span></p>
    <div class="tarjeta pt-analizar-form">
      <div class="pt-analizar-fila">
        <label class="campo"><span>Título <span class="tenue">(opcional)</span></span><input class="entrada" id="pt-a-titulo" maxlength="140" value="${esc(guardado?.titulo || '')}"></label>
        <label class="campo"><span>Autor <span class="tenue">(opcional)</span></span><input class="entrada" id="pt-a-autor" maxlength="140" value="${esc(guardado?.autor || '')}"></label>
      </div>
      <label class="campo"><span>El texto</span><textarea class="area pt-a-texto" id="pt-a-texto" rows="12" placeholder="Pegue aquí el texto. Cada salto de línea es un párrafo.">${esc(guardado?.texto || '')}</textarea></label>
      <div class="fila">
        <span class="contador" id="pt-a-cuenta"></span><span class="espaciador"></span>
        ${guardado?.texto ? `<button type="button" class="btn btn-fantasma" id="pt-a-borrar">${icono('basura', 16)}Borrar el texto</button>` : ''}
        <button type="button" class="btn btn-primario" id="pt-a-ver">${icono('partitura', 18)}Ver la partitura</button>
      </div>
    </div>
  </div>`;
  const $ = s => cont.querySelector(s);
  const area = $('#pt-a-texto');
  const contar = () => {
    const el = $('#pt-a-cuenta');
    if (!el) return;
    const an = analizar(area.value);
    el.textContent = area.value.trim() ? `${plural(an.palabras, 'palabra')} · ${plural(an.frases.length, 'frase')}` : '';
  };
  area.addEventListener('input', debounce(contar, 200));
  contar();
  $('#pt-a-borrar')?.addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar el texto pegado de este navegador?', { si: 'Borrar', peligro: true }))) return;
    local(claveAnalizar(), null);
    location.hash = href('_analizar');
    analizarTexto(cont);
  });
  $('#pt-a-ver').addEventListener('click', () => {
    const texto = limpiarTexto(area.value).replace(/\n\n/g, '\n');
    const an = analizar(texto);
    if (an.frases.length < MIN_FRASES_BANCO) { aviso(`Pegue un texto de al menos ${MIN_FRASES_BANCO} frases.`); area.focus(); return; }
    local(claveAnalizar(), { titulo: $('#pt-a-titulo').value.trim(), autor: $('#pt-a-autor').value.trim(), texto });
    if (location.hash === href('_analizar')) analizarTexto(cont);
    else location.hash = href('_analizar');
  });
}

async function escribirSobrePegado(p) {
  const actual = await leerBorrador(`${SLUG}:analizado`);
  if (actual?.E?.texto?.trim() && !(await confirmar('Ya tiene un texto en curso sobre otra partitura pegada. Si sigue, se reemplaza por uno nuevo sobre esta.', { si: 'Empezar uno nuevo', no: 'Cancelar', peligro: true }))) return;
  const modelo = { id: 'analizado', titulo: p.titulo || '', autor: p.autor || '', notas: notasDe(analizar(textoDe(p))) };
  const E = { titulo: '', texto: '', margen: 2, modelo };
  local(`borrador:${estado.yo.id}:${SLUG}:analizado`, { E, _actualizado: new Date().toISOString() });
  try { await estado.api.guardarBorrador(`${SLUG}:analizado`, { E }); } catch { /* queda en este navegador */ }
  location.hash = href('analizado');
}

// ---------------------------------------------------------------------
// Escritorio: escribir libre o sobre un modelo (y editar una entrega)
// ---------------------------------------------------------------------
async function escritorio(cont, { itemId = null, entrega = null, fija = false } = {}) {
  if (entrega) itemId = entrega.item_id || 'libre';
  const clave = `${SLUG}:${itemId}`;
  const libre = itemId === 'libre';
  let E;
  let nota = '';
  let modelo = null;      // { id, titulo, autor, anio, obra, traductor, notas }
  let textoModelo = null; // el texto del modelo (para «Releer»), si se tiene
  if (entrega) {
    const d = entrega.datos || {};
    E = { titulo: entrega.titulo || '', texto: typeof d.texto === 'string' ? d.texto : '', margen: d.margen === 0 ? 0 : 2 };
    modelo = d.modelo || null;
  } else {
    const b = await leerBorrador(clave);
    E = b?.E ? { titulo: String(b.E.titulo || ''), texto: String(b.E.texto || ''), margen: b.E.margen === 0 ? 0 : 2, modelo: b.E.modelo } : { titulo: '', texto: '', margen: 2 };
    if (E.texto.trim()) nota = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`;
    if (itemId === 'analizado') {
      modelo = E.modelo || null;
      if (!modelo?.notas?.length) {
        cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('No hay una partitura pegada', 'Pegue un texto en «Analizar un texto» y elija «Escribir sobre esta partitura».', `<a class="btn" href="${href('_analizar')}">Analizar un texto</a>`)}</div>`;
        return;
      }
      const p = local(claveAnalizar());
      if (p?.texto) textoModelo = p.texto;
    } else if (!libre) {
      const c = await estado.api.contenido(SLUG, itemId).catch(() => null);
      if (!c?.datos?.parrafos?.length) {
        cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Esta partitura no está disponible', 'Puede que el tutor la haya retirado.', `<a class="btn" href="#/d/${SLUG}">Volver a Partituras</a>`)}</div>`;
        return;
      }
      modelo = modeloDe(itemId, c.datos);
      textoModelo = textoDe(c.datos);
    }
  }
  if (entrega && modelo && !textoModelo && modelo.id && modelo.id !== 'analizado') {
    const c = await estado.api.contenido(SLUG, modelo.id).catch(() => null);
    if (c?.datos?.parrafos) textoModelo = textoDe(c.datos);
  }
  const M = modelo ? deNotas(modelo.notas) : null;

  let publicado = false;
  let colores = local(`${SLUG}-colores`) !== false;
  const guardado = t => { const el = cont.querySelector('#guardado'); if (el) el.textContent = t; };
  const guardarNube = debounce(async () => {
    if (publicado || entrega) return;
    try { await estado.api.guardarBorrador(clave, { E }); guardado('Guardado'); }
    catch { guardado('Guardado en este dispositivo'); }
  }, 1500);
  function cambio() {
    if (entrega) { guardado('Cambios sin guardar'); return; }
    if (publicado) return;
    local(`borrador:${estado.yo.id}:${clave}`, { E, _actualizado: new Date().toISOString() });
    guardado('Guardando…');
    guardarNube();
  }
  const volver = entrega ? `#/entrega/${entrega.id}` : `#/d/${SLUG}`;
  const volverHTML = fija && !entrega ? '' : `<a class="herr" href="${volver}" title="${entrega ? 'Volver al texto' : 'Volver a Partituras'}" aria-label="${entrega ? 'Volver al texto' : 'Volver a Partituras'}">${icono('izquierda', 18)}</a>`;
  const pasos = M ? PASOS_MODELO : PASOS_LIBRE;
  // La consigna empieza a la vista (también en el celular); quien la pliega en el computador la encuentra plegada la próxima vez.
  const plegadoIni = !!local(`${SLUG}-plegado`) && window.innerWidth >= 960;

  cont.innerHTML = `
  <div class="contenedor pt-contenedor" style="max-width:1400px;--acento:${ACENTO}">
    <div class="escritorio pt-escritorio${plegadoIni ? ' pt-plegado' : ''}" id="pt-escritorio">
      <aside class="consigna-panel pt-consigna" aria-label="Consigna y signos">
        <button type="button" class="pt-pestana" id="pt-desplegar" aria-label="Mostrar la consigna y los signos" title="Mostrar la consigna y los signos">${icono('partitura', 20)}<span>Consigna y signos</span><b class="pt-pestana-tit">${esc(M ? `Sobre «${modelo.titulo || 'un texto pegado'}»` : 'Escriba y escuche su ritmo')}</b><i class="pt-pestana-ver">Ver ▾</i></button>
        <div class="pt-consigna-cuerpo">
          <div class="pt-consigna-cab">
            <span class="rotulo">${M ? 'Partituras · sobre una partitura' : 'Partituras · escribir'}</span>
            <span class="espaciador"></span>
            <button type="button" class="btn btn-fantasma btn-chico btn-icono" id="pt-plegar" aria-expanded="true" aria-label="Ocultar el panel" title="Ocultar el panel: más espacio para escribir">${icono('izquierda', 18)}</button>
          </div>
          <h1>${M ? esc(modelo.titulo || 'Un texto pegado') : 'Escriba y escuche su ritmo'}</h1>
          ${M && (modelo.autor || modelo.anio) ? `<p class="pt-quien">${quienEs(modelo)}</p>` : ''}
          <div class="consigna-texto"><ol>${pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol></div>
          ${M ? `<div class="pt-objetivo" id="pt-objetivo" aria-live="polite"></div>
            <div class="pt-margen"><span class="rotulo">Margen</span>
              <div class="conmutador" role="tablist" aria-label="Margen">
                <button type="button" role="tab" data-margen="2" class="${E.margen ? 'on' : ''}" aria-selected="${!!E.margen}">Cercana · ±2</button>
                <button type="button" role="tab" data-margen="0" class="${E.margen ? '' : 'on'}" aria-selected="${!E.margen}">Exacta</button>
              </div></div>
            ${textoModelo ? `<button type="button" class="btn btn-fantasma btn-chico pt-releer" id="pt-releer">${icono('libro', 16)}Releer el modelo</button>` : ''}` : ''}
          <details class="pt-detalle" id="pt-signos"${window.innerWidth > 1100 && !M ? ' open' : ''}><summary>${icono('info', 16)}Cómo se lee la partitura</summary>${leyendaHTML()}</details>
        </div>
      </aside>
      <section class="mesa pt-mesa">
        <div class="mesa-barra">
          ${volverHTML}
          <span class="rotulo pt-rotulo">${entrega ? 'Editar' : M ? 'Sobre una partitura' : 'Escritura libre'}</span>
          <span class="espaciador"></span>
          <span class="guardado" id="guardado">${esc(nota)}</span>
          <button type="button" class="herr${colores ? ' on' : ''}" id="pt-colores" aria-pressed="${colores}" title="Colores de las rachas en el texto" aria-label="Colores de las rachas en el texto">${icono('ojo', 18)}</button>
          <button type="button" class="herr" id="enfoque" title="Modo enfoque" aria-label="Modo enfoque">${icono('enfoque', 18)}</button>
        </div>
        <div class="hoja-escribir pt-hoja">
          <input class="titulo-escribir" id="titulo" placeholder="Título" maxlength="140" value="${esc(E.titulo)}" aria-label="Título">
          <div class="pt-editor${colores ? '' : ' pt-sin-color'}" id="pt-editor">
            <div class="pt-fondo" id="pt-fondo" aria-hidden="true"></div>
            <textarea class="pt-texto" id="pt-texto" spellcheck="true" rows="8" aria-label="Su texto" placeholder="Escriba aquí, o pegue un texto suyo. Cada salto de línea abre un párrafo."></textarea>
          </div>
        </div>
        <div class="pt-fijo" id="pt-fijo">
          <div id="pt-panel"></div>
          <div class="mesa-pie">
            <span class="contador" id="contador"></span>
            <span class="espaciador"></span>
            <button type="button" class="btn btn-primario" id="pt-publicar">${icono(entrega ? 'check' : 'enviar', 18)}${entrega ? 'Guardar cambios' : 'Publicar'}</button>
          </div>
        </div>
      </section>
    </div>
  </div>`;
  const $ = s => cont.querySelector(s);
  const area = $('#pt-texto');
  const fondo = $('#pt-fondo');
  area.value = E.texto;
  let an = analizar(E.texto, { escribiendo: true });
  let hl = null;

  // panel plegable
  const esc_ = $('#pt-escritorio');
  const plegar = on => {
    esc_.classList.toggle('pt-plegado', on);
    $('#pt-plegar').setAttribute('aria-expanded', String(!on));
    if (window.innerWidth >= 960) local(`${SLUG}-plegado`, on || null);
    requestAnimationFrame(() => { crecer(area); panel.pintar(an); });
  };
  $('#pt-plegar').addEventListener('click', () => plegar(true));
  $('#pt-desplegar').addEventListener('click', () => plegar(false));

  const caretPos = () => area.selectionStart ?? area.value.length;
  function pintarFondo(conCaret = false) {
    fondo.innerHTML = marcadoHTML(area.value, an, { conColor: true, resalte: hl, clase: 'pt-c', caret: conCaret ? caretPos() : null }) + '\n';
  }
  // Que la línea donde se escribe no quede debajo de la partitura fija.
  function mantenerVisible() {
    pintarFondo(true);
    const c = fondo.querySelector('.pt-caret');
    if (!c) return;
    const r = c.getBoundingClientRect();
    const tope = window.innerHeight - $('#pt-fijo').offsetHeight - 24;
    if (r.bottom > tope) window.scrollBy({ top: r.bottom - tope });
    else if (r.top < 90) window.scrollBy({ top: r.top - 90 });
    pintarFondo(false);
  }
  const panel = panelPartitura($('#pt-panel'), {
    reducible: true,
    compacto: window.innerWidth < 640 || window.innerHeight < 760,
    alPasar: i => { hl = i; pintarFondo(); },
    alElegir: i => {
      const f = an.frases[i] || (i === an.frases.length && an.abierta) || null;
      if (!f) return;
      area.focus({ preventScroll: true });
      area.setSelectionRange(f.a, f.b);
      hl = i;
      pintarFondo();
      fondo.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      seguirCursor();
    },
    alCambiarTamano: () => {},
  });

  function pintarObjetivo() {
    if (!M) return;
    const n = an.frases.length;
    const cmp = comparar(an, M, E.margen);
    const el = $('#pt-objetivo');
    if (n >= M.frases.length) {
      el.innerHTML = `<span class="rotulo">Partitura completa</span>
        <p class="pt-obj-fin">${icono('check', 18)}Sus ${n} frases cubren las ${M.frases.length} del modelo. ${cmp.en_lugar} en su lugar.</p>`;
      return;
    }
    const obj = M.frases[n].w;
    const lleva = an.abierta?.w || 0;
    const falta = obj - lleva;
    el.innerHTML = `<span class="rotulo">Frase ${n + 1} de ${M.frases.length}</span>
      <div class="pt-obj-fila"><span>El modelo tiene</span><b>${obj}</b></div>
      <div class="pt-obj-fila"><span>Usted lleva</span><b class="pt-obj-lleva">${lleva}</b></div>
      <div class="pt-obj-barra" aria-hidden="true"><i style="width:${Math.min(100, Math.round(100 * lleva / obj))}%"></i></div>
      <p class="pt-obj-nota">${falta > E.margen ? `Faltan ${plural(falta, 'palabra')}${E.margen ? ` (con ${falta - E.margen} a ${falta + E.margen} queda en su lugar)` : ''}.` : Math.abs(falta) <= E.margen ? 'En su lugar: ya puede cerrar la frase.' : `Se pasó por ${plural(-falta, 'palabra')}.`}</p>
      <p class="pt-obj-nota">${cmp.en_lugar} de ${cmp.comparadas} frases en su lugar · ${cmp.pct} % de la partitura</p>`;
  }
  function puedePublicar() {
    const total = analizar(area.value);
    if (!total.frases.length) return { ok: false, msg: 'Escriba al menos una frase.' };
    if (!M) return { ok: true };
    const cmp = comparar(total, M, E.margen);
    if (total.palabras >= MIN_PALABRAS || cmp.completa) return { ok: true };
    return { ok: false, msg: `Faltan ${plural(MIN_PALABRAS - total.palabras, 'palabra')} para publicar (o complete la partitura).` };
  }
  function pintarPie() {
    const n = an.palabras;
    const nf = an.frases.length + (an.abierta ? 1 : 0);
    const p = puedePublicar();
    const np = analizar(area.value).parrafos.length;
    $('#contador').textContent = `${plural(n, 'palabra')} · ${plural(nf, 'frase')} · ${cuenta(np, 'párrafo', 'párrafos')}${n ? ` · ~${minutos(n)} min` : ''}${!p.ok && M ? ` · ${p.msg}` : ''}`;
    $('#pt-publicar').disabled = !p.ok;
    $('#pt-publicar').title = p.ok ? '' : p.msg;
  }
  function seguirCursor() {
    const { i } = fraseEn(an, caretPos());
    panel.cabezal(i);
  }
  function todo() {
    an = analizar(area.value, { escribiendo: true });
    panel.pintar(an, { M, margen: E.margen });
    pintarFondo();
    pintarObjetivo();
    pintarPie();
    seguirCursor();
  }

  area.addEventListener('input', () => {
    E.texto = area.value;
    crecer(area);
    todo();
    mantenerVisible();
    cambio();
  });
  for (const ev of ['keyup', 'click', 'select']) area.addEventListener(ev, seguirCursor);
  $('#titulo').addEventListener('input', ev => { E.titulo = ev.target.value; cambio(); });
  $('#pt-colores').addEventListener('click', ev => {
    colores = !colores;
    ev.currentTarget.classList.toggle('on', colores);
    ev.currentTarget.setAttribute('aria-pressed', String(colores));
    $('#pt-editor').classList.toggle('pt-sin-color', !colores);
    local(`${SLUG}-colores`, colores ? null : false);
  });
  $('#enfoque').addEventListener('click', ev => { ev.currentTarget.classList.toggle('on', document.body.classList.toggle('enfoque')); });
  cont.querySelectorAll('[data-margen]').forEach(b => b.addEventListener('click', () => {
    E.margen = Number(b.dataset.margen);
    cont.querySelectorAll('[data-margen]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    cambio();
    todo();
  }));
  $('#pt-releer')?.addEventListener('click', () => {
    const am = analizar(textoModelo);
    const actual = an.frases.length;
    modal({
      titulo: modelo.titulo || 'El modelo',
      cuerpo: `<div class="pt-releer-texto lectura">${am.parrafos.map(p => `<p>${p.frases.map(i => `<span class="${i === actual ? 'pt-hl' : ''}">${esc(am.frases[i].t)}</span>`).join(' ')}</p>`).join('')}</div>`,
      acciones: [{ texto: 'Volver a escribir', clase: 'btn-primario' }],
      ancho: 720,
      alAbrir: m => m.querySelector('.pt-hl')?.scrollIntoView({ block: 'center' }),
    });
  });
  $('#pt-publicar').addEventListener('click', publicar);
  const alCambiarTamano = debounce(() => crecer(area), 150);
  window.addEventListener('resize', alCambiarTamano);

  async function publicar() {
    const p = puedePublicar();
    if (!p.ok) { aviso(p.msg); return; }
    const limpio = limpiarTexto(area.value);
    const fin = analizar(limpio);
    const titulo = E.titulo.trim();
    const cmp = M ? comparar(fin, M, E.margen) : null;
    const datos = {
      modo: M ? 'modelo' : 'libre', texto: limpio,
      modelo: M ? { id: modelo.id, titulo: modelo.titulo || '', autor: modelo.autor || '', anio: modelo.anio || '', obra: modelo.obra || '', traductor: modelo.traductor || '', notas: modelo.notas } : null,
      margen: E.margen, comparadas: cmp?.comparadas ?? 0, en_lugar: cmp?.en_lugar ?? 0, pct: cmp?.pct ?? 0, completa: cmp?.completa ?? false,
      firma: firmaDe(fin),
    };
    const credito = creditoDe(datos);
    const extra = M ? ` ${credito}` : '';
    if (!entrega && !(await confirmar(`${avisoPublicar('su texto y su partitura', 'los')}${extra}`, { si: 'Publicar', no: 'Seguir escribiendo' }))) return;
    const btn = $('#pt-publicar');
    btn.disabled = true;
    try {
      publicado = true;
      guardarNube.cancelar();
      await publicarEntrega({
        dinamica: SLUG, item_id: itemId, titulo,
        texto: credito ? `${limpio}\n\n${credito}` : limpio,
        vista: vistaHTML(limpio, fin, datos, M),
        datos, modulo_version: VERSION,
      }, { entregaExistente: entrega });
      if (!entrega) quitarBorrador(clave);
    } catch (err) {
      publicado = false;
      cambio();
      errorAviso(err);
      btn.disabled = false;
    }
  }

  crecer(area);
  todo();
  return () => {
    window.removeEventListener('resize', alCambiarTamano);
    panel.destruir();
    document.body.classList.remove('enfoque');
    if (!publicado && !entrega && E.texto.trim()) guardarNube.ahora();
  };
}

function vistaHTML(texto, an, datos, M) {
  const credito = creditoDe(datos);
  return `<div class="v-partituras">${parrafosHTML(texto, an)}</div>${credito ? `<p class="v-credito">${esc(credito)}</p>` : ''}<div class="v-pt-svg">${sistemasSVG(an, { modelo: M, margen: datos.margen })}</div>`;
}

// ---------------------------------------------------------------------
// En la entrega: la partitura debajo del texto, con el texto de la lectura crítica
// ---------------------------------------------------------------------
export function refHTML(e, enlace = '') {
  const d = e.datos || {};
  const an = analizar(d.texto || '');
  const m = d.modelo;
  const linea = m
    ? `Sobre la partitura de ${m.titulo ? `<em>${esc(m.titulo)}</em>` : 'otro texto'}${m.autor ? `, de ${esc(m.autor)}` : ''} · ${d.completa ? 'completa' : `${Number(d.pct) || 0} %`} · ${Number(d.en_lugar) || 0} de ${Number(d.comparadas) || 0} frases en su lugar (${d.margen === 0 ? 'exacta' : '±2'})`
    : `Escritura libre · ${plural(an.frases.length, 'frase')}`;
  return `<div class="consigna-ref pt-ref"><b>Partitura</b>${linea}${enlace}</div>`;
}

export function montarEnEntrega(cont, lect, e) {
  const d = e.datos || {};
  if (typeof d.texto !== 'string') return null;
  const an = analizar(d.texto);
  const M = d.modelo?.notas ? deNotas(d.modelo.notas) : null;
  const caja = document.createElement('div');
  caja.className = 'pt-entrega-panel';
  lect.insertAdjacentElement('afterend', caja);
  const spans = () => [...lect.querySelectorAll('.v-partituras .pt-f')];
  let marcado = null;
  const marcar = i => {
    spans().forEach(s => s.classList.remove('pt-hl'));
    marcado = i;
    if (i !== null) spans()[i]?.classList.add('pt-hl');
  };
  const panel = panelPartitura(caja, {
    reducible: true,
    compacto: true,
    alPasar: i => marcar(i),
    alElegir: i => { spans()[i]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); marcar(i); panel.cabezal(i); },
  });
  panel.pintar(an, { M, margen: d.margen === 0 ? 0 : 2, final: true });
  const seguir = () => {
    const alto = window.innerHeight - panel.alto();
    let mejor = null, dist = Infinity;
    spans().forEach((s, i) => {
      const r = s.getBoundingClientRect();
      if (r.bottom < 0 || r.top > alto) return;
      const dd = Math.abs((r.top + r.bottom) / 2 - alto / 2);
      if (dd < dist) { dist = dd; mejor = i; }
    });
    if (mejor !== null) panel.cabezal(mejor);
  };
  let pend = false;
  const alDesplazar = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; seguir(); }); };
  window.addEventListener('scroll', alDesplazar, { passive: true });
  requestAnimationFrame(seguir);
  return {
    repintar: () => { if (marcado !== null) marcar(marcado); },
    destruir: () => { window.removeEventListener('scroll', alDesplazar); panel.destruir(); },
  };
}
