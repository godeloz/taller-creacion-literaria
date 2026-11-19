// Lectura de una entrega: la referencia de cada dinámica (consigna, postal, dados, fachada, la voz…)
// y sus conmutadores; el texto, las reacciones y las notas los pinta la lectura crítica.
import { estado, dinamica } from '../nucleo/estado.js';
import { esc, fechaLarga } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { etiquetaDinamica, vacio, acordeonReto } from '../nucleo/componentes.js';

export default async function vistaEntrega(cont, { params, query = {} }) {
  const id = params[0];
  const e = await estado.api.entrega(id);
  if (!e) {
    cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('Este texto no está disponible',
      'Puede que haya sido ocultado, o que sea un reto de hoy: esos se abren cuando usted publica el suyo.',
      '<a class="btn" href="#/muro">Volver al muro</a>')}</div>`;
    return;
  }
  // Los textos de las consignas: la lectura crítica arma también su encabezado.
  if (e.dinamica === 'consignas' && e.item_id) {
    const { default: lecturaCritica } = await import('./lectura-critica.js');
    return lecturaCritica(cont, e, { nota: query.nota, sugerencias: 'sugerencias' in query });
  }
  const d = dinamica(e.dinamica);
  let consigna = '';
  let conFinal = false;
  let originalS7 = null;
  let fachadas = null;   // Fachadas: el módulo pinta la fachada con el recorrido
  let contrapuntos = null;   // Contrapuntos: el módulo pinta la conversación
  let partituras = null;     // Partituras: el módulo pinta la partitura debajo del texto
  if (e.dinamica === 'consignas' && e.item_id) {
    const cs = await estado.api.consigna(e.item_id).catch(() => null);
    if (cs) consigna = `<div class="consigna-ref"><b>Consigna</b>${esc(cs.titulo)}${enlaceRespuestas(e)}</div>`;
  } else if (e.dinamica === 'correo-secretos') {
    consigna = refSecreto(e);
  } else if (e.dinamica === 'juego-de-dados') {
    consigna = refDados(e);
  } else if (e.dinamica === 'fachadas') {
    fachadas = await import('../modulos/fachadas.js');
    consigna = refFachada(e, fachadas);
  } else if (e.dinamica === 'contrapuntos') {
    contrapuntos = await import('../modulos/contrapuntos.js');
    consigna = refContrapunto(e, contrapuntos);
  } else if (e.dinamica === 'partituras') {
    partituras = await import('../modulos/partituras.js');
    consigna = partituras.refHTML(e, ['libre', 'analizado'].includes(e.item_id) ? '' : enlaceRespuestas(e));
  } else if (e.item_id) {
    try {
      const c = await estado.api.contenido(e.dinamica, e.item_id);
      if (c) {
        conFinal = !!c.datos.con_final;
        if (e.dinamica === 's7') originalS7 = c.datos;
        const etiqueta = e.dinamica === 'reto' ? `Reto del ${fechaLarga(e.reto_fecha)}`
          : e.dinamica === 'maraton' ? 'Carta del Maratón'
          : e.dinamica === 'poema' ? 'Poema fuente'
          : e.dinamica === 'cutup' ? 'Juego de frases'
          : e.dinamica === 's7' ? 'Texto original'
          : e.dinamica === 'forma' ? 'Consigna'
          : e.dinamica === 'fallar' ? 'Borrador revisado'
          : e.dinamica === 'pliegues' ? 'Texto de origen'
          : e.dinamica === 'definicional' ? 'Frase de partida' : d?.nombre || '';
        // Reto del día: el nombre abre y cierra sus instrucciones.
        consigna = e.dinamica === 'reto'
          ? `<div class="consigna-ref"><b>${esc(etiqueta)}</b>${acordeonReto(c.datos)}${enlaceRespuestas(e)}</div>`
          : `<div class="consigna-ref"><b>${esc(etiqueta)}</b>${esc(c.datos.titulo || c.datos.nombre || '')}${c.datos.autor ? `, de ${esc(c.datos.autor)}` : ''}${enlaceRespuestas(e)}</div>`;
      }
    } catch { /* la consigna es opcional */ }
  }
  if (!consigna && e.dinamica === 'fallar' && e.item_id?.startsWith('propio-')) {
    consigna = `<div class="consigna-ref"><b>Texto propio</b>${esc(e.datos?.base_titulo || 'Revisión de un texto de quien escribe')}</div>`;
  }
  if (!consigna && e.dinamica === 'pliegues' && e.item_id?.startsWith('propio-')) {
    const o = e.datos?.origen || {};
    consigna = `<div class="consigna-ref"><b>Texto de origen</b>${esc(o.titulo || (o.autor ? 'Un texto' : 'Un texto propio'))}${o.autor ? `, de ${esc(o.autor)}` : ''}</div>`;
  }
  if (!consigna && e.dinamica === 'definicional' && e.item_id?.startsWith('propio-')) {
    const o = e.datos?.origen || {};
    consigna = `<div class="consigna-ref"><b>Frase de partida</b>${o.autor ? `Una frase de ${esc(o.autor)}${o.obra ? `, ${esc(o.obra)}` : ''}` : 'Una frase propia'}</div>`;
  }
  const mia = e.autor === estado.yo.id;

  // Cada dinámica conserva sus conmutadores. La lectura crítica repinta el texto cada vez que
  // cambian las notas: lo que se eligió se vuelve a aplicar en alPintar.
  const ver = { pl: 'final', df: 'color', cp: 'color', pt: 'color' };
  let panelPt = null;
  const alPintar = t => {
    t.querySelector('.v-pliegues')?.classList.toggle('ver-pliegues', ver.pl === 'pliegues');
    t.querySelector('.v-definicional')?.classList.toggle('limpia', ver.df === 'limpia');
    t.querySelector('.v-contrapuntos')?.classList.toggle('limpia', ver.cp === 'limpia');
    t.querySelector('.v-partituras')?.classList.toggle('limpia', ver.pt === 'limpia');
    panelPt?.repintar();
  };
  const marcar = b => b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });

  const alMontar = async (cont, lect) => {
    // Pliegues: la entrega trae dos caras (texto final y pliegues); se elige cuál leer.
    if (lect.querySelector('.v-pliegues')) {
      lect.insertAdjacentHTML('beforebegin', `<div class="conmutador v-pl-conmutador" role="tablist" aria-label="Versión">
        <button type="button" role="tab" data-plv="final" class="on" aria-selected="true">Texto final</button>
        <button type="button" role="tab" data-plv="pliegues" aria-selected="false">Pliegues</button></div>`);
      cont.querySelector('.v-pl-conmutador').addEventListener('click', ev => {
        const b = ev.target.closest('[data-plv]');
        if (!b) return;
        ver.pl = b.dataset.plv;
        alPintar(lect);
        marcar(b);
      });
    }

    // S+7: la reescritura o, al lado, el original (las entregas desde la versión 1.1 guardan el original con que se escribieron).
    const orig = e.dinamica === 's7' ? (e.datos?.original?.parrafos ? e.datos.original : originalS7) : null;
    if (orig?.parrafos?.length && e.datos?.cambios && Object.keys(e.datos.cambios).length) {
      const { comparacionHTML, esPoema } = await import('../modulos/s7.js');
      lect.insertAdjacentHTML('beforebegin', `<div class="conmutador s7-conmutador" role="tablist" aria-label="Versión">
        <button type="button" role="tab" data-s7v="nueva" class="on" aria-selected="true">Reescritura</button>
        <button type="button" role="tab" data-s7v="comparar" aria-selected="false">Comparar con el original</button></div>`);
      lect.insertAdjacentHTML('afterend', `<div class="s7-comparar oculto">${comparacionHTML(orig.parrafos, e.datos.cambios, esPoema(orig))}</div>`);
      cont.querySelector('.s7-conmutador').addEventListener('click', ev => {
        const b = ev.target.closest('[data-s7v]');
        if (!b) return;
        const comparar = b.dataset.s7v === 'comparar';
        lect.classList.toggle('oculto', comparar);
        cont.querySelector('.s7-comparar').classList.toggle('oculto', !comparar);
        marcar(b);
      });
    }

    // Fachadas: tocar un recuadro o un recorte lo amplía.
    if (fachadas) fachadas.activarFigura(cont.querySelector('.fa-ref'), e.datos || {});

    // Literatura definicional: la escalera con sus colores (diccionario y escritura propia) o en lectura limpia.
    if (lect.querySelector('.v-definicional')?.querySelector('.v-df-d, .v-df-p')) {
      lect.insertAdjacentHTML('beforebegin', `<div class="conmutador df-conmutador" role="tablist" aria-label="Lectura">
        <button type="button" role="tab" data-dfv="color" class="on" aria-selected="true">Con colores</button>
        <button type="button" role="tab" data-dfv="limpia" aria-selected="false">Lectura limpia</button></div>`);
      cont.querySelector('.df-conmutador').addEventListener('click', ev => {
        const b = ev.target.closest('[data-dfv]');
        if (!b) return;
        ver.df = b.dataset.dfv;
        alPintar(lect);
        marcar(b);
      });
    }

    // Contrapuntos: la historia con los colores (la voz y quien escribe), en lectura limpia o la conversación tal como se dio.
    if (lect.querySelector('.v-contrapuntos') && contrapuntos) {
      lect.insertAdjacentHTML('beforebegin', `<div class="conmutador cp-conmutador" role="tablist" aria-label="Lectura">
        <button type="button" role="tab" data-cpv="color" class="on" aria-selected="true">Con colores</button>
        <button type="button" role="tab" data-cpv="limpia" aria-selected="false">Lectura limpia</button>
        <button type="button" role="tab" data-cpv="conversacion" aria-selected="false">La conversación</button></div>
        <p class="cp-leyenda cp-leyenda-entrega"><span class="cp-c-v">La voz</span> · <span>Quien escribe</span></p>`);
      lect.insertAdjacentHTML('afterend', `<div class="cp-conversacion oculto"><p class="tenue cp-conv-nota">La conversación tal como se dio, antes de la versión preliminar.</p>${contrapuntos.conversacionHTML(e.datos?.turnos)}</div>`);
      cont.querySelector('.cp-conmutador').addEventListener('click', ev => {
        const b = ev.target.closest('[data-cpv]');
        if (!b) return;
        const v = b.dataset.cpv;
        if (v !== 'conversacion') ver.cp = v;
        alPintar(lect);
        lect.classList.toggle('oculto', v === 'conversacion');
        cont.querySelector('.cp-conversacion').classList.toggle('oculto', v !== 'conversacion');
        cont.querySelector('.cp-leyenda-entrega').classList.toggle('oculto', v !== 'color');
        marcar(b);
      });
    }

    // Partituras: el texto con los colores de sus rachas (o limpio) y, debajo, la partitura que sigue la lectura.
    if (lect.querySelector('.v-partituras') && partituras) {
      if (lect.querySelector('.v-partituras [class*="pt-c-"]')) {
        lect.insertAdjacentHTML('beforebegin', `<div class="conmutador pt-conmutador" role="tablist" aria-label="Lectura">
          <button type="button" role="tab" data-ptv="color" class="on" aria-selected="true">Con colores</button>
          <button type="button" role="tab" data-ptv="limpia" aria-selected="false">Lectura limpia</button></div>`);
        cont.querySelector('.pt-conmutador').addEventListener('click', ev => {
          const b = ev.target.closest('[data-ptv]');
          if (!b) return;
          ver.pt = b.dataset.ptv;
          alPintar(lect);
          marcar(b);
        });
      }
      panelPt = partituras.montarEnEntrega(cont, lect, e);
    }
  };

  // El texto se lee y se comenta como en las consignas: fragmentos con notas al margen.
  const { default: lecturaCritica } = await import('./lectura-critica.js');
  const quitar = await lecturaCritica(cont, e, {
    nota: query.nota,
    sugerencias: 'sugerencias' in query,   // desde el aviso: abrir los cambios sugeridos
    volver: `<a class="btn btn-fantasma btn-chico" href="#/muro">${icono('izquierda', 16)}Muro</a>`,
    acciones: `${mia && !e.archivada_en && e.dinamica === 'fallar' && conFinal ? `<a class="btn btn-chico btn-fantasma" href="#/d/fallar/${encodeURIComponent(e.item_id)}?autora">${icono('libro', 16)}Versión final</a>` : ''}
      ${mia && !e.archivada_en ? `<a class="btn btn-chico" href="#/editar/${e.id}">${icono('lapiz', 16)}${e.dinamica === 'fallar' && !e.item_id?.startsWith('propio-') ? 'Explicaciones' : 'Editar'}</a>` : ''}`,
    etiqueta: etiquetaDinamica(e.dinamica),
    ref: consigna,
    contexto: d?.nombre || '',
    alPintar,
    alMontar,
  });
  return () => { quitar?.(); panelPt?.destruir(); };
}

// Enlace a todas las respuestas a la misma consigna (texto, carta, poema o reto del día).
function enlaceRespuestas(e) {
  if (e.dinamica === 'consignas' && e.item_id) return `<a class="enlace-respuestas" href="#/consignas/${encodeURIComponent(e.item_id)}">Ver los textos de esta consigna</a>`;
  const href = e.dinamica === 'reto' && e.reto_fecha ? `#/muro?reto=${e.reto_fecha}`
    : e.item_id && !e.item_id.startsWith('propio-') ? `#/muro?dinamica=${encodeURIComponent(e.dinamica)}&item=${encodeURIComponent(e.item_id)}` : '';
  const a = { reto: 'a este reto', maraton: 'a esta carta', poema: 'a este poema', s7: 'a este texto', fallar: 'a este texto', pliegues: 'a este texto', 'correo-secretos': 'a este secreto', 'juego-de-dados': 'a esta mesa', definicional: 'a esta frase', fachadas: 'a esta fachada', contrapuntos: 'a esta voz', partituras: 'a esta partitura' }[e.dinamica] || 'a esta consigna';
  return href ? `<a class="enlace-respuestas" href="${href}">Ver todas las respuestas ${a}</a>` : '';
}

