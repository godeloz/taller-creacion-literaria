// Ritmo: la longitud de las frases y su puntuación, leídas como una partitura.
// Es una pieza común: la usa Partituras (escribir, leer, escribir sobre un modelo y la entrega).
//
// analizar(texto, { escribiendo }) → {
//   frases: [{ i, a, b, t, w, p, dial, pausas: { coma, pc, dp, par, raya }, tot, fin, fig, pat }],
//   parrafos: [{ a, b, w, frases: [i…], seccion }], palabras, abierta: { a, b, w } | null, rachas: [{ pat, desde, hasta }] }
//   a, b: posiciones en el texto (b sin los espacios del final) · w: palabras · p: párrafo · dial: diálogo (el
//   párrafo empieza con raya) · tot: pausas internas · fin: '.', '?', '!', '…' o '' · fig: figura · pat: racha o null.
//   Un párrafo es cada línea con texto (un salto de línea abre un párrafo nuevo). Una línea de tres asteriscos
//   (o de guiones) separa secciones: no es un párrafo; el párrafo siguiente lleva seccion: true.
//   escribiendo: la última frase sin punto final, si el texto no termina en un salto de línea, queda «abierta»:
//   no es una nota todavía (se dibuja punteada).
// partituraSVG(an, opciones) → { svg, ancho, alto, xs }: la partitura dibujada (SVG con atributos, sin estilos:
//   pasa por sanitizar() tal cual, así sirve también para la vista publicada y el PDF).
// sistemasSVG(an, opciones) → la partitura en varios renglones (para la vista publicada y el PDF).
// minimapaSVG(an, opciones) → la miniatura del texto entero.
// Las claves de sol y de fa son los contornos de la fuente Noto Music (SIL Open Font License), sin la fuente.

// ---------------------------------------------------------------------
// Convenciones
// ---------------------------------------------------------------------
export const FIGURAS = [
  { id: 'semicorchea', nombre: 'Semicorchea', hasta: 5, rango: '5 o menos' },
  { id: 'corchea', nombre: 'Corchea', hasta: 10, rango: 'de 6 a 10' },
  { id: 'negra', nombre: 'Negra', hasta: 20, rango: 'de 11 a 20' },
  { id: 'blanca', nombre: 'Blanca', hasta: 35, rango: 'de 21 a 35' },
  { id: 'redonda', nombre: 'Redonda', hasta: Infinity, rango: 'más de 35' },
];
export const figuraDe = w => FIGURAS.findIndex(f => w <= f.hasta);

export const CORTA = 10;    // ráfaga: frases de 10 palabras o menos
export const LARGA = 21;    // caudal: frases de 21 palabras o más
export const MIN_RACHA = 3;
export const LABERINTO = 4; // pausas internas desde las que una frase es un laberinto

// Colores: la nota (cabeza, plica, banda) y el texto (más oscuro, para que se lea sobre papel).
export const PATRONES = {
  monotonia: { nombre: 'Monotonía', nota: '#D93025', texto: '#B3261E', banda: '#D93025', regla: 'Tres o más frases seguidas que no se separan más de 2 palabras o del 15 %.' },
  rafaga: { nombre: 'Ráfaga', nota: '#3D6BE8', texto: '#2F5BD8', banda: '#4D7CFF', regla: `Tres o más frases seguidas de ${CORTA} palabras o menos.` },
  caudal: { nombre: 'Caudal', nota: '#D98A00', texto: '#8F5600', banda: '#E59A12', regla: `Tres o más frases seguidas de ${LARGA} palabras o más.` },
  alternancia: { nombre: 'Alternancia', nota: '#00A884', texto: '#00785F', banda: '#00A884', regla: 'Tres o más frases seguidas que cambian de figura y suben y bajan: el ritmo alterna.' },
};
export const ORDEN_PATRONES = ['alternancia', 'rafaga', 'caudal', 'monotonia'];
export const TINTA = '#16141C';
export const AZUL = '#2E4A7D';
const PAUTA = '#CFC8BC';
const GRIS = '#C2BBAF';
const TENUE = '#6A6473';
const PAPEL = '#FBF9F4';
const VERDE = '#00896B';

// ---------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------
const LETRA = /[\p{L}\p{N}]/u;
const MAYUS = /[\p{Lu}\p{N}]/u;
const CIERRES = '»”"’\')]';
const ABREV = new Set(['sr', 'sra', 'srta', 'sres', 'dr', 'dra', 'ud', 'uds', 'vd', 'vds', 'p', 'ej', 'pág', 'págs', 'núm', 'cap', 'vol',
  'art', 'av', 'avda', 'sto', 'sta', 'fr', 'hno', 'lic', 'ing', 'prof', 'gral', 'cía', 'dto', 'tel', 'aprox', 'mr', 'mrs', 'st']);
const SECCION = /^\s*(?:[*·•~]\s*){3,}$|^\s*[—–-]{3,}\s*$/;

export const palabrasDe = t => String(t || '').split(/\s+/).filter(x => LETRA.test(x)).length;

function cortes(par) {
  // Posiciones (dentro del párrafo) donde termina una frase.
  const out = [];
  const n = par.length;
  for (let i = 0; i < n; i++) {
    const c = par[i];
    if (c !== '.' && c !== '?' && c !== '!' && c !== '…') continue;
    let j = i + 1;
    while (j < n && '.?!…'.includes(par[j])) j++;
    while (j < n && CIERRES.includes(par[j])) j++;
    let k = j;
    while (k < n && /\s/.test(par[k])) k++;
    if (k >= n) break;
    if (k === j) { i = j - 1; continue; }        // sin espacio: «3.5», «a.m.»
    if (c === '.' && j === i + 1) {
      // abreviaturas («Sr.», «p. ej.») e iniciales («J. R.»)
      const m = par.slice(0, i).match(/([\p{L}]+)$/u);
      if (m && (ABREV.has(m[1].toLowerCase()) || (m[1].length === 1 && /\p{Lu}/u.test(m[1])))) { i = j - 1; continue; }
    }
    const x = par[k], y = par[k + 1] || '';
    const abre = MAYUS.test(x) || '¿¡«“"'.includes(x) || ((x === '—' || x === '–' || x === '(') && (MAYUS.test(y) || '¿¡«'.includes(y)));
    if (abre) out.push([j, k]);
    i = j - 1;
  }
  return out;
}

