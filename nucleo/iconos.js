// Iconografía de línea (trazo redondeado) y avatares del taller.

const P = {
  inicio: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  dinamicas: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  muro: '<rect x="4" y="4" width="7" height="10" rx="2"/><rect x="13" y="4" width="7" height="6" rx="2"/><rect x="4" y="16" width="7" height="4" rx="2"/><rect x="13" y="12" width="7" height="8" rx="2"/>',
  cuaderno: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>',
  tutor: '<path d="M12 3l8 4-8 4-8-4z"/><path d="M6 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3V9"/><path d="M20 7v6"/>',
  salir: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
  candado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  reloj: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2"/><path d="M10 3h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  lapiz: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  basura: '<path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="M7 7l1 13h8l1-13"/>',
  descargar: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  subir: '<path d="M12 16V5"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoNo: '<path d="M4 4l16 16"/><path d="M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.8 3.5M6.3 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.8-.9"/>',
  izquierda: '<path d="M15 5l-7 7 7 7"/>',
  derecha: '<path d="M9 5l7 7-7 7"/>',
  barajar: '<path d="M4 7h3.5c2 0 3 1 4.5 3.5S14.5 17 16.5 17H20"/><path d="M4 17h3.5c1.3 0 2.2-.5 3-1.4"/><path d="M13.5 8.4c.8-.9 1.7-1.4 3-1.4H20"/><path d="M17.5 4.5L20 7l-2.5 2.5"/><path d="M17.5 14.5L20 17l-2.5 2.5"/>',
  enviar: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  cartas: '<rect x="7" y="3" width="12" height="16" rx="2"/><path d="M4 6.5V19a2 2 0 0 0 2 2h9"/>',
  fichas: '<rect x="3" y="5" width="7" height="5" rx="1"/><rect x="12" y="5" width="9" height="5" rx="1"/><rect x="6" y="14" width="10" height="5" rx="1"/>',
  tijeras: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5L20 19M8.5 15.5L20 5"/>',
  curva: '<path d="M2 16c3 0 4-9 8-9s4 11 12 3"/>',
  diccionario: '<path d="M6 4h12v16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 9l2 5 2-5M9.8 12h2.4"/><path d="M15 9v5"/>',
  llama: '<path d="M12 21c-3.9 0-6.8-2.6-6.8-6.3 0-3.5 2.6-5.4 3.7-9.2 2.3 1.4 3.1 3.5 3.1 5.2 1.1-.7 1.8-1.9 2-3.2 2.1 1.7 4.8 4.5 4.8 7.3 0 3.6-2.8 6.2-6.8 6.2z"/>',
  chispa: '<path d="M12 3l1.8 5.7 5.7 1.8-5.7 1.8L12 18l-1.8-5.7-5.7-1.8 5.7-1.8z"/>',
  estrella: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>',
  pagina: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h4"/>',
  pluma: '<path d="M20 4C12 4 6 9 6 17l-2 3"/><path d="M6 17c5 0 11-4 14-13"/><path d="M9 13h6"/>',
  envivo: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  comentario: '<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  calendario: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3 2.8 3 6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  proyectar: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  libro: '<path d="M4 5c3-1 5.5-1 8 1 2.5-2 5-2 8-1v14c-3-1-5.5-1-8 1-2.5-2-5-2-8-1z"/><path d="M12 6v14"/>',
  enfoque: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
  cursiva: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
  negrita: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  alinIzq: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alinCen: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alinDer: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  ordenar: '<path d="M4 6h10M4 12h7M4 18h4"/><path d="M17 5v14M14 16l3 3 3-3"/>',
  reiniciar: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  imprimir: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  medalla: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11L6 3h4l2 5 2-5h4l-2.5 8"/>',
  // reacciones
  gusta: '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7c1.2 0 2 .9 2 2v3h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>',
  encanta: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  detuve: '<path d="M7 3h10v18l-5-3.5L7 21z"/>',
  imagen: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M12 1.5v1.5M19 3.5l-1 1M5 3.5l1 1"/>',
  leermas: '<path d="M3 6h10M3 10h10M3 14h6"/><path d="M15 17l4-4-4-4"/>',
  sorpresa: '<path d="M12 3l1.8 5.7 5.7 1.8-5.7 1.8L12 18l-1.8-5.7-5.7-1.8 5.7-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
};

