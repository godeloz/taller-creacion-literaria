// Panel del tutor › Personas y grupos: agregar estudiantes e invitados, definir
// su modo de participación, crear grupos y gestionar contraseñas.
import { estado, MODOS, recargarBase } from '../nucleo/estado.js';
import { esc, modal, aviso, errorAviso, confirmar, $ } from '../nucleo/ui.js';
import { icono } from '../nucleo/iconos.js';
import { avatar, vacio } from '../nucleo/componentes.js';

const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
export function generarClave(n = 10) {
  const r = crypto.getRandomValues(new Uint32Array(n));
  return [...r].map(x => ALFABETO[x % ALFABETO.length]).join('');
}

function pillModo(modo) {
  const m = MODOS[modo] || MODOS.participante;
  return `<span class="pill-modo modo-${modo}" title="${esc(m.corto)}">${icono(m.ico, 14)}${esc(m.nombre)}</span>`;
}

function opcionesGrupo(actual, { conNuevo = true } = {}) {
  const activos = estado.grupos.filter(g => g.activo !== false || g.id === actual);
  return activos.map(g => `<option value="${g.id}" ${g.id === actual ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')
    + (conNuevo ? '<option value="__nuevo">+ Nuevo grupo…</option>' : '');
}

async function editarGrupo(g = null) {
  const r = await modal({
    titulo: g ? 'Editar grupo' : 'Nuevo grupo',
    cuerpo: `
      <p class="tenue" style="margin-top:0">Un grupo es el espacio donde las personas se ven entre sí: muro, rachas, ranking y clase en vivo.</p>
      <div class="campo"><label for="g-nombre">Nombre</label><input class="entrada" id="g-nombre" value="${esc(g?.nombre || '')}" placeholder="Por ejemplo: Invitados de la Maestría"></div>
      <div class="campo"><label for="g-desc">Descripción (opcional)</label><input class="entrada" id="g-desc" value="${esc(g?.descripcion || '')}"></div>
      ${g ? `<label class="fila" style="gap:8px;font-weight:600"><input type="checkbox" id="g-archivar" ${g.activo === false ? 'checked' : ''}> Archivado (no aparece al agregar personas)</label>` : ''}`,
    acciones: [{ texto: 'Cancelar', clase: 'btn-fantasma', valor: null }, {
      texto: g ? 'Guardar' : 'Crear grupo', clase: 'btn-primario', accion: v => {
        const nombre = v.querySelector('#g-nombre').value.trim();
        if (!nombre) { aviso('Escriba un nombre para el grupo.', 'error'); return false; }
        return { nombre, descripcion: v.querySelector('#g-desc').value.trim(), activo: !v.querySelector('#g-archivar')?.checked };
      },
    }],
  });
  if (!r || typeof r !== 'object') return null;
  try {
    const guardado = await estado.api.guardarGrupo({ ...g, ...r });
    await recargarBase();
    aviso(g ? 'Grupo actualizado.' : 'Grupo creado.', 'exito');
    return guardado;
  } catch (e) { errorAviso(e); return null; }
}

async function mostrarCredenciales(nombre, email, clave) {
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  const texto = `Taller de Creación Literaria\nEntre en: ${url}\nCorreo: ${email}\nContraseña: ${clave}\n\nPuede cambiar la contraseña desde su perfil.`;
  await modal({
    titulo: 'Datos de ingreso',
    cuerpo: `<p style="margin-top:0">Envíele estos datos a <b>${esc(nombre)}</b>. La contraseña no se vuelve a mostrar.</p>
      <pre class="credenciales">${esc(texto)}</pre>`,
    acciones: [
      { texto: 'Copiar', clase: 'btn', accion: async () => { try { await navigator.clipboard.writeText(texto); aviso('Copiado.', 'exito'); } catch { aviso('Seleccione el texto y cópielo.', 'error'); } return false; } },
      { texto: 'Listo', clase: 'btn-primario' },
    ],
  });
}

// Formulario para agregar o editar a una persona.
async function formularioPersona({ fila = null, tieneCuenta = false } = {}) {
  const nueva = !fila;
  const base = fila || { nombre: '', email: '', rol: 'creador', modo: 'participante', grupo_id: estado.grupos.find(g => g.activo !== false)?.id };
  const pedirClave = !tieneCuenta;
  let rol = base.rol, modo = base.modo;
  const r = await modal({
    titulo: nueva ? 'Agregar persona' : tieneCuenta ? `Editar a ${base.nombre}` : `Crear la cuenta de ${base.nombre}`,
    ancho: 640,
    cuerpo: `
      <div class="dos-col" style="gap:12px">
        <div class="campo" style="margin:0"><label for="p-nombre">Nombre</label><input class="entrada" id="p-nombre" value="${esc(base.nombre)}"></div>
        <div class="campo" style="margin:0"><label for="p-email">Correo</label><input class="entrada" type="email" id="p-email" value="${esc(base.email)}" ${nueva ? '' : 'disabled'}></div>
      </div>
      <div class="etiqueta" style="margin:18px 0 8px">Participa como</div>
      <div class="conmutador" id="p-rol" role="group">
        <button type="button" data-rol="creador">${icono('pluma', 15)}Estudiante</button>
        <button type="button" data-rol="invitado">${icono('estrella', 15)}Invitado</button>
      </div>
      <div class="etiqueta" style="margin:18px 0 8px">Modo</div>
      <div class="opciones-modo" id="p-modo">
        ${Object.entries(MODOS).map(([k, m]) => `<button type="button" data-modo="${k}">${icono(m.ico, 18)}<b>${esc(m.nombre)}</b><span>${esc(m.corto)}</span></button>`).join('')}
      </div>
      <div class="campo" style="margin-top:16px"><label for="p-grupo">Grupo</label><select class="selector" id="p-grupo">${opcionesGrupo(base.grupo_id)}</select></div>
      ${pedirClave ? `<div class="campo"><label for="p-clave">Contraseña inicial</label>
        <div class="fila" style="flex-wrap:nowrap"><input class="entrada" id="p-clave" value="${generarClave()}" autocomplete="off" style="font-family:var(--f-mono)"><button type="button" class="btn btn-chico" id="p-generar">${icono('reiniciar', 15)}Otra</button></div>
        <span class="nota-campo">Mínimo 8 caracteres. La persona puede cambiarla desde su perfil.</span></div>` : ''}`,
    acciones: [
      { texto: 'Cancelar', clase: 'btn-fantasma', valor: null },
      ...(pedirClave ? [{ texto: 'Solo agregar a la lista', clase: 'btn', accion: v => leer(v, 'lista') }] : []),
      { texto: pedirClave ? 'Crear cuenta' : 'Guardar cambios', clase: 'btn-primario', accion: v => leer(v, pedirClave ? 'crear' : 'guardar') },
    ],
    alAbrir: v => {
      const pintarSel = () => {
        v.querySelectorAll('[data-rol]').forEach(b => b.classList.toggle('on', b.dataset.rol === rol));
        v.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === modo));
      };
      v.querySelector('#p-rol').addEventListener('click', e => { const b = e.target.closest('[data-rol]'); if (b) { rol = b.dataset.rol; pintarSel(); } });
      v.querySelector('#p-modo').addEventListener('click', e => { const b = e.target.closest('[data-modo]'); if (b) { modo = b.dataset.modo; pintarSel(); } });
      v.querySelector('#p-generar')?.addEventListener('click', () => { v.querySelector('#p-clave').value = generarClave(); });
      v.querySelector('#p-grupo').addEventListener('change', async ev => {
        if (ev.target.value !== '__nuevo') return;
        const g = await editarGrupo();
        ev.target.innerHTML = opcionesGrupo(g?.id || base.grupo_id);
      });
      pintarSel();
    },
  });

  function leer(v, accion) {
    const datos = {
      nombre: v.querySelector('#p-nombre').value.trim(),
      email: v.querySelector('#p-email').value.trim().toLowerCase(),
      rol, modo,
      grupo_id: v.querySelector('#p-grupo').value,
      password: v.querySelector('#p-clave')?.value.trim(),
      accion,
    };
    if (!datos.nombre) { aviso('Falta el nombre.', 'error'); return false; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) { aviso('El correo no es válido.', 'error'); return false; }
    if (!datos.grupo_id || datos.grupo_id === '__nuevo') { aviso('Elija un grupo.', 'error'); return false; }
    if (accion === 'crear' && (datos.password || '').length < 8) { aviso('La contraseña debe tener al menos 8 caracteres.', 'error'); return false; }
    return datos;
  }

  if (!r || typeof r !== 'object') return false;
  try {
    if (r.accion === 'guardar' || r.accion === 'lista') {
      await estado.api.guardarPersona(r);
      aviso(r.accion === 'lista' ? 'Quedó en la lista. Cree su cuenta cuando quiera.' : 'Cambios guardados.', 'exito');
      return true;
    }
    try {
      await estado.api.crearCuenta(r);
    } catch (e) {
      if (!e.sinFuncion) throw e;
      await estado.api.guardarPersona(r);
      await modal({
        titulo: 'Falta un paso en Supabase',
        cuerpo: `<p style="margin-top:0"><b>${esc(r.nombre)}</b> quedó en la lista del taller, pero la app todavía no puede crear cuentas: falta instalar la función <code>usuarios</code> (ver el LEEME).</p>
          <p>Mientras tanto, cree la cuenta en Supabase › Authentication › Users › Add user, con este correo y esta contraseña, y marque <b>Auto Confirm User</b>:</p>
          <pre class="credenciales">${esc(r.email)}\n${esc(r.password)}</pre>`,
        acciones: [{ texto: 'Entendido', clase: 'btn-primario' }],
      });
      return true;
    }
    await mostrarCredenciales(r.nombre, r.email, r.password);
    return true;
  } catch (e) { errorAviso(e); return false; }
}

async function cambiarClave(p) {
  const r = await modal({
    titulo: `Nueva contraseña para ${p.nombre}`,
    cuerpo: `<div class="campo"><label for="n-clave">Contraseña</label>
      <div class="fila" style="flex-wrap:nowrap"><input class="entrada" id="n-clave" value="${generarClave()}" autocomplete="off" style="font-family:var(--f-mono)"><button type="button" class="btn btn-chico" id="n-generar">${icono('reiniciar', 15)}Otra</button></div>
      <span class="nota-campo">La contraseña anterior deja de funcionar.</span></div>`,
    acciones: [{ texto: 'Cancelar', clase: 'btn-fantasma', valor: null }, {
      texto: 'Cambiar contraseña', clase: 'btn-primario', accion: v => {
        const c = v.querySelector('#n-clave').value.trim();
        if (c.length < 8) { aviso('La contraseña debe tener al menos 8 caracteres.', 'error'); return false; }
        return { c };
      },
    }],
    alAbrir: v => v.querySelector('#n-generar').addEventListener('click', () => { v.querySelector('#n-clave').value = generarClave(); }),
  });
  if (!r || typeof r !== 'object') return;
  try {
    await estado.api.cambiarClaveDe(p.id, r.c);
    await mostrarCredenciales(p.nombre, p.email, r.c);
  } catch (e) {
    if (e.sinFuncion) aviso('Para cambiar contraseñas desde la app, instale la función «usuarios» (ver el LEEME). Mientras tanto, hágalo en Supabase › Authentication › Users.', 'error', 7000);
    else errorAviso(e);
  }
}

export async function seccionPersonas(c, query) {
  await recargarBase();
  const [lista] = await Promise.all([estado.api.lista()]);
  const perfiles = estado.perfiles;
  const filtroGrupo = query.grupo || '';
  const filtroModo = query.modo || '';

  // Cada fila de la lista, con su cuenta (perfil) si ya existe.
  const filas = lista
    .filter(i => i.rol !== 'tutor')
    .map(i => ({ ...i, perfil: perfiles.find(p => p.email?.toLowerCase() === i.email.toLowerCase()) }))
    .filter(f => (!filtroGrupo || f.grupo_id === filtroGrupo) && (!filtroModo || f.modo === filtroModo));
  const cuentaPor = (g, m) => lista.filter(i => i.rol !== 'tutor' && i.grupo_id === g && (!m || i.modo === m)).length;
  const hash = cambios => '#/tutor/personas?' + new URLSearchParams(Object.entries({ grupo: filtroGrupo, modo: filtroModo, ...cambios }).filter(([, v]) => v)).toString();
  const n = (k, s) => `${k} ${k === 1 ? s : s === 'observador' ? 'observadores' : s + 's'}`;
  const nombreGrupo = id => estado.grupos.find(g => g.id === id)?.nombre || '—';

  c.innerHTML = `
    <div class="fila" style="margin-bottom:18px;align-items:flex-start">
      <p class="tenue" style="margin:0;max-width:62ch">Cada persona pertenece a un grupo y participa en uno de tres modos. En su grupo, los <b>participantes</b> se ven entre sí; los <b>observadores</b> ven al grupo pero nadie los ve a ellos; los <b>privados</b> no ven a nadie. Usted ve todo.</p>
      <span class="espaciador"></span>
      <button class="btn btn-fantasma" id="b-grupo">${icono('mas', 16)}Nuevo grupo</button>
      <button class="btn btn-primario" id="b-persona">${icono('mas', 16)}Agregar persona</button>
    </div>

    <div class="rejilla-grupos">
      ${estado.grupos.map(g => `
        <div class="grupo-tarjeta ${g.activo === false ? 'archivado' : ''}">
          <div style="display:flex;gap:8px;align-items:flex-start"><b style="font-size:17px;flex:1;min-width:0">${esc(g.nombre)}</b>${g.activo === false ? '<span class="estado-pill">Archivado</span>' : ''}
            <button class="btn btn-fantasma btn-chico btn-icono" data-editar-grupo="${g.id}" aria-label="Editar grupo" title="Editar grupo">${icono('lapiz', 15)}</button></div>
          ${g.descripcion ? `<p class="tenue" style="margin:4px 0 0;font-size:14px">${esc(g.descripcion)}</p>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
            <span class="pill-modo modo-participante">${n(cuentaPor(g.id, 'participante'), 'participante')}</span>
            <span class="pill-modo modo-observador">${n(cuentaPor(g.id, 'observador'), 'observador')}</span>
            <span class="pill-modo modo-privado">${n(cuentaPor(g.id, 'privado'), 'privado')}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px"><a class="btn btn-chico" href="${hash({ grupo: g.id })}">Personas</a><a class="btn btn-chico" href="#/tutor/estudiantes?grupo=${g.id}">Actividad</a><a class="btn btn-chico" href="#/muro?grupo=${g.id}">Muro</a></div>
        </div>`).join('')}
    </div>

    <div class="filtros">
      <a class="chip ${!filtroGrupo ? 'activo' : ''}" href="${hash({ grupo: '' })}">Todos los grupos</a>
      ${estado.grupos.map(g => `<a class="chip ${filtroGrupo === g.id ? 'activo' : ''}" href="${hash({ grupo: g.id })}">${esc(g.nombre)}</a>`).join('')}
      <span class="espaciador"></span>
      <select class="selector" id="f-modo" style="width:auto;min-height:38px"><option value="">Todos los modos</option>${Object.entries(MODOS).map(([k, m]) => `<option value="${k}" ${k === filtroModo ? 'selected' : ''}>${m.nombre}</option>`).join('')}</select>
    </div>

    ${filas.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Persona</th><th>Tipo</th><th>Modo</th><th>Grupo</th><th>Cuenta</th><th></th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td><div style="display:flex;gap:10px;align-items:center">${f.perfil ? avatar(f.perfil, 32) : `<span class="avatar" style="width:32px;height:32px;border:1.5px dashed var(--linea-2)"></span>`}
          <div><div style="font-weight:700">${f.perfil ? `<a href="#/perfil/${f.perfil.id}" style="text-decoration:none">${esc(f.nombre)}</a>` : esc(f.nombre)}</div><div class="tenue" style="font-size:13px">${esc(f.email)}</div></div></div></td>
        <td>${f.rol === 'invitado' ? 'Invitado' : 'Estudiante'}</td>
        <td>${pillModo(f.modo)}</td>
        <td>${esc(nombreGrupo(f.grupo_id))}</td>
        <td>${f.perfil ? '<span class="estado-pill si">Activa</span>' : '<span class="estado-pill">Sin cuenta</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-chico" data-editar="${esc(f.email)}">${icono('lapiz', 15)}${f.perfil ? 'Editar' : 'Crear cuenta'}</button>
          ${f.perfil ? `<button class="btn btn-chico btn-fantasma" data-clave="${esc(f.email)}">${icono('llave', 15)}Contraseña</button>`
            : `<button class="btn btn-chico btn-fantasma btn-icono" data-quitar="${esc(f.email)}" title="Quitar de la lista" aria-label="Quitar de la lista">${icono('basura', 15)}</button>`}
        </td>
      </tr>`).join('')}</tbody></table></div>` : vacio('No hay personas con estos filtros')}`;

  const recargar = () => seccionPersonas(c, query);
  $('#b-persona', c).onclick = async () => { if (await formularioPersona()) recargar(); };
  $('#b-grupo', c).onclick = async () => { if (await editarGrupo()) recargar(); };
  $('#f-modo', c).onchange = ev => { location.hash = hash({ modo: ev.target.value }); };
  c.onclick = async ev => {
    const eg = ev.target.closest('[data-editar-grupo]');
    if (eg) { if (await editarGrupo(estado.grupos.find(g => g.id === eg.dataset.editarGrupo))) recargar(); return; }
    const ed = ev.target.closest('[data-editar]');
    if (ed) {
      const f = filas.find(x => x.email === ed.dataset.editar);
      if (await formularioPersona({ fila: f, tieneCuenta: !!f.perfil })) recargar();
      return;
    }
    const cl = ev.target.closest('[data-clave]');
    if (cl) { const f = filas.find(x => x.email === cl.dataset.clave); await cambiarClave({ ...f.perfil, nombre: f.nombre, email: f.email }); return; }
    const q = ev.target.closest('[data-quitar]');
    if (q) {
      if (!(await confirmar(`¿Quitar a ${q.dataset.quitar} de la lista? No tiene cuenta todavía, así que no se pierde nada.`, { si: 'Quitar', peligro: true }))) return;
      try { await estado.api.quitarDeLista(q.dataset.quitar); recargar(); } catch (e) { errorAviso(e); }
    }
  };
}

export { pillModo };