function pausasDe(t, dial) {
  const cuerpo = t.replace(/^[\s—–-]+/, '');
  const rayas = dial ? 0 : (cuerpo.match(/[—–]/g) || []).length;
  return {
    coma: (t.match(/,/g) || []).length,
    pc: (t.match(/;/g) || []).length,
    dp: (t.match(/:(?!\d)/g) || []).length,
    par: (t.match(/\(/g) || []).length,
    raya: Math.ceil(rayas / 2),
  };
}
function finDe(t) {
  let s = t.trimEnd();
  while (s && CIERRES.includes(s[s.length - 1])) s = s.slice(0, -1);
  if (s.endsWith('...') || s.endsWith('…')) return '…';
  const c = s[s.length - 1];
  if (c === '?' || c === '!' || c === '.') return c;
  if (t.includes('?')) return '?';
  return '';
}

export function analizar(texto, { escribiendo = false } = {}) {
  const T = String(texto ?? '');
  const frases = [];
  const parrafos = [];
  let seccion = false;
  const lineas = T.matchAll(/[^\n]+/g);
  for (const m of lineas) {
    const linea = m[0];
    if (!linea.trim()) continue;
    if (SECCION.test(linea)) { seccion = true; continue; }
    const base = m.index;
    const ini = base + (linea.length - linea.trimStart().length);
    const par = { a: ini, b: base + linea.trimEnd().length, w: 0, frases: [], seccion };
    seccion = false;
    const p = parrafos.length;
    const dial = /^\s*[—–]/.test(linea);
    const cs = cortes(linea);
    const tramos = [];
    let desde = linea.length - linea.trimStart().length;
    for (const [fin, sig] of cs) { tramos.push([desde, fin]); desde = sig; }
    tramos.push([desde, linea.trimEnd().length]);
    for (const [a0, b0] of tramos) {
      const t = linea.slice(a0, b0).trim();
      if (!t || !LETRA.test(t)) continue;
      const a = base + a0 + (linea.slice(a0, b0).length - linea.slice(a0, b0).trimStart().length);
      const w = palabrasDe(t);
      const pz = pausasDe(t, dial);
      const f = { i: frases.length, a, b: a + t.length, t, w, p, dial, pausas: pz, tot: pz.coma + pz.pc + pz.dp + pz.par + pz.raya, fin: finDe(t), fig: figuraDe(w), pat: null };
      frases.push(f);
      par.frases.push(f.i);
      par.w += w;
    }
    if (par.frases.length) parrafos.push(par);
  }
  // La frase que se está escribiendo: la última, sin cierre, si el texto no termina en un salto de línea.
  let abierta = null;
  const ult = frases[frases.length - 1];
  if (escribiendo && ult && !ult.fin && !/\n\s*$/.test(T)) {
    abierta = { a: ult.a, b: ult.b, w: ult.w, t: ult.t };
    frases.pop();
    const par = parrafos[parrafos.length - 1];
    par.frases.pop();
    par.w -= ult.w;
    if (!par.frases.length) parrafos.pop();
  }
  const rachas = marcarRachas(frases);
  return { frases, parrafos, palabras: frases.reduce((s, f) => s + f.w, 0) + (abierta?.w || 0), abierta, rachas };
}

// Las rachas: monotonía primero; después ráfaga, caudal y alternancia sobre lo que quede libre.
function marcarRachas(F) {
  const n = F.length;
  const rachas = [];
  const pasar = (pat, cabe) => {
    let i = 0;
    while (i < n) {
      if (F[i].pat) { i++; continue; }
      let j = i;
      while (j + 1 < n && !F[j + 1].pat && cabe(i, j + 1)) j++;
      if (j - i + 1 >= MIN_RACHA) {
        for (let k = i; k <= j; k++) F[k].pat = pat;
        rachas.push({ pat, desde: i, hasta: j });
        i = j + 1;
      } else i++;
    }
  };
  pasar('monotonia', (i, j) => {
    let mn = Infinity, mx = 0, s = 0;
    for (let k = i; k <= j; k++) { mn = Math.min(mn, F[k].w); mx = Math.max(mx, F[k].w); s += F[k].w; }
    return mx - mn <= Math.max(2, 0.15 * s / (j - i + 1));
  });
  pasar('rafaga', (i, j) => F[i].w <= CORTA && F[j].w <= CORTA);
  pasar('caudal', (i, j) => F[i].w >= LARGA && F[j].w >= LARGA);
  pasar('alternancia', (i, j) => {
    if (F[j].fig === F[j - 1].fig) return false;
    if (j - i < 2) return true;
    return Math.sign(F[j].w - F[j - 1].w) !== Math.sign(F[j - 1].w - F[j - 2].w);
  });
  return rachas.sort((x, y) => x.desde - y.desde);
}

// Resumen para los rótulos: cuántas frases y qué parte del texto hay en cada racha.
export function resumen(an) {
  const n = an.frases.length || 1;
  const out = {};
  for (const k of ORDEN_PATRONES) {
    const fr = an.frases.filter(f => f.pat === k);
    out[k] = { frases: fr.length, pct: Math.round(100 * fr.length / n), rachas: an.rachas.filter(r => r.pat === k) };
  }
  return out;
}

// Lo que se guarda de una partitura (sin el texto): [[palabras, párrafo, diálogo (1|0)]…]
export const notasDe = an => an.frases.map(f => [f.w, f.p, f.dial ? 1 : 0]);
// Una partitura guardada vuelta análisis (para dibujar el modelo sin su texto).
export function deNotas(notas = []) {
  const frases = [];
  const parrafos = [];
  (Array.isArray(notas) ? notas : []).forEach((x, i) => {
    const w = Math.max(1, Number(x?.[0]) || 1);
    const p = Math.max(0, Number(x?.[1]) || 0);
    const f = { i, a: 0, b: 0, t: '', w, p, dial: !!x?.[2], pausas: { coma: 0, pc: 0, dp: 0, par: 0, raya: 0 }, tot: 0, fin: '.', fig: figuraDe(w), pat: null };
    frases.push(f);
    let par = parrafos[parrafos.length - 1];
    if (!par || par.p !== p) { par = { p, w: 0, frases: [], seccion: false }; parrafos.push(par); }
    par.frases.push(i);
    par.w += w;
  });
  const rachas = marcarRachas(frases);
  return { frases, parrafos, palabras: frases.reduce((s, f) => s + f.w, 0), abierta: null, rachas };
}
// Para la tarjeta del muro: [[palabras, racha]…] (racha: m, r, c, a o '').
const CODIGO = { monotonia: 'm', rafaga: 'r', caudal: 'c', alternancia: 'a' };
export const firmaDe = an => an.frases.map(f => [f.w, CODIGO[f.pat] || '']);

// La frase en una posición del texto (para seguir el cursor del editor).
export function fraseEn(an, pos) {
  if (an.abierta && pos >= an.abierta.a) return { i: an.frases.length, abierta: true };
  let k = -1;
  for (const f of an.frases) { if (f.a <= pos) k = f.i; else break; }
  return { i: Math.max(0, k), abierta: false };
}

// ---------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------
const SOL = 'M314 801Q300 854 291 906Q282 958 282 1012Q282 1059 288 1100Q295 1142 307 1177Q320 1217 341 1252Q362 1288 386 1311Q409 1334 427 1334Q451 1334 493 1249Q514 1206 524 1156Q534 1106 534 1049Q534 978 515 908Q496 837 460 775Q423 713 372 666L407 498Q422 500 432 501Q442 502 447 502Q508 502 556 468Q604 433 632 377Q661 321 661 254Q661 177 622 116Q582 54 503 25Q508 8 532 -117Q538 -147 541 -164Q544 -182 545 -195Q546 -208 546 -225Q546 -275 522 -314Q497 -354 456 -376Q414 -398 363 -398Q311 -398 271 -378Q231 -359 208 -324Q185 -290 185 -245Q185 -197 212 -165Q238 -133 287 -133Q329 -133 356 -164Q382 -194 382 -236Q382 -272 357 -299Q332 -326 292 -326H282Q308 -365 364 -365Q433 -365 472 -320Q511 -275 511 -205Q511 -188 507 -160Q503 -131 493 -91Q483 -51 478 -25Q472 1 470 12Q436 2 390 2Q304 2 222 52Q142 102 96 184Q50 266 50 361Q50 451 91 530Q132 609 192 675Q253 741 314 801ZM341 826Q364 838 390 870Q416 903 440 945Q464 987 479 1030Q494 1072 494 1106Q494 1142 483 1163Q472 1184 445 1184Q421 1184 398 1162Q376 1140 358 1104Q341 1067 331 1022Q321 977 321 930Q321 898 328 872Q334 846 341 826ZM398 379Q371 373 347 354Q323 334 308 306Q294 279 294 248Q294 223 307 196Q320 170 339 154Q352 142 365 136Q380 129 380 123Q380 120 370 117Q332 126 302 151Q271 176 254 212Q236 247 236 287Q236 330 254 370Q271 410 302 442Q334 474 374 490L345 641Q229 547 174 456Q120 366 120 277Q120 212 154 156Q188 100 247 66Q306 31 380 31Q400 31 420 35Q441 39 464 45ZM495 55Q593 97 593 227Q593 270 571 306Q549 341 512 362Q475 383 429 383Z';
const FA = 'M50 123Q216 231 288 301Q336 348 373 408Q410 469 432 536Q453 603 453 669Q453 728 435 774Q417 819 383 845Q349 871 302 871Q284 871 264 867Q245 863 224 855Q181 839 158 814Q135 788 135 765Q135 756 143 752Q151 748 158 748Q168 748 183 752Q190 754 196 755Q203 756 210 756Q248 756 272 734Q296 711 296 674Q296 638 266 612Q236 586 195 586Q146 586 111 617Q76 648 76 697Q76 756 109 802Q142 848 198 874Q255 900 324 900Q400 900 460 867Q520 834 556 776Q591 719 591 646Q591 551 538 464Q511 419 476 379Q442 339 389 298Q336 256 256 208Q176 160 57 101ZM687 809Q710 809 726 793Q742 777 742 754Q742 731 726 716Q710 700 687 700Q664 700 648 716Q632 731 632 754Q632 777 648 793Q664 809 687 809ZM687 589Q710 589 726 573Q742 557 742 534Q742 511 726 496Q710 480 687 480Q664 480 648 496Q632 511 632 534Q632 557 648 573Q664 589 687 589Z';
const n1 = v => Math.round(v * 10) / 10;
const escX = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Un contorno de la fuente (unidades de 1000 por em, 1 em = 4 espacios; la línea base es la línea de abajo del pentagrama).
function glifo(d, x0, base, sp) {
  const k = sp / 250;
  let out = '';
  let modo = '';
  let par = 0;
  for (const tok of d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g)) {
    if (/[A-Za-z]/.test(tok)) { modo = tok; par = 0; out += tok; continue; }
    const v = Number(tok);
    if (modo === 'H') { out += n1(x0 + v * k) + ' '; continue; }
    if (modo === 'V') { out += n1(base - v * k) + ' '; continue; }
    out += (par % 2 === 0 ? n1(x0 + v * k) : n1(base - v * k)) + ' ';
    par++;
  }
  return out.trim();
}

