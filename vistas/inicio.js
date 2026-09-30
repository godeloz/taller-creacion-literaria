// Pantalla de inicio: reto del día, racha, ranking, dinámicas y lo último publicado.
import { estado, esTutor, estaAbierta, claseActiva } from '../nucleo/estado.js';
import { esc, saludo, fechaLarga, hoyISO, enlazar } from '../nucleo/ui.js';
import { icono, llama } from '../nucleo/iconos.js';
import { avatar, tarjetaEntrega, vacio, revisarInsigniasNuevas } from '../nucleo/componentes.js';
import { tileDinamica } from './dinamicas.js';

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function tarjetaRacha(r) {
  const nota = r.hoy_hecho ? 'Hoy ya sumó.'
    : r.actual > 0 ? 'Publique el reto de hoy para sumar un día más.'
    : 'Publique el reto de hoy para empezar una racha.';
  const comodin = r.comodin_disponible ? 'Comodín disponible esta semana.' : 'Ya usó el comodín de esta semana.';
  return `<section class="racha-tarjeta" aria-label="Racha">
    <div class="racha-num">${llama(40, '#16141C')}<b>${r.actual}</b><span>${r.actual === 1 ? 'día' : 'días'} de racha</span></div>
    <div class="semana">${r.semana.map((d, i) => `<div><span class="dia dia-${d.estado}" title="${esc(fechaLarga(d.fecha))}: ${d.estado}">${d.estado === 'hecho' ? icono('check', 15, { grosor: 2.4 }) : ''}</span>${DIAS[i]}</div>`).join('')}</div>
    <div class="racha-nota">${nota} ${comodin}<br><span style="opacity:.75">Mejor racha: ${r.mejor}</span></div>
  </section>`;
}

export function listaRanking(filas) {
  if (!filas.length) return '<p class="tenue" style="margin:4px 0 0">Nadie tiene una racha activa todavía. Puede ser la primera persona.</p>';
  return `<div class="ranking">${filas.map((f, i) => `
    <a class="ranking-fila ${f.usuario === estado.yo.id ? 'yo' : ''}" href="#/perfil/${f.usuario}">
      <span class="ranking-pos">${i + 1}</span>${avatar(f, 30)}
      <span class="ranking-nombre">${f.usuario === estado.yo.id ? 'Usted' : esc(f.nombre)}</span>
      <span class="ranking-num">${llama(16)}${f.actual}</span>
    </a>`).join('')}</div>`;
}

export default async function inicio(cont) {
  const api = estado.api;
  const [reto, mio, conteo, racha, ranking, recientes] = await Promise.all([
    api.retoDelDia().catch(() => null),
    api.miRetoHoy().catch(() => null),
    api.conteoReto().catch(() => 0),
    api.racha(estado.yo.id).catch(() => null),
    api.ranking().catch(() => []),
    api.entregas({ limite: 6 }).catch(() => []),
  ]);
  const reacciones = await api.reacciones(recientes.map(e => e.id)).catch(() => []);
  const nombre = estado.yo.nombre.split(' ')[0];
  const dinamicas = estado.dinamicas.filter(d => d.en_menu && d.estado !== 'oculta');
  const abiertas = dinamicas.filter(estaAbierta).length;

  let retoHTML;
  if (!reto) {
    retoHTML = `<section class="reto-tarjeta reto-hecho"><span class="rotulo">Reto del día</span><h2>El reto de hoy todavía no está listo</h2><p>Vuelva más tarde.</p></section>`;
  } else if (mio) {
    retoHTML = `<section class="reto-tarjeta reto-hecho">
      <span class="rotulo">${icono('check', 14)} Reto del día · publicado</span>
      <h2>${esc(reto.datos.titulo)}</h2>
      <p>Ya publicó su texto de hoy. ${conteo > 1 ? `Ya puede leer lo que escribieron sus ${conteo - 1} compañeros.` : 'Todavía nadie más lo ha publicado.'}</p>
      <div class="fila">
        <a class="btn btn-primario" href="#/muro?reto=${hoyISO()}">Leer las respuestas del grupo</a>
        <a class="btn btn-fantasma" href="#/entrega/${mio.id}">Ver el mío</a>
      </div>
    </section>`;
  } else {
    const pasos = reto.datos.pasos || (reto.datos.consigna ? [reto.datos.consigna] : []);
    retoHTML = `<section class="reto-tarjeta">
      <span class="rotulo">Reto del día · ${esc(fechaLarga(hoyISO()))}</span>
      <h2>${esc(reto.datos.titulo)}</h2>
      ${pasos.slice(0, 3).map(p => `<p>${enlazar(p)}</p>`).join('')}
      <div class="fila">
        <a class="btn btn-blanco" href="#/reto">${icono('lapiz', 18)}Escribir el reto</a>
        <span class="meta">${conteo ? `${conteo} ${conteo === 1 ? 'compañero ya lo publicó' : 'compañeros ya lo publicaron'} · ` : ''}Máximo ${reto.datos.limite_palabras || 500} palabras · Las respuestas se abren cuando publique la suya</span>
      </div>
    </section>`;
  }

  cont.innerHTML = `
  <div class="contenedor">
    <h1 class="saludo">${saludo()}, <em>${esc(nombre)}</em>.</h1>
    <div class="rejilla-inicio">
      ${retoHTML}
      <div class="columna">
        ${racha ? tarjetaRacha(racha) : ''}
        <section class="tarjeta" style="padding:22px 24px">
          <div class="rotulo" style="margin-bottom:10px">Rachas activas</div>
          ${listaRanking(ranking)}
        </section>
      </div>
    </div>

    <section style="margin-top:40px">
      <div class="fila" style="align-items:baseline;margin-bottom:16px">
        <h2 class="titulo-seccion">Dinámicas</h2><span class="espaciador"></span>
        <span class="tenue">${abiertas} abiertas · ${dinamicas.length - abiertas} en camino</span>
      </div>
      <div class="rejilla-dinamicas">${dinamicas.map(d => tileDinamica(d)).join('')}</div>
    </section>

    <section style="margin-top:40px">
      <div class="fila" style="align-items:baseline;margin-bottom:16px">
        <h2 class="titulo-seccion">Recién publicado</h2><span class="espaciador"></span>
        <a class="btn btn-chico" href="#/muro">Ir al muro</a>
      </div>
      <div class="rejilla-inicio">
        <div class="muro" style="columns:2 300px">${recientes.length ? recientes.slice(0, 4).map(e => tarjetaEntrega(e, reacciones)).join('') : vacio('El muro está esperando', 'Cuando alguien publique, aparecerá aquí.')}</div>
        <div class="columna">
          <a class="din" href="#/cuaderno" style="background:var(--verde);color:var(--tinta);min-height:220px">
            <span class="din-sello" style="background:var(--tinta);color:var(--verde)">${icono('cuaderno', 26)}</span>
            <div><div class="din-nombre" style="font-size:32px">Cuaderno</div><div class="din-desc">Privado: solo usted lo ve. Proyectos, apuntes e ideas sueltas.</div></div>
          </a>
          ${esTutor() ? `<a class="din" href="#/tutor" style="background:var(--tinta);color:#fff;min-height:160px">
            <span class="din-sello" style="background:var(--lima);color:var(--tinta)">${icono('tutor', 26)}</span>
            <div><div class="din-nombre">Panel del tutor</div><div class="din-desc">Entregas, contenido, retos y clase en vivo.</div></div></a>` : ''}
        </div>
      </div>
    </section>
  </div>`;

  revisarInsigniasNuevas();
}