// Correo de secretos: la postal (si la hay) y el camino que tomó quien escribe. La traducción va en la vista, como epígrafe.
// La imagen se carga solo al abrir la entrega (no en el muro).
function refSecreto(e) {
  const d = e.datos || {};
  const caminos = { 1: 'Primera frase', 2: 'Revelación final', 3: 'Secreto oculto' };
  const img = d.imagen && /^[a-z0-9-]+$/.test(d.imagen)
    ? `<img src="img/correo-secretos/${d.imagen}.webp" ${d.ancho ? `width="${Number(d.ancho)}" height="${Number(d.alto)}"` : ''} alt="${esc(`Postal: ${d.traduccion || ''}`)}" loading="lazy" decoding="async">` : '';
  return `<div class="consigna-ref cs-ref">
    ${img ? `<figure class="cs-ref-postal">${img}</figure>` : ''}
    <div><b>${d.imagen ? 'Postal de PostSecret' : 'Secreto del Banco'}</b>${caminos[d.camino] ? `Camino ${Number(d.camino)} · ${caminos[d.camino]}` : ''}${enlaceRespuestas(e)}</div>
  </div>`;
}

// Juego de dados: los dados con que se escribió la historia (los usados, resaltados), la mesa y las tiradas.
// Sin el nombre de cada dado (solo como texto alternativo, para lectores de pantalla). La vista trae
// además una línea de texto con los nombres de los dados (para el PDF); aquí se oculta.
function refDados(e) {
  const d = e.datos || {};
  const dados = Array.isArray(d.dados) ? d.dados.filter(x => /^[a-z0-9-]+$/.test(x)) : [];
  const n = Number(d.tiradas) || 0;
  return `<div class="consigna-ref jd-ref">
    <div><b>Juego de dados</b>${esc(d.mesa_nombre || 'Mesa')}${n ? ` · ${n} ${n === 1 ? 'tirada' : 'tiradas'}` : ''}${enlaceRespuestas(e)}</div>
    ${dados.length ? `<div class="jd-ref-dados">${dados.map((x, k) => `<figure class="${d.usados?.[k] ? 'usado' : ''}">
      <img src="img/juego-de-dados/mini/${x}.webp" width="240" height="240" alt="${esc(d.nombres?.[k] || x)}${d.usados?.[k] ? ' (usado)' : ''}" loading="lazy" decoding="async">
      </figure>`).join('')}</div>` : ''}
  </div>`;
}

