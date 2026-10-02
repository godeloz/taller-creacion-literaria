// Marca de la última actualización de la app.
//
// Se cambia en CADA actualización, al entregar:
//   · marca:  fecha y hora de Colombia en que se guardaron los archivos ('AAAA-MM-DD HH:MM').
//             Es la misma que encabeza la entrada de contexto/06-BITACORA.md.
//   · nombre: título corto del cambio.
//   · sql:    todos los archivos de supabase/ que la app necesita (sin «.sql»), en orden.
//             Si la actualización trae un SQL nuevo, se agrega aquí. Al tutor se le avisa
//             cuando falta correr alguno.
//
// La marca se ve, muy discreta, en el pie de la app: sirve para saber qué versión está publicada.
export const VERSION = {
  marca: '2026-10-01 20:21',
  nombre: 'Marca de actualización y aviso de SQL pendientes',
  sql: [
    '01-esquema',
    '02-contenido-inicial',
    '03-nuevas-dinamicas',
    '04-personas-y-grupos',
    '05-fallar-mejor',
    '06-consignas',
    '07-lectura-critica',
    '08-pliegues',
    '09-consignas-estados',
    '10-actualizaciones',
  ],
};

// «2026-10-01 · 16:49»
export const marcaVisible = () => VERSION.marca.replace(' ', ' · ');
