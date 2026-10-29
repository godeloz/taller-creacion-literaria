// Diccionario común de la app: definiciones del Wikcionario en español (CC BY-SA 4.0).
// Vive en diccionario/ (lo arma herramientas/armar_diccionario.py, fuera del repositorio):
//   indice.json  → { credito, largo_max, partes: ['ga', 'gat'…] }
//   <parte>.json → { palabra: { d: [[clase, [acepción…]]…], f: [lema…] } }
//   d: definiciones (cada acepción es un texto o [marca, texto]); f: la palabra es una forma
//   (plural, conjugación…) de esos lemas. Cada consulta descarga solo la parte de la palabra.
//
// Uso:
//   buscar(palabra) → { palabra, encontrada, d, lemas: [{ lema, d }] }
//   montarDiccionario(el, { alTrasladar }) → { mostrar(palabra), limpiar() }
//   esFuncional(palabra): artículos, preposiciones, pronombres, conjunciones… (no hace falta definirlas)
import { esc } from './ui.js';
import { icono } from './iconos.js';

const BASE = new URL('../diccionario/', import.meta.url);
const VISIBLES = 4; // acepciones por clase antes de «Ver todas»

let indice = null;
const partes = new Map();

// Igual que normalizar() de armar_diccionario.py: minúsculas, sin tildes, «_» para lo que no sea a-z.
export function normalizar(palabra) {
  return String(palabra || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-z]/g, '_');
}

function cargarIndice() {
  if (!indice) {
    indice = fetch(new URL('indice.json', BASE))
      .then(r => { if (!r.ok) throw new Error('Sin diccionario'); return r.json(); })
      .then(i => ({ ...i, set: new Set(i.partes || []) }))
      .catch(e => { indice = null; throw e; });
  }
  return indice;
}

function parteDe(norm, I) {
  for (let L = I.largo_max || 4; L >= 1; L--) {
    const k = (norm + '_'.repeat(L)).slice(0, L);
    if (I.set.has(k)) return k;
  }
  return null;
}

async function entrada(palabra) {
  const I = await cargarIndice();
  const k = parteDe(normalizar(palabra), I);
  if (!k) return null;
  if (!partes.has(k)) {
    partes.set(k, fetch(new URL(`${k}.json`, BASE))
      .then(r => { if (!r.ok) throw new Error('Sin diccionario'); return r.json(); })
      .catch(e => { partes.delete(k); throw e; }));
  }
  return (await partes.get(k))[palabra] || null;
}

const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

export async function buscar(palabra) {
  const w = String(palabra || '').trim();
  const res = { palabra: w, encontrada: null, d: null, lemas: [] };
  if (!w) return res;
  for (const v of [...new Set([w, w.toLowerCase(), mayuscula(w.toLowerCase())])]) {
    const e = await entrada(v);
    if (!e) continue;
    res.encontrada = v;
    res.d = e.d || null;
    const lemas = await Promise.all((e.f || []).filter(l => l !== v).map(async l => ({ lema: l, d: (await entrada(l))?.d })));
    res.lemas = lemas.filter(l => l.d?.length);
    break;
  }
  return res;
}

// ---------- palabras funcionales ----------
const FUNCIONALES = new Set(`
el la los las lo un una unos unas al del
a ante bajo cabe con contra de desde durante en entre hacia hasta mediante para por según sin so sobre tras versus vía
y e ni o u pero mas sino aunque que porque pues como si cuando mientras donde luego conque
yo tú vos usted él ella ello nosotros nosotras vosotros vosotras ustedes ellos ellas
me te se nos os le les mí ti sí conmigo contigo consigo
mi mis tu tus su sus nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras
mío mía míos mías tuyo tuya tuyos tuyas suyo suya suyos suyas
este esta esto estos estas ese esa eso esos esas aquel aquella aquello aquellos aquellas
qué quién quiénes quien quienes cual cuales cuál cuáles cuyo cuya cuyos cuyas
cuánto cuánta cuántos cuántas cuanto cuanta cuantos cuantas dónde cómo cuándo adónde
algo alguien nada nadie alguno alguna algunos algunas algún ninguno ninguna ningún
cada otro otra otros otras mismo misma mismos mismas tal tales todo toda todos todas
no ya muy más menos tan tanto
he has ha hemos habéis han había habías habíamos habíais habían hube hubo hubimos hubieron
habré habrá habremos habrán habría habrías habríamos habrían haya hayas hayamos hayan
hubiera hubieras hubiéramos hubieran hubiese hubieses hubiésemos hubiesen
`.trim().split(/\s+/));

export const esFuncional = palabra => FUNCIONALES.has(String(palabra || '').toLowerCase());

// ---------- panel ----------
const textoAcepcion = a => (Array.isArray(a) ? a[1] : a);
const marcaAcepcion = a => (Array.isArray(a) ? a[0] : '');

