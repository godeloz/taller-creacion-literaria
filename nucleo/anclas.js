// Anclas de las notas: posiciones de un fragmento en el texto tal como se lee.
// Se cuentan los caracteres de los nodos de texto de la vista (sin los números de las notas,
// sin los dibujos SVG y sin lo que la entrega oculta). Lo usan la lectura crítica (pintar las
// marcas) y la edición de una entrega (reubicar las notas cuando el texto cambia).
import { estado } from './estado.js';
import { sanitizar, parrafos } from './ui.js';

// Lo que no cuenta como texto: los números de las notas, los dibujos y las líneas ocultas de algunas vistas
// (los nombres de los dados y el trazo de Fachadas, que solo salen en el PDF).
const FUERA = '.lc-n, svg, .jd-dados-texto, .v-fachadas';

export function nodosTexto(raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest(FUERA) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const out = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
  return out;
}
export function textoCompleto(raiz) { return nodosTexto(raiz).map(t => t.data).join(''); }
export function posicion(raiz, nodo, off) {
  const r = document.createRange();
  r.setStart(raiz, 0);
  r.setEnd(nodo, off);
  let total = 0;
  for (const t of nodosTexto(raiz)) {
    if (t === nodo) return total + off;
    if (!r.intersectsNode(t)) break;
    total += t.data.length;
  }
  return total;
}

// El HTML que se lee de una entrega, y su texto.
export const baseDe = e => (e.vista ? sanitizar(e.vista) : parrafos(e.texto || ''));
export const textoDeHTML = html => textoCompleto(Object.assign(document.createElement('div'), { innerHTML: html }));

// Pinta las marcas sobre el texto base. lista: [{ id, inicio, fin, n, clase }]
export function pintarMarcas(raiz, baseHTML, lista) {
  raiz.innerHTML = baseHTML;
  if (!lista.length) return;
  const cortes = [...new Set(lista.flatMap(x => [x.inicio, x.fin]))];
  let pos = 0;
  for (const t of nodosTexto(raiz)) {
    const L = t.data.length, ini = pos;
    cortes.filter(c => c > ini && c < ini + L).sort((a, b) => b - a).forEach(c => t.splitText(c - ini));
    pos += L;
  }
  pos = 0;
  for (const t of nodosTexto(raiz)) {
    const s = pos, f = pos + t.data.length;
    pos = f;
    if (!t.data.trim()) continue;
    const cubren = lista.filter(x => x.inicio < f && x.fin > s);
    if (!cubren.length) continue;
    const m = document.createElement('mark');
    const clases = new Set(['lc-marca']);
    cubren.forEach(x => (x.clase || '').split(' ').filter(Boolean).forEach(k => clases.add(k)));
    if (cubren.filter(x => !x.temporal).length > 1) clases.add('varias');
    m.className = [...clases].join(' ');
    m.dataset.ids = cubren.filter(x => !x.temporal).map(x => x.id).join(' ');
    t.replaceWith(m);
    m.appendChild(t);
  }
  for (const x of lista) {
    if (x.temporal || !x.n) continue;
    const ms = [...raiz.querySelectorAll('mark.lc-marca')].filter(m => m.dataset.ids.split(' ').includes(x.id));
    let ult = ms[ms.length - 1];
    if (!ult) continue;
    while (ult.nextSibling?.classList?.contains('lc-n')) ult = ult.nextSibling;   // varias notas que terminan en el mismo punto
    const sup = document.createElement('sup');
    sup.className = 'lc-n';
    sup.dataset.ids = x.id;
    sup.textContent = x.n;
    ult.after(sup);
  }
}

// Ubica el fragmento de una nota; si la posición no coincide con la cita, la busca.
// Una nota «suelta» (su fragmento desapareció al editar el texto) no se ubica.
export function ubicar(completo, a) {
  if (!a || a.suelta) return null;
  if (completo.slice(a.inicio, a.fin) === a.cita) return { inicio: a.inicio, fin: a.fin };
  const i = completo.indexOf(a.cita);
  return i >= 0 ? { inicio: i, fin: i + a.cita.length } : null;
}

// ---------------------------------------------------------------------
// Comparar dos versiones de un texto, palabra por palabra.
// Devuelve los tramos iguales: [[inicio en el viejo, inicio en el nuevo, largo]], en orden.
// ---------------------------------------------------------------------
const PIEZA = /\s+|[\p{L}\p{N}’'-]+|[^\s\p{L}\p{N}’'-]/gu;
const piezas = t => t.match(PIEZA) || [];