// Cabeza de nota: una elipse inclinada (con dos arcos, para no usar transform).
function cabeza(x, y, rx, ry, ang, relleno, color, ancho = 1.7) {
  const r = ang * Math.PI / 180;
  const dx = rx * Math.cos(r), dy = rx * Math.sin(r);
  const d = `M${n1(x - dx)} ${n1(y - dy)}A${n1(rx)} ${n1(ry)} ${ang} 1 0 ${n1(x + dx)} ${n1(y + dy)}A${n1(rx)} ${n1(ry)} ${ang} 1 0 ${n1(x - dx)} ${n1(y - dy)}Z`;
  return `<path d="${d}" fill="${relleno ? color : PAPEL}" stroke="${color}" stroke-width="${ancho}"/>`;
}
function rombo(x, y, s, relleno, color) {
  return `<path d="M${n1(x - 0.68 * s)} ${n1(y)}L${n1(x)} ${n1(y - 0.52 * s)}L${n1(x + 0.68 * s)} ${n1(y)}L${n1(x)} ${n1(y + 0.52 * s)}Z" fill="${relleno ? color : PAPEL}" stroke="${color}" stroke-width="1.7"/>`;
}

function anchoTexto(t, tam) { return t.length * tam * 0.58; }

// Las posiciones: cada frase ocupa un ancho proporcional a sus palabras, con un mínimo para que nada se pise.
function ranuras(ws, disponible, sp, { kMin = 0.25, kMax = 1.05 } = {}, minimo = 0) {
  const min = Math.max(2.7 * sp, minimo);
  const total = ws.reduce((s, w) => s + w, 0) || 1;
  // k (píxeles por palabra): lo que cabe, entre un mínimo (si no cabe, la partitura se desplaza) y un máximo.
  let k = disponible / total;
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const fijas = ws.filter(w => w * k < min);
    const resto = ws.filter(w => w * k >= min).reduce((s, w) => s + w, 0);
    const libre = disponible - fijas.length * min;
    if (!resto || libre <= 0) break;
    k = libre / resto;
  }
  k = Math.min(Math.max(k, kMin * sp), kMax * sp);
  return ws.map(w => Math.max(min, w * k));
}

