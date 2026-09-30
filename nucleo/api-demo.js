// Modo de demostración: misma interfaz que api-supabase.js, con los datos
// guardados solo en este navegador. Sirve para probar la app sin conexión.
import { hoyISO, sumarDias, local, contarPalabras } from './ui.js';
import { calcularRacha } from './racha.js';

const CLAVE = 'taller-demo-v2';
const GRUPO = 'grupo-demo';
const GRUPO2 = 'grupo-invitados';

const DINAMICAS = [
  { slug: 'reto', nombre: 'Reto del día', descripcion: 'Un ejercicio corto, el mismo para todo el grupo, que cambia cada día.', color: '#FF6B4A', estado: 'abierta', orden: 0, en_menu: false, desbloqueo: null },
  { slug: 'maraton', nombre: 'Maratón de ejercicios', descripcion: 'Cartas de escritura para escribir mucho, escribir raro, escribir lo que no se había escrito antes.', color: '#4D7CFF', estado: 'abierta', orden: 1, en_menu: true, desbloqueo: null },
  { slug: 'poema', nombre: 'El poema desarmado', descripcion: 'Desmonte un poema y escriba otro con sus mismas palabras.', color: '#FF4F7B', estado: 'abierta', orden: 2, en_menu: true, desbloqueo: null },
  { slug: 'cutup', nombre: 'Cut Up', descripcion: 'Construya un relato alrededor de frases ajenas, al modo de Burroughs.', color: '#00A884', estado: 'abierta', orden: 3, en_menu: true, desbloqueo: null },
  { slug: 's7', nombre: 'S+7', descripcion: 'Reescriba un cuento con el diccionario, al modo oulipiano.', color: '#FF8A00', estado: 'abierta', orden: 4, en_menu: true, desbloqueo: null },
  { slug: 'forma', nombre: 'La forma de las historias', descripcion: 'Trace el arco emocional de una historia, al modo de Vonnegut.', color: '#8B6CFF', estado: 'abierta', orden: 5, en_menu: true, desbloqueo: null },
];

const INSIGNIAS = [
  ['primera-pagina', 'Primera página', 'Publicó su primer reto del día.', 'pagina', '#FF6B4A', 'auto'],
  ['racha-3', 'Tres al hilo', 'Mantuvo una racha de 3 días.', 'llama', '#FFB547', 'auto'],
  ['racha-7', 'Semana entera', 'Mantuvo una racha de 7 días.', 'llama', '#FF8A00', 'auto'],
  ['racha-14', 'Quincena de tinta', 'Mantuvo una racha de 14 días.', 'llama', '#FF4F7B', 'auto'],
  ['racha-30', 'Un mes escribiendo', 'Mantuvo una racha de 30 días.', 'llama', '#5B3DF5', 'auto'],
  ['maratonista', 'Maratonista', 'Publicó 5 cartas del Maratón.', 'cartas', '#4D7CFF', 'auto'],
  ['desarmador', 'Desarmador', 'Publicó 3 poemas desarmados.', 'fichas', '#FF4F7B', 'auto'],
  ['lector-atento', 'Lector atento', 'Dejó 10 comentarios de al menos 20 palabras en textos de otros.', 'ojo', '#00A884', 'auto'],
  ['todas-las-dinamicas', 'Todoterreno', 'Publicó al menos una vez en cada dinámica abierta.', 'estrella', '#C6F24E', 'auto'],
  ['mencion-tutor', 'Mención del tutor', 'Reconocimiento especial otorgado por el tutor.', 'pluma', '#121212', 'manual'],
].map(([slug, nombre, descripcion, icono, color, tipo], i) => ({ slug, nombre, descripcion, icono, color, tipo, orden: i + 1 }));

