/* Vel Arte: galería de la página de producto (cambio de foto por miniaturas) y selector de
   envases y extras (como en las tiendas: al elegir cambian la foto, el precio y la descripción). */
(function () {
  'use strict';
  var NS = window.VelArte || {};
  var img = document.getElementById('galeria-img');
  var botones = document.querySelectorAll('[data-foto-src]');
  var etiquetaRef = document.querySelector('[data-referencia-etiqueta]');
  var original = img ? { src: img.getAttribute('src'), alt: img.alt, completa: img.classList.contains('foto--completa') } : null;

  function mostrarFoto(src, alt, completa, referencia) {
    if (!img) return;
    img.src = src;
    if (alt) img.alt = alt;
    img.classList.toggle('foto--completa', !!completa);
    if (etiquetaRef) etiquetaRef.hidden = !referencia;
  }

  if (img && botones.length) {
    Array.prototype.forEach.call(botones, function (b) {
      b.addEventListener('click', function () {
        mostrarFoto(b.getAttribute('data-foto-src'), b.getAttribute('data-foto-alt') || img.alt,
          b.getAttribute('data-foto-completa') === '1', false);
        Array.prototype.forEach.call(botones, function (o) {
          if (o === b) o.setAttribute('aria-current', 'true'); else o.removeAttribute('aria-current');
        });
      });
    });
  }

  /* ---------- Envases y extras ---------- */
  var caja = document.querySelector('[data-opciones]');
  if (!caja) return;
  var idProducto = caja.getAttribute('data-producto');
  var base = caja.getAttribute('data-precio-base');
  base = base === '' ? null : Number(base);
  var total = caja.querySelector('[data-opcion-total]');
  var descripcion = caja.querySelector('[data-opcion-descripcion]');
  var zonaTexto = caja.querySelector('[data-texto-personal]');
  var campoTexto = zonaTexto ? zonaTexto.querySelector('input') : null;
  var etiquetaTexto = zonaTexto ? zonaTexto.querySelector('[data-texto-etiqueta]') : null;
  var waProducto = document.querySelector('[data-wa-producto]');
  var pesos = NS.pesos || function (n) { return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };

  function elegidas() {
    return Array.prototype.filter.call(caja.querySelectorAll('input[data-opcion]'), function (i) {
      return i.checked && i.getAttribute('data-opcion');
    });
  }

  function actualizar() {
    var sel = elegidas();
    var suma = 0, textos = [], pideTexto = null, foto = null;
    sel.forEach(function (i) {
      suma += Number(i.getAttribute('data-precio')) || 0;
      if (i.getAttribute('data-descripcion')) textos.push(i.getAttribute('data-descripcion'));
      if (i.getAttribute('data-pide-texto') === '1' && !pideTexto) pideTexto = i;
      if (i.type === 'radio' && i.getAttribute('data-foto')) foto = i;
    });
    if (total) total.textContent = base == null ? 'A cotizar' + (suma ? ' + ' + pesos(suma) + ' del envase' : '') : pesos(base + suma);
    if (descripcion) descripcion.textContent = textos.join(' · ');
    if (zonaTexto) {
      zonaTexto.hidden = !pideTexto;
      if (pideTexto && etiquetaTexto) etiquetaTexto.textContent = pideTexto.getAttribute('data-etiqueta-texto') || '¿Qué nombre o frase va?';
    }
    if (foto) {
      mostrarFoto(foto.getAttribute('data-foto'), document.title.split(' | ')[0] + ' — ' + foto.getAttribute('data-nombre'),
        foto.getAttribute('data-referencia') === '1', foto.getAttribute('data-referencia') === '1');
    } else if (original) {
      mostrarFoto(original.src, original.alt, original.completa, false);
    }
    if (waProducto && NS.construirLinea && NS.mensajePedido) {
      var linea = NS.construirLinea(idProducto, sel.map(function (i) { return i.getAttribute('data-opcion'); }), campoTexto ? campoTexto.value : '');
      if (linea) waProducto.href = NS.waUrl(NS.mensajePedido([Object.assign(linea, { cantidad: 1 })]));
    }
  }

  /* Lo que lee «Añadir a mi pedido» (pedido.js) */
  NS.leerEleccion = function (id) {
    if (id !== idProducto) return null;
    var sel = elegidas();
    var pide = sel.filter(function (i) { return i.getAttribute('data-pide-texto') === '1'; })[0];
    var texto = campoTexto ? campoTexto.value.trim() : '';
    if (pide && !texto) {
      return { error: 'Escribe el nombre o la frase para «' + pide.getAttribute('data-nombre') + '».', foco: campoTexto };
    }
    return {
      opciones: sel.map(function (i) { return i.getAttribute('data-opcion'); }),
      texto: pide ? texto : '',
      detalle: sel.map(function (i) { return i.getAttribute('data-nombre'); }).join(' + ')
    };
  };

  caja.addEventListener('change', actualizar);
  if (campoTexto) campoTexto.addEventListener('input', actualizar);
  actualizar();
})();
