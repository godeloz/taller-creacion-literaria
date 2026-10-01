// Piezas de interfaz reutilizables: avatares, tarjetas de entrega,
// reacciones, comentarios.
import { estado, esTutor, dinamica, soloTutor, soyVisible, MODOS } from './estado.js';
import { esc, hace, fechaHora, aviso, errorAviso, confirmar, $, enlazar } from './ui.js';
import { icono, avatarSVG, REACCIONES } from './iconos.js';

// ---------- color de texto legible sobre un fondo ----------
export function colorTexto(hex) {
  const h = (hex || '#FFFFFF').replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.0588 >= 4.5 ? '#16141C' : '#FFFFFF';
}

export const ICONO_DINAMICA = { reto: 'chispa', maraton: 'cartas', poema: 'fichas', cutup: 'tijeras', s7: 'diccionario', forma: 'curva', fallar: 'revision', consignas: 'pagina', pliegues: 'pliegue' };

export function avatar(p, tam = 40) {
  if (!p) return `<span class="avatar" style="width:${tam}px;height:${tam}px;background:var(--linea)"></span>`;
  if (p.foto_url) return `<span class="avatar" style="width:${tam}px;height:${tam}px"><img src="${esc(p.foto_url)}" alt=""></span>`;
  return `<span class="avatar" style="width:${tam}px;height:${tam}px">${avatarSVG(p.avatar, tam)}</span>`;
}

export function etiquetaDinamica(slug) {
  const d = dinamica(slug);
  if (!d) return '';
  return `<span class="etiqueta-din"><span class="punto" style="background:${esc(d.color)}"></span>${esc(d.nombre)}</span>`;
}

export function nombreDe(e) {
  return e.perfil?.nombre || 'Alguien del taller';
}

// Marca para textos y comentarios que solo ve el tutor (observadores y privados).
export function etiquetaSoloTutor(p) {
  if (!soloTutor(p)) return '';
  return `<span class="etiqueta-solo-tutor" title="${esc(MODOS[p.modo]?.nombre || '')}: ${esc(MODOS[p.modo]?.corto || '')}">${icono('candado', 12)}Solo lo ve el tutor</span>`;
}

// ---------- tarjeta de entrega para el muro ----------
// Pliegues: resalta en el extracto lo que viene del texto de origen.
function extractoMarcado(t, marcas) {
  let h = '';
  let pos = 0;
  for (const [a, b] of marcas) {
    if (!(a >= pos && b > a) || a >= t.length) continue;
    const f = Math.min(b, t.length);
    h += esc(t.slice(pos, a)) + `<span class="marca-pliegue">${esc(t.slice(a, f))}</span>`;
    pos = f;
  }
  return h + esc(t.slice(pos));
}

export function tarjetaEntrega(e, reacciones = []) {
  const mias = reacciones.filter(r => r.entrega_id === e.id);
  const conteo = t => mias.filter(r => r.tipo === t).length;
  const total = mias.length;
  const extracto = (e.texto || '').slice(0, 520);
  const oculto = e.estado === 'oculta';
  return `
  <a class="entrada-tarjeta" href="#/entrega/${e.id}" ${oculto ? 'style="opacity:.55"' : ''}>
    <div class="autor-linea">
      ${avatar(e.perfil, 38)}
      <div style="min-width:0;flex:1">
        <div class="autor-nombre">${esc(nombreDe(e))}</div>
        <div class="autor-meta">${hace(e.creado)}${e.editada ? ' · editado' : ''}${oculto ? ' · oculto' : ''}</div>
      </div>
      ${etiquetaDinamica(e.dinamica)}
    </div>
    ${etiquetaSoloTutor(e.perfil) ? `<div style="margin:-4px 0 8px">${etiquetaSoloTutor(e.perfil)}</div>` : ''}
    ${e.titulo ? `<div class="entrada-titulo">${esc(e.titulo)}</div>` : ''}
    <div class="entrada-extracto">${e.dinamica === 'pliegues' && Array.isArray(e.datos?.marcas) ? extractoMarcado(extracto, e.datos.marcas) : esc(extracto)}</div>
    <div class="entrada-pie">
      <span class="mini-reacciones">
        ${conteo('encanta') ? `<span title="Me encanta">${icono('encanta', 16)}${conteo('encanta')}</span>` : ''}
        ${conteo('gusta') ? `<span title="Me gusta">${icono('gusta', 16)}${conteo('gusta')}</span>` : ''}
        ${total - conteo('encanta') - conteo('gusta') > 0 ? `<span title="Reacciones de lectura">${icono('detuve', 16)}${total - conteo('encanta') - conteo('gusta')}</span>` : ''}
      </span>
      ${e.n_comentarios ? `<span class="mini-reacciones"><span>${icono('comentario', 16)}${e.n_comentarios}</span></span>` : ''}
      <span class="espaciador"></span>
      <span>${e.palabras ?? 0} palabras</span>
    </div>
  </a>`;
}

