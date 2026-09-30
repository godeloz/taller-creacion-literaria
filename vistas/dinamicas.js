// Menú visual de dinámicas.
import { estado, estaAbierta } from '../nucleo/estado.js';
import { esc, fechaLarga } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { colorTexto, ICONO_DINAMICA } from '../nucleo/componentes.js';

export function tileDinamica(d, { conDescripcion = false } = {}) {
  const abierta = estaAbierta(d);
  const ico = ICONO_DINAMICA[d.slug] || 'chispa';
  if (!abierta) {
    const cuando = d.desbloqueo ? `Se abre el ${fechaLarga(d.desbloqueo)}` : 'Próximamente';
    return `<div class="din din-cerrada">
      <span class="din-candado">${icono('candado', 18)}</span>
      <span class="din-sello">${icono(ico, 26)}</span>
      <div><div class="din-nombre">${esc(d.nombre)}</div><div class="din-desc">${esc(cuando)}</div></div>
    </div>`;
  }
  const fondo = d.color || '#FF6B4A';
  const texto = colorTexto(fondo);
  return `<a class="din" href="#/d/${d.slug}" style="background:${esc(fondo)};color:${texto}">
    <span class="din-sello" style="background:${texto};color:${esc(fondo)}">${icono(ico, 26)}</span>
    <div><div class="din-nombre">${esc(d.nombre)}</div>${conDescripcion && d.descripcion ? `<div class="din-desc">${esc(d.descripcion)}</div>` : ''}</div>
  </a>`;
}

export default async function vistaDinamicas(cont) {
  const lista = estado.dinamicas.filter(d => d.en_menu && d.estado !== 'oculta');
  const abiertas = lista.filter(estaAbierta).length;
  cont.innerHTML = `
  <div class="contenedor">
    <div class="fila" style="align-items:flex-end;margin-bottom:24px">
      <h1 class="saludo" style="margin:0">Dinámicas</h1>
      <span class="espaciador"></span>
      <span class="tenue">${abiertas} abiertas · ${lista.length - abiertas} en camino</span>
    </div>
    <div class="rejilla-dinamicas" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
      <a class="din" href="#/reto" style="background:var(--coral);color:var(--tinta)">
        <span class="din-sello" style="background:var(--tinta);color:var(--coral)">${icono('chispa', 26)}</span>
        <div><div class="din-nombre">Reto del día</div><div class="din-desc">El mismo ejercicio para todo el grupo. Cambia cada día y suma a su racha.</div></div>
      </a>
      ${lista.map(d => tileDinamica(d, { conDescripcion: true })).join('')}
    </div>
  </div>`;
}
