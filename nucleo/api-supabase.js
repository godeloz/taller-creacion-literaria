// Conexión real con Supabase.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { hoyISO } from './ui.js';

const CAMPOS_LISTA = 'id,autor,grupo_id,dinamica,item_id,titulo,texto,palabras,reto_fecha,sesion_id,estado,editada,creado,actualizado,perfil:perfiles!entregas_autor_fkey(id,nombre,avatar,foto_url,rol,modo,grupo_id),comentarios(count)';

function traducir(error) {
  const m = error?.message || String(error);
  if (/JWT|token/i.test(m)) return new Error('Su sesión venció. Vuelva a iniciar sesión.');
  if (/Failed to fetch|NetworkError/i.test(m)) return new Error('No hay conexión. Revise su internet e intente de nuevo.');
  if (/row-level security/i.test(m)) return new Error('No tiene permiso para hacer esto.');
  return new Error(m);
}

export function crearApiSupabase(CONFIG) {
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'taller-sesion' },
  });
  let yo = null;
  let recuperando = false;
  sb.auth.onAuthStateChange(evento => { if (evento === 'PASSWORD_RECOVERY') recuperando = true; });

  const ok = ({ data, error }) => { if (error) throw traducir(error); return data; };
  const normalizar = e => {
    if (!e) return e;
    e.n_comentarios = e.comentarios?.[0]?.count ?? 0;
    delete e.comentarios;
    return e;
  };

  // Nombre con el que quedó desplegada la Edge Function en Supabase (ver LEEME, paso 3).
  const FUNCION_USUARIOS = 'funcion-usuarios';

  async function llamarFuncion(cuerpo) {
    const { data, error } = await sb.functions.invoke(FUNCION_USUARIOS, { body: cuerpo });
    if (!error) return data;
    const respuesta = error.context;
    if (respuesta && typeof respuesta.status === 'number') {
      if (respuesta.status === 404) { const e = new Error('La función «funcion-usuarios» no está instalada en Supabase.'); e.sinFuncion = true; throw e; }
      let mensaje = error.message;
      try { mensaje = (await respuesta.json()).error || mensaje; } catch { /* sin cuerpo */ }
      throw new Error(mensaje);
    }
    const e = new Error('No se pudo contactar la función «funcion-usuarios». ¿Está instalada?');
    e.sinFuncion = true;
    throw e;
  }

  return {
    modo: 'supabase',

    // ---------- sesión ----------
    async sesion() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { yo = null; return null; }
      yo = ok(await sb.from('perfiles').select('*').eq('id', session.user.id).maybeSingle());
      if (!yo) throw new Error('Su usuario existe, pero no tiene perfil en el taller. Pida al tutor que revise la lista de invitados.');
      return yo;
    },
    async iniciarSesion(email, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave });
      if (error) {
        if (/invalid/i.test(error.message)) throw new Error('Correo o contraseña incorrectos.');
        throw traducir(error);
      }
      return this.sesion();
    },
    async cerrarSesion() { await sb.auth.signOut(); yo = null; },
    async cambiarContrasena(nueva) {
      const { error } = await sb.auth.updateUser({ password: nueva });
      if (error) throw traducir(error);
    },
    enRecuperacion() { const r = recuperando; recuperando = false; return r; },
    alCambiarSesion(cb) {
      sb.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') cb(null); });
    },

    // ---------- perfiles ----------
    async perfiles() {
      return ok(await sb.from('perfiles').select('*').order('nombre'));
    },
    async actualizarAvatar(clave) {
      ok(await sb.from('perfiles').update({ avatar: clave }).eq('id', yo.id));
      yo.avatar = clave;
    },

    // ---------- dinámicas y contenido ----------
    async dinamicas() {
      return ok(await sb.from('dinamicas').select('*').order('orden'));
    },
    async actualizarDinamica(slug, cambios) {
      ok(await sb.from('dinamicas').update(cambios).eq('slug', slug));
    },
    async contenidos(dinamica, { todos = false } = {}) {
      let q = sb.from('contenidos').select('item_id,datos,activo,orden,actualizado').eq('dinamica', dinamica).order('orden');
      if (!todos) q = q.eq('activo', true);
      return ok(await q);
    },
    async contenido(dinamica, item_id) {
      return ok(await sb.from('contenidos').select('item_id,datos,activo').eq('dinamica', dinamica).eq('item_id', item_id).maybeSingle());
    },
    async activarContenido(dinamica, item_id, activo) {
      ok(await sb.from('contenidos').update({ activo }).eq('dinamica', dinamica).eq('item_id', item_id));
    },
    async aplicarPaquete(dinamica, nombre, contenido, items) {
      return ok(await sb.rpc('aplicar_paquete', { p_dinamica: dinamica, p_nombre: nombre, p_contenido: contenido, p_items: items }));
    },
    async paquetes(dinamica) {
      return ok(await sb.from('paquetes').select('id,nombre,items,creado').eq('dinamica', dinamica).order('creado', { ascending: false }));
    },

    // ---------- reto del día ----------
    async retoDelDia() {
      const id = ok(await sb.rpc('reto_del_dia'));
      if (!id) return null;
      const c = await this.contenido('reto', id);
      return c ? { item_id: id, datos: c.datos, fecha: hoyISO() } : null;
    },
    async conteoReto(fecha = hoyISO()) {
      return ok(await sb.rpc('conteo_reto', { f: fecha }));
    },
    async miRetoHoy() {
      return ok(await sb.from('entregas').select('id,titulo,creado').eq('autor', yo.id).eq('reto_fecha', hoyISO()).maybeSingle());
    },
    async racha(usuario) {
      return ok(await sb.rpc('racha_de', { u: usuario }));
    },
    async ranking(grupo) {
      return ok(await sb.rpc('ranking_rachas', grupo ? { p_grupo: grupo } : {}));
    },
    async calendario(desde, hasta) {
      const [programados, asignados] = await Promise.all([
        sb.from('retos_calendario').select('fecha,item_id').gte('fecha', desde).lte('fecha', hasta).then(ok),
        sb.from('retos_asignados').select('fecha,item_id').order('fecha').then(ok),
      ]);
      return { programados, asignados };
    },
    async programarReto(fecha, item_id) {
      ok(await sb.from('retos_calendario').upsert({ fecha, item_id }));
    },
    async quitarProgramado(fecha) {
      ok(await sb.from('retos_calendario').delete().eq('fecha', fecha));
    },

    // ---------- entregas ----------
    async entregas(f = {}) {
      let q = sb.from('entregas').select(f.conVista ? CAMPOS_LISTA + ',vista,datos' : CAMPOS_LISTA).order('creado', { ascending: false });
      if (f.dinamica) q = q.eq('dinamica', f.dinamica);
      if (f.autor) q = q.eq('autor', f.autor);
      if (f.item_id) q = q.eq('item_id', f.item_id);
      if (f.reto_fecha) q = q.eq('reto_fecha', f.reto_fecha);
      if (f.sesion_id) q = q.eq('sesion_id', f.sesion_id);
      if (f.grupo_id) q = q.eq('grupo_id', f.grupo_id);
      if (!f.incluirOcultas) q = q.eq('estado', 'publicada');
      q = q.limit(f.limite || 300);
      return ok(await q).map(normalizar);
    },
    async entrega(id) {
      return normalizar(ok(await sb.from('entregas').select(CAMPOS_LISTA + ',vista,datos,modulo_version').eq('id', id).maybeSingle()));
    },
    async publicar(e) {
      const fila = {
        dinamica: e.dinamica, item_id: e.item_id ?? null, titulo: e.titulo || null, texto: e.texto || '',
        vista: e.vista || null, datos: e.datos || {}, modulo_version: e.modulo_version || null, sesion_id: e.sesion_id || null,
      };
      return ok(await sb.from('entregas').insert(fila).select('id').single());
    },
    async editarEntrega(id, c) {
      const cambios = {};
      for (const k of ['titulo', 'texto', 'vista', 'datos']) if (k in c) cambios[k] = c[k];
      ok(await sb.from('entregas').update(cambios).eq('id', id));
    },
    async cambiarEstadoEntrega(id, estadoNuevo) {
      ok(await sb.from('entregas').update({ estado: estadoNuevo }).eq('id', id));
    },
    async borrarEntrega(id) {
      ok(await sb.from('entregas').delete().eq('id', id));
    },

    // ---------- consignas de escritura ----------
    // Cada consigna trae `grupos`: [{ grupo_id, apertura, cierre }] (el estudiante solo ve la de su grupo).
    async consignas() {
      return ok(await sb.from('consignas').select('*,grupos:consigna_grupos(grupo_id,apertura,cierre)').order('creado', { ascending: false }));
    },
    async consigna(id) {
      return ok(await sb.from('consignas').select('*,grupos:consigna_grupos(grupo_id,apertura,cierre)').eq('id', id).maybeSingle());
    },
    async guardarConsigna(c) {
      const fila = {
        titulo: c.titulo, instrucciones: c.instrucciones || '', ejemplos: c.ejemplos || [], referentes: c.referentes || '',
        limite_palabras: c.limite_palabras || null, archivada: !!c.archivada,
      };
      if (c.id) return ok(await sb.from('consignas').update(fila).eq('id', c.id).select().single());
      return ok(await sb.from('consignas').insert(fila).select().single());
    },
    async asignarConsigna(consigna_id, grupo_id, apertura, cierre) {
      ok(await sb.from('consigna_grupos').upsert({ consigna_id, grupo_id, apertura, cierre }));
    },
    async quitarAsignacion(consigna_id, grupo_id) {
      ok(await sb.from('consigna_grupos').delete().eq('consigna_id', consigna_id).eq('grupo_id', grupo_id));
    },
    async conteoConsigna(id, grupo) {
      return ok(await sb.rpc('conteo_consigna', grupo ? { item: id, p_grupo: grupo } : { item: id }));
    },

    // ---------- reacciones y comentarios ----------
    async reacciones(ids) {
      if (!ids.length) return [];
      const salida = [];
      for (let i = 0; i < ids.length; i += 150) {
        salida.push(...ok(await sb.from('reacciones').select('entrega_id,usuario,tipo').in('entrega_id', ids.slice(i, i + 150))));
      }
      return salida;
    },
    async reaccionar(entrega_id, tipo, poner) {
      if (poner) ok(await sb.from('reacciones').insert({ entrega_id, tipo, usuario: yo.id }));
      else ok(await sb.from('reacciones').delete().eq('entrega_id', entrega_id).eq('tipo', tipo).eq('usuario', yo.id));
    },
    async comentarios(entrega_id) {
      return ok(await sb.from('comentarios').select('*,perfil:perfiles!comentarios_autor_fkey(id,nombre,avatar,foto_url,rol,modo)').eq('entrega_id', entrega_id).order('creado'));
    },
    async comentar(entrega_id, texto, privado = false) {
      ok(await sb.from('comentarios').insert({ entrega_id, texto, privado, autor: yo.id }));
    },
    async borrarComentario(id) {
      ok(await sb.from('comentarios').delete().eq('id', id));
    },

    // ---------- insignias ----------
    async insignias() {
      return ok(await sb.from('insignias').select('*').order('orden'));
    },
    async otorgadas(usuario) {
      let q = sb.from('insignias_otorgadas').select('*');
      if (usuario) q = q.eq('usuario', usuario);
      return ok(await q);
    },
    async otorgar(usuario, insignia, nota) {
      ok(await sb.from('insignias_otorgadas').upsert({ usuario, insignia, nota: nota || null, otorgada_por: yo.id }));
    },
    async quitarInsignia(usuario, insignia) {
      ok(await sb.from('insignias_otorgadas').delete().eq('usuario', usuario).eq('insignia', insignia));
    },

    // ---------- cuaderno ----------
    async proyectos() {
      return ok(await sb.from('cuaderno_proyectos').select('*').order('creado'));
    },
    async guardarProyecto(p) {
      const fila = { titulo: p.titulo, descripcion: p.descripcion || null, color: p.color || null, actualizado: new Date().toISOString(), autor: yo.id };
      if (p.id) return ok(await sb.from('cuaderno_proyectos').update(fila).eq('id', p.id).select().single());
      return ok(await sb.from('cuaderno_proyectos').insert(fila).select().single());
    },
    async borrarProyecto(id) {
      ok(await sb.from('cuaderno_proyectos').delete().eq('id', id));
    },
    async notas() {
      return ok(await sb.from('cuaderno_notas').select('*').order('actualizado', { ascending: false }));
    },
    async guardarNota(n) {
      const fila = { titulo: n.titulo ?? '', cuerpo: n.cuerpo ?? '', proyecto_id: n.proyecto_id || null, actualizado: new Date().toISOString(), autor: yo.id };
      if (n.id) return ok(await sb.from('cuaderno_notas').update(fila).eq('id', n.id).select().single());
      return ok(await sb.from('cuaderno_notas').insert(fila).select().single());
    },
    async borrarNota(id) {
      ok(await sb.from('cuaderno_notas').delete().eq('id', id));
    },

    // ---------- borradores ----------
    async borrador(clave) {
      const r = ok(await sb.from('borradores').select('datos,actualizado').eq('clave', clave).eq('autor', yo.id).maybeSingle());
      return r ? { ...r.datos, _actualizado: r.actualizado } : null;
    },
    async guardarBorrador(clave, datos) {
      ok(await sb.from('borradores').upsert({ autor: yo.id, clave, datos, actualizado: new Date().toISOString() }));
    },
    async borrarBorrador(clave) {
      ok(await sb.from('borradores').delete().eq('clave', clave).eq('autor', yo.id));
    },

    // ---------- clase en vivo ----------
    async sesionClase(grupo) {
      const g = grupo || yo.grupo_id;
      if (!g) return null;
      return ok(await sb.from('sesion_clase').select('*').eq('grupo_id', g).maybeSingle());
    },
    async activarClase({ dinamica, item_id, titulo, minutos, grupo_id }) {
      const fila = {
        grupo_id: grupo_id || yo.grupo_id, id: crypto.randomUUID(), dinamica, item_id: item_id || null,
        titulo: titulo || null, minutos: minutos || null, inicia: new Date().toISOString(), activa: true,
      };
      return ok(await sb.from('sesion_clase').upsert(fila).select().single());
    },
    async terminarClase(grupo) {
      ok(await sb.from('sesion_clase').update({ activa: false }).eq('grupo_id', grupo || yo.grupo_id));
    },

    // ---------- personas y grupos (tutor) ----------
    async grupos() {
      return ok(await sb.from('grupos').select('*').order('creado'));
    },
    async guardarGrupo(g) {
      const fila = { nombre: g.nombre, descripcion: g.descripcion || null, activo: g.activo !== false };
      if (g.id) return ok(await sb.from('grupos').update(fila).eq('id', g.id).select().single());
      return ok(await sb.from('grupos').insert(fila).select().single());
    },
    async lista() {
      return ok(await sb.from('invitados').select('*').order('nombre'));
    },
    async guardarPersona(p) {
      ok(await sb.from('invitados').upsert({
        email: p.email.trim().toLowerCase(), nombre: p.nombre.trim(), rol: p.rol, modo: p.modo, grupo_id: p.grupo_id || null,
      }));
    },
    async quitarDeLista(email) {
      ok(await sb.from('invitados').delete().eq('email', email));
    },
    // Crear cuentas y cambiar contraseñas exige la función «funcion-usuarios» de Supabase.
    async crearCuenta(p) {
      return llamarFuncion({ accion: 'crear', ...p });
    },
    async cambiarClaveDe(usuario, password) {
      return llamarFuncion({ accion: 'clave', usuario, password });
    },

    // ---------- tiempo real ----------
    suscribir(tabla, cb) {
      const canal = sb.channel(`t-${tabla}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, p => cb(p))
        .subscribe();
      return () => sb.removeChannel(canal);
    },
  };
}