// Fachadas: la fachada con los recuadros y el trazo del recorrido, y la tira de recortes (los dibuja el módulo
// con la imagen de GitHub y los números de datos.puntos; no hay recortes guardados). La vista trae el trazo
// en SVG (para el muro y el PDF); aquí se oculta.
function refFachada(e, fa) {
  const d = e.datos || {};
  const n = Array.isArray(d.puntos) ? d.puntos.length : 0;
  return `<div class="consigna-ref fa-ref">
    <div><b>Fachadas</b>${esc(d.titulo_fachada || 'Una fachada')}${n ? ` · ${n} puntos` : ''}${d.credito ? `<span class="fa-ref-credito">${esc(d.credito)}</span>` : ''}${enlaceRespuestas(e)}</div>
    ${fa.figuraHTML(d)}
  </div>`;
}

// Contrapuntos: con quién se conversó (la voz se revela en la entrega; su nombre no hace parte de la historia).
function refContrapunto(e, cp) {
  const d = e.datos || {};
  const t = Array.isArray(d.turnos) ? d.turnos : [];
  const r = t.filter(x => typeof x?.r === 'string').length;
  return `<div class="consigna-ref cp-ref"><b>La voz</b>${d.banco?.revelacion ? esc(d.banco.revelacion) : d.banco ? cp.vozHTML(d.banco) : 'Una voz'}${t.length ? ` · ${r} ${r === 1 ? 'respuesta' : 'respuestas'}` : ''}${enlaceRespuestas(e)}</div>`;
}
