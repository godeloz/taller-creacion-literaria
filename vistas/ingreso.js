// Pantalla de ingreso: correo y contraseña (o elección de usuario en la demostración).
import { CONFIG } from '../config.js';
import { estado } from '../nucleo/estado.js';
import { esc, $, errorAviso } from '../nucleo/ui.js';
import { icono, avatarSVG } from '../nucleo/iconos.js';

export default async function ingreso(cont, { alEntrar }) {
  const demo = estado.api.modo === 'demo';
  const colores = [['#FF6B4A', 'pluma'], ['#C6F24E', 'cartas'], ['#4D7CFF', 'fichas'], ['#FFD84D', 'chispa'],
    ['#FF4F7B', 'encanta'], ['#B18CFF', 'libro'], ['#00A884', 'tijeras'], ['#FFB547', 'cuaderno']];
  cont.innerHTML = `
  <div class="ingreso">
    <section class="ingreso-arte">
      <div class="mosaico">${colores.map(([c, i]) => `<span style="background:${c}">${icono(i, 28)}</span>`).join('')}</div>
      <h1>${esc(CONFIG.titulo).replace('Creación', '<em>Creación</em>')}</h1>
      <p style="color:#A39DB0;max-width:40ch;margin:0;position:relative">Retos diarios, dinámicas de escritura y un cuaderno propio. Todo lo que escriba queda guardado aquí.</p>
    </section>
    <section class="ingreso-form">
      <div class="ingreso-caja">
        ${demo ? `
          <h2>Modo demostración</h2>
          <p class="tenue">Elija con qué usuario quiere entrar. Los datos se guardan solo en este navegador.</p>
          <div class="demo-usuarios">
            ${estado.api.usuariosDemo().map(u => `<button type="button" data-id="${u.id}">${avatarSVG(u.avatar, 38)}<span>${esc(u.nombre)}<br><small class="tenue" style="font-weight:500">${u.rol === 'tutor' ? 'Tutor' : 'Creador'}</small></span></button>`).join('')}
          </div>` : `
          <h2>Bienvenido al taller</h2>
          <p class="tenue" style="margin:0 0 24px">Ingrese con el correo y la contraseña que le entregó el tutor.</p>
          <form id="form-ingreso">
            <div class="campo"><label for="correo">Correo</label><input class="entrada" id="correo" type="email" autocomplete="username" required></div>
            <div class="campo"><label for="clave">Contraseña</label><input class="entrada" id="clave" type="password" autocomplete="current-password" required></div>
            <button class="btn btn-primario" type="submit" style="width:100%;margin-top:8px">Entrar</button>
            <p class="tenue" style="font-size:13.5px;margin-top:18px">¿Olvidó su contraseña? Escríbale al tutor para que se la restablezca.</p>
          </form>`}
      </div>
    </section>
  </div>`;

  if (demo) {
    cont.querySelector('.demo-usuarios').addEventListener('click', async ev => {
      const b = ev.target.closest('[data-id]');
      if (!b) return;
      try { await alEntrar(await estado.api.iniciarSesion(b.dataset.id)); } catch (e) { errorAviso(e); }
    });
    return;
  }

  $('#form-ingreso', cont).addEventListener('submit', async ev => {
    ev.preventDefault();
    const boton = ev.target.querySelector('button');
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    try {
      const yo = await estado.api.iniciarSesion($('#correo').value, $('#clave').value);
      await alEntrar(yo);
    } catch (e) {
      errorAviso(e);
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });
}
