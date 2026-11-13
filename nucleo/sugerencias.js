// Cambios sugeridos por el tutor: la lógica (sin interfaz; la interfaz está en vistas/sugerencias.js).
//
// El texto de una entrega se mira como se lee, con un salto de línea («\n») entre párrafos: así se
// sabe en qué párrafo cae cada cambio. Un cambio es { id, inicio, fin, antes, despues, estado }, con
// las posiciones sobre ese texto (la «base» de la ronda). Al aceptar, el cambio se aplica a la vista
// (sin tocar su estructura: colores, cursivas, párrafos), al texto plano y, según la dinámica, a los
// datos con que el módulo vuelve a abrir la entrega para editarla.
import { nodosTexto, baseDe, tramosIguales, mapear } from './anclas.js';
import { sanitizar } from './ui.js';

// Dinámicas donde el tutor puede sugerir cambios (las demás arman su texto con piezas: solo comentarios).
export const SUGERIBLES = new Set(['reto', 'consignas', 'maraton', 'correo-secretos', 'juego-de-dados', 'fachadas', 'contrapuntos']);
// Lo que se lee pero no es de quien escribe: no se edita.
export const NO_EDITABLE = '.v-credito, .cs-epigrafe, .v-rotulo';

const BLOQUE = 'p, div, li, blockquote, h1, h2, h3, h4, h5, h6, figure, figcaption, pre, section, article, ul, ol';

// El texto con «\n» entre bloques y las piezas (nodos de texto) que lo forman.
export function piezasDe(raiz) {
  let texto = '', prev;
  const piezas = [];
  for (const n of nodosTexto(raiz)) {
    const padre = n.parentElement;
    // el espacio entre bloques no es texto
    if (!n.data.trim() && (padre === raiz || [...padre.children].some(c => c.matches(BLOQUE)))) continue;
    const bl = padre?.closest(BLOQUE);
    const bloque = bl && bl !== raiz && raiz.contains(bl) ? bl : raiz;
    if (piezas.length && bloque !== prev) texto += '\n';
    piezas.push({ nodo: n, ini: texto.length, len: n.data.length });
    texto += n.data;
    prev = bloque;
  }
  return { texto: texto.replace(/ /g, ' '), piezas };
}
const div = html => Object.assign(document.createElement('div'), { innerHTML: sanitizar(html || '') });
export const textoDe = html => piezasDe(div(html)).texto;
export const baseDeEntrega = e => textoDe(baseDe(e));

// Dónde cae una posición: el primer nodo que la contiene (en el borde entre dos nodos del mismo
// párrafo, el de antes; después de un salto de párrafo, el del párrafo nuevo).
function lugar(piezas, p) {
  for (const x of piezas) if (p >= x.ini && p <= x.ini + x.len) return { nodo: x.nodo, off: p - x.ini };
  const u = piezas[piezas.length - 1];
  return u ? { nodo: u.nodo, off: u.len } : null;
}

// ---------------------------------------------------------------------
// De dos versiones a una lista de cambios
// ---------------------------------------------------------------------
export function cambiosDe(base, nuevo) {
  const ig = tramosIguales(base, nuevo);
  const huecos = [];
  let a = 0, b = 0;
  for (const [x, y, L] of [...ig, [base.length, nuevo.length, 0]]) {
    if (x > a || y > b) huecos.push({ inicio: a, fin: x, ni: b, nf: y });
    a = Math.max(a, x + L); b = Math.max(b, y + L);
  }
  // Una frase reescrita es un solo cambio: se juntan los que solo separa un espacio.
  const out = [];
  for (const h of huecos) {
    const u = out[out.length - 1];
    const entre = u && base.slice(u.fin, h.inicio);
    if (u && /^[ \t]{1,2}$/.test(entre) && entre === nuevo.slice(u.nf, h.ni)) { u.fin = h.fin; u.nf = h.nf; }
    else out.push({ ...h });
  }
  return out.map(h => ({ inicio: h.inicio, fin: h.fin, antes: base.slice(h.inicio, h.fin), despues: nuevo.slice(h.ni, h.nf) }));
}

// ---------------------------------------------------------------------
// Aplicar cambios
// ---------------------------------------------------------------------
const ordenar = cs => [...cs].sort((x, y) => y.inicio - x.inicio || y.fin - x.fin);
const sinSaltos = t => String(t || '').replace(/\s*\n\s*/g, ' ');