const PERSONAS = [
  // id, nombre, rol, avatar, modo, grupo
  ['tutor-demo', 'Tutor de prueba', 'tutor', 'av-10', 'participante', GRUPO],
  ['c1', 'Lucía Ferrer', 'creador', 'av-1', 'participante', GRUPO],
  ['c2', 'Martín Ocampo', 'creador', 'av-3', 'participante', GRUPO],
  ['c3', 'Valeria Ruiz', 'creador', 'av-7', 'participante', GRUPO],
  ['c4', 'Tomás Gil', 'creador', 'av-4', 'participante', GRUPO],
  ['c5', 'Isabel Mora', 'creador', 'av-9', 'participante', GRUPO],
  ['o1', 'Ana Observadora', 'invitado', 'av-11', 'observador', GRUPO],
  ['p1', 'Pablo Privado', 'invitado', 'av-12', 'privado', GRUPO],
  ['g1', 'Raúl Invitado', 'invitado', 'av-5', 'participante', GRUPO2],
  ['g2', 'Elena Invitada', 'invitado', 'av-6', 'participante', GRUPO2],
];


async function sembrar() {
  const { MODULOS } = await import('../modulos/registro.js');
  const contenidos = [];
  for (const din of Object.keys(MODULOS)) {
    const m = (await MODULOS[din]()).default;
    if (!m.paquete?.plantilla) continue;
    const js = await (await fetch(new URL('../' + m.paquete.plantilla, import.meta.url))).json();
    m.paquete.validar(js).items.forEach((it, i) => contenidos.push({ dinamica: din, ...it, activo: true, orden: i + 1, actualizado: new Date().toISOString() }));
  }
  const hoy = hoyISO();
  const ayer = sumarDias(hoy, -1);
  const db = {
    sesion: null,
    perfiles: PERSONAS.map(([id, nombre, rol, avatar, modo, grupo_id]) => ({ id, nombre, rol, avatar, modo, grupo_id, email: `${id}@demo.co`, foto_url: null })),
    lista: [
      ...PERSONAS.map(([id, nombre, rol, , modo, grupo_id]) => ({ email: `${id}@demo.co`, nombre, rol, modo, grupo_id, creado: new Date().toISOString() })),
      { email: 'pendiente@demo.co', nombre: 'Invitada sin cuenta', rol: 'invitado', modo: 'observador', grupo_id: GRUPO, creado: new Date().toISOString() },
    ],
    grupos: [
      { id: GRUPO, nombre: 'Creación Literaria (demostración)', descripcion: null, activo: true, creado: new Date(Date.now() - 864e5).toISOString() },
      { id: GRUPO2, nombre: 'Grupo de invitados', descripcion: 'Un grupo aparte: solo se ven entre ellos.', activo: true, creado: new Date().toISOString() },
    ],
    sesiones: {},
    dinamicas: DINAMICAS,
    contenidos,
    paquetes: [],
    calendario: [],
    asignados: [{ fecha: ayer, item_id: contenidos.find(c => c.dinamica === 'reto').item_id }],
    entregas: [],
    reacciones: [],
    comentarios: [],
    proyectos: [],
    notas: [],
    borradores: {},
    insignias: INSIGNIAS,
    otorgadas: [],
  };
  // Historial de ejemplo para que el muro y el ranking no arranquen vacíos.
  const ejemplo = (autor, dias, dinamica, item_id, titulo, texto) => db.entregas.push({
    id: crypto.randomUUID(), autor, grupo_id: PERSONAS.find(x => x[0] === autor)[5], dinamica, item_id, titulo, texto,
    vista: texto.split(/\n{2,}/).map(p => `<p>${p}</p>`).join(''), datos: {}, palabras: contarPalabras(texto),
    reto_fecha: dinamica === 'reto' ? sumarDias(hoy, -dias) : null, sesion_id: null, estado: 'publicada', editada: false,
    creado: new Date(Date.now() - dias * 864e5 - 3600e3).toISOString(), actualizado: new Date().toISOString(),
  });
  const reto = db.asignados[0].item_id;
  for (const d of [1, 2, 3, 4, 6, 7]) ejemplo('c1', d, 'reto', reto, null, '(Texto de ejemplo del modo demostración.)\n\nAquí iría el reto que escribió esta persona ese día.');
  for (const d of [1, 2]) ejemplo('c2', d, 'reto', reto, null, '(Texto de ejemplo del modo demostración.)\n\nOtro reto publicado para ver cómo se ve el muro.');
  const carta = contenidos.find(c => c.dinamica === 'maraton').item_id;
  ejemplo('o1', 1, 'maraton', carta, 'Carta de la observadora', '(Texto de ejemplo.)\n\nLo escribió una invitada observadora: solo lo ven ella y el tutor.');
  ejemplo('p1', 1, 'maraton', carta, 'Carta del invitado privado', '(Texto de ejemplo.)\n\nLo escribió un invitado privado: solo lo ven él y el tutor.');
  ejemplo('g1', 1, 'reto', reto, null, '(Texto de ejemplo.)\n\nUn reto del grupo de invitados: solo lo ve ese grupo y el tutor.');
  ejemplo('c3', 1, 'maraton', contenidos.find(c => c.dinamica === 'maraton').item_id, 'Primera carta', '(Texto de ejemplo del modo demostración.)\n\nUna carta del Maratón ya publicada.');
  return db;
}

