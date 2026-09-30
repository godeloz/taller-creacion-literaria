// Módulo: La forma de las historias. Trazar arcos emocionales sobre una cuadrícula
// de tiempo (principio → fin) y fortuna (desdicha ↔ bienestar), al modo de Vonnegut.
import { estado, avisoPublicar } from '../nucleo/estado.js';
import { esc, local, debounce, confirmar, modal, aviso, errorAviso, hace } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { publicarEntrega } from '../nucleo/publicar.js';

const ACENTO = '#8B6CFF';
const COLS = 24, VMAX = 7, FILAS = VMAX * 2 + 1;
const CW = 40, CH = 34, ML = 78, MT = 58, MR = 46, MB = 56;
const W = ML + COLS * CW + MR, H = MT + FILAS * CH + MB;
const cx = c => ML + (c + 0.5) * CW;
const cy = v => MT + (VMAX - v) * CH + CH / 2;
const nivel = v => (v > 0 ? '+' + v : String(v));

// Espectro emocional: celeste arriba (bienestar) → rojo intenso abajo (desdicha).
const STOPS = [[0, '#79CFEC'], [0.18, '#1E6FB4'], [0.37, '#4E9B3E'], [0.55, '#E3B012'], [0.75, '#DF741A'], [1, '#B51C1C']];
// Los arcos se distinguen por el patrón del trazo, no por el color.
const TRAZOS = ['none', '9 5', '2 5', '13 4 2 4', '22 6', '5 4 1 4'];

// Formas de referencia de Vonnegut (aproximadas) para comparar.
const MODELOS = {
  hoyo: { nombre: 'El hombre en el hoyo', puntos: [[0, 2], [5, 2], [9, -3], [12, -5], [16, -2], [20, 3], [23, 4]] },
  chica: { nombre: 'Chico conoce chica', puntos: [[0, 0], [4, 3], [9, 5], [13, -3], [17, -4], [21, 4], [23, 6]] },
  cenicienta: { nombre: 'Cenicienta', puntos: [[0, -5], [5, -4], [9, 1], [12, 5], [14, 6], [15, -4], [19, -3], [23, 7]] },
  kafka: { nombre: 'La metamorfosis', puntos: [[0, -2], [8, -3], [14, -5], [19, -6], [23, -7]] },
};

const CONSIGNA_LIBRE = { item_id: null, datos: { titulo: 'La forma de una historia', consigna: 'Trace el arco de una historia: ubique en la cuadrícula sus momentos clave, de principio a fin, y escriba en cada punto qué ocurre. Luego cierre el arco con su nombre.' } };

const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function colorEn(v) {
  const t = Math.max(0, Math.min(1, (VMAX - v) / (2 * VMAX)));
  let i = 0;
  while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
  const [t0, c0] = STOPS[i], [t1, c1] = STOPS[i + 1];
  const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  const a = hx(c0), b = hx(c1);
  return 'rgb(' + a.map((x, j) => Math.round(x + (b[j] - x) * k)).join(',') + ')';
}