// ---------- barra de reacciones ----------
export function barraReacciones(entregaId, reacciones, { completa = true } = {}) {
  const yo = estado.yo.id;
  return `<div class="reacciones" data-entrega="${entregaId}">
    ${REACCIONES.map(r => {
      const deEste = reacciones.filter(x => x.entrega_id === entregaId && x.tipo === r.tipo);
      const puesta = deEste.some(x => x.usuario === yo);
      const etiqueta = completa && r.corto ? `<span>${esc(r.corto)}</span>` : '';
      return `<button type="button" class="reaccion ${puesta ? 'puesta' : ''}" data-tipo="${r.tipo}" aria-pressed="${puesta}" title="${esc(r.nombre)}" aria-label="${esc(r.nombre)}">
        ${icono(r.tipo, 18)}${etiqueta}<span class="n">${deEste.length || ''}</span></button>`;
    }).join('')}
  </div>`;
}

export function activarReacciones(raiz, reacciones) {
  raiz.addEventListener('click', async ev => {
    const b = ev.target.closest('.reaccion');
    if (!b) return;
    const barra = b.closest('.reacciones');
    const entrega = barra.dataset.entrega;
    const tipo = b.dataset.tipo;
    const poner = !b.classList.contains('puesta');
    b.classList.toggle('puesta', poner);
    b.setAttribute('aria-pressed', poner);
    const n = b.querySelector('.n');
    const valor = Number(n.textContent || 0) + (poner ? 1 : -1);
    n.textContent = valor || '';
    try {
      await estado.api.reaccionar(entrega, tipo, poner);
      if (poner) reacciones.push({ entrega_id: entrega, tipo, usuario: estado.yo.id });
      else {
        const i = reacciones.findIndex(r => r.entrega_id === entrega && r.tipo === tipo && r.usuario === estado.yo.id);
        if (i >= 0) reacciones.splice(i, 1);
      }
    } catch (e) {
      b.classList.toggle('puesta', !poner);
      n.textContent = (valor + (poner ? -1 : 1)) || '';
      errorAviso(e);
    }
  });
}