// opciones: { sp, ancho (el disponible), modelo (análisis del modelo), margen (2 o 0), clave, bajo, marcas,
//   barras (vista de barras), interactivo (data-i y zonas para el puntero), final (doble barra al terminar) }
export function partituraSVG(an, o = {}) {
  const sp = o.sp || 11;
  const conBajo = o.bajo !== false && !o.barras;
  const conClave = o.clave !== false && !o.barras;
  const marcas = o.marcas !== false && !o.barras;
  const M = o.modelo || null;
  const margen = o.margen ?? 2;
  const T = 4.6 * sp + 6;                       // primera línea de la clave de sol
  const B = T + 10 * sp;                        // primera línea de la clave de fa
  const alto = conBajo ? B + 5.8 * sp : T + 8.6 * sp;
  const SX = 22;                                 // donde empieza el pentagrama
  const X0 = SX + (conClave ? 4.4 * sp : 1.2 * sp);
  const F = an.frases;
  const A = an.abierta;
  // Las ranuras: las del modelo (si lo hay) y, después, las frases propias que sobran.
  const base = M ? M.frases.map(f => f.w) : F.map(f => f.w);
  const sobran = M ? F.slice(M.frases.length).map(f => f.w) : [];
  const ws = [...base, ...sobran, ...(A && !(M && F.length < M.frases.length) ? [Math.max(A.w, 3)] : [])];
  const disponible = Math.max(120, (o.ancho || 900) - X0 - 3.2 * sp);
  const anchos = ranuras(ws.length ? ws : [6], disponible, sp, o.k || {}, o.minRanura || 0);
  const xs = [];
  let x = X0;
  const bordes = anchos.map(a => { const r = [x, x + a]; xs.push(x + a / 2); x += a; return r; });
  const ancho = Math.max(o.ancho || 0, x + 3.2 * sp);
  const X1 = ancho - 8;
  const out = [];
  const arriba = [];
  const enBajo = conBajo;
  const fondoAlto = enBajo ? B + 4 * sp : T + 4 * sp;

  // y de una frase: más palabras, más arriba (cada media línea cuenta); desde 54 palabras, en la primera línea adicional.
  const yNota = w => {
    const crudo = T + 5 * sp - w * (5 * sp / 45);
    return Math.max(T + Math.round((crudo - T) / (sp / 2)) * (sp / 2), T - sp);
  };
  const yPar = w => {
    const crudo = B + 5 * sp - w * (5 * sp / 110);
    return Math.max(B + Math.round((crudo - B) / (sp / 2)) * (sp / 2), B - sp);
  };

  // pentagramas
  if (!o.barras) for (let k = 0; k < 5; k++) out.push(`<line x1="${SX}" y1="${n1(T + k * sp)}" x2="${n1(X1)}" y2="${n1(T + k * sp)}" stroke="${PAUTA}" stroke-width="1"/>`);
  if (enBajo) for (let k = 0; k < 5; k++) out.push(`<line x1="${SX}" y1="${n1(B + k * sp)}" x2="${n1(X1)}" y2="${n1(B + k * sp)}" stroke="${PAUTA}" stroke-width="1"/>`);
  if (!o.barras) out.push(`<line x1="${SX}" y1="${n1(T)}" x2="${SX}" y2="${n1(fondoAlto)}" stroke="${TINTA}" stroke-width="1.3"/>`);
  if (enBajo) {
    const m = (T + fondoAlto) / 2;
    out.push(`<path d="M${SX - 5} ${n1(T)}Q${SX - 12} ${n1(T)} ${SX - 12} ${n1(T + 2 * sp)}L${SX - 12} ${n1(m - 2 * sp)}Q${SX - 12} ${n1(m)} ${SX - 18} ${n1(m)}Q${SX - 12} ${n1(m)} ${SX - 12} ${n1(m + 2 * sp)}L${SX - 12} ${n1(fondoAlto - 2 * sp)}Q${SX - 12} ${n1(fondoAlto)} ${SX - 5} ${n1(fondoAlto)}" fill="none" stroke="${TINTA}" stroke-width="2.2" stroke-linecap="round"/>`);
  }
  if (conClave) {
    out.push(`<path d="${glifo(SOL, SX + 0.15 * sp, T + 4 * sp, sp)}" fill="${TINTA}"/>`);
    if (enBajo) out.push(`<path d="${glifo(FA, SX + 0.3 * sp, B + 4 * sp, sp)}" fill="${TINTA}"/>`);
  }

  // bandas de las rachas (detrás de las notas) y su corchete con el nombre (debajo del pentagrama)
  if (!o.barras) {
    for (const r of an.rachas) {
      if (r.desde >= bordes.length) continue;
      const P = PATRONES[r.pat];
      const a = bordes[r.desde][0] + 2, b = bordes[Math.min(r.hasta, bordes.length - 1)][1] - 2;
      out.push(`<rect x="${n1(a)}" y="${n1(T - 0.8 * sp)}" width="${n1(b - a)}" height="${n1(5.6 * sp)}" rx="6" fill="${P.banda}" fill-opacity="${r.pat === 'monotonia' ? 0.08 : 0.1}"/>`);
      const yb = T + 7.2 * sp;
      arriba.push(`<path d="M${n1(a)} ${n1(yb - 0.45 * sp)}L${n1(a)} ${n1(yb)}L${n1(b)} ${n1(yb)}L${n1(b)} ${n1(yb - 0.45 * sp)}" fill="none" stroke="${P.nota}" stroke-width="1.4"/>`);
      const tam = Math.max(8.5, sp * 0.82);
      const nombre = P.nombre.toUpperCase();
      const etiqueta = anchoTexto(nombre, tam) + 6 < b - a ? nombre : anchoTexto(nombre.slice(0, 4) + '.', tam) + 4 < b - a ? nombre.slice(0, 4) + '.' : '';
      if (etiqueta && sp >= 7) arriba.push(`<text x="${n1((a + b) / 2)}" y="${n1(yb + 1.15 * sp)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="${n1(tam)}" letter-spacing="1" fill="${P.texto}">${etiqueta}</text>`);
    }
  }

  // barras de compás (párrafos) y doble barra entre secciones
  const barra = (FF, gris) => {
    for (let i = 1; i < Math.min(FF.length, bordes.length); i++) {
      if (FF[i].p === FF[i - 1].p) continue;
      const bx = bordes[i][0];
      const sec = (FF === F ? an : M)?.parrafos?.find(pp => pp.frases[0] === i)?.seccion;
      out.push(`<line x1="${n1(bx)}" y1="${n1(T)}" x2="${n1(bx)}" y2="${n1(fondoAlto)}" stroke="${gris ? GRIS : TINTA}" stroke-width="1.1"${gris ? ' stroke-dasharray="3 3"' : ''}/>`);
      if (sec && !gris) out.push(`<line x1="${n1(bx - 4)}" y1="${n1(T)}" x2="${n1(bx - 4)}" y2="${n1(fondoAlto)}" stroke="${TINTA}" stroke-width="1.1"/>`);
    }
  };

  // la clave de fa: una nota sostenida por párrafo
  const bajo = (AN, gris) => {
    if (!enBajo || o.barras) return;
    for (const par of AN.parrafos) {
      const idx = par.frases.filter(i => i < bordes.length);
      if (!idx.length) continue;
      const a = bordes[idx[0]][0], b = bordes[idx[idx.length - 1]][1];
      const y = yPar(par.w);
      const color = gris ? GRIS : AZUL;
      const num = String(par.w);
      const tam = Math.max(8.5, sp * 0.8);
      const conNum = !gris && b - a > anchoTexto(num, tam) + 3.4 * sp;
      const fin = b - 0.8 * sp - (conNum ? anchoTexto(num, tam) + 4 : 0);
      if (y <= B - sp + 0.01) out.push(`<line x1="${n1(a + 0.9 * sp - 1.05 * sp)}" y1="${n1(B - sp)}" x2="${n1(a + 0.9 * sp + 1.05 * sp)}" y2="${n1(B - sp)}" stroke="#8A8478" stroke-width="1.2"/>`);
      if (y >= B + 5 * sp - 0.01) out.push(`<line x1="${n1(a + 0.9 * sp - 1.05 * sp)}" y1="${n1(B + 5 * sp)}" x2="${n1(a + 0.9 * sp + 1.05 * sp)}" y2="${n1(B + 5 * sp)}" stroke="#8A8478" stroke-width="1.2"/>`);
      if (fin > a + 1.6 * sp) out.push(`<rect x="${n1(a + 0.9 * sp)}" y="${n1(y - 0.2 * sp)}" width="${n1(fin - a - 0.9 * sp)}" height="${n1(0.4 * sp)}" rx="${n1(0.2 * sp)}" fill="${color}" fill-opacity="${gris ? 0.35 : 0.3}"/>`);
      out.push(cabeza(a + 0.9 * sp, y, 0.72 * sp, 0.46 * sp, -20, false, color));
      if (conNum) out.push(`<text x="${n1(b - 0.6 * sp)}" y="${n1(y + 0.32 * sp)}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="${n1(tam)}" fill="${TENUE}">${num}</text>`);
    }
  };

  // una nota
  const nota = (i, w, color, { dial = false, gris = false, abierta = false } = {}) => {
    const xc = xs[i];
    const y = yNota(w);
    const fig = figuraDe(w);
    const hueca = fig >= 3 || abierta;
    const g = [];
    const lin = gris ? GRIS : '#8A8478';
    for (let yy = T - sp; y <= yy + 0.01; yy -= sp) g.push(`<line x1="${n1(xc - 1.05 * sp)}" y1="${n1(yy)}" x2="${n1(xc + 1.05 * sp)}" y2="${n1(yy)}" stroke="${lin}" stroke-width="1.2"/>`);
    if (y >= T + 5 * sp - 0.01) g.push(`<line x1="${n1(xc - 1.05 * sp)}" y1="${n1(T + 5 * sp)}" x2="${n1(xc + 1.05 * sp)}" y2="${n1(T + 5 * sp)}" stroke="${lin}" stroke-width="1.2"/>`);
    const rx = 0.62 * sp;
    if (fig < 4 && !o.barras) {
      const abajo = y < T + 2 * sp;
      const sx = abajo ? xc - rx + 0.7 : xc + rx - 0.7;
      const y2 = abajo ? y + 3.4 * sp : y - 3.4 * sp;
      g.push(`<line x1="${n1(sx)}" y1="${n1(y)}" x2="${n1(sx)}" y2="${n1(y2)}" stroke="${color}" stroke-width="1.5"${abierta ? ' stroke-dasharray="2.5 2"' : ''}/>`);
      const banderas = fig === 0 ? 2 : fig === 1 ? 1 : 0;
      for (let k = 0; k < banderas; k++) {
        const yb = abajo ? y2 - k * 0.8 * sp : y2 + k * 0.8 * sp;
        const s = abajo ? -1 : 1;
        g.push(`<path d="M${n1(sx)} ${n1(yb)}C${n1(sx + 0.2 * sp)} ${n1(yb + s * 0.9 * sp)} ${n1(sx + 1.1 * sp)} ${n1(yb + s * 1.2 * sp)} ${n1(sx + 0.8 * sp)} ${n1(yb + s * 2.3 * sp)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`);
      }
    }
    if (abierta) g.push(`<path d="M${n1(xc - rx)} ${n1(y)}a${n1(rx)} ${n1(0.44 * sp)} 0 1 0 ${n1(2 * rx)} 0a${n1(rx)} ${n1(0.44 * sp)} 0 1 0 ${n1(-2 * rx)} 0" fill="${PAPEL}" stroke="#8A8478" stroke-width="1.6" stroke-dasharray="2.5 2"/>`);
    else if (dial) g.push(rombo(xc, y, sp, !hueca, color));
    else if (fig === 4) g.push(cabeza(xc, y, 0.8 * sp, 0.5 * sp, -12, false, color, 2));
    else g.push(cabeza(xc, y, rx, 0.44 * sp, -20, !hueca, color));
    return { y, g };
  };

  // signos sobre la nota: final (?, !, …), pausas internas y el laberinto. Cada uno en su carril; si no cabe, se resume.
  const signos = (i, f) => {
    const xc = xs[i];
    const anchoR = bordes[i][1] - bordes[i][0] - 4;
    const g = [];
    const yf = T - 2.15 * sp;
    if (f.fin === '…') {
      g.push(`<path d="M${n1(xc - 0.7 * sp)} ${n1(yf + 0.2 * sp)}A${n1(0.7 * sp)} ${n1(0.7 * sp)} 0 0 1 ${n1(xc + 0.7 * sp)} ${n1(yf + 0.2 * sp)}" fill="none" stroke="#3F3A47" stroke-width="1.6"/><circle cx="${n1(xc)}" cy="${n1(yf)}" r="${n1(0.14 * sp)}" fill="#3F3A47"/>`);
    } else if (f.fin === '?' || (f.t && f.t.includes('?'))) {
      g.push(`<text x="${n1(xc)}" y="${n1(yf + 0.45 * sp)}" text-anchor="middle" font-family="Literata, serif" font-weight="700" font-size="${n1(1.15 * sp)}" fill="#3F3A47">?</text>`);
    } else if (f.fin === '!' || (f.t && f.t.includes('!'))) {
      g.push(`<path d="M${n1(xc - 0.55 * sp)} ${n1(yf - 0.35 * sp)}L${n1(xc + 0.55 * sp)} ${n1(yf)}L${n1(xc - 0.55 * sp)} ${n1(yf + 0.35 * sp)}" fill="none" stroke="#3F3A47" stroke-width="1.6"/>`);
    }
    const pz = f.pausas;
    if (f.tot) {
      const partes = [];
      if (pz.coma) partes.push(pz.coma <= 3 ? Array(pz.coma).fill(',').join(' ') : `,×${pz.coma}`);
      for (let k = 0; k < pz.pc; k++) partes.push('//');
      for (let k = 0; k < pz.dp; k++) partes.push(':');
      for (let k = 0; k < pz.par; k++) partes.push('( )');
      for (let k = 0; k < pz.raya; k++) partes.push('—');
      const tam = 1.1 * sp;
      let txt = partes.join(' ');
      if (anchoTexto(txt, tam) > anchoR) txt = String(f.tot);
      g.push(`<text x="${n1(xc)}" y="${n1(T - 3.15 * sp)}" text-anchor="middle" font-family="Literata, serif" font-weight="700" font-size="${n1(tam)}" fill="${TENUE}">${escX(txt)}</text>`);
    }
    if (f.tot >= LABERINTO && anchoR > 2.3 * sp) {
      const y = T - 4.05 * sp, x0 = xc - 1.05 * sp;
      let d = `M${n1(x0 + 0.95 * sp)} ${n1(y - 0.28 * sp)}`;
      for (let k = 0; k < 2; k++) d += `q${n1(0.15 * sp)} ${n1(-0.3 * sp)} ${n1(0.3 * sp)} 0q${n1(0.15 * sp)} ${n1(0.3 * sp)} ${n1(0.3 * sp)} 0`;
      g.push(`<text x="${n1(x0)}" y="${n1(y)}" font-family="Literata, serif" font-style="italic" font-weight="700" font-size="${n1(0.95 * sp)}" fill="#3F3A47">tr</text><path d="${d}" fill="none" stroke="#3F3A47" stroke-width="1.3"/>`);
    }
    return g;
  };

  const notas = [];
  const pts = [];
  if (o.barras) {
    // vista de barras: una barra por frase, con la media punteada
    const maxW = Math.max(40, ...F.map(f => f.w), ...(M ? M.frases.map(f => f.w) : []));
    const yB = w => T + 6.5 * sp - (w / maxW) * (9 * sp);
    const lin = v => out.push(`<line x1="${n1(X0 - 0.3 * sp)}" y1="${n1(yB(v))}" x2="${n1(X1)}" y2="${n1(yB(v))}" stroke="#ECE7DF" stroke-width="1"/><text x="${n1(X0 - 0.6 * sp)}" y="${n1(yB(v) + 3)}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="9" fill="${TENUE}">${v}</text>`);
    [10, 20, 30, 40, 60].filter(v => v <= maxW).forEach(lin);
    const barraDe = (i, w, color, op) => {
      const [a, b] = bordes[i];
      const ancho = Math.max(2, Math.min(b - a - 4, 3.2 * sp));
      const xc = (a + b) / 2;
      return `<rect x="${n1(xc - ancho / 2)}" y="${n1(yB(w))}" width="${n1(ancho)}" height="${n1(T + 6.5 * sp - yB(w))}" rx="2" fill="${color}" fill-opacity="${op}"/>`;
    };
    if (M) M.frases.forEach((f, i) => notas.push({ i: null, g: [barraDe(i, f.w, GRIS, 0.5)] }));
    F.forEach((f, i) => { if (i < bordes.length) notas.push({ i, g: [barraDe(i, f.w, f.pat ? PATRONES[f.pat].nota : TINTA, f.pat ? 0.9 : 0.75)] }); });
    if (F.length) {
      const media = F.reduce((s, f) => s + f.w, 0) / F.length;
      out.push(`<line x1="${n1(X0)}" y1="${n1(yB(media))}" x2="${n1(X1)}" y2="${n1(yB(media))}" stroke="${TINTA}" stroke-width="1" stroke-dasharray="4 4" opacity=".55"/>`);
    }
    out.push(`<line x1="${n1(X0 - 0.3 * sp)}" y1="${n1(T + 6.5 * sp)}" x2="${n1(X1)}" y2="${n1(T + 6.5 * sp)}" stroke="${TINTA}" stroke-width="1"/>`);
    // los párrafos, como en la partitura: una línea entre uno y otro
    for (let i = 1; i < Math.min(F.length, bordes.length); i++) if (F[i].p !== F[i - 1].p) out.push(`<line x1="${n1(bordes[i][0])}" y1="${n1(T - 2.5 * sp)}" x2="${n1(bordes[i][0])}" y2="${n1(T + 6.5 * sp)}" stroke="${PAUTA}" stroke-width="1"/>`);
  } else {
    if (M) {
      barra(M.frases, true);
      bajo(M, true);
      const gp = [];
      // Las notas del modelo que todavía no tienen frase propia también responden al puntero.
      M.frases.forEach((f, i) => { const r = nota(i, f.w, GRIS, { dial: f.dial, gris: true }); notas.push({ i: i > F.length || (i === F.length && !A) ? `m${i}` : null, g: r.g }); gp.push([xs[i], r.y]); });
      out.push(curva(gp, GRIS, true));
    }
    barra(F, false);
    bajo(an, false);
    F.forEach((f, i) => {
      if (i >= bordes.length) return;
      const color = f.pat ? PATRONES[f.pat].nota : TINTA;
      const r = nota(i, f.w, color, { dial: f.dial });
      if (marcas) r.g.push(...signos(i, f));
      if (M && i < M.frases.length) {
        const ok = Math.abs(f.w - M.frases[i].w) <= margen;
        r.g.push(`<text x="${n1(xs[i])}" y="${n1(T + 6.4 * sp)}" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${n1(1.2 * sp)}" fill="${ok ? VERDE : GRIS}">${ok ? '✓' : '·'}</text>`);
      }
      notas.push({ i, g: r.g });
      pts.push([xs[i], r.y]);
    });
    if (A) {
      const i = F.length;
      if (i < bordes.length) {
        const r = nota(i, A.w, '#8A8478', { abierta: true });
        r.g.push(`<text x="${n1(xs[i])}" y="${n1(T - 3.15 * sp)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="${n1(0.9 * sp)}" fill="${TENUE}">${A.w}…</text>`);
        notas.push({ i: 'a', g: r.g });
        pts.push([xs[i], r.y]);
      }
    }
  }
  if (!o.barras && pts.length > 1) out.push(curva(pts, TINTA, false));
  // doble barra: al final del texto, o del modelo
  const finX = M ? bordes[M.frases.length - 1]?.[1] : (o.final && !A ? bordes[bordes.length - 1]?.[1] : null);
  if (finX && !o.barras) out.push(`<line x1="${n1(finX - 4)}" y1="${n1(T)}" x2="${n1(finX - 4)}" y2="${n1(fondoAlto)}" stroke="${TINTA}" stroke-width="1.1"/><rect x="${n1(finX - 1)}" y="${n1(T)}" width="3.5" height="${n1(fondoAlto - T)}" fill="${TINTA}"/>`);

  const cuerpo = notas.map(n => {
    if (!o.interactivo || n.i === null) return n.g.join('');
    const k = n.i === 'a' ? F.length : typeof n.i === 'string' ? Number(n.i.slice(1)) : n.i;
    const [a, b] = bordes[k];
    return `<g class="pt-n${typeof n.i === 'string' && n.i[0] === 'm' ? ' pt-gm' : ''}" data-i="${k}"><rect class="pt-zona" x="${n1(a)}" y="0" width="${n1(b - a)}" height="${n1(alto)}" fill="transparent"/>${n.g.join('')}</g>`;
  }).join('');
  const marcador = o.interactivo
    ? `<rect class="pt-resalte" x="0" y="${n1(T - 4.5 * sp)}" width="0" height="${n1(fondoAlto - T + 4.9 * sp)}" rx="5" fill="#FFD84D" fill-opacity=".3"/>` : '';
  const cabezal = o.interactivo
    ? `<g class="pt-cabezal" opacity="0"><line x1="0" y1="${n1(T - 4.4 * sp)}" x2="0" y2="${n1(fondoAlto + 0.6 * sp)}" stroke="#FF6B4A" stroke-width="2"/><path d="M-5 ${n1(T - 4.4 * sp - 7)}L5 ${n1(T - 4.4 * sp - 7)}L0 ${n1(T - 4.4 * sp)}Z" fill="#FF6B4A"/></g>` : '';
  const svg = `<svg class="pt-svg" viewBox="0 0 ${n1(ancho)} ${n1(alto)}" width="${n1(ancho)}" height="${n1(alto)}" role="img" aria-label="${escX(o.etiqueta || `Partitura: ${F.length} frases`)}">${marcador}${out.join('')}${cuerpo}${arriba.join('')}${cabezal}</svg>`;
  return { svg, ancho, alto, xs, bordes, T, sp };
}