// Curva monótona (Fritsch–Carlson): no se pasa de los puntos que une.
function trazo(pts) {
  const n = pts.length;
  if (n < 2) return '';
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const dx = [], delta = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; delta[i] = (ys[i + 1] - ys[i]) / dx[i]; }
  m[0] = delta[0]; m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / delta[i], b = m[i + 1] / delta[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * delta[i]; m[i + 1] = t * b * delta[i]; }
  }
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    d += ` C ${(xs[i] + dx[i] / 3).toFixed(1)} ${(ys[i] + m[i] * dx[i] / 3).toFixed(1)}, ${(xs[i + 1] - dx[i] / 3).toFixed(1)} ${(ys[i + 1] - m[i + 1] * dx[i] / 3).toFixed(1)}, ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
  }
  return d;
}

const corta = t => { const s = String(t || '').trim().replace(/\s+/g, ' '); return s.length > 9 ? s.slice(0, 9) + '…' : s; };

// Dibuja la cuadrícula. Interactiva (con casillas) o fija (para publicar).
function dibujo({ arcos, activo = [], modelo = null, interactivo = false, bloqueadas = new Set() }) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Arcos de la historia">`;
  s += `<defs><linearGradient id="espectro-forma" gradientUnits="userSpaceOnUse" x1="0" y1="${cy(VMAX)}" x2="0" y2="${cy(-VMAX)}">${STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#FBF9F4"/>`;
  for (let c = 0; c <= COLS; c++) s += `<line x1="${ML + c * CW}" y1="${MT}" x2="${ML + c * CW}" y2="${MT + FILAS * CH}" stroke="#E2DDD4" stroke-width="0.7"/>`;
  for (let f = 0; f <= FILAS; f++) s += `<line x1="${ML}" y1="${MT + f * CH}" x2="${ML + COLS * CW}" y2="${MT + f * CH}" stroke="#E2DDD4" stroke-width="0.7"/>`;
  if (interactivo) {
    for (let c = 0; c < COLS; c++) for (let v = VMAX; v >= -VMAX; v--) {
      s += `<rect class="celda${bloqueadas.has(c) ? ' bloqueada' : ''}" data-col="${c}" data-val="${v}" x="${ML + c * CW}" y="${cy(v) - CH / 2}" width="${CW}" height="${CH}"><title>Momento ${c + 1}, nivel ${nivel(v)}</title></rect>`;
    }
  }
  const y0 = cy(0);
  s += `<line x1="${ML}" y1="${y0}" x2="${W - MR + 18}" y2="${y0}" stroke="#16141C" stroke-width="2"/>`;
  s += `<path d="M ${W - MR + 18} ${y0} l -9 -4.5 l 0 9 z" fill="#16141C"/>`;
  s += `<line x1="${ML}" y1="${MT - 8}" x2="${ML}" y2="${MT + FILAS * CH + 8}" stroke="#16141C" stroke-width="2"/>`;
  const txt = 'font-family="JetBrains Mono, monospace"';
  s += `<text x="${ML - 6}" y="${MT - 22}" font-size="12" fill="#16141C" ${txt}>Bienestar / Buena suerte</text>`;
  s += `<text x="${ML - 6}" y="${MT + FILAS * CH + 30}" font-size="12" fill="#16141C" ${txt}>Desdicha / Mala suerte</text>`;
  s += `<text x="${ML + 4}" y="${MT + FILAS * CH + 48}" font-size="11" fill="#6A6473" letter-spacing="1.5" ${txt}>PRINCIPIO</text>`;
  s += `<text x="${ML + COLS * CW}" y="${MT + FILAS * CH + 48}" font-size="11" fill="#6A6473" letter-spacing="1.5" text-anchor="end" ${txt}>FIN</text>`;

  if (modelo && MODELOS[modelo]) {
    const M = MODELOS[modelo];
    const co = M.puntos.map(([c, v]) => ({ x: cx(c), y: cy(v) }));
    s += `<path d="${trazo(co)}" fill="none" stroke="#9A93A3" stroke-width="2.4" stroke-dasharray="1 7" stroke-linecap="round"/>`;
    const u = co[co.length - 1];
    s += `<text x="${u.x}" y="${u.y - 12}" font-size="12" fill="#6A6473" text-anchor="end" ${txt}>${esc(M.nombre)}</text>`;
  }

  const etiqueta = (x, y, v, texto, color, datos) => {
    const t = corta(texto) || '—';
    const an = t.length * 6.6 + 12;
    const ry = v >= 0 ? y - 25 : y + 10;
    return `<g class="etq" ${datos}><rect x="${(x - an / 2).toFixed(1)}" y="${ry}" width="${an.toFixed(1)}" height="16" rx="3" fill="#FFFFFF" stroke="${color}" stroke-width="1"/><text x="${x.toFixed(1)}" y="${ry + 11.5}" font-size="10.5" text-anchor="middle" fill="#16141C" ${txt}>${esc(t)}</text></g>`;
  };
  const dibujarArco = (puntos, patron, datos) => {
    let out = '';
    const co = puntos.map(p => ({ x: cx(p.col), y: cy(p.val) }));
    if (co.length > 1) out += `<path d="${trazo(co)}" fill="none" stroke="url(#espectro-forma)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${patron}"/>`;
    let etqs = '';
    puntos.forEach(p => {
      const col = colorEn(p.val);
      out += `<circle cx="${cx(p.col)}" cy="${cy(p.val)}" r="5" fill="${col}" stroke="#FBF9F4" stroke-width="1.6"/>`;
      etqs += etiqueta(cx(p.col), cy(p.val), p.val, p.texto, col, datos(p));
    });
    return out + etqs;
  };
  arcos.forEach((a, i) => { if (a.visible !== false) s += dibujarArco(a.puntos, a.patron, p => interactivo ? `data-arco="${i}" data-col="${p.col}"` : ''); });
  if (activo.length) s += dibujarArco(activo, '6 5', p => interactivo ? `data-arco="-1" data-col="${p.col}"` : '');
  return s + '</svg>';
}