// Sobre los nodos de texto de una raíz: borra lo de [inicio, fin) y pone «despues» donde empezaba.
export function aplicarDOM(raiz, cambios) {
  for (const c of ordenar(cambios)) {
    const { piezas } = piezasDe(raiz);
    const donde = lugar(piezas, c.inicio);
    for (const x of piezas) {
      const s = Math.max(c.inicio, x.ini), f = Math.min(c.fin, x.ini + x.len);
      if (f > s) x.nodo.deleteData(s - x.ini, f - s);
    }
    const d = sinSaltos(c.despues);
    if (d && donde) donde.nodo.insertData(Math.min(donde.off, donde.nodo.data.length), d);
    else if (d) raiz.appendChild(document.createTextNode(d));
  }
  return raiz;
}
export const aplicarHTML = (html, cambios) => aplicarDOM(div(html), cambios).innerHTML;

// Sobre un texto plano que se parece al de la vista (por ejemplo, con «\n\n» entre párrafos).
export function aplicarTexto(plano, tv, cambios) {
  const ig = tramosIguales(tv, plano);
  let t = plano;
  for (const c of ordenar(cambios)) {
    const i = mapear(ig, c.inicio, 'inicio', plano.length);
    const f = c.fin > c.inicio ? Math.max(i, mapear(ig, c.fin, 'fin', plano.length)) : i;
    t = t.slice(0, i) + sinSaltos(c.despues) + t.slice(f);
  }
  return t;
}
// Sobre un texto que se lee igual que la base (aquí sí se pueden calcular las posiciones exactas).
export function aplicarCadena(t, cambios) {
  for (const c of ordenar(cambios)) t = t.slice(0, c.inicio) + sinSaltos(c.despues) + t.slice(c.fin);
  return t;
}

// Los tramos de color de Contrapuntos ([inicio, fin, 'v' | 's'] sobre la historia) siguen al texto;
// lo que cambió dentro de un parlamento de la voz pasa a ser propio (como en el módulo).
function moverTramos(tramos, viejo, nuevo) {
  const ig = tramosIguales(viejo, nuevo);
  const out = [];
  for (const t of Array.isArray(tramos) ? tramos : []) {
    for (const [a, b, L] of ig) {
      const s = Math.max(t[0], a), f = Math.min(t[1], a + L);
      if (f <= s) continue;
      const u = out[out.length - 1];
      const ni = b + (s - a), nf = b + (f - a);
      if (u && u[2] === t[2] && u[1] === ni) u[1] = nf;
      else out.push([ni, nf, t[2]]);
    }
  }
  return out;
}

// Lo que queda de una entrega al aceptar unos cambios: { texto, vista, datos }.
export async function aplicarAEntrega(e, cambios) {
  const vistaBase = baseDe(e);
  const tv = textoDe(vistaBase);
  const datos = e.datos && typeof e.datos === 'object' ? { ...e.datos } : {};
  if (e.dinamica === 'contrapuntos' && typeof datos.historia === 'string') {
    const cp = await import('../modulos/contrapuntos.js');
    const historia = aplicarTexto(datos.historia, tv, cambios);
    const nuevos = { ...datos, historia, tramos: moverTramos(datos.tramos, datos.historia, historia) };
    return { texto: `${historia}\n\n${cp.creditoDe(datos.banco)}`, vista: cp.vistaHTML(nuevos), datos: nuevos };
  }
  const vista = aplicarHTML(vistaBase, cambios);
  const texto = aplicarTexto(e.texto || '', tv, cambios);
  // Correo de secretos, Juego de dados y Fachadas reabren el texto desde datos.html, que es una parte de la vista.
  if (typeof datos.html === 'string' && datos.html) {
    const th = textoDe(datos.html);
    const off = tv.indexOf(th);
    if (off >= 0) {
      const dentro = cambios.filter(c => c.inicio >= off && c.fin <= off + th.length)
        .map(c => ({ ...c, inicio: c.inicio - off, fin: c.fin - off }));
      datos.html = aplicarHTML(datos.html, dentro);
    } else {
      console.warn('Sugerencias: no se encontró datos.html en la vista; se edita solo la vista.');
    }
  }
  return { texto, vista, datos: Object.keys(datos).length ? datos : (e.datos ?? {}) };
}

