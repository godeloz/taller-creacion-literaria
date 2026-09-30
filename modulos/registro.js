// Registro de módulos (dinámicas). Para sumar una dinámica nueva:
// 1. cree modulos/<slug>.js siguiendo el contrato de los existentes;
// 2. agréguelo aquí;
// 3. cree la fila en la tabla `dinamicas` de Supabase (o desde el panel del tutor).
//
// Contrato de un módulo (export default):
//   slug, nombre, version
//   abrir(contenedor, ctx) -> función de limpieza opcional
//        ctx: { item_id, entrega (si se está editando), sesion (clase en vivo), query }
//   paquete: {
//     plantilla: 'plantillas/<archivo>.json',
//     validar(json) -> { items: [{ item_id, datos }], errores: [] },
//     describir(datos) -> texto corto para listas del tutor
//   }

export const MODULOS = {
  reto: () => import('./reto.js'),
  maraton: () => import('./maraton.js'),
  poema: () => import('./poema.js'),
};