export function icono(nombre, tam = 20, { relleno = false, grosor = 1.8, clase = '' } = {}) {
  const d = P[nombre] || P.chispa;
  return `<svg class="ico ${clase}" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="${relleno ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

export const LLAMA = '<path d="M12 22c-4 0-7-2.7-7-6.5 0-3.6 2.7-5.6 3.8-9.5 2.4 1.5 3.2 3.6 3.2 5.4 1.1-.7 1.8-1.9 2-3.3 2.2 1.8 5 4.6 5 7.6 0 3.7-2.9 6.3-7 6.3z"/>';
export function llama(tam = 24, color = '#FFB547') {
  return `<svg class="ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="${color}" aria-hidden="true">${LLAMA}</svg>`;
}

export const REACCIONES = [
  { tipo: 'gusta', nombre: 'Me gusta', corto: '' },
  { tipo: 'encanta', nombre: 'Me encanta', corto: '' },
  { tipo: 'detuve', nombre: 'Me detuve aquí', corto: 'Me detuve aquí' },
  { tipo: 'imagen', nombre: 'Imagen potente', corto: 'Imagen potente' },
  { tipo: 'leermas', nombre: 'Quiero leer más', corto: 'Quiero leer más' },
  { tipo: 'sorpresa', nombre: 'Me sorprendió', corto: 'Me sorprendió' },
];

// ---------- avatares ----------
// Doce diseños alusivos a la escritura: fondo de color + dibujo de línea.
export const AVATARES = {
  'av-1': { fondo: '#FF6B4A', tinta: '#16141C', d: P.pluma },
  'av-2': { fondo: '#B18CFF', tinta: '#16141C', d: '<path d="M8 11h8l1.2 8H6.8z"/><path d="M10 11V8h4v3"/><path d="M14 8l5-5"/>' },
  'av-3': { fondo: '#4D7CFF', tinta: '#FFFFFF', d: '<rect x="3.5" y="10" width="17" height="9" rx="1.5"/><path d="M7 10V4.5h10V10"/><path d="M7 13.5h1M10 13.5h1M13 13.5h1M16 13.5h1M8 16.5h8"/>' },
  'av-4': { fondo: '#C6F24E', tinta: '#16141C', d: P.libro },
  'av-5': { fondo: '#FFD84D', tinta: '#16141C', d: '<path d="M5 19l2-6L16 4l4 4-9 9z"/><path d="M5 19l2-6 4 4z"/><path d="M14 6l4 4"/>' },
  'av-6': { fondo: '#00A884', tinta: '#16141C', d: '<path d="M6 19V5h6a4 4 0 0 1 0 8H6"/><path d="M11 13l5 6"/>' },
  'av-7': { fondo: '#FF4F7B', tinta: '#16141C', d: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 10h6M9 14h6M9 18h3"/><path d="M8.5 13l7 2"/>' },
  'av-8': { fondo: '#5B3DF5', tinta: '#FFFFFF', d: '<circle cx="7" cy="13" r="3.5"/><circle cx="17" cy="13" r="3.5"/><path d="M10.5 12.5c1-.7 2-.7 3 0M3.5 12L2 9M20.5 12L22 9"/>' },
  'av-9': { fondo: '#FFB547', tinta: '#16141C', d: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 3c-1 1.3 1 2 0 3.5M12 3c-1 1.3 1 2 0 3.5"/>' },
  'av-10': { fondo: '#16141C', tinta: '#C6F24E', d: '<path d="M18 14.5A7 7 0 0 1 9.5 6a7 7 0 1 0 8.5 8.5z"/><path d="M16 4l.5 1.5L18 6l-1.5.5L16 8l-.5-1.5L14 6l1.5-.5z"/>' },
  'av-11': { fondo: '#8B6CFF', tinta: '#FFFFFF', d: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M4 7l8 6 8-6"/>' },
  'av-12': { fondo: '#FFFFFF', tinta: '#16141C', d: '<path d="M9.5 8a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7v1"/><path d="M12 16v.5"/><path d="M5 20l2-3.5A8 8 0 1 1 10 19.5z"/>' },
};

export function avatarSVG(clave, tam = 40) {
  const a = AVATARES[clave] || AVATARES['av-1'];
  const borde = a.fondo === '#FFFFFF' ? 'stroke:#E2DDD4;' : '';
  return `<svg class="avatar-svg" width="${tam}" height="${tam}" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="19.5" fill="${a.fondo}" style="${borde}"/>
    <g transform="translate(8 8)" fill="none" stroke="${a.tinta}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${a.d}</g>
  </svg>`;
}