// ---------------------------------------------------------------------
// Ver los cambios sobre el texto: lo quitado tachado, lo agregado en color
// ---------------------------------------------------------------------
export function marcarHTML(baseHTML, cambios) {
  const raiz = div(baseHTML);
  for (const c of ordenar(cambios)) {
    let { piezas } = piezasDe(raiz);
    // cortar los nodos en los bordes del cambio
    for (const x of piezas) {
      const fx = x.ini + x.len;
      if (c.fin > x.ini && c.fin < fx) x.nodo.splitText(c.fin - x.ini);
      if (c.inicio > x.ini && c.inicio < fx) x.nodo.splitText(c.inicio - x.ini);
    }
    ({ piezas } = piezasDe(raiz));
    const dels = [];
    for (const x of piezas) {
      if (x.ini >= c.inicio && x.ini + x.len <= c.fin && x.len) {
        const d = document.createElement('del');
        d.className = 'sg-del';
        d.dataset.sg = c.id;
        x.nodo.replaceWith(d);
        d.appendChild(x.nodo);
        dels.push(d);
      }
    }
    const despues = sinSaltos(c.despues);
    if (!despues) {
      if (!dels.length) continue;
      continue;
    }
    const ins = document.createElement('ins');
    ins.className = 'sg-ins';
    ins.dataset.sg = c.id;
    ins.textContent = despues;
    if (dels.length) { dels[dels.length - 1].after(ins); continue; }
    const donde = lugar(piezas, c.inicio);
    if (!donde) { raiz.appendChild(ins); continue; }
    const n = donde.nodo;
    if (donde.off <= 0) n.before(ins);
    else if (donde.off >= n.data.length) n.after(ins);
    else { n.splitText(donde.off); n.after(ins); }
  }
  return raiz.innerHTML;
}

// ---------------------------------------------------------------------
// Rondas
// ---------------------------------------------------------------------
export const pendientes = s => (s?.cambios || []).filter(c => c.estado === 'pendiente');

// Si el texto cambió desde que se hicieron los cambios (el autor lo editó), se mueven con él;
// los que tocaban algo que ya no está igual quedan «caduco» (ya no aplica).
export function reanclarCambios(cambios, viejo, nuevo) {
  if (viejo === nuevo) return cambios;
  const ig = tramosIguales(viejo, nuevo);
  return cambios.map(c => {
    if (c.estado !== 'pendiente') return c;
    const i = mapear(ig, c.inicio, 'inicio', nuevo.length);
    const f = c.fin > c.inicio ? mapear(ig, c.fin, 'fin', nuevo.length) : i;
    if (nuevo.slice(i, f) !== c.antes) return { ...c, estado: 'caduco' };
    return { ...c, inicio: i, fin: f };
  });
}

// Corre los cambios que quedan pendientes cuando se aplican otros antes de ellos.
export function desplazar(cambios, aplicados) {
  return cambios.map(c => {
    if (c.estado !== 'pendiente') return c;
    let d = 0;
    for (const a of aplicados) if (a.id !== c.id && a.fin <= c.inicio) d += sinSaltos(a.despues).length - a.antes.length;
    return d ? { ...c, inicio: c.inicio + d, fin: c.fin + d } : c;
  });
}

// El autor decide: { aceptar: [ids], rechazar: [ids] }. Devuelve lo que hay que guardar y la entrega nueva.
export async function decidir(e, ronda, { aceptar = [], rechazar = [] }) {
  const actual = baseDeEntrega(e);
  let cambios = reanclarCambios(ronda.cambios, ronda.base, actual);
  const acepta = cambios.filter(c => c.estado === 'pendiente' && aceptar.includes(c.id));
  cambios = cambios.map(c => c.estado !== 'pendiente' ? c
    : aceptar.includes(c.id) ? { ...c, estado: 'aceptado' }
    : rechazar.includes(c.id) ? { ...c, estado: 'rechazado' } : c);
  let entrega = null, base = actual;
  if (acepta.length) {
    entrega = await aplicarAEntrega(e, acepta);
    cambios = desplazar(cambios, acepta);
    const esperado = aplicarCadena(actual, acepta);
    base = textoDe(entrega.vista);
    cambios = reanclarCambios(cambios, esperado, base);
  }
  return { cambios, base, entrega };
}
