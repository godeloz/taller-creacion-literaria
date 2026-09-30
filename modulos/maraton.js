// Módulo: Maratón de ejercicios (mazo de cartas de escritura).
import { estado } from '../nucleo/estado.js';
import { esc, sanitizar, local, barajar, modal, parrafos } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { montarEscritorio } from '../nucleo/escritorio.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

const ACENTO = '#4D7CFF';

function panelCarta(carta, posicion, total, { conMazo = true, publicada = null } = {}) {
  const d = carta.datos;
  return `
    <div class="fila"><span class="rotulo">Carta ${posicion} de ${total}</span><span class="espaciador"></span>
      ${conMazo ? `<button type="button" class="btn btn-fantasma btn-chico" id="ver-mazo">${icono('cartas', 16)}Mazo</button>` : ''}</div>
    <h1>${esc(d.titulo)}</h1>
    <div class="consigna-texto"><p>${sanitizar(d.consigna)}</p></div>
    ${d.entrena ? `<details class="entrena"><summary>${icono('info', 16)}¿Qué entrena esta carta?</summary><p>${esc(d.entrena)}</p></details>` : ''}
    ${conMazo ? `<div class="fila" style="margin-top:18px"><button type="button" class="btn btn-chico" id="otra-carta">${icono('barajar', 16)}Otra carta</button></div>` : ''}
    <div class="consigna-extra">
      ${publicada ? `<span class="linea-ico" style="color:var(--verde)">${icono('check', 16)}Ya publicó esta carta.</span>` : ''}
      ${d.fuente ? `<span class="linea-ico">${icono('libro', 16)}${esc(d.fuente)}</span>` : ''}
    </div>`;
}

function mazo(ids) {
  const clave = `maraton-mazo:${estado.yo.id}`;
  let m = local(clave);
  if (!m || !Array.isArray(m.orden) || m.orden.length !== ids.length || !ids.every(i => m.orden.includes(i))) {
    m = { orden: barajar(ids), pos: 0 };
    local(clave, m);
  }
  return {
    actual: () => m.orden[m.pos % m.orden.length],
    siguiente(evitar) {
      m.pos++;
      if (m.pos >= m.orden.length) { m.orden = barajar(ids); m.pos = 0; if (m.orden[0] === evitar && ids.length > 1) m.pos = 1; }
      local(clave, m);
      return m.orden[m.pos];
    },
    ir(id) { const i = m.orden.indexOf(id); if (i >= 0) { m.pos = i; local(clave, m); } },
  };
}

