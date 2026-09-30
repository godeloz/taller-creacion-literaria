// Publicación y edición comunes a todos los módulos.
import { estado, claseActiva } from './estado.js';
import { aviso } from './ui.js';
import { revisarInsigniasNuevas } from './componentes.js';

// e: { dinamica, item_id, titulo, texto, vista, datos, modulo_version }
export async function publicarEntrega(e, { entregaExistente = null, irA = null } = {}) {
  if (entregaExistente) {
    await estado.api.editarEntrega(entregaExistente.id, { titulo: e.titulo, texto: e.texto, vista: e.vista, datos: e.datos });
    aviso('Cambios guardados.', 'exito');
    location.hash = `#/entrega/${entregaExistente.id}`;
    return entregaExistente.id;
  }
  const s = claseActiva();
  const r = await estado.api.publicar({ ...e, sesion_id: s && s.dinamica === e.dinamica ? s.id : null });
  aviso('¡Publicado!', 'exito');
  await revisarInsigniasNuevas();
  location.hash = irA || `#/entrega/${r.id}`;
  return r.id;
}