export async function crearApiDemo() {
  let db = local(CLAVE);
  if (!db) { db = await sembrar(); local(CLAVE, db); }
  const guardar = () => local(CLAVE, db);
  const oyentes = [];
  const emitir = (tabla, evento, nuevo) => { guardar(); oyentes.filter(o => o.tabla === tabla).forEach(o => o.cb({ eventType: evento, new: nuevo })); };
  window.addEventListener('storage', ev => {
    if (ev.key !== CLAVE) return;
    db = local(CLAVE);
    ['entregas', 'sesion_clase', 'comentarios', 'reacciones'].forEach(t => oyentes.filter(o => o.tabla === t).forEach(o => o.cb({ eventType: 'UPDATE' })));
  });

  let yo = db.perfiles.find(p => p.id === db.sesion) || null;
  const tutor = () => yo?.rol === 'tutor';
  const ahora = () => new Date().toISOString();
  const pf = id => { const p = db.perfiles.find(x => x.id === id); return p && { id: p.id, nombre: p.nombre, avatar: p.avatar, foto_url: p.foto_url, rol: p.rol, modo: p.modo, grupo_id: p.grupo_id }; };
  const hizoReto = f => db.entregas.some(e => e.autor === yo.id && e.reto_fecha === f);
  // Misma regla que la base de datos (puede_ver_autor).
  const puedeVer = a => {
    if (!yo) return false;
    if (a === yo.id || tutor()) return true;
    const el = db.perfiles.find(p => p.id === a);
    if (!el) return false;
    if (el.rol === 'tutor') return true;
    return ['participante', 'observador'].includes(yo.modo) && el.modo === 'participante' && !!yo.grupo_id && yo.grupo_id === el.grupo_id;
  };
  const visible = e => tutor() || e.autor === yo.id ||
    (e.estado === 'publicada' && puedeVer(e.autor) && (!e.reto_fecha || e.reto_fecha < hoyISO() || hizoReto(e.reto_fecha) || yo.modo === 'observador'));
  const comentarioVisible = c => {
    const e = db.entregas.find(x => x.id === c.entrega_id);
    return e && visible(e) && puedeVer(c.autor) && (!c.privado || c.autor === yo.id || tutor() || e.autor === yo.id);
  };
  const conExtras = e => ({ ...e, perfil: pf(e.autor), n_comentarios: db.comentarios.filter(c => c.entrega_id === e.id && comentarioVisible(c)).length });
  const abierta = slug => { const d = db.dinamicas.find(x => x.slug === slug); return d && (d.estado === 'abierta' || (d.estado === 'proximamente' && d.desbloqueo && d.desbloqueo <= hoyISO())); };
  const exigirTutor = () => { if (!tutor()) throw new Error('Solo el tutor puede hacer esto.'); };

  function retoDelDiaId() {
    const f = hoyISO();
    const a = db.asignados.find(x => x.fecha === f);
    if (a) return a.item_id;
    let v = db.calendario.find(x => x.fecha === f)?.item_id;
    if (!v) {
      const usos = id => db.asignados.filter(x => x.item_id === id).length;
      const reservados = new Set(db.calendario.filter(x => x.fecha > f).map(x => x.item_id));
      const cand = db.contenidos.filter(c => c.dinamica === 'reto' && c.activo && !reservados.has(c.item_id));
      cand.sort((a, b) => usos(a.item_id) - usos(b.item_id) || Math.random() - 0.5);
      v = cand[0]?.item_id;
    }
    if (v) { db.asignados.push({ fecha: f, item_id: v }); guardar(); }
    return v || null;
  }

  function evaluarInsignias(u) {
    const dar = s => { if (!db.otorgadas.some(o => o.usuario === u && o.insignia === s)) db.otorgadas.push({ usuario: u, insignia: s, fecha: ahora() }); };
    const mias = db.entregas.filter(e => e.autor === u);
    if (mias.some(e => e.dinamica === 'reto')) dar('primera-pagina');
    const r = calcularRacha(mias.filter(e => e.reto_fecha).map(e => e.reto_fecha), hoyISO());
    [3, 7, 14, 30].forEach(n => { if (r.mejor >= n) dar('racha-' + n); });
    if (mias.filter(e => e.dinamica === 'maraton').length >= 5) dar('maratonista');
    if (mias.filter(e => e.dinamica === 'poema').length >= 3) dar('desarmador');
    const largos = db.comentarios.filter(c => c.autor === u && contarPalabras(c.texto) >= 20 && db.entregas.find(e => e.id === c.entrega_id)?.autor !== u);
    if (largos.length >= 10) dar('lector-atento');
    const menu = db.dinamicas.filter(d => d.en_menu && abierta(d.slug));
    if (mias.length && menu.every(d => mias.some(e => e.dinamica === d.slug))) dar('todas-las-dinamicas');
  }

  return {
    modo: 'demo',
    usuariosDemo: () => db.perfiles,
    reiniciarDemo() { local(CLAVE, null); location.reload(); },

    async sesion() { return yo; },
    async iniciarSesion(id) {
      yo = db.perfiles.find(p => p.id === id || p.email === id) || null;
      if (!yo) throw new Error('Usuario no encontrado.');
      db.sesion = yo.id; guardar();
      return yo;
    },
    async cerrarSesion() { yo = null; db.sesion = null; guardar(); },
    async cambiarContrasena() {},
    alCambiarSesion() {},

    async perfiles() { return db.perfiles.filter(p => puedeVer(p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre)); },
    async actualizarAvatar(clave) { db.perfiles.find(p => p.id === yo.id).avatar = clave; yo.avatar = clave; guardar(); },

    async dinamicas() { return [...db.dinamicas].sort((a, b) => a.orden - b.orden); },
    async actualizarDinamica(slug, c) { exigirTutor(); Object.assign(db.dinamicas.find(d => d.slug === slug), c); guardar(); },
    async contenidos(din, { todos = false } = {}) {
      const asignadosVisibles = new Set(db.asignados.filter(a => a.fecha <= hoyISO()).map(a => a.item_id));
      return db.contenidos
        .filter(c => c.dinamica === din && (todos ? tutor() || c.activo : c.activo))
        .filter(c => din !== 'reto' || tutor() || asignadosVisibles.has(c.item_id))
        .sort((a, b) => a.orden - b.orden)
        .map(c => structuredClone(c));
    },
    async contenido(din, item_id) { return (await this.contenidos(din, { todos: true })).find(c => c.item_id === item_id) || null; },
    async activarContenido(din, item_id, activo) { exigirTutor(); db.contenidos.find(c => c.dinamica === din && c.item_id === item_id).activo = activo; guardar(); },
    async aplicarPaquete(din, nombre, contenido, items) {
      exigirTutor();
      const pid = crypto.randomUUID();
      db.paquetes.push({ id: pid, dinamica: din, nombre, items: items.length, creado: ahora() });
      let nuevos = 0, actualizados = 0;
      let base = Math.max(0, ...db.contenidos.filter(c => c.dinamica === din).map(c => c.orden));
      for (const it of items) {
        const c = db.contenidos.find(x => x.dinamica === din && x.item_id === it.item_id);
        if (c) { c.datos = it.datos; c.activo = true; c.actualizado = ahora(); actualizados++; }
        else { db.contenidos.push({ dinamica: din, item_id: it.item_id, datos: it.datos, activo: true, orden: ++base, actualizado: ahora() }); nuevos++; }
      }
      guardar();
      return { paquete: pid, nuevos, actualizados };
    },
    async paquetes(din) { return db.paquetes.filter(p => p.dinamica === din).reverse(); },

    async retoDelDia() {
      const id = retoDelDiaId();
      if (!id) return null;
      const c = db.contenidos.find(x => x.dinamica === 'reto' && x.item_id === id);
      return c ? { item_id: id, datos: structuredClone(c.datos), fecha: hoyISO() } : null;
    },
    async conteoReto(f = hoyISO()) {
      return db.entregas.filter(e => e.reto_fecha === f && e.estado === 'publicada' && (() => { const p = db.perfiles.find(x => x.id === e.autor); return p && p.grupo_id === yo.grupo_id && p.modo === 'participante'; })()).length;
    },
    async miRetoHoy() { return db.entregas.find(e => e.autor === yo.id && e.reto_fecha === hoyISO()) || null; },
    async racha(u) { if (!puedeVer(u)) return null; return calcularRacha(db.entregas.filter(e => e.autor === u && e.reto_fecha).map(e => e.reto_fecha), hoyISO()); },
    async ranking(grupo) {
      const out = [];
      const g = tutor() ? (grupo || yo.grupo_id) : yo.grupo_id;
      if (!tutor() && !['participante', 'observador'].includes(yo.modo)) return out;
      for (const p of db.perfiles.filter(p => p.rol !== 'tutor' && p.modo === 'participante' && p.grupo_id === g)) {
        const r = await this.racha(p.id);
        if (r.actual > 0) out.push({ usuario: p.id, nombre: p.nombre, avatar: p.avatar, foto_url: p.foto_url, actual: r.actual });
      }
      return out.sort((a, b) => b.actual - a.actual || a.nombre.localeCompare(b.nombre));
    },
    async calendario(desde, hasta) {
      exigirTutor();
      return { programados: db.calendario.filter(c => c.fecha >= desde && c.fecha <= hasta), asignados: [...db.asignados].sort((a, b) => a.fecha.localeCompare(b.fecha)) };
    },
    async programarReto(fecha, item_id) { exigirTutor(); db.calendario = db.calendario.filter(c => c.fecha !== fecha); db.calendario.push({ fecha, item_id }); guardar(); },
    async quitarProgramado(fecha) { exigirTutor(); db.calendario = db.calendario.filter(c => c.fecha !== fecha); guardar(); },

    async entregas(f = {}) {
      return db.entregas
        .filter(visible)
        .filter(e => (!f.dinamica || e.dinamica === f.dinamica) && (!f.autor || e.autor === f.autor) &&
          (!f.item_id || e.item_id === f.item_id) && (!f.reto_fecha || e.reto_fecha === f.reto_fecha) &&
          (!f.sesion_id || e.sesion_id === f.sesion_id) && (!f.grupo_id || e.grupo_id === f.grupo_id) && (f.incluirOcultas || e.estado === 'publicada'))
        .sort((a, b) => b.creado.localeCompare(a.creado))
        .slice(0, f.limite || 300)
        .map(conExtras);
    },
    async entrega(id) { const e = db.entregas.find(x => x.id === id); return e && visible(e) ? conExtras(e) : null; },
    async publicar(e) {
      if (!abierta(e.dinamica) && !tutor()) throw new Error('Esta dinámica todavía no está abierta');
      const fila = {
        id: crypto.randomUUID(), autor: yo.id, grupo_id: yo.grupo_id, dinamica: e.dinamica, item_id: e.item_id ?? null,
        titulo: e.titulo || null, texto: e.texto || '', vista: e.vista || null, datos: e.datos || {}, modulo_version: e.modulo_version,
        palabras: contarPalabras(e.texto), reto_fecha: null, sesion_id: null, estado: 'publicada', editada: false, creado: ahora(), actualizado: ahora(),
      };
      if (e.dinamica === 'reto') {
        fila.reto_fecha = hoyISO();
        fila.item_id = retoDelDiaId();
        const lim = db.contenidos.find(c => c.dinamica === 'reto' && c.item_id === fila.item_id)?.datos.limite_palabras || 500;
        if (fila.palabras > lim) throw new Error(`El reto admite máximo ${lim} palabras (su texto tiene ${fila.palabras})`);
        if (hizoReto(fila.reto_fecha)) throw new Error('Ya publicó el reto de hoy. Puede editarlo.');
      }
      const s = db.sesiones[yo.grupo_id];
      if (e.sesion_id && s && s.activa && s.id === e.sesion_id) fila.sesion_id = e.sesion_id;
      db.entregas.push(fila);
      evaluarInsignias(yo.id);
      emitir('entregas', 'INSERT', fila);
      return { id: fila.id };
    },
    async editarEntrega(id, c) {
      const e = db.entregas.find(x => x.id === id);
      if (!e || e.autor !== yo.id) throw new Error('Solo puede editar sus propias entregas');
      for (const k of ['titulo', 'texto', 'vista', 'datos']) if (k in c) e[k] = c[k];
      e.palabras = contarPalabras(e.texto); e.editada = true; e.actualizado = ahora();
      emitir('entregas', 'UPDATE', e);
    },
    async cambiarEstadoEntrega(id, est) { exigirTutor(); db.entregas.find(x => x.id === id).estado = est; emitir('entregas', 'UPDATE', {}); },
    async borrarEntrega(id) {
      exigirTutor();
      db.entregas = db.entregas.filter(e => e.id !== id);
      db.comentarios = db.comentarios.filter(c => c.entrega_id !== id);
      db.reacciones = db.reacciones.filter(r => r.entrega_id !== id);
      emitir('entregas', 'DELETE', {});
    },

    async reacciones(ids) { const s = new Set(ids); return db.reacciones.filter(r => s.has(r.entrega_id) && puedeVer(r.usuario)); },
    async reaccionar(entrega_id, tipo, poner) {
      db.reacciones = db.reacciones.filter(r => !(r.entrega_id === entrega_id && r.tipo === tipo && r.usuario === yo.id));
      if (poner) db.reacciones.push({ entrega_id, tipo, usuario: yo.id });
      emitir('reacciones', 'INSERT', {});
    },
    async comentarios(entrega_id) {
      return db.comentarios.filter(c => c.entrega_id === entrega_id && comentarioVisible(c))
        .sort((a, b) => a.creado.localeCompare(b.creado)).map(c => ({ ...c, perfil: pf(c.autor) }));
    },
    async comentar(entrega_id, texto, privado = false) {
      db.comentarios.push({ id: crypto.randomUUID(), entrega_id, autor: yo.id, texto, privado: privado && tutor(), editado: false, creado: ahora() });
      evaluarInsignias(yo.id);
      emitir('comentarios', 'INSERT', {});
    },
    async borrarComentario(id) {
      const c = db.comentarios.find(x => x.id === id);
      if (!c || (c.autor !== yo.id && !tutor())) throw new Error('No puede borrar este comentario');
      db.comentarios = db.comentarios.filter(x => x.id !== id); emitir('comentarios', 'DELETE', {});
    },

    async insignias() { return db.insignias; },
    async otorgadas(u) { return db.otorgadas.filter(o => (!u || o.usuario === u) && puedeVer(o.usuario)); },
    async otorgar(usuario, insignia, nota) {
      exigirTutor();
      db.otorgadas = db.otorgadas.filter(o => !(o.usuario === usuario && o.insignia === insignia));
      db.otorgadas.push({ usuario, insignia, nota, fecha: ahora(), otorgada_por: yo.id }); guardar();
    },
    async quitarInsignia(usuario, insignia) { exigirTutor(); db.otorgadas = db.otorgadas.filter(o => !(o.usuario === usuario && o.insignia === insignia)); guardar(); },

    async proyectos() { return db.proyectos.filter(p => p.autor === yo.id); },
    async guardarProyecto(p) {
      let f = p.id && db.proyectos.find(x => x.id === p.id && x.autor === yo.id);
      if (!f) { f = { id: crypto.randomUUID(), autor: yo.id, creado: ahora() }; db.proyectos.push(f); }
      Object.assign(f, { titulo: p.titulo, descripcion: p.descripcion || null, color: p.color || null, actualizado: ahora() });
      guardar(); return { ...f };
    },
    async borrarProyecto(id) {
      db.proyectos = db.proyectos.filter(p => !(p.id === id && p.autor === yo.id));
      db.notas.forEach(n => { if (n.proyecto_id === id) n.proyecto_id = null; }); guardar();
    },
    async notas() { return db.notas.filter(n => n.autor === yo.id).sort((a, b) => b.actualizado.localeCompare(a.actualizado)); },
    async guardarNota(n) {
      if (!yo) throw new Error('Sesión cerrada');
      let f = n.id && db.notas.find(x => x.id === n.id && x.autor === yo.id);
      if (!f) { f = { id: crypto.randomUUID(), autor: yo.id, creado: ahora() }; db.notas.push(f); }
      Object.assign(f, { titulo: n.titulo ?? '', cuerpo: n.cuerpo ?? '', proyecto_id: n.proyecto_id || null, actualizado: ahora() });
      guardar(); return { ...f };
    },
    async borrarNota(id) { db.notas = db.notas.filter(n => !(n.id === id && n.autor === yo.id)); guardar(); },

    async borrador(clave) { return db.borradores[`${yo.id}:${clave}`] || null; },
    async guardarBorrador(clave, datos) { db.borradores[`${yo.id}:${clave}`] = { ...datos, _actualizado: ahora() }; guardar(); },
    async borrarBorrador(clave) { delete db.borradores[`${yo.id}:${clave}`]; guardar(); },

    async sesionClase(grupo) { return db.sesiones[grupo || yo.grupo_id] || null; },
    async activarClase({ dinamica, item_id, titulo, minutos, grupo_id }) {
      exigirTutor();
      const g = grupo_id || yo.grupo_id;
      db.sesiones[g] = { grupo_id: g, id: crypto.randomUUID(), dinamica, item_id: item_id || null, titulo: titulo || null, minutos: minutos || null, inicia: ahora(), activa: true };
      emitir('sesion_clase', 'UPDATE', db.sesiones[g]);
      return db.sesiones[g];
    },
    async terminarClase(grupo) { exigirTutor(); const s = db.sesiones[grupo || yo.grupo_id]; if (s) s.activa = false; emitir('sesion_clase', 'UPDATE', s); },

    // ---------- personas y grupos ----------
    async grupos() { return [...db.grupos].sort((a, b) => a.creado.localeCompare(b.creado)); },
    async guardarGrupo(g) {
      exigirTutor();
      let f = g.id && db.grupos.find(x => x.id === g.id);
      if (!f) { f = { id: crypto.randomUUID(), creado: ahora() }; db.grupos.push(f); }
      Object.assign(f, { nombre: g.nombre, descripcion: g.descripcion || null, activo: g.activo !== false });
      guardar(); return { ...f };
    },
    async lista() { exigirTutor(); return [...db.lista].sort((a, b) => a.nombre.localeCompare(b.nombre)); },
    async guardarPersona(p) {
      exigirTutor();
      const email = p.email.trim().toLowerCase();
      let f = db.lista.find(x => x.email === email);
      if (!f) { f = { email, creado: ahora() }; db.lista.push(f); }
      Object.assign(f, { nombre: p.nombre.trim(), rol: p.rol, modo: p.modo, grupo_id: p.grupo_id || null });
      const perfil = db.perfiles.find(x => x.email === email);
      if (perfil) Object.assign(perfil, { nombre: f.nombre, rol: f.rol, modo: f.modo, grupo_id: f.grupo_id });
      guardar();
    },
    async quitarDeLista(email) { exigirTutor(); db.lista = db.lista.filter(x => x.email !== email); guardar(); },
    async crearCuenta(p) {
      exigirTutor();
      const email = p.email.trim().toLowerCase();
      if (db.perfiles.some(x => x.email === email)) throw new Error('Ya existe una cuenta con ese correo. Si quiere, cámbiele la contraseña.');
      if ((p.password || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      await this.guardarPersona(p);
      const id = crypto.randomUUID();
      db.perfiles.push({ id, email, nombre: p.nombre.trim(), rol: p.rol, modo: p.modo, grupo_id: p.grupo_id || null, avatar: 'av-' + (1 + Math.floor(Math.random() * 12)), foto_url: null });
      guardar();
      return { ok: true, id };
    },
    async cambiarClaveDe(usuario, password) {
      exigirTutor();
      if ((password || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      return { ok: true };
    },

    suscribir(tabla, cb) {
      const o = { tabla, cb };
      oyentes.push(o);
      return () => { const i = oyentes.indexOf(o); if (i >= 0) oyentes.splice(i, 1); };
    },
  };
}