// ---------- comentarios ----------
export async function montarComentarios(cont, entrega) {
  const pintar = async () => {
    let lista = [];
    try { lista = await estado.api.comentarios(entrega.id); } catch (e) { errorAviso(e); }
    cont.innerHTML = `
      <div class="fila"><h3 class="titulo-seccion" style="font-size:26px">Comentarios</h3><span class="tenue">${lista.length || ''}</span></div>
      ${lista.length ? '' : '<p class="tenue" style="margin:0">Todavía no hay comentarios. Sea la primera lectura.</p>'}
      ${lista.map(c => {
        const esTut = c.perfil?.rol === 'tutor';
        const puedeBorrar = c.autor === estado.yo.id || esTutor();
        return `<div class="comentario ${esTut ? 'tutor' : ''} ${c.privado ? 'privado' : ''}">
          ${avatar(c.perfil, 36)}
          <div class="comentario-cuerpo">
            <div class="fila" style="gap:6px">
              <b>${esc(c.perfil?.nombre || '')}</b>${esTut ? '<span class="sello-tutor">Tutor</span>' : ''}${c.privado ? '<span class="sello-privado">Privado</span>' : ''}${!c.privado && soloTutor(c.perfil) ? etiquetaSoloTutor(c.perfil) : ''}
              <span class="tenue" style="font-size:13px">${hace(c.creado)}</span>
              <span class="espaciador"></span>
              ${puedeBorrar ? `<button class="btn btn-fantasma btn-chico btn-icono" data-borrar="${c.id}" aria-label="Borrar comentario" title="Borrar">${icono('basura', 16)}</button>` : ''}
            </div>
            <p>${enlazar(c.texto)}</p>
          </div>
        </div>`;
      }).join('')}
      <form class="form-comentario">
        <label class="sr" for="nuevo-comentario">Escriba un comentario</label>
        <textarea id="nuevo-comentario" placeholder="Escriba un comentario para quien escribió este texto…" required></textarea>
        ${!soyVisible() ? '<p class="tenue" style="margin:6px 0 0;font-size:14px">Por su modo de participación, sus comentarios y reacciones solo los ve el tutor.</p>' : ''}
        <div class="fila">
          ${esTutor() ? '<label class="fila" style="gap:6px;font-size:14px;font-weight:600"><input type="checkbox" name="privado"> Privado (solo lo ve el autor)</label>' : ''}
          <span class="espaciador"></span>
          <button class="btn btn-primario btn-chico" type="submit">${icono('enviar', 16)}Comentar</button>
        </div>
      </form>`;
  };
  cont.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const texto = f.querySelector('textarea').value.trim();
    if (!texto) return;
    const privado = !!f.querySelector('[name=privado]')?.checked;
    f.querySelector('button[type=submit]').disabled = true;
    try {
      await estado.api.comentar(entrega.id, texto, privado);
      await pintar();
      await revisarInsigniasNuevas();
    } catch (e) { errorAviso(e); f.querySelector('button[type=submit]').disabled = false; }
  });
  cont.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-borrar]');
    if (!b) return;
    if (!(await confirmar('¿Borrar este comentario?', { si: 'Borrar', peligro: true }))) return;
    try { await estado.api.borrarComentario(b.dataset.borrar); await pintar(); } catch (e) { errorAviso(e); }
  });
  await pintar();
}

// ---------- insignias ----------
export function discoInsignia(ins, tam = 64) {
  const color = ins.color || '#FFB547';
  return `<span class="insignia-disco" style="width:${tam}px;height:${tam}px;background:${esc(color)};color:${colorTexto(color)}">${icono(ins.icono || 'estrella', Math.round(tam * 0.46))}</span>`;
}

export async function revisarInsigniasNuevas() {
  try {
    const [todas, mias] = await Promise.all([estado.api.insignias(), estado.api.otorgadas(estado.yo.id)]);
    const clave = `insignias-vistas-${estado.yo.id}`;
    let vistas;
    try { vistas = JSON.parse(localStorage.getItem(clave) || 'null'); } catch { vistas = null; }
    const actuales = mias.map(m => m.insignia);
    if (vistas === null) { localStorage.setItem(clave, JSON.stringify(actuales)); return; }
    const nuevas = actuales.filter(s => !vistas.includes(s));
    localStorage.setItem(clave, JSON.stringify(actuales));
    if (!nuevas.length) return;
    const { modal } = await import('./ui.js');
    for (const s of nuevas) {
      const ins = todas.find(i => i.slug === s);
      if (!ins) continue;
      await modal({
        cuerpo: `<div class="celebracion">${discoInsignia(ins, 96)}
          <div class="rotulo">Nueva insignia</div>
          <h2 class="dialogo-titulo" style="margin:6px 0 8px">${esc(ins.nombre)}</h2>
          <p class="tenue">${esc(ins.descripcion)}</p></div>`,
        acciones: [{ texto: 'Seguir escribiendo', clase: 'btn-primario' }],
        ancho: 420,
      });
    }
  } catch (e) { console.warn(e); }
}

export function vacio(titulo, texto = '', accion = '') {
  return `<div class="vacio-estado"><div class="display">${esc(titulo)}</div>${texto ? `<p>${esc(texto)}</p>` : ''}${accion}</div>`;
}

export { fechaHora };
