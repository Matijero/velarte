/* Vel Arte: base compartida + "Mi pedido" (localStorage con respaldo en memoria). */
(function () {
  'use strict';

  var NS = (window.VelArte = window.VelArte || {});
  var CLAVE = 'velarte.pedido.v1';
  var MAX_CODIFICADO = 6000;
  var MAX_CANT = 999; /* recuerditos para bautizos y comuniones: se pueden escribir, no solo sumar de a uno */

  function leerJSON(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  NS.leerJSON = leerJSON;
  NS.config = leerJSON('va-config') || { whatsapp: '', mensajeBase: 'Hola, quiero pedir:', mensajeGeneral: 'Hola' };
  NS.base = document.body.getAttribute('data-base') || '/';
  NS.productos = {};
  NS.registrar = function (lista) {
    (lista || []).forEach(function (p) { NS.productos[p.id] = p; });
  };
  NS.registrar(leerJSON('va-productos'));
  var referenciaPedido = {};
  (leerJSON('va-pedido-productos') || []).forEach(function (p) { referenciaPedido[p.id] = p; });

  NS.pesos = function (n) {
    return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  NS.norm = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  };
  /* Búsqueda tolerante: sin plural, sin palabras vacías ("velas de navidad" = "navidad"),
     con sinónimos del negocio y coincidencia por prefijo ("bautiz" encuentra "bautizo"). */
  var EQUIV = { bautismo: 'bautizo', recuerdito: 'recuerdo', regalito: 'regalo', detalle: 'regalo', navideno: 'navidad', navidena: 'navidad', flor: 'bouquet', ramo: 'bouquet', virgencita: 'virgen', angelito: 'angel' };
  var VACIAS = { de: 1, del: 1, para: 1, el: 1, la: 1, los: 1, las: 1, un: 1, una: 1, con: 1, y: 1, en: 1, por: 1, a: 1, vela: 1, velas: 1 };
  function raiz(w) {
    if (w.length > 4 && /es$/.test(w) && !/[aeiou]es$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && /s$/.test(w)) w = w.slice(0, -1);
    return EQUIV[w] || w;
  }
  /* Palabras significativas: sin tildes, sin vacías, en raíz. */
  NS.palabrasBusqueda = function (s) {
    return NS.norm(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (w) { return w && !VACIAS[w]; }).map(raiz);
  };
  NS.textoBusqueda = function (s) { return NS.palabrasBusqueda(s).join(' '); };
  /* Cada palabra de la consulta debe ser prefijo de alguna palabra del texto. */
  NS.coincideBusqueda = function (consulta, texto) {
    var tw = NS.palabrasBusqueda(texto);
    return NS.palabrasBusqueda(consulta).every(function (q) {
      return tw.some(function (t) { return t.indexOf(q) === 0; });
    });
  };
  NS.reducirMovimiento = function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  NS.waUrl = function (texto) {
    if (!NS.config.whatsapp) return '#contacto-pendiente';
    return 'https://wa.me/' + NS.config.whatsapp + '?text=' + encodeURIComponent(texto);
  };
  NS.el = function (tag, attrs, hijos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) e.appendChild(h); });
    return e;
  };

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  NS.toast = function (mensaje, deshacer) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.textContent = '';
    toastEl.appendChild(NS.el('span', { text: mensaje }));
    if (deshacer) {
      var b = NS.el('button', { type: 'button', class: 'toast__btn', text: 'Deshacer' });
      b.addEventListener('click', function () { deshacer(); ocultarToast(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add('toast--visible');
    toastTimer = setTimeout(ocultarToast, deshacer ? 8000 : 5000);
  };
  /* Al ocultarlo se vacía: un "Deshacer" invisible no debe poder enfocarse con el teclado. */
  function ocultarToast() {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.classList.remove('toast--visible');
    toastEl.textContent = '';
  }

  /* ---------- Almacenamiento ---------- */
  var memoria = [];
  function cargar() {
    try {
      var crudo = window.localStorage.getItem(CLAVE);
      if (crudo) {
        var datos = JSON.parse(crudo);
        if (Array.isArray(datos)) return datos.filter(function (i) { return i && i.id && i.cantidad > 0; });
      }
      return [];
    } catch (e) { return memoria.slice(); }
  }
  function guardar(items) {
    memoria = items.slice();
    try { window.localStorage.setItem(CLAVE, JSON.stringify(items)); } catch (e) { /* modo privado: queda en memoria */ }
  }

  var avisoActualizacion = '';
  function revalidar(datos) {
    var salida = [], porId = {}, cambios = false;
    datos.forEach(function (i) {
      var p = referenciaPedido[i.id];
      if (!p || !p.disponible) { cambios = true; return; }
      var cantidad = Number(i.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 1) { cambios = true; return; }
      cantidad = Math.min(MAX_CANT, Math.floor(cantidad));
      if (cantidad !== i.cantidad || i.precio !== p.precio || i.nombre !== p.nombre || i.tipo !== p.tipo) cambios = true;
      if (porId[p.id]) { porId[p.id].cantidad = Math.min(MAX_CANT, porId[p.id].cantidad + cantidad); cambios = true; return; }
      var item = Object.assign({}, p, { cantidad: cantidad });
      porId[p.id] = item; salida.push(item);
    });
    if (cambios) avisoActualizacion = 'Actualizamos los precios de tu selección y retiramos las velas que ya no están disponibles. Revisa tu pedido antes de enviarlo.';
    return salida;
  }
  var items = revalidar(cargar());
  guardar(items);

  /* ---------- Cálculos y mensaje ---------- */
  function lineaPrecio(i) {
    if (i.precio == null) return 'a cotizar';
    var t = NS.pesos(i.precio * i.cantidad);
    return i.tipo === 'desde' ? 'desde ' + t : t;
  }

  NS.resumen = function (lista) {
    var total = 0, cantidad = 0, hayDesde = false, hayCotizar = false;
    lista.forEach(function (i) {
      cantidad += i.cantidad;
      if (i.precio == null) { hayCotizar = true; return; }
      total += i.precio * i.cantidad;
      if (i.tipo === 'desde') hayDesde = true;
    });
    return { total: total, cantidad: cantidad, hayDesde: hayDesde, hayCotizar: hayCotizar };
  };

  NS.mensajePedido = function (lista) {
    var r = NS.resumen(lista);
    var cabecera = NS.config.mensajeBase;
    var pie = [];
    if (lista.some(function (i) { return i.demo; })) pie.push('Selección de demostración: productos y precios ilustrativos, por confirmar.');
    if (r.total > 0 || r.hayCotizar) {
      pie.push('Total estimado: ' + (r.hayDesde ? 'desde ' : '') + NS.pesos(r.total) +
        (r.hayCotizar ? ' (sin contar los productos a cotizar)' : ''));
    }
    pie.push('Precio final y envío: los confirmamos por este chat.');
    pie.push('Nombre:', 'Ciudad o barrio:', 'Para qué día lo necesitas:', 'Personalización (nombre, colores):');
    var lineas = [];
    for (var n = 0; n < lista.length; n++) {
      var i = lista[n];
      var linea = '- ' + i.cantidad + ' x ' + i.nombre + (i.codigo ? ' (' + i.codigo + ')' : '') + ' - ' + lineaPrecio(i);
      lineas.push(linea);
    }
    return [cabecera].concat(lineas, pie).join('\n');
  };

  /* ---------- Referencias DOM ---------- */
  var dlg = document.getElementById('dlg-pedido');
  var lista = document.querySelector('[data-pedido-lista]');
  var vacio = document.querySelector('[data-pedido-vacio]');
  var totalEl = document.querySelector('[data-pedido-total]');
  var vaciarBtn = document.querySelector('[data-pedido-vaciar]');
  var waDlg = document.querySelector('[data-pedido-wa-dlg]');
  var waBarra = document.querySelector('[data-pedido-wa]');
  var waBarraTxt = document.querySelector('[data-pedido-wa-texto]');
  var barraTitulo = document.querySelector('[data-pedido-titulo]');
  var barraDetalle = document.querySelector('[data-pedido-detalle]');
  var contadores = document.querySelectorAll('[data-pedido-contador]');
  var ultimoDisparador = null;

  function textoTotal(r) {
    if (r.total === 0) return r.hayCotizar ? 'Todo a cotizar' : '';
    return 'Total estimado: ' + (r.hayDesde ? 'desde ' : '') + NS.pesos(r.total) + (r.hayCotizar ? ' + cotizaciones' : '');
  }

  function pintar(enfocar, sinLista) {
    var r = NS.resumen(items);
    var hay = items.length > 0;
    var msg = hay ? NS.mensajePedido(items) : NS.config.mensajeGeneral;
    var largo = encodeURIComponent(msg).length > MAX_CODIFICADO;
    var mensajeEnlace = largo ? NS.config.mensajeGeneral + '\nVoy a pegar mi pedido completo en este chat.' : msg;

    Array.prototype.forEach.call(contadores, function (c) { c.hidden = !hay; c.textContent = r.cantidad; });
    barraTitulo.textContent = hay ? 'Mi pedido (' + r.cantidad + ')' : 'Mi pedido';
    barraDetalle.textContent = hay ? (textoTotal(r) || '').replace('Total estimado: ', '') : 'Aún vacío';
    waBarraTxt.textContent = hay ? 'Enviar' : 'Escríbenos';
    waBarra.setAttribute('aria-label', hay ? 'Enviar pedido por WhatsApp' : 'Escríbenos por WhatsApp');
    waBarra.href = NS.waUrl(mensajeEnlace);
    waDlg.href = NS.waUrl(mensajeEnlace);
    if (!NS.config.whatsapp) {
      waBarraTxt.textContent = 'Contacto pendiente';
      waDlg.textContent = 'Contacto para pedidos pendiente';
      waBarra.setAttribute('aria-disabled', 'true');
      waDlg.setAttribute('aria-disabled', 'true');
    } else {
      waDlg.textContent = largo ? 'Abrir WhatsApp y pegar el pedido' : 'Enviar pedido por WhatsApp';
    }
    var nota = document.querySelector('.hoja__nota');
    nota.textContent = !NS.config.whatsapp ? 'Puedes guardar tu selección mientras la tienda configura el contacto.' : largo ? 'Tu pedido es largo. Cópialo completo con el botón de abajo y pégalo en el chat de WhatsApp.' : 'Se abrirá WhatsApp con tu pedido ya escrito.';
    var copiar = document.querySelector('[data-pedido-copiar]');
    var textoPedido = document.querySelector('[data-pedido-texto]');
    copiar.hidden = !largo;
    textoPedido.value = msg;
    var actualizado = document.querySelector('[data-pedido-actualizado]');
    actualizado.hidden = !avisoActualizacion;
    actualizado.textContent = avisoActualizacion;

    vacio.hidden = hay;
    vaciarBtn.hidden = !hay;
    totalEl.hidden = !hay || !textoTotal(r);
    totalEl.textContent = textoTotal(r);

    if (!sinLista) {
    lista.textContent = '';
    items.forEach(function (i) {
      var nombre = NS.el('a', { href: NS.base + (i.url || ''), class: 'pedido-item__nombre', text: i.nombre });
      var precio = NS.el('p', { class: 'pedido-item__precio', text: lineaPrecio(i) });
      var menos = NS.el('button', { type: 'button', class: 'paso-btn', 'data-accion': 'menos', 'data-id': i.id, 'aria-label': 'Quitar una unidad de ' + i.nombre, text: '−' });
      var cant = NS.el('input', { type: 'number', class: 'paso-cant', inputmode: 'numeric', min: '1', max: String(MAX_CANT), step: '1', value: String(i.cantidad), 'aria-label': 'Cantidad de ' + i.nombre, 'data-accion': 'cantidad', 'data-id': i.id });
      var mas = NS.el('button', { type: 'button', class: 'paso-btn', 'data-accion': 'mas', 'data-id': i.id, 'aria-label': 'Añadir una unidad de ' + i.nombre, text: '+' });
      var quitar = NS.el('button', { type: 'button', class: 'btn-texto', 'data-accion': 'quitar', 'data-id': i.id, 'aria-label': 'Quitar ' + i.nombre + ' del pedido', text: 'Quitar' });
      var li = NS.el('li', { class: 'pedido-item' }, [
        NS.el('div', { class: 'pedido-item__info' }, [nombre, precio]),
        NS.el('div', { class: 'paso-grupo' }, [menos, cant, mas]),
        quitar
      ]);
      lista.appendChild(li);
    });
    }

    if (enfocar) {
      var objetivo = lista.querySelector('[data-accion="' + enfocar.accion + '"][data-id="' + enfocar.id + '"]') ||
        lista.querySelector('[data-accion="mas"]') || vaciarBtn;
      if (objetivo && !objetivo.hidden) objetivo.focus();
      else {
        var cierre = dlg.querySelector('[data-cerrar-pedido]');
        if (cierre && dlg.open) cierre.focus();
      }
    }
  }

  function buscar(id) {
    for (var n = 0; n < items.length; n++) if (items[n].id === id) return n;
    return -1;
  }

  NS.pedido = {
    items: function () { return items.slice(); },
    agregar: function (p, cantidad) {
      if (!p || !referenciaPedido[p.id] || !referenciaPedido[p.id].disponible) return;
      p = referenciaPedido[p.id];
      cantidad = Math.min(MAX_CANT, Math.max(1, Math.floor(Number(cantidad) || 1)));
      var n = buscar(p.id);
      if (n >= 0) items[n].cantidad = Math.min(MAX_CANT, items[n].cantidad + cantidad);
      else items.push(Object.assign({}, p, { cantidad: cantidad }));
      guardar(items); pintar();
    },
    cambiar: function (id, delta) {
      var n = buscar(id);
      if (n < 0) return;
      items[n].cantidad = Math.min(MAX_CANT, items[n].cantidad + delta);
      if (items[n].cantidad <= 0) { this.quitar(id); return; }
      guardar(items); pintar({ accion: delta > 0 ? 'mas' : 'menos', id: id });
    },
    quitar: function (id) {
      var n = buscar(id);
      if (n < 0) return;
      var quitado = items.splice(n, 1)[0];
      guardar(items); pintar({ accion: 'mas', id: '' });
      NS.toast('Quitaste ' + quitado.nombre, function () {
        /* F-05: si otra pestaña ya volvió a añadirlo mientras tanto, se respeta esa línea (sin duplicar). */
        if (buscar(quitado.id) < 0) items.splice(Math.min(n, items.length), 0, quitado);
        guardar(items); pintar();
      });
    },
    vaciar: function () { items = []; guardar(items); pintar(); }
  };

  /* ---------- Eventos ---------- */
  function abrir(disparador) {
    ultimoDisparador = disparador || null;
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
    document.documentElement.classList.add('sin-scroll');
    /* El diálogo modal tapa todo lo que está fuera de él: el aviso con "Deshacer" se muestra dentro. */
    if (toastEl && dlg.open) dlg.appendChild(toastEl);
  }
  function cerrar() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  dlg.addEventListener('close', function () {
    document.documentElement.classList.remove('sin-scroll');
    if (toastEl && toastEl.parentNode === dlg) document.body.appendChild(toastEl);
    if (ultimoDisparador && document.contains(ultimoDisparador)) ultimoDisparador.focus();
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) cerrar(); });

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    var abrirBtn = t.closest('[data-abrir-pedido]');
    if (abrirBtn) { abrir(abrirBtn); return; }
    if (t.closest('[data-cerrar-pedido]')) { cerrar(); return; }
    if (t.closest('[data-pedido-copiar]')) {
      var textoCompleto = document.querySelector('[data-pedido-texto]');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textoCompleto.value).then(function () { NS.toast('Pedido completo copiado. Pégalo en WhatsApp.'); }).catch(function () { textoCompleto.hidden = false; textoCompleto.focus(); textoCompleto.select(); });
      } else { textoCompleto.hidden = false; textoCompleto.focus(); textoCompleto.select(); }
      return;
    }
    if (t.closest('[data-pedido-wa]') && encodeURIComponent(NS.mensajePedido(items)).length > MAX_CODIFICADO) {
      e.preventDefault(); abrir(waBarra); return;
    }
    if (t.closest('[data-pedido-vaciar]')) {
      var previo = items.slice();
      NS.pedido.vaciar();
      NS.toast('Vaciaste tu pedido', function () {
        /* NUEVO-1: se recupera lo vaciado sin pisar lo que otra pestaña añadió o cambió entretanto. */
        var actuales = {};
        items.forEach(function (i) { actuales[i.id] = i; });
        var restaurado = previo.map(function (i) { var a = actuales[i.id]; delete actuales[i.id]; return a || i; });
        items = restaurado.concat(items.filter(function (i) { return actuales[i.id]; }));
        guardar(items); pintar();
      });
      return;
    }
    var add = t.closest('[data-add]');
    if (add) {
      var p = NS.productos[add.getAttribute('data-add')];
      if (p) { NS.pedido.agregar(p, 1); NS.toast('Añadido: ' + p.nombre); }
      return;
    }
    var acc = t.closest('[data-accion]');
    if (acc && dlg.contains(acc)) {
      var id = acc.getAttribute('data-id');
      var a = acc.getAttribute('data-accion');
      if (a === 'mas') NS.pedido.cambiar(id, 1);
      else if (a === 'menos') NS.pedido.cambiar(id, -1);
      else if (a === 'quitar') NS.pedido.quitar(id);
    }
  });

  /* Cantidad escrita a mano (p. ej. 40 recuerditos): no se reconstruye la lista para no perder el toque siguiente. */
  dlg.addEventListener('change', function (e) {
    var campo = e.target;
    if (!campo || campo.getAttribute('data-accion') !== 'cantidad') return;
    var id = campo.getAttribute('data-id'), n = buscar(id);
    if (n < 0) return;
    var v = Math.floor(Number(campo.value));
    if (!Number.isFinite(v) || v < 1) v = items[n].cantidad;
    v = Math.min(MAX_CANT, v);
    items[n].cantidad = v;
    campo.value = String(v);
    var precio = campo.closest('.pedido-item').querySelector('.pedido-item__precio');
    if (precio) precio.textContent = lineaPrecio(items[n]);
    guardar(items); pintar(undefined, true);
    if (v === MAX_CANT) NS.toast('Para más de ' + MAX_CANT + ' unidades escríbenos y lo cotizamos aparte.');
  });

  /* Cabecera que se oculta al bajar y reaparece al subir */
  var cab = document.getElementById('cabecera');
  var ultimoY = 0;
  /* Se lee tras el primer pintado para no forzar un reflow durante la carga. */
  window.requestAnimationFrame(function () { ultimoY = window.scrollY; });
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.scrollY;
      var dentro = cab && cab.contains(document.activeElement);
      if (cab) cab.classList.toggle('cabecera--oculta', y > 160 && y > ultimoY + 4 && !dentro);
      if (y < ultimoY - 4 && cab) cab.classList.remove('cabecera--oculta');
      ultimoY = y;
      ticking = false;
    });
  }, { passive: true });

  window.addEventListener('storage', function (e) {
    if (e.key === CLAVE) { items = revalidar(cargar()); pintar(); }
  });

  pintar();
})();