export function tramosIguales(viejo, nuevo) {
  // lo común al principio y al final se toma de una vez
  let pre = 0;
  while (pre < viejo.length && pre < nuevo.length && viejo[pre] === nuevo[pre]) pre++;
  let suf = 0;
  while (suf < viejo.length - pre && suf < nuevo.length - pre && viejo[viejo.length - 1 - suf] === nuevo[nuevo.length - 1 - suf]) suf++;
  // que el corte no parta una palabra
  const letra = /[\p{L}\p{N}’'-]/u;
  while (pre > 0 && letra.test(viejo[pre - 1]) && (letra.test(viejo[pre] || '') || letra.test(nuevo[pre] || ''))) pre--;
  while (suf > 0 && letra.test(viejo[viejo.length - suf]) && (letra.test(viejo[viejo.length - suf - 1] || '') || letra.test(nuevo[nuevo.length - suf - 1] || ''))) suf--;
  const A = piezas(viejo.slice(pre, viejo.length - suf));
  const B = piezas(nuevo.slice(pre, nuevo.length - suf));
  const iguales = [];
  if (pre) iguales.push([0, 0, pre]);
  // Myers: el camino más corto de ediciones entre A y B (por piezas)
  const N = A.length, M = B.length, MAX = N + M;
  const pares = [];
  if (N && M) {
    const v = new Map([[1, 0]]);
    const traza = [];
    let fin = false;
    for (let d = 0; d <= MAX && !fin; d++) {
      if (d > 3000) break;   // demasiado distintos: se toma solo lo común al principio y al final
      traza.push(new Map(v));
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
        let y = x - k;
        while (x < N && y < M && A[x] === B[y]) { x++; y++; }
        v.set(k, x);
        if (x >= N && y >= M) { fin = true; break; }
      }
    }
    if (fin) {
      let x = N, y = M;
      for (let d = traza.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
        const vv = traza[d], k = x - y;
        const kPrev = (k === -d || (k !== d && (vv.get(k - 1) ?? -1) < (vv.get(k + 1) ?? -1))) ? k + 1 : k - 1;
        const xPrev = vv.get(kPrev) ?? 0, yPrev = xPrev - kPrev;
        while (x > xPrev && y > yPrev) { x--; y--; pares.push([x, y]); }
        x = xPrev; y = yPrev;
      }
      pares.reverse();
    }
  }
  // de pares de piezas a tramos de caracteres
  const offA = [], offB = [];
  let o = pre; for (const p of A) { offA.push(o); o += p.length; }
  o = pre; for (const p of B) { offB.push(o); o += p.length; }
  for (const [i, j] of pares) {
    const ult = iguales[iguales.length - 1];
    const a = offA[i], b = offB[j], L = A[i].length;
    if (ult && ult[0] + ult[2] === a && ult[1] + ult[2] === b) ult[2] += L;
    else iguales.push([a, b, L]);
  }
  if (suf) {
    const a = viejo.length - suf, b = nuevo.length - suf;
    const ult = iguales[iguales.length - 1];
    if (ult && ult[0] + ult[2] === a && ult[1] + ult[2] === b) ult[2] += suf;
    else iguales.push([a, b, suf]);
  }
  return iguales;
}

// Lleva una posición del texto viejo al nuevo. Dentro de un tramo cambiado, «inicio» va al comienzo
// de lo que lo reemplazó y «fin», al final (así el fragmento abarca lo que se reescribió en él).
function mapear(iguales, p, lado, largoNuevo) {
  let antes = null;
  for (let k = 0; k < iguales.length; k++) {
    const [a, b, L] = iguales[k];
    if (p >= a && p <= a + L) {
      // lo que se agregó justo antes del fragmento no entra en él
      const sig = iguales[k + 1];
      if (lado === 'inicio' && p === a + L && sig && sig[0] === p) return sig[1];
      return b + (p - a);
    }
    if (a > p) return lado === 'inicio' ? (antes ? antes[1] + antes[2] : 0) : b;
    antes = iguales[k];
  }
  return lado === 'inicio' ? (antes ? antes[1] + antes[2] : 0) : largoNuevo;
}

// Nueva ancla para una nota cuando el texto cambió de «viejo» a «nuevo».
// Devuelve null si no cambia nada. Si el fragmento se reescribió, guarda en «antes» lo que decía
// cuando se dejó la nota; si desapareció, la nota queda «suelta».
export function reanclar(ancla, viejo, nuevo, iguales = tramosIguales(viejo, nuevo)) {
  const pos = ubicar(viejo, ancla);
  if (!pos) return null;
  let i = mapear(iguales, pos.inicio, 'inicio', nuevo.length);
  let f = mapear(iguales, pos.fin, 'fin', nuevo.length);
  while (i < f && /\s/.test(nuevo[i])) i++;
  while (f > i && /\s/.test(nuevo[f - 1])) f--;
  let cita = nuevo.slice(i, f);
  // Si el fragmento se movió entero (un párrafo que cambió de lugar), se busca donde quedó.
  const original = viejo.slice(pos.inicio, pos.fin);
  if (cita !== original) {
    const k = nuevo.indexOf(original);
    if (k >= 0 && nuevo.indexOf(original, k + 1) < 0) { i = k; f = k + original.length; cita = original; }
  }
  if (f <= i || !/[\p{L}\p{N}]/u.test(cita)) return { ...ancla, suelta: true };
  if (i === ancla.inicio && f === ancla.fin && cita === ancla.cita) return null;
  const r = { inicio: i, fin: f, cita };
  const antes = cita !== ancla.cita ? ancla.antes || ancla.cita : ancla.antes;
  if (antes && antes !== cita) r.antes = antes;   // si volvió a decir lo mismo, ya no se marca
  return r;
}

// Después de editar una entrega: las notas sobre fragmentos se mueven con el texto.
// No interrumpe nunca la edición: si algo falla, las notas siguen ubicándose por su cita.
export async function reubicarNotas(entregaVieja, vistaNueva, textoNuevo = '') {
  try {
    const viejo = textoDeHTML(baseDe(entregaVieja));
    const nuevo = textoDeHTML(baseDe({ vista: vistaNueva, texto: textoNuevo }));
    if (viejo === nuevo) return;
    const notas = await estado.api.notasParaReubicar(entregaVieja.id);
    if (!notas?.length) return;
    const iguales = tramosIguales(viejo, nuevo);
    const cambios = notas.map(n => ({ id: n.id, ancla: reanclar(n.ancla, viejo, nuevo, iguales) })).filter(x => x.ancla);
    if (cambios.length) await estado.api.reubicarNotas(entregaVieja.id, cambios);
  } catch (err) {
    console.warn('No se pudieron reubicar las notas', err);
  }
}
