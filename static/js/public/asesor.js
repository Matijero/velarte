/* Vel Arte: asesor guiado. 3 preguntas -> coincidencias exactas (hasta 6) + alternativas aparte con su motivo
   + WhatsApp con el contexto ya escrito. Reglas simples (ocasión, cantidad, presupuesto, destacadas); sin servicios externos. */
(function () {
  'use strict';
  var NS = window.VelArte;
  var form = document.getElementById('asesor-form');
  if (!NS || !form) return;

  var pasos = Array.prototype.slice.call(form.querySelectorAll('[data-paso]'));
  var precios = {};
  ((NS.leerJSON('va-explorador') || {}).precios || []).forEach(function (r) { precios[r.id] = r; });

  var progreso = document.getElementById('asesor-progreso');
  var sigue = document.getElementById('asesor-sigue');
  var atras = document.getElementById('asesor-atras');
  var salida = document.getElementById('asesor-resultados');
  var campoMaximo = document.getElementById('asesor-maximo');
  var errorMaximo = document.getElementById('asesor-error');
  var ayudaMaximo = campoMaximo.getAttribute('aria-describedby') || '';
  var actual = 0;

  function valor(nombre) {
    var r = form.querySelector('input[name="' + nombre + '"]:checked');
    return r ? { v: r.value, t: r.getAttribute('data-etiqueta') || '' } : { v: '', t: '' };
  }

  function mostrar(n, enfocar) {
    actual = n;
    pasos.forEach(function (f, i) { f.hidden = i !== n; });
    progreso.textContent = 'Pregunta ' + (n + 1) + ' de ' + pasos.length;
    atras.hidden = n === 0;
    sigue.textContent = n === pasos.length - 1 ? 'Ver recomendaciones' : 'Siguiente';
    if (enfocar) {
      var marcado = pasos[n].querySelector('input:checked') || pasos[n].querySelector('input');
      if (marcado) marcado.focus();
    }
  }

  function coincideRango(r, precio) {
    if (precio == null) return false;
    if (r.min > 0 && precio <= r.min) return false;
    return r.max == null || precio <= r.max;
  }

  /* Decisión D-1: las coincidencias exactas (cumplen ocasión y presupuesto) van primero y nunca se rellenan;
     las alternativas van aparte, cada una con su motivo, y nunca se presentan como coincidencias. */
  var MAX_COINCIDENCIAS = 6, MAX_ALTERNATIVAS = 3;
  var MOTIVOS = {
    caro: { ui: 'Se pasa de tu presupuesto', wa: 'se pasa del presupuesto' },
    barato: { ui: 'Cuesta menos que el rango que elegiste', wa: 'cuesta menos que el rango elegido' },
    cotizar: { ui: 'Precio a cotizar', wa: 'precio a cotizar' },
    ocasion: { ui: 'Es para otra ocasión', wa: 'es para otra ocasión' }
  };
  /* Orden de las alternativas: misma ocasión con el precio más cercano, luego las de precio a cotizar
     y al final las de otra ocasión dentro del presupuesto. Lo que falla en ambas cosas no se sugiere. */
  var GRUPO = { caro: 0, barato: 0, cotizar: 1, ocasion: 2 };

  function recomendar(oca, cant, pre) {
    var maximo = campoMaximo.value;
    var rango = maximo === '' && pre.v ? precios[pre.v] : null;
    var tope = maximo !== '' ? Number(maximo) : rango ? rango.max : null;
    var hayPresupuesto = maximo !== '' || !!rango;

    function enOcasion(p) { return !oca.v || p.ocasiones.some(function (o) { return o.slug === oca.v; }); }
    /* '' si cabe en el presupuesto; si no, el código del motivo. */
    function motivoPrecio(p) {
      if (!hayPresupuesto) return '';
      if (p.precio == null) return 'cotizar';
      if (tope != null && p.precio > tope) return 'caro';
      if (rango && !coincideRango(rango, p.precio)) return 'barato';
      return '';
    }
    function distancia(x) {
      if (x.motivo === 'caro') return x.p.precio - tope;
      if (x.motivo === 'barato') return rango.min - x.p.precio;
      return 0;
    }
    function porPuntos(a, b) { return (b.puntos - a.puntos) || (a.pos - b.pos); }

    var todos = Object.keys(NS.productos).map(function (k, i) {
      return { p: NS.productos[k], pos: i };
    }).filter(function (x) { return x.p.disponible; });
    todos.forEach(function (x) {
      var p = x.p, puntos = 0;
      if (p.destacado) puntos += 2;
      if (cant.v === 'pocas' && p.precio != null) puntos += 1;
      if (cant.v === 'varias' && p.personalizable) puntos += 2;
      if (cant.v === 'evento') { if (p.por_encargo) puntos += 3; if (p.personalizable) puntos += 2; }
      x.puntos = puntos;
      var precio = motivoPrecio(p);
      x.motivo = enOcasion(p) ? precio : (precio ? 'ninguno' : 'ocasion');
    });
    var coincidencias = todos.filter(function (x) { return x.motivo === ''; }).sort(porPuntos);
    var alternativas = todos.filter(function (x) { return GRUPO.hasOwnProperty(x.motivo); }).sort(function (a, b) {
      return (GRUPO[a.motivo] - GRUPO[b.motivo]) || (distancia(a) - distancia(b)) || porPuntos(a, b);
    });
    return {
      coincidencias: coincidencias.slice(0, MAX_COINCIDENCIAS),
      alternativas: alternativas.slice(0, MAX_ALTERNATIVAS)
    };
  }

  function tarjeta(p, cant, motivo) {
    var media = NS.el('div', { class: 'tarjeta__media' });
    if (p.foto) {
      var src = /^(https?:)?\/\//.test(p.foto.url) ? p.foto.url : NS.base + p.foto.url;
      media.appendChild(NS.el('img', { src: src, alt: p.foto.alt, width: '800', height: '800', loading: 'lazy', decoding: 'async' }));
    } else {
      var tpl = document.getElementById('tpl-placeholder');
      if (tpl && tpl.content) {
        var svg = tpl.content.firstElementChild.cloneNode(true);
        svg.setAttribute('aria-hidden', 'true'); svg.removeAttribute('role'); svg.removeAttribute('aria-label');
        media.appendChild(svg);
      }
    }
    var cuerpo = NS.el('div', { class: 'tarjeta__cuerpo' }, [
      NS.el('h4', { class: 'tarjeta__nombre' }, [NS.el('a', { class: 'tarjeta__enlace', href: NS.base + p.url, text: p.nombre })]),
      motivo ? NS.el('p', { class: 'tarjeta__motivo', text: MOTIVOS[motivo].ui }) : null,
      NS.el('p', { class: 'tarjeta__precio', text: p.precio_texto }),
      NS.el('p', { class: 'tarjeta__meta', text: p.coleccion.nombre })
    ]);
    if (p.demo) media.appendChild(NS.el('span', { class: 'etiqueta etiqueta--demo galeria__demo', text: 'Demo' }));
    if (cant.v && p.precio != null) {
      var intervalo = { pocas: [1, 2], varias: [3, 12], evento: [13, null] }[cant.v];
      var texto = intervalo[1] ? NS.pesos(p.precio * intervalo[0]) + ' a ' + NS.pesos(p.precio * intervalo[1]) : 'Desde ' + NS.pesos(p.precio * intervalo[0]);
      cuerpo.appendChild(NS.el('p', { class: 'tarjeta__meta', text: 'Estimado para tu cantidad: ' + texto + (p.tipo === 'desde' ? ' (precio mínimo)' : '') }));
    }
    var mas = NS.el('button', { type: 'button', class: 'btn-mas', 'data-add': p.id, 'aria-label': 'Añadir ' + p.nombre + ' a mi pedido' });
    mas.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    return NS.el('article', { class: 'tarjeta', 'data-id': p.id }, [media, cuerpo, mas]);
  }

  function nombreCodigo(p) { return p.nombre + (p.codigo ? ' (' + p.codigo + ')' : ''); }

  /* Lo que la clienta marcó (sus respuestas) va separado de lo que el asesor sugirió;
     nunca se dice que eligió o le gustó algo que solo se le mostró. */
  function mensaje(oca, cant, pre, res) {
    var l = ['Hola ' + (NS.config.nombre || '') + ', ¿me ayudan a elegir velas?', 'Lo que busco:'];
    if (oca.t) l.push('- Ocasión: ' + oca.t);
    if (cant.t) l.push('- Es ' + cant.t);
    if (pre.t) l.push('- Presupuesto por vela: ' + pre.t);
    if (!oca.t && !cant.t && !pre.t) l.push('- Aún no lo tengo claro');
    var vistas = res.coincidencias.concat(res.alternativas);
    if (vistas.some(function (x) { return x.p.demo; })) l.push('Estoy viendo productos y precios de demostración: quisiera confirmar las opciones reales.');
    if (res.coincidencias.length) {
      l.push('El asesor me mostró estas opciones que coinciden con lo que busco:');
      res.coincidencias.forEach(function (x) { l.push('- ' + nombreCodigo(x.p)); });
    } else {
      l.push('El asesor no encontró velas que coincidan con todo lo que busco.');
    }
    if (res.alternativas.length) {
      l.push('También me sugirió estas, que no coinciden del todo:');
      res.alternativas.forEach(function (x) { l.push('- ' + nombreCodigo(x.p) + ': ' + MOTIVOS[x.motivo].wa); });
    }
    return l.join('\n');
  }

  function bloque(nombre, titulo, intro, lista, cant, conMotivo) {
    var idTitulo = 'asesor-' + nombre + '-titulo';
    var g = NS.el('div', { class: 'grilla' });
    lista.forEach(function (x) { g.appendChild(tarjeta(x.p, cant, conMotivo ? x.motivo : '')); });
    return NS.el('section', { class: 'asesor__bloque asesor__bloque--' + nombre, 'data-bloque': nombre, 'aria-labelledby': idTitulo }, [
      NS.el('h3', { class: 'asesor__bloque-titulo', id: idTitulo, text: titulo }),
      intro ? NS.el('p', { class: 'asesor__bloque-intro', text: intro }) : null,
      g
    ]);
  }

  function resultados() {
    var oca = valor('oca'), cant = valor('cant'), pre = valor('pre');
    var maximo = campoMaximo.value;
    if (maximo !== '') pre = { v: '', t: 'Hasta ' + NS.pesos(Number(maximo)) };
    var res = recomendar(oca, cant, pre);
    var n = res.coincidencias.length, hayAlt = res.alternativas.length > 0;
    salida.textContent = '';
    var partes = [oca.t && 'ocasión: ' + oca.t, cant.t, pre.t && 'presupuesto por vela: ' + pre.t].filter(Boolean);
    salida.appendChild(NS.el('h2', { class: 'titulo-seccion', text: n ? 'Opciones que coinciden con tu búsqueda' : 'No encontramos una coincidencia exacta' }));
    if (partes.length) salida.appendChild(NS.el('p', { class: 'asesor__resumen', text: 'Según lo que nos contaste (' + partes.join('; ') + ').' }));
    if (n) {
      salida.appendChild(bloque('coincidencias', n === 1 ? '1 vela coincide con lo que buscas' : n + ' velas coinciden con lo que buscas',
        '', res.coincidencias, cant, false));
    } else {
      salida.appendChild(NS.el('p', { class: 'aviso aviso--fuerte', role: 'status',
        text: 'Ninguna vela disponible cumple a la vez la ocasión y el presupuesto que elegiste. ' +
          (hayAlt ? 'Abajo te mostramos otras que se acercan, y por qué no coinciden. ' : '') +
          'Escríbenos por WhatsApp y te ayudamos a encontrar una opción.' }));
    }
    if (hayAlt) {
      salida.appendChild(bloque('alternativas', 'También te puede gustar',
        'No cumplen todo lo que pediste; en cada una te contamos qué cambia.', res.alternativas, cant, true));
    }
    if (res.coincidencias.concat(res.alternativas).some(function (x) { return x.p.demo; })) {
      salida.appendChild(NS.el('p', { class: 'aviso', text: 'Vista de demostración: estos productos y precios son ilustrativos. La tienda debe confirmar disponibilidad y valores reales.' }));
    }
    if (n || hayAlt) {
      salida.appendChild(NS.el('p', { class: 'subtitulo', text: 'Para eventos priorizamos opciones por encargo y personalizables. Los estimados no incluyen envío ni descuentos por cantidad.' }));
    } else {
      salida.appendChild(NS.el('p', { text: 'Puedes cambiar la ocasión o ampliar el presupuesto. También puedes compartir estos detalles con la tienda para que revise otras opciones.' }));
    }
    var acciones = NS.el('p', { class: 'asesor__botones' }, [
      NS.el('a', { class: 'btn btn--wa btn--grande', href: NS.waUrl(mensaje(oca, cant, pre, res)), target: NS.config.whatsapp ? '_blank' : '_self', rel: 'noopener', text: NS.config.whatsapp ? 'Compartir mi búsqueda por WhatsApp' : 'Contacto para pedidos pendiente' }),
      NS.el('button', { type: 'button', class: 'btn btn--linea', id: 'asesor-reiniciar', text: 'Empezar de nuevo' })
    ]);
    salida.appendChild(acciones);
    salida.hidden = false;
    form.hidden = true;
    salida.focus();
    salida.scrollIntoView({ behavior: NS.reducirMovimiento() ? 'auto' : 'smooth', block: 'start' });
  }

  /* CG-04: el error queda asociado al campo (aria-invalid + aria-describedby) y se limpia al corregirlo. */
  function marcarError(hayError) {
    errorMaximo.hidden = !hayError;
    if (hayError) {
      errorMaximo.textContent = 'Escribe un presupuesto entre 0 y 9.999.999.999 pesos, sin puntos ni comas.';
      campoMaximo.setAttribute('aria-invalid', 'true');
      campoMaximo.setAttribute('aria-describedby', (ayudaMaximo + ' asesor-error').trim());
    } else {
      campoMaximo.removeAttribute('aria-invalid');
      if (ayudaMaximo) campoMaximo.setAttribute('aria-describedby', ayudaMaximo);
      else campoMaximo.removeAttribute('aria-describedby');
    }
  }
  campoMaximo.addEventListener('input', function () {
    if (campoMaximo.getAttribute('aria-invalid') === 'true' && campoMaximo.checkValidity()) marcarError(false);
  });

  sigue.addEventListener('click', function () {
    if (actual === pasos.length - 1 && !campoMaximo.checkValidity()) {
      marcarError(true);
      campoMaximo.focus(); return;
    }
    marcarError(false);
    if (actual < pasos.length - 1) mostrar(actual + 1, true); else resultados();
  });
  atras.addEventListener('click', function () { if (actual > 0) mostrar(actual - 1, true); });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  salida.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    if (!t.closest('#asesor-reiniciar')) return;
    salida.hidden = true;
    form.hidden = false;
    form.reset();
    marcarError(false);
    mostrar(0, true);
  });

  /* ?oca=<slug> viene de la portada: ya respondió la primera pregunta. */
  var oca = new URLSearchParams(window.location.search).get('oca');
  var radio = Array.prototype.slice.call(form.querySelectorAll('input[name="oca"]')).find(function (input) { return oca && input.value === oca; });
  if (radio) { radio.checked = true; mostrar(1, false); } else { mostrar(0, false); }
})();
