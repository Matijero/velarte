/* Vel Arte: galería de la página de producto (cambio de foto por miniaturas). */
(function () {
  'use strict';
  var img = document.getElementById('galeria-img');
  var botones = document.querySelectorAll('[data-foto-src]');
  if (!img || !botones.length) return;
  Array.prototype.forEach.call(botones, function (b) {
    b.addEventListener('click', function () {
      img.src = b.getAttribute('data-foto-src');
      img.alt = b.getAttribute('data-foto-alt') || img.alt;
      Array.prototype.forEach.call(botones, function (o) {
        if (o === b) o.setAttribute('aria-current', 'true'); else o.removeAttribute('aria-current');
      });
    });
  });
})();