function bloquesHTML(lema, bloques, conTrasladar) {
  return bloques.map(([clase, aceps], b) => `
    <section class="dicc-bloque">
      <h3 class="dicc-lema">${esc(lema)} <span class="dicc-clase">${esc(clase || '')}</span></h3>
      <ol class="dicc-aceps">${aceps.map((a, k) => `
        <li class="dicc-acep${k >= VISIBLES ? ' dicc-mas' : ''}">
          <span class="dicc-acep-texto">${marcaAcepcion(a) ? `<span class="dicc-marca">${esc(marcaAcepcion(a))}</span> ` : ''}${esc(textoAcepcion(a))}</span>
          ${conTrasladar ? `<button type="button" class="dicc-trasladar" data-texto="${esc(textoAcepcion(a))}" title="Trasladar a su escritura">${icono('abajo', 15)}<span>Trasladar</span></button>` : ''}
        </li>`).join('')}
      </ol>
      ${aceps.length > VISIBLES ? `<button type="button" class="btn btn-chico btn-fantasma dicc-ver-todas" data-b="${b}">Ver las ${aceps.length} acepciones</button>` : ''}
    </section>`).join('');
}

const enlaceDLE = lema => `<a class="dicc-dle" href="https://dle.rae.es/${encodeURIComponent(lema)}" target="_blank" rel="noopener">Ver «${esc(lema)}» en el DLE ↗</a>`;
const enlaceWik = lema => `<a href="https://es.wiktionary.org/wiki/${encodeURIComponent(lema)}" target="_blank" rel="noopener">Wikcionario</a>`;

export function montarDiccionario(el, { alTrasladar = null } = {}) {
  let vez = 0;
  el.classList.add('dicc');
  el.innerHTML = `
    <form class="dicc-buscar" role="search">
      <label class="sr" for="dicc-q">Buscar en el diccionario</label>
      <input class="entrada" id="dicc-q" type="search" placeholder="Buscar otra palabra…" autocomplete="off" spellcheck="false">
      <button type="submit" class="btn btn-chico">${icono('ojo', 15)}Buscar</button>
    </form>
    <div class="dicc-cuerpo" aria-live="polite"></div>`;
  const cuerpo = el.querySelector('.dicc-cuerpo');
  const q = el.querySelector('#dicc-q');

  async function mostrar(palabra) {
    const mia = ++vez;
    q.value = palabra;
    cuerpo.innerHTML = '<p class="cargando dicc-cargando">Buscando en el diccionario…</p>';
    let r;
    try { r = await buscar(palabra); } catch {
      if (mia !== vez) return;
      cuerpo.innerHTML = `<p class="dicc-nada">No se pudo abrir el diccionario. Revise su conexión e intente de nuevo.</p>
        <button type="button" class="btn btn-chico" data-reintentar>${icono('reiniciar', 15)}Intentar de nuevo</button>`;
      return;
    }
    if (mia !== vez) return;
    const conT = !!alTrasladar;
    const lemaPrincipal = r.d ? r.encontrada : r.lemas[0]?.lema || r.palabra.toLowerCase();
    let html = '';
    if (r.d) html += bloquesHTML(r.encontrada, r.d, conT);
    if (r.lemas.length) {
      const nombres = r.lemas.map(l => `<b>${esc(l.lema)}</b>`).join(' y ');
      html += `<p class="dicc-forma">${r.d ? 'También es' : `«${esc(r.palabra)}» es`} una forma de ${nombres}.</p>`;
      html += r.lemas.map(l => bloquesHTML(l.lema, l.d, conT)).join('');
    }
    if (!html) {
      html = `<p class="dicc-nada">«${esc(r.palabra)}» no está en el diccionario.${conT ? ' Puede dejarla así o escribir usted su definición.' : ''}</p>`;
    }
    cuerpo.innerHTML = `${html}
      <p class="dicc-pie">${enlaceDLE(lemaPrincipal)}<span>Definiciones: ${enlaceWik(lemaPrincipal)}, CC BY-SA 4.0</span></p>`;
  }

  const alEnviar = ev => { ev.preventDefault(); if (q.value.trim()) mostrar(q.value.trim()); };
  const alClic = ev => {
    const t = ev.target.closest('.dicc-trasladar');
    if (t && alTrasladar) { alTrasladar(t.dataset.texto); return; }
    const v = ev.target.closest('.dicc-ver-todas');
    if (v) { v.closest('.dicc-bloque').classList.add('abierto'); v.remove(); return; }
    if (ev.target.closest('[data-reintentar]')) mostrar(q.value.trim());
  };
  el.querySelector('form').addEventListener('submit', alEnviar);
  el.addEventListener('click', alClic);
  return {
    mostrar,
    limpiar() { vez++; el.removeEventListener('click', alClic); },
  };
}
