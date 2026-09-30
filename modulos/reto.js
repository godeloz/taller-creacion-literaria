// Módulo: Reto del día.
import { estado, soyVisible, avisoPublicar, miModo } from '../nucleo/estado.js';
import { esc, enlazar, fechaLarga, hoyISO } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { montarEscritorio } from '../nucleo/escritorio.js';
import { publicarEntrega } from '../nucleo/publicar.js';
import { vacio } from '../nucleo/componentes.js';

function panel(reto, fecha, { conteo = 0, editando = false } = {}) {
  const d = reto.datos;
  const pasos = d.pasos?.length ? d.pasos : d.consigna ? [d.consigna] : [];
  return `
    <span class="rotulo">Reto del día · ${esc(fechaLarga(fecha))}</span>
    <h1>${esc(d.titulo)}</h1>
    <div class="consigna-texto">
      ${pasos.length > 1 ? `<ol>${pasos.map(p => `<li>${enlazar(p)}</li>`).join('')}</ol>` : pasos.map(p => `<p>${enlazar(p)}</p>`).join('')}
    </div>
    ${d.entrena ? `<details class="entrena" style="margin-top:14px"><summary>${icono('info', 16)}¿Qué entrena este reto?</summary><p>${esc(d.entrena)}</p></details>` : ''}
    <div class="consigna-extra">
      <span class="linea-ico">${icono('pagina', 16)}Máximo ${d.limite_palabras || 500} palabras.</span>
      ${d.cronometro_min ? `<span class="linea-ico">${icono('reloj', 16)}Use el cronómetro de ${d.cronometro_min} minutos de la barra del editor.</span>` : ''}
      ${editando ? '' : miModo() === 'privado'
        ? `<span class="linea-ico">${icono('candado', 16)}Participa en modo privado: su reto solo lo ve el tutor.</span>`
        : miModo() === 'observador'
          ? `<span class="linea-ico">${icono('ojo', 16)}Como observador puede leer las respuestas del grupo cuando quiera. Su reto solo lo ve el tutor.</span>`
          : `<span class="linea-ico">${icono('candado', 16)}Las respuestas del grupo se abren cuando publique la suya.${conteo ? ` Ya hay ${conteo}.` : ''}</span>`}
      <span class="linea-ico">${icono('llama', 16)}Publicarlo hoy suma a su racha.</span>
    </div>`;
}

export default {
  slug: 'reto',
  nombre: 'Reto del día',
  version: '1.0',

  async abrir(cont, ctx) {
    if (ctx.entrega) {
      const e = ctx.entrega;
      const c = await estado.api.contenido('reto', e.item_id);
      const reto = { item_id: e.item_id, datos: c?.datos || { titulo: 'Reto del día', pasos: [] } };
      const esc_ = montarEscritorio(cont, {
        acento: 'var(--coral)', panelHTML: panel(reto, e.reto_fecha, { editando: true }), clave: `reto:${e.id}`,
        limite: reto.datos.limite_palabras || 500, cronometroMin: reto.datos.cronometro_min, titulo: e.titulo || '',
        html: e.vista || '', editando: true, textoBoton: 'Guardar cambios',
        alPublicar: d => publicarEntrega({ dinamica: 'reto', item_id: e.item_id, titulo: d.titulo, texto: d.texto, vista: d.html, datos: {} }, { entregaExistente: e }),
      });
      return () => esc_.destruir();
    }

    const [reto, mio, conteo] = await Promise.all([
      estado.api.retoDelDia(), estado.api.miRetoHoy(), estado.api.conteoReto().catch(() => 0),
    ]);
    const hoy = hoyISO();
    if (!reto) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">${vacio('El reto de hoy todavía no está listo', 'El banco de retos está vacío o no hay retos activos. Avísele al tutor.')}</div>`;
      return;
    }
    if (mio) {
      cont.innerHTML = `<div class="contenedor contenedor-estrecho">
        <div class="reto-tarjeta reto-hecho">
          <span class="rotulo">${icono('check', 14)} Reto del día · publicado</span>
          <h2>${esc(reto.datos.titulo)}</h2>
          <p>Ya publicó su texto de hoy. Mañana habrá un reto nuevo.</p>
          <div class="fila">
            <a class="btn btn-primario" href="#/muro?reto=${hoy}">Leer las respuestas del grupo</a>
            <a class="btn" href="#/entrega/${mio.id}">Ver el mío</a>
            <a class="btn btn-fantasma" href="#/editar/${mio.id}">${icono('lapiz', 16)}Editar</a>
          </div>
        </div></div>`;
      return;
    }
    const esc_ = montarEscritorio(cont, {
      acento: 'var(--coral)', panelHTML: panel(reto, hoy, { conteo }), clave: `reto:${hoy}`,
      limite: reto.datos.limite_palabras || 500, cronometroMin: reto.datos.cronometro_min,
      placeholder: 'Empiece aquí. El texto se guarda solo mientras escribe.',
      textoBoton: 'Publicar reto',
      avisoPublicar: soyVisible() ? 'Al publicar, el grupo podrá leer su reto y usted podrá leer el de los demás. Después podrá editarlo, pero no borrarlo.' : avisoPublicar('su reto'),
      alPublicar: d => publicarEntrega({ dinamica: 'reto', item_id: reto.item_id, titulo: d.titulo, texto: d.texto, vista: d.html, datos: {}, modulo_version: '1.0' }, { irA: `#/muro?reto=${hoy}` }),
    });
    return () => esc_.destruir();
  },

  paquete: {
    plantilla: 'plantillas/retos.json',
    describir: d => d.titulo,
    validar(json) {
      const errores = [];
      const lista = Array.isArray(json) ? json : json?.retos;
      if (!Array.isArray(lista)) return { items: [], errores: ['El archivo debe tener una lista "retos": [ … ].'] };
      const vistos = new Set();
      const items = [];
      lista.forEach((r, i) => {
        const n = `Reto ${i + 1}`;
        if (!r || typeof r !== 'object') { errores.push(`${n}: no es un objeto.`); return; }
        const id = String(r.id || '').trim();
        if (!id) errores.push(`${n}: falta "id".`);
        else if (vistos.has(id)) errores.push(`${n}: el id "${id}" está repetido.`);
        vistos.add(id);
        if (!String(r.titulo || '').trim()) errores.push(`${n} (${id}): falta "titulo".`);
        const pasos = Array.isArray(r.pasos) ? r.pasos.filter(p => typeof p === 'string' && p.trim()) : [];
        if (!pasos.length && !String(r.consigna || '').trim()) errores.push(`${n} (${id}): necesita "pasos" (lista de instrucciones) o "consigna".`);
        const lim = r.limite_palabras ?? 500;
        if (!Number.isInteger(lim) || lim < 10 || lim > 5000) errores.push(`${n} (${id}): "limite_palabras" debe ser un número entero.`);
        if (r.cronometro_min != null && (!Number.isInteger(r.cronometro_min) || r.cronometro_min < 1 || r.cronometro_min > 120)) errores.push(`${n} (${id}): "cronometro_min" debe ser un número de minutos.`);
        const datos = { titulo: String(r.titulo || '').trim(), limite_palabras: lim };
        if (pasos.length) datos.pasos = pasos; else datos.consigna = String(r.consigna).trim();
        if (r.entrena) datos.entrena = String(r.entrena);
        if (r.cronometro_min) datos.cronometro_min = r.cronometro_min;
        items.push({ item_id: id, datos });
      });
      return { items, errores };
    },
  },
};