function curva(pts, color, punteada) {
  if (pts.length < 2) return '';
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${n1(p1[0] + (p2[0] - p0[0]) / 6)} ${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)} ${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return punteada
    ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="4 4"/>`
    : `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".24" stroke-width="2.4" stroke-linecap="round"/>`;
}

// La partitura en renglones (como una partitura impresa): para la vista publicada y el PDF.
export function sistemasSVG(an, { ancho = 900, sp = 10, modelo = null, margen = 2 } = {}) {
  const F = an.frases;
  const n = Math.max(F.length, modelo?.frases.length || 0);
  if (!n) return '';
  const wDe = i => (modelo && i < modelo.frases.length ? modelo.frases[i].w : F[i].w);
  const k = 0.6 * sp;
  const util = ancho - 22 - 4.4 * sp - 2 * sp;
  const grupos = [];
  let actual = [];
  let usado = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(2.7 * sp, wDe(i) * k);
    if (actual.length && usado + a > util) { grupos.push(actual); actual = []; usado = 0; }
    actual.push(i);
    usado += a;
  }
  if (actual.length) grupos.push(actual);
  return grupos.map((g, gi) => {
    const sub = recorte(an, g[0], g[g.length - 1]);
    const subM = modelo ? recorte(modelo, g[0], Math.min(g[g.length - 1], modelo.frases.length - 1)) : null;
    const ultimo = gi === grupos.length - 1;
    return partituraSVG(sub, { sp, ancho, modelo: subM && subM.frases.length ? subM : null, margen, final: ultimo, k: { kMin: 0.6, kMax: 0.6 } }).svg;
  }).join('');
}
// Un tramo de frases como análisis propio (las posiciones de las rachas y los párrafos se rehacen).
function recorte(an, desde, hasta) {
  const frases = an.frases.slice(desde, hasta + 1).map((f, k) => ({ ...f, i: k }));
  const parrafos = [];
  for (const f of frases) {
    let par = parrafos[parrafos.length - 1];
    if (!par || par._p !== f.p) {
      const orig = an.parrafos.find(pp => pp.frases.includes(f.i + desde));
      par = { _p: f.p, w: orig ? orig.w : 0, frases: [], seccion: !!orig?.seccion && orig.frases[0] === f.i + desde };
      parrafos.push(par);
    }
    par.frases.push(f.i);
  }
  const rachas = an.rachas.filter(r => r.hasta >= desde && r.desde <= hasta)
    .map(r => ({ ...r, desde: Math.max(0, r.desde - desde), hasta: Math.min(hasta, r.hasta) - desde }));
  return { frases, parrafos, rachas, abierta: null, palabras: frases.reduce((s, f) => s + f.w, 0) };
}

// La miniatura: el texto entero, una barrita por frase, con la ventana visible y el cabezal.
export function minimapaSVG(an, { ancho = 900, alto = 40, modelo = null } = {}) {
  const base = modelo || an;
  const F = base.frases;
  if (!F.length) return { svg: '', xs: [] };
  const total = F.reduce((s, f) => s + f.w, 0) || 1;
  const maxW = Math.max(...F.map(f => f.w), 1);
  let x = 6;
  const out = [`<rect x="0" y="0" width="${ancho}" height="${alto}" rx="10" fill="#ECE7DF"/>`];
  const xs = [];
  F.forEach((f, i) => {
    const a = (ancho - 12) * f.w / total;
    if (i > 0 && f.p !== F[i - 1].p) out.push(`<line x1="${n1(x)}" y1="5" x2="${n1(x)}" y2="${alto - 4}" stroke="#F4F1EC" stroke-width="2"/>`);
    const h = (alto - 14) * f.w / maxW;
    const propia = modelo ? an.frases[i] : f;
    const color = modelo ? (propia ? (propia.pat ? PATRONES[propia.pat].nota : TENUE) : GRIS) : (f.pat ? PATRONES[f.pat].nota : TENUE);
    out.push(`<rect x="${n1(x + 0.6)}" y="${n1(alto - 6 - h)}" width="${n1(Math.max(1.2, a - 1.2))}" height="${n1(h)}" rx="1.5" fill="${color}"/>`);
    xs.push([x, x + a]);
    x += a;
  });
  return { svg: `<svg class="pt-mm" viewBox="0 0 ${ancho} ${alto}" width="100%" height="${alto}" preserveAspectRatio="none" role="img" aria-label="El texto entero en miniatura">${out.join('')}<rect class="pt-mm-ventana" x="0" y="2" width="0" height="${alto - 4}" rx="7" fill="#2E4A7D" fill-opacity=".07" stroke="#2E4A7D" stroke-width="1.5"/><line class="pt-mm-cabezal" x1="-10" y1="1" x2="-10" y2="${alto - 1}" stroke="#FF6B4A" stroke-width="2"/></svg>`, xs };
}
