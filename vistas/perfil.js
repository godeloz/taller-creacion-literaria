// Perfil: avatar, racha, insignias, entregas y portafolio.
import { estado, esTutor } from '../nucleo/estado.js';
import { esc, modal, aviso, errorAviso, $ } from '../nucleo/ui.js';
import { icono, AVATARES, avatarSVG } from '../nucleo/iconos.js';
import { avatar, tarjetaEntrega, discoInsignia, vacio } from '../nucleo/componentes.js';
import { tarjetaRacha } from './inicio.js';
import { descargarTXT, imprimir } from '../nucleo/exportar.js';
import { refrescarAvatarCabecera } from '../nucleo/app.js';

export default async function vistaPerfil(cont, { params }) {
  const id = params[0] || estado.yo.id;
  const p = id === estado.yo.id ? estado.yo : estado.perfiles.find(x => x.id === id);
  if (!p) { cont.innerHTML = `<div class="contenedor">${vacio('No encontramos este perfil')}</div>`; return; }
  const propio = id === estado.yo.id;
  const [racha, todas, mias, entregas] = await Promise.all([
    estado.api.racha(id).catch(() => null),
    estado.api.insignias(),
    estado.api.otorgadas(id),
    estado.api.entregas({ autor: id, incluirOcultas: propio || esTutor() }),
  ]);
  const reacciones = await estado.api.reacciones(entregas.map(e => e.id)).catch(() => []);
  const ganadas = new Map(mias.map(m => [m.insignia, m]));
  const palabras = entregas.reduce((s, e) => s + (e.palabras || 0), 0);
  const retos = entregas.filter(e => e.dinamica === 'reto').length;

  cont.innerHTML = `
  <div class="contenedor">
    <div class="perfil-cab">
      <span id="avatar-perfil">${avatar(p, 112)}</span>
      <div style="flex:1;min-width:240px">
        <div class="rotulo">${p.rol === 'tutor' ? 'Tutor' : 'Creador'}</div>
        <h1>${esc(p.nombre)}</h1>
        <div class="fila" style="margin-top:14px">
          ${propio ? `<button class="btn btn-chico" id="b-avatar">${icono('chispa', 16)}Cambiar avatar</button>` : ''}
          ${propio && estado.api.modo !== 'demo' ? `<button class="btn btn-chico btn-fantasma" id="b-clave">${icono('llave', 16)}Cambiar contraseña</button>` : ''}
          ${(propio || esTutor()) && entregas.length ? `<button class="btn btn-chico btn-fantasma" id="b-port-pdf">${icono('imprimir', 16)}Portafolio en PDF</button>
            <button class="btn btn-chico btn-fantasma" id="b-port-txt">${icono('descargar', 16)}Portafolio .txt</button>` : ''}
          ${esTutor() && !propio ? `<button class="btn btn-chico btn-primario" id="b-mencion">${icono('medalla', 16)}Otorgar mención</button>` : ''}
          ${propio ? `<button class="btn btn-chico btn-fantasma" id="b-salir">${icono('salir', 16)}Cerrar sesión</button>` : ''}
        </div>
      </div>
    </div>

    <div class="rejilla-inicio" style="margin-bottom:36px">
      <div class="cifras" style="align-content:flex-start">
        <div class="cifra"><b>${entregas.length}</b><span>textos publicados</span></div>
        <div class="cifra"><b>${retos}</b><span>retos del día</span></div>
        <div class="cifra"><b>${palabras.toLocaleString('es-CO')}</b><span>palabras escritas</span></div>
        <div class="cifra"><b>${ganadas.size}</b><span>insignias</span></div>
      </div>
      ${racha ? tarjetaRacha(racha) : ''}
    </div>

    <h2 class="titulo-seccion" style="margin-bottom:16px">Insignias</h2>
    <div class="insignias">
      ${todas.map(ins => {
        const g = ganadas.get(ins.slug);
        return `<div class="insignia ${g ? '' : 'bloqueada'}" title="${esc(g?.nota || '')}">${discoInsignia(ins)}<b>${esc(ins.nombre)}</b><span>${esc(g?.nota || ins.descripcion)}</span></div>`;
      }).join('')}
    </div>

    <h2 class="titulo-seccion" style="margin:40px 0 16px">${propio ? 'Mis textos' : 'Textos publicados'}</h2>
    ${entregas.length ? `<div class="muro">${entregas.map(e => tarjetaEntrega(e, reacciones)).join('')}</div>` : vacio('Todavía no hay textos publicados')}
  </div>`;

  $('#b-avatar', cont)?.addEventListener('click', async () => {
    let elegido = estado.yo.avatar;
    const r = await modal({
      titulo: 'Elija su avatar',
      cuerpo: `<div class="selector-avatares">${Object.keys(AVATARES).map(k => `<button type="button" data-av="${k}" class="${k === elegido ? 'on' : ''}" aria-label="Avatar ${k.slice(3)}">${avatarSVG(k, 72)}</button>`).join('')}</div>
        <p class="tenue" style="margin-top:14px;font-size:14px">Más adelante el tutor podrá poner su foto.</p>`,
      acciones: [{ texto: 'Cancelar', valor: null, clase: 'btn-fantasma' }, { texto: 'Guardar', clase: 'btn-primario', accion: () => elegido }],
      alAbrir: velo => velo.querySelector('.selector-avatares').addEventListener('click', ev => {
        const b = ev.target.closest('[data-av]');
        if (!b) return;
        elegido = b.dataset.av;
        velo.querySelectorAll('[data-av]').forEach(x => x.classList.toggle('on', x === b));
      }),
    });
    if (!r || r === true) return;
    try {
      await estado.api.actualizarAvatar(r);
      $('#avatar-perfil', cont).innerHTML = avatar(estado.yo, 112);
      refrescarAvatarCabecera();
    } catch (e) { errorAviso(e); }
  });

  $('#b-clave', cont)?.addEventListener('click', async () => {
    await modal({
      titulo: 'Cambiar contraseña',
      cuerpo: `<div class="campo"><label for="c1">Nueva contraseña</label><input class="entrada" type="password" id="c1" minlength="8" autocomplete="new-password"></div>
        <div class="campo"><label for="c2">Repítala</label><input class="entrada" type="password" id="c2" autocomplete="new-password"></div>
        <p class="nota-campo">Mínimo 8 caracteres.</p>`,
      acciones: [{ texto: 'Cancelar', clase: 'btn-fantasma', valor: null }, {
        texto: 'Guardar', clase: 'btn-primario', accion: async velo => {
          const a = velo.querySelector('#c1').value, b = velo.querySelector('#c2').value;
          if (a.length < 8) { aviso('La contraseña debe tener al menos 8 caracteres.', 'error'); return false; }
          if (a !== b) { aviso('Las contraseñas no coinciden.', 'error'); return false; }
          try { await estado.api.cambiarContrasena(a); aviso('Contraseña actualizada.', 'exito'); } catch (e) { errorAviso(e); return false; }
        },
      }],
    });
  });

  $('#b-port-pdf', cont)?.addEventListener('click', () => imprimir([...entregas].reverse(), `Portafolio de ${p.nombre}`, 'Taller de Creación Literaria'));
  $('#b-port-txt', cont)?.addEventListener('click', () => descargarTXT([...entregas].reverse(), `portafolio ${p.nombre}`));
  $('#b-salir', cont)?.addEventListener('click', async () => { await estado.api.cerrarSesion(); location.hash = '#/'; location.reload(); });

  $('#b-mencion', cont)?.addEventListener('click', async () => {
    const manuales = todas.filter(i => i.tipo === 'manual');
    const r = await modal({
      titulo: `Mención para ${p.nombre}`,
      cuerpo: `<div class="campo"><label for="m-ins">Insignia</label><select class="selector" id="m-ins">${manuales.map(i => `<option value="${i.slug}">${esc(i.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="m-nota">Motivo (lo verá el estudiante)</label><textarea class="area" id="m-nota" placeholder="Por…"></textarea></div>`,
      acciones: [{ texto: 'Cancelar', clase: 'btn-fantasma', valor: null }, {
        texto: 'Otorgar', clase: 'btn-primario',
        accion: velo => ({ ins: velo.querySelector('#m-ins').value, nota: velo.querySelector('#m-nota').value.trim() }),
      }],
    });
    if (!r || r === true) return;
    try { await estado.api.otorgar(p.id, r.ins, r.nota); aviso('Mención otorgada.', 'exito'); location.reload(); } catch (e) { errorAviso(e); }
  });
}