export default {
  slug: 'maraton',
  nombre: 'Maratón de ejercicios',
  version: '1.0',

  async abrir(cont, ctx) {
    const cartas = await estado.api.contenidos('maraton');
    if (ctx.entrega) {
      const e = ctx.entrega;
      const carta = cartas.find(c => c.item_id === e.item_id) || (await estado.api.contenido('maraton', e.item_id)) || { item_id: e.item_id, datos: { titulo: 'Carta', consigna: '' } };
      const pos = Math.max(1, cartas.findIndex(c => c.item_id === e.item_id) + 1);
      const es = montarEscritorio(cont, {
        acento: ACENTO, panelHTML: panelCarta(carta, pos, cartas.length, { conMazo: false }), clave: `maraton:${e.item_id}`,
        titulo: e.titulo || '', html: e.vista || '', editando: true, textoBoton: 'Guardar cambios',
        alPublicar: d => publicarEntrega({ dinamica: 'maraton', item_id: e.item_id, titulo: d.titulo, texto: d.texto, vista: d.html, datos: {} }, { entregaExistente: e }),
      });
      return () => es.destruir();
    }

    if (!cartas.length) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('El mazo está vacío', 'El tutor todavía no ha cargado cartas para esta dinámica.')}</div>`;
      return;
    }
    const ids = cartas.map(c => c.item_id);
    const m = mazo(ids);
    let id = ctx.item_id && ids.includes(ctx.item_id) ? ctx.item_id : null;
    if (!id && ctx.sesion?.item_id && ids.includes(ctx.sesion.item_id)) id = ctx.sesion.item_id;
    if (!id) { location.replace(`#/d/maraton/${encodeURIComponent(m.actual())}`); return; }
    m.ir(id);
    const carta = cartas.find(c => c.item_id === id);
    const pos = ids.indexOf(id) + 1;
    const mias = await estado.api.entregas({ autor: estado.yo.id, dinamica: 'maraton', incluirOcultas: true });
    const publicadas = new Map(mias.map(e => [e.item_id, e]));
    const publicada = publicadas.get(id);

    let limpiar = () => {};
    if (publicada) {
      cont.innerHTML = `
      <div class="contenedor" style="max-width:1400px">
        <div class="escritorio" style="--acento:${ACENTO}">
          <aside class="consigna-panel">${panelCarta(carta, pos, cartas.length, { publicada })}</aside>
          <section class="hoja">
            <div class="rotulo" style="color:var(--verde);margin-bottom:10px">${icono('check', 14)} Publicada</div>
            ${publicada.titulo ? `<h1>${esc(publicada.titulo)}</h1>` : ''}
            <div class="lectura" style="max-height:48vh;overflow:hidden;mask-image:linear-gradient(#000 70%,transparent)">${parrafos(publicada.texto)}</div>
            <div class="fila" style="margin-top:18px">
              <a class="btn btn-primario" href="#/entrega/${publicada.id}">Ver publicación</a>
              <a class="btn" href="#/editar/${publicada.id}">${icono('lapiz', 16)}Editar</a>
              <a class="btn btn-fantasma" href="#/muro?dinamica=maraton">Leer al grupo</a>
            </div>
          </section>
        </div>
      </div>`;
    } else {
      const es = montarEscritorio(cont, {
        acento: ACENTO, panelHTML: panelCarta(carta, pos, cartas.length), clave: `maraton:${id}`,
        placeholder: 'Escriba mucho, escriba raro. El texto se guarda solo.',
        alPublicar: d => publicarEntrega({ dinamica: 'maraton', item_id: id, titulo: d.titulo, texto: d.texto, vista: d.html, datos: {}, modulo_version: '1.0' }),
      });
      limpiar = () => es.destruir();
    }

    cont.querySelector('#otra-carta')?.addEventListener('click', () => {
      location.hash = `#/d/maraton/${encodeURIComponent(m.siguiente(id))}`;
    });
    cont.querySelector('#ver-mazo')?.addEventListener('click', async () => {
      const elegido = await modal({
        titulo: 'El mazo',
        cuerpo: `<p class="tenue">${cartas.length} cartas. La marca indica las que ya publicó.</p>
          <div style="display:flex;flex-direction:column;gap:2px">${cartas.map((c, i) => `
            <button type="button" class="cuaderno-item" data-c="${esc(c.item_id)}" style="${c.item_id === id ? 'background:#E6EDFF' : ''}">
              <span class="tenue" style="font-family:var(--f-mono);font-size:12px;width:24px">${String(i + 1).padStart(2, '0')}</span>
              ${esc(c.datos.titulo)}
              <small>${publicadas.has(c.item_id) ? icono('check', 16) : ''}</small>
            </button>`).join('')}</div>`,
        acciones: [{ texto: 'Cerrar', clase: 'btn-fantasma', valor: null }],
        alAbrir: (velo, cerrar) => velo.addEventListener('click', ev => {
          const b = ev.target.closest('[data-c]');
          if (b) cerrar(b.dataset.c);
        }),
      });
      if (elegido && typeof elegido === 'string') location.hash = `#/d/maraton/${encodeURIComponent(elegido)}`;
    });
    return limpiar;
  },

  paquete: {
    plantilla: 'plantillas/maraton.json',
    describir: d => d.titulo,
    validar(json) {
      const errores = [];
      const lista = Array.isArray(json) ? json : json?.cartas;
      if (!Array.isArray(lista)) return { items: [], errores: ['El archivo debe tener una lista "cartas": [ … ].'] };
      const vistos = new Set();
      const items = [];
      lista.forEach((c, i) => {
        const n = `Carta ${i + 1}`;
        if (!c || typeof c !== 'object') { errores.push(`${n}: no es un objeto.`); return; }
        const id = String(c.id || '').trim();
        if (!id) errores.push(`${n}: falta "id".`);
        else if (vistos.has(id)) errores.push(`${n}: el id "${id}" está repetido.`);
        vistos.add(id);
        if (!String(c.titulo || '').trim()) errores.push(`${n} (${id}): falta "titulo".`);
        if (!String(c.consigna || '').trim()) errores.push(`${n} (${id}): falta "consigna".`);
        const datos = { titulo: String(c.titulo || '').trim(), consigna: String(c.consigna || '').trim() };
        if (c.entrena) datos.entrena = String(c.entrena);
        if (c.fuente) datos.fuente = String(c.fuente);
        items.push({ item_id: id, datos });
      });
      return { items, errores };
    },
  },
};