function muestraTrazo(patron, ancho = 44) {
  return `<svg width="${ancho}" height="10" viewBox="0 0 ${ancho} 10" aria-hidden="true"><defs><linearGradient id="mt-${patron.replace(/\s/g, '')}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${ancho}" y2="0"><stop offset="0" stop-color="#1E6FB4"/><stop offset=".5" stop-color="#E3B012"/><stop offset="1" stop-color="#B51C1C"/></linearGradient></defs><line x1="2" y1="5" x2="${ancho - 2}" y2="5" stroke="url(#mt-${patron.replace(/\s/g, '')})" stroke-width="3" stroke-linecap="round" stroke-dasharray="${patron}"/></svg>`;
}

export default {
  slug: 'forma',
  nombre: 'La forma de las historias',
  version: '1.0',

  async abrir(cont, ctx) {
    const consignas = await estado.api.contenidos('forma');
    const editando = ctx.entrega || null;
    let consigna;
    if (editando) {
      consigna = editando.item_id ? (consignas.find(c => c.item_id === editando.item_id) || await estado.api.contenido('forma', editando.item_id)) : null;
      consigna = consigna || CONSIGNA_LIBRE;
    } else {
      const id = ctx.item_id || ctx.sesion?.item_id;
      consigna = consignas.find(c => c.item_id === id);
      if (!consigna && consignas.length) { location.replace(`#/d/forma/${encodeURIComponent(consignas[0].item_id)}`); return; }
      consigna = consigna || CONSIGNA_LIBRE;
    }
    const C = consigna.datos;
    const clave = `forma:${consigna.item_id || 'libre'}`;
    const claveLocal = `borrador:${estado.yo.id}:${clave}`;

    // ---------- estado ----------
    let arcos = [], activo = {}, tono = 0, titulo = '', modelo = '';
    let notaBorrador = '';
    const cargarEstado = d => {
      arcos = (d.arcos || []).map(a => ({ nombre: a.nombre, patron: a.patron || 'none', puntos: a.puntos || [], visible: a.visible !== false }));
      activo = {};
      (d.activo || []).forEach(p => { activo[p.col] = { val: p.val, texto: p.texto }; });
      tono = d.tono ?? arcos.length;
      titulo = d.titulo || '';
    };
    if (editando) cargarEstado({ ...(editando.datos || {}), titulo: editando.titulo });
    else {
      const loc = local(claveLocal);
      let nube = null;
      try { nube = await estado.api.borrador(clave); } catch { /* sin conexión */ }
      const b = [loc, nube].filter(Boolean).sort((a, c) => (c._actualizado || '').localeCompare(a._actualizado || ''))[0];
      if (b && (b.arcos?.length || b.activo?.length)) { cargarEstado(b); notaBorrador = `Borrador recuperado · ${hace(b._actualizado || new Date().toISOString())}`; }
    }
    const ordenados = () => Object.keys(activo).map(Number).sort((a, b) => a - b).map(c => ({ col: c, val: activo[c].val, texto: activo[c].texto }));
    const serial = () => ({ titulo, arcos, activo: ordenados(), tono });

    // ---------- estructura ----------
    cont.innerHTML = `
    <div class="contenedor" style="max-width:1440px">
      <div class="escritorio" style="--acento:${ACENTO}">
        <aside class="consigna-panel">
          <span class="rotulo">La forma de las historias</span>
          <h1>${esc(C.titulo)}</h1>
          <div class="consigna-texto"><p>${esc(C.consigna)}</p></div>
          ${consignas.length > 1 && !editando ? `<label class="sr" for="elegir-consigna">Consigna</label><select class="selector" id="elegir-consigna" style="margin:4px 0 8px">${consignas.map(c => `<option value="${esc(c.item_id)}" ${c.item_id === consigna.item_id ? 'selected' : ''}>${esc(c.datos.titulo)}</option>`).join('')}</select>` : ''}
          <details class="entrena" style="margin-top:10px"><summary>${icono('info', 16)}Cómo trazar</summary>
            <ol class="consigna-texto" style="font-size:14.5px;margin-top:10px;padding-left:1.2em">
              <li>Haga clic en una casilla y escriba la escena que ocurre en ese momento.</li>
              <li>Cada columna admite un solo punto del arco.</li>
              <li>Con dos puntos o más, pulse <b>Cerrar arco</b> y póngale nombre.</li>
              <li>Puede trazar otros arcos sobre el mismo plano.</li>
              <li>Haga clic en una etiqueta para leer la escena completa.</li>
            </ol></details>
          <div class="consigna-extra">
            <span class="rotulo">Arcos trazados</span>
            <div id="leyenda"></div>
            <label class="rotulo" for="modelo" style="margin-top:10px">Comparar con una forma de Vonnegut</label>
            <select class="selector" id="modelo" style="min-height:38px">
              <option value="">Ninguna</option>
              ${Object.entries(MODELOS).map(([k, m]) => `<option value="${k}">${esc(m.nombre)}</option>`).join('')}
            </select>
            <div class="escala-forma"><span class="franja-forma"></span><span class="marcas-forma"><span>Bienestar</span><span>Neutralidad</span><span>Desdicha</span></span></div>
          </div>
        </aside>
        <section class="mesa">
          <div class="mesa-barra">
            <button type="button" class="btn btn-primario btn-chico" id="b-cerrar" disabled>${icono('curva', 16)}Cerrar arco</button>
            <button type="button" class="btn btn-fantasma btn-chico" id="b-deshacer" disabled>${icono('reiniciar', 15)}Quitar último punto</button>
            <button type="button" class="btn btn-fantasma btn-chico" id="b-limpiar">${icono('basura', 15)}Limpiar</button>
            <span class="espaciador"></span>
            <span class="guardado" id="guardado">${esc(notaBorrador)}</span>
          </div>
          <div style="padding:18px 20px 8px">
            <input class="titulo-escribir" id="titulo" placeholder="Título (opcional)" maxlength="140" value="${esc(titulo)}" style="width:100%;margin-bottom:10px">
            <div class="marco-forma" id="grafica"></div>
          </div>
          <div class="mesa-pie">
            <span class="contador" id="contador"></span>
            <span class="espaciador"></span>
            <button type="button" class="btn btn-primario" id="publicar" disabled>${icono(editando ? 'check' : 'enviar', 18)}${editando ? 'Guardar cambios' : 'Publicar arcos'}</button>
          </div>
        </section>
      </div>
    </div>`;
    const $ = s => cont.querySelector(s);
    const elGuardado = $('#guardado');

    const guardarNube = debounce(async () => {
      if (editando) return;
      try { await estado.api.guardarBorrador(clave, serial()); elGuardado.textContent = 'Guardado'; }
      catch { elGuardado.textContent = 'Guardado en este dispositivo'; }
    }, 3000);
    function cambio() {
      if (editando) { elGuardado.textContent = 'Cambios sin guardar'; return; }
      local(claveLocal, { ...serial(), _actualizado: new Date().toISOString() });
      elGuardado.textContent = 'Guardando…';
      guardarNube();
    }

    function pintar() {
      const pts = ordenados();
      $('#grafica').innerHTML = dibujo({ arcos, activo: pts, modelo, interactivo: true, bloqueadas: new Set(pts.map(p => p.col)) });
      $('#leyenda').innerHTML = arcos.length ? arcos.map((a, i) => `
        <div class="arco-fila">${muestraTrazo(a.patron)}<span class="arco-nombre${a.visible === false ? ' oculto-arco' : ''}">${esc(a.nombre)} <small class="tenue">· ${a.puntos.length} puntos</small></span>
          <button type="button" class="mini" data-ver="${i}">${a.visible === false ? 'Mostrar' : 'Ocultar'}</button>
          <button type="button" class="mini" data-quitar="${i}">Eliminar</button></div>`).join('')
        : '<p class="tenue" style="font-size:14px;margin:0">Todavía no hay arcos cerrados.</p>';
      $('#b-cerrar').disabled = pts.length < 2;
      $('#b-deshacer').disabled = !pts.length;
      $('#contador').textContent = `${arcos.length} ${arcos.length === 1 ? 'arco' : 'arcos'}${pts.length ? ` · ${pts.length} ${pts.length === 1 ? 'punto' : 'puntos'} en el arco en curso` : ''}`;
      $('#publicar').disabled = !arcos.length && pts.length < 2;
    }

    // ---------- escenas ----------
    async function escribirEscena(col, val, textoPrevio = '') {
      const r = await modal({
        titulo: textoPrevio ? 'Edite la escena' : 'Escriba la escena',
        cuerpo: `<p class="rotulo">Momento ${col + 1} de ${COLS} · nivel ${nivel(val)}</p>
          <label class="sr" for="escena">Qué ocurre en este momento</label>
          <textarea class="area" id="escena" placeholder="Qué ocurre en este momento: un párrafo, una frase, una imagen." style="font-family:var(--f-lectura);font-size:17px;min-height:140px">${esc(textoPrevio)}</textarea>`,
        acciones: [{ texto: 'Cancelar', clase: 'btn-fantasma', valor: null }, {
          texto: textoPrevio ? 'Guardar' : 'Crear punto', clase: 'btn-primario',
          accion: v => { const t = v.querySelector('#escena').value.trim(); return t ? { t } : false; },
        }],
      });
      if (r && r.t) { activo[col] = { val, texto: r.t }; pintar(); cambio(); }
    }

    async function leerEscena(ai, col) {
      const enCurso = ai === -1;
      const p = enCurso ? { col, ...activo[col] } : arcos[ai].puntos.find(q => q.col === col);
      if (!p) return;
      const r = await modal({
        titulo: enCurso ? 'Arco en curso' : arcos[ai].nombre,
        cuerpo: `<p class="rotulo">Momento ${col + 1} · nivel ${nivel(p.val)}</p><p style="font-family:var(--f-lectura);font-size:17.5px;line-height:1.7;white-space:pre-wrap;border-left:3px solid ${colorEn(p.val)};padding-left:14px">${esc(p.texto)}</p>`,
        acciones: enCurso
          ? [{ texto: 'Eliminar punto', clase: 'btn-peligro', valor: 'borrar' }, { texto: 'Editar', clase: 'btn', valor: 'editar' }, { texto: 'Cerrar', clase: 'btn-primario', valor: null }]
          : [{ texto: 'Cerrar', clase: 'btn-primario', valor: null }],
      });
      if (r === 'borrar') { delete activo[col]; pintar(); cambio(); }
      if (r === 'editar') escribirEscena(col, p.val, p.texto);
    }

    // ---------- eventos ----------
    $('#grafica').addEventListener('click', ev => {
      const cel = ev.target.closest('.celda');
      if (cel) { if (!cel.classList.contains('bloqueada')) escribirEscena(+cel.dataset.col, +cel.dataset.val); return; }
      const etq = ev.target.closest('.etq');
      if (etq) leerEscena(+etq.dataset.arco, +etq.dataset.col);
    });
    $('#b-cerrar').addEventListener('click', async () => {
      const pts = ordenados();
      const r = await modal({
        titulo: 'Cierre el arco',
        cuerpo: `<p class="rotulo">${pts.length} puntos · el trazo quedará fijo</p>
          <label class="etiqueta" for="nombre-arco">Historia o personaje</label>
          <input class="entrada" id="nombre-arco" placeholder="Cenicienta, El hombre en el hoyo…" style="margin-top:6px">`,
        acciones: [{ texto: 'Cancelar', clase: 'btn-fantasma', valor: null }, {
          texto: 'Cerrar arco', clase: 'btn-primario', accion: v => ({ n: v.querySelector('#nombre-arco').value.trim() }),
        }],
        alAbrir: (v, cerrar) => v.querySelector('#nombre-arco').addEventListener('keydown', e => { if (e.key === 'Enter') cerrar({ n: e.target.value.trim() }); }),
      });
      if (!r || typeof r !== 'object') return;
      arcos.push({ nombre: r.n || `Arco ${arcos.length + 1}`, patron: TRAZOS[tono % TRAZOS.length], puntos: pts, visible: true });
      tono++;
      activo = {};
      pintar(); cambio();
    });
    $('#b-deshacer').addEventListener('click', () => {
      const cols = Object.keys(activo).map(Number);
      if (!cols.length) return;
      delete activo[Math.max(...cols)];
      pintar(); cambio();
    });
    $('#b-limpiar').addEventListener('click', async () => {
      if (!(await confirmar('¿Borrar todos los arcos y todas las escenas? No se pueden recuperar.', { si: 'Borrar todo', peligro: true }))) return;
      arcos = []; activo = {}; tono = 0; pintar(); cambio();
    });
    $('#leyenda').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.ver !== undefined) { const a = arcos[+b.dataset.ver]; a.visible = a.visible === false; }
      if (b.dataset.quitar !== undefined) arcos.splice(+b.dataset.quitar, 1);
      pintar(); cambio();
    });
    $('#modelo').addEventListener('change', ev => { modelo = ev.target.value; pintar(); });
    $('#titulo').addEventListener('input', ev => { titulo = ev.target.value; cambio(); });
    $('#elegir-consigna')?.addEventListener('change', ev => { location.hash = `#/d/forma/${encodeURIComponent(ev.target.value)}`; });

    // ---------- publicar ----------
    $('#publicar').addEventListener('click', async () => {
      if (ordenados().length >= 2) {
        const ok = await confirmar('Hay un arco en curso sin cerrar. Ciérrelo primero para incluirlo; si publica ahora, quedará por fuera.', { si: 'Publicar sin él', no: 'Volver' });
        if (!ok) return;
      }
      const visibles = arcos.filter(a => a.visible !== false);
      if (!visibles.length) { aviso('Cierre al menos un arco (y déjelo visible) para publicar.', 'error'); return; }
      const svg = dibujo({ arcos: visibles, interactivo: false });
      const escenas = visibles.map(a => `<h3>${esc(a.nombre)}</h3>${a.puntos.map(p => `<p class="v-escena"><strong>Momento ${p.col + 1} · ${nivel(p.val)}</strong> ${esc(p.texto)}</p>`).join('')}`).join('');
      const vista = `<figure class="v-forma">${svg}</figure><div class="v-escenas">${escenas}</div>`;
      const texto = visibles.map(a => `${a.nombre.toUpperCase()}\n${a.puntos.map(p => `· Momento ${p.col + 1} (nivel ${nivel(p.val)}): ${p.texto}`).join('\n')}`).join('\n\n');
      if (!editando && !(await confirmar(avisoPublicar('sus arcos', 'los', 'ver'), { si: 'Publicar', no: 'Seguir trazando' }))) return;
      const b = $('#publicar');
      b.disabled = true;
      try {
        await publicarEntrega({ dinamica: 'forma', item_id: consigna.item_id, titulo: titulo.trim(), texto, vista, modulo_version: '1.0', datos: { arcos: visibles, tono } }, { entregaExistente: editando });
        guardarNube.cancelar();
        if (!editando) { local(claveLocal, null); estado.api.borrarBorrador(clave).catch(() => {}); }
      } catch (e) { errorAviso(e); b.disabled = false; }
    });

    pintar();
    return () => { if (!editando && (arcos.length || Object.keys(activo).length)) guardarNube.ahora(); };
  },

  paquete: {
    plantilla: 'plantillas/formas.json',
    describir: d => d.titulo,
    validar(json) {
      const errores = [];
      const lista = Array.isArray(json) ? json : json?.consignas;
      if (!Array.isArray(lista)) return { items: [], errores: ['El archivo debe tener una lista "consignas": [ … ].'] };
      const vistos = new Set();
      const items = [];
      lista.forEach((c, i) => {
        const n = `Consigna ${i + 1}`;
        const id = String(c?.id || '').trim();
        if (!id) errores.push(`${n}: falta "id".`);
        else if (vistos.has(id)) errores.push(`${n}: el id "${id}" está repetido.`);
        vistos.add(id);
        if (!String(c?.titulo || '').trim()) errores.push(`${n} (${id}): falta "titulo".`);
        if (!String(c?.consigna || '').trim()) errores.push(`${n} (${id}): falta "consigna".`);
        items.push({ item_id: id, datos: { titulo: String(c?.titulo || '').trim(), consigna: String(c?.consigna || '').trim() } });
      });
      return { items, errores };
    },
  },
};
