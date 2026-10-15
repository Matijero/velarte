/* Vel Arte: búsqueda y filtros en el cliente sobre las tarjetas ya prerenderizadas.
   Estado sincronizado con la URL: ?q=&col=&oca=&aro=&pre=&orden= (oca y aro admiten varios, separados por coma). */
(function () {
  'use strict';
  var NS = window.VelArte;
  var grilla = document.getElementById('va-grilla');
  if (!NS || !grilla) return;

  var exp = NS.leerJSON('va-explorador') || {};
  var precios = {};
  (exp.precios || []).forEach(function (r) { precios[r.id] = r; });

  var $ = function (id) { return document.getElementById(id); };
  var form = $('va-form'), campo = $('va-q'), borrarQ = $('va-q-limpiar');
  var orden = $('va-orden'), btnFiltros = $('va-btn-filtros'), panel = $('va-panel-filtros');
  var nFiltros = $('va-n-filtros'), aplicadosEl = $('va-aplicados'), contador = $('va-contador');
  var limpiar = $('va-limpiar'), vacio = $('va-vacio'), verResultados = $('va-ver-resultados');
  var tarjetas = Array.prototype.slice.call(grilla.querySelectorAll('.tarjeta'));
  var porId = {};
  tarjetas.forEach(function (t, i) { porId[t.getAttribute('data-id')] = { el: t, pos: i }; });

  var estado = { q: '', col: '', oca: [], aro: [], pre: '', orden: 'rel' };

  function lista(v) { return v ? v.split(',').filter(Boolean) : []; }

  function leerURL() {
    var u = new URLSearchParams(window.location.search);
    estado.q = (u.get('q') || '').slice(0, 80);
    estado.col = u.get('col') || '';
    estado.oca = lista(u.get('oca'));
    estado.aro = lista(u.get('aro'));
    estado.pre = u.get('pre') || '';
    estado.orden = u.get('orden') || 'rel';
    if (!(exp.colecciones || []).some(function (c) { return c.slug === estado.col; })) estado.col = '';
    estado.oca = estado.oca.filter(function (slug, i, a) { return a.indexOf(slug) === i && (exp.ocasiones || []).some(function (o) { return o.slug === slug; }); });
    estado.aro = estado.aro.filter(function (slug, i, a) { return a.indexOf(slug) === i && (exp.aromas || []).some(function (o) { return o.slug === slug; }); });
    if (estado.pre && !precios[estado.pre]) estado.pre = '';
    if (['rel', 'pa', 'pd', 'az'].indexOf(estado.orden) < 0) estado.orden = 'rel';
  }

  function escribirURL() {
    var u = new URLSearchParams();
    if (estado.q) u.set('q', estado.q);
    if (estado.col) u.set('col', estado.col);
    if (estado.oca.length) u.set('oca', estado.oca.join(','));
    if (estado.aro.length) u.set('aro', estado.aro.join(','));
    if (estado.pre) u.set('pre', estado.pre);
    if (estado.orden !== 'rel') u.set('orden', estado.orden);
    var qs = u.toString();
    var url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
    try { window.history.replaceState(null, '', url); } catch (e) { /* sin historial: no pasa nada */ }
  }

  /* Misma regla que services.coincide_rango */
  function coincideRango(r, precio) {
    if (r.id === 'cot') return precio == null;
    if (precio == null) return false;
    if (r.min > 0 && precio <= r.min) return false;
    return r.max == null || precio <= r.max;
  }

  function coincide(p) {
    if (estado.q && !NS.coincideBusqueda(estado.q, p.texto)) return false;
    if (estado.col && (p.colecciones || [p.coleccion.slug]).indexOf(estado.col) < 0) return false;
    if (estado.oca.length && !p.ocasiones.some(function (o) { return estado.oca.indexOf(o.slug) >= 0; })) return false;
    if (estado.aro.length && !p.aromas.some(function (a) { return estado.aro.indexOf(a.slug) >= 0; })) return false;
    if (estado.pre && !coincideRango(precios[estado.pre], p.precio)) return false;
    return true;
  }

  function comparador() {
    var base = function (a, b) { return (a.disponible === b.disponible ? 0 : (a.disponible ? -1 : 1)) || (porId[a.id].pos - porId[b.id].pos); };
    if (estado.orden === 'az') return function (a, b) { return a.nombre.localeCompare(b.nombre, 'es') || base(a, b); };
    if (estado.orden === 'pa' || estado.orden === 'pd') {
      var dir = estado.orden === 'pa' ? 1 : -1;
      return function (a, b) {
        if (a.precio == null && b.precio == null) return base(a, b);
        if (a.precio == null) return 1;
        if (b.precio == null) return -1;
        return (a.precio - b.precio) * dir || base(a, b);
      };
    }
    return base;
  }

  function etiquetaDe(grupo, valor) {
    var b = Array.prototype.slice.call(document.querySelectorAll('.chip[data-grupo]')).find(function (chip) { return chip.getAttribute('data-grupo') === grupo && chip.getAttribute('data-valor') === valor; });
    return b ? (b.getAttribute('data-etiqueta') || b.textContent.replace(/\s*\(\d+\)\s*$/, '').trim()) : valor;
  }

  function pintarAplicados() {
    aplicadosEl.textContent = '';
    var filtros = [];
    if (estado.q) filtros.push({ g: 'q', v: '', t: 'Búsqueda: ' + estado.q });
    if (estado.col) filtros.push({ g: 'col', v: estado.col, t: etiquetaDe('col', estado.col) });
    estado.oca.forEach(function (v) { filtros.push({ g: 'oca', v: v, t: etiquetaDe('oca', v) }); });
    estado.aro.forEach(function (v) { filtros.push({ g: 'aro', v: v, t: etiquetaDe('aro', v) }); });
    if (estado.pre) filtros.push({ g: 'pre', v: estado.pre, t: precios[estado.pre].etiqueta });
    filtros.forEach(function (f) {
      var b = NS.el('button', {
        type: 'button', class: 'chip chip--quitar', 'data-quitar': f.g, 'data-valor': f.v,
        'aria-label': 'Quitar filtro: ' + f.t, text: f.t
      });
      aplicadosEl.appendChild(b);
    });
    aplicadosEl.hidden = filtros.length === 0;
    limpiar.hidden = filtros.length === 0;
    var extra = estado.oca.length + estado.aro.length + (estado.pre ? 1 : 0);
    nFiltros.hidden = extra === 0;
    nFiltros.textContent = String(extra);
  }

  function pintarChips() {
    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-grupo]'), function (b) {
      if (b.tagName !== 'BUTTON') return;
      var g = b.getAttribute('data-grupo'), v = b.getAttribute('data-valor');
      var on = g === 'col' || g === 'pre' ? estado[g] === v : estado[g].indexOf(v) >= 0;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function aplicar(opciones) {
    var datos = tarjetas.map(function (t) { return NS.productos[t.getAttribute('data-id')]; }).filter(Boolean);
    var visibles = datos.filter(coincide);
    var vis = {};
    visibles.forEach(function (p) { vis[p.id] = true; });
    tarjetas.forEach(function (t) { t.hidden = !vis[t.getAttribute('data-id')]; });
    datos.slice().sort(comparador()).forEach(function (p) { grilla.appendChild(porId[p.id].el); });

    var n = visibles.length;
    contador.textContent = n + ' producto' + (n === 1 ? '' : 's');
    Array.prototype.forEach.call(document.querySelectorAll('[data-contador-n]'), function (e) { e.textContent = String(n); });
    if (verResultados) verResultados.textContent = 'Ver ' + n + ' producto' + (n === 1 ? '' : 's');
    vacio.hidden = n !== 0;
    grilla.hidden = n === 0;
    if (n === 0) {
      var b = document.getElementById('va-vacio-wa');
      if (b) b.href = NS.waUrl(estado.q ? 'Hola, busco una vela: ' + estado.q + '. ¿Me ayudan?' : NS.config.mensajeGeneral);
    }
    campo.value = estado.q;
    borrarQ.hidden = !estado.q;
    orden.value = estado.orden;
    pintarChips();
    pintarAplicados();
    if (!opciones || !opciones.sinURL) escribirURL();
  }

  function alternar(g, v) {
    if (g === 'col' || g === 'pre') estado[g] = estado[g] === v ? '' : v;
    else {
      var i = estado[g].indexOf(v);
      if (i >= 0) estado[g].splice(i, 1); else estado[g].push(v);
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    var chip = t.closest('button.chip[data-grupo]');
    if (chip && chip.closest('.explorador')) {
      var g = chip.getAttribute('data-grupo'), v = chip.getAttribute('data-valor');
      if (g === 'col') estado.col = v === estado.col ? '' : v;
      else if (g === 'pre') estado.pre = v === estado.pre ? '' : v;
      else alternar(g, v);
      aplicar();
      return;
    }
    var quitar = t.closest('[data-quitar]');
    if (quitar) {
      var gq = quitar.getAttribute('data-quitar'), vq = quitar.getAttribute('data-valor');
      if (gq === 'q') estado.q = '';
      else if (gq === 'col' || gq === 'pre') estado[gq] = '';
      else estado[gq] = estado[gq].filter(function (x) { return x !== vq; });
      aplicar();
      contador.focus();
      return;
    }
    var enlace = t.closest('a[data-filtro]');
    if (enlace) {
      e.preventDefault();
      estado = { q: '', col: enlace.getAttribute('data-valor'), oca: [], aro: [], pre: '', orden: estado.orden };
      aplicar();
      var sec = $('explorador');
      sec.scrollIntoView({ behavior: NS.reducirMovimiento() ? 'auto' : 'smooth', block: 'start' });
      sec.focus({ preventScroll: true });
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    estado.q = campo.value.trim();
    aplicar();
    campo.blur();
  });
  var buscaTimer;
  campo.addEventListener('input', function () {
    estado.q = campo.value.trim().slice(0, 80);
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(function () { aplicar(); }, 180);
  });
  borrarQ.addEventListener('click', function () { estado.q = ''; aplicar(); contador.focus(); });
  orden.addEventListener('change', function () { estado.orden = orden.value; aplicar(); });
  limpiar.addEventListener('click', function () {
    estado = { q: '', col: '', oca: [], aro: [], pre: '', orden: estado.orden };
    aplicar();
    contador.focus();
  });
  btnFiltros.addEventListener('click', function () {
    var abierto = panel.hidden;
    panel.hidden = !abierto;
    btnFiltros.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  });
  if (verResultados) verResultados.addEventListener('click', function () {
    panel.hidden = true;
    btnFiltros.setAttribute('aria-expanded', 'false');
    (grilla.hidden ? vacio : grilla).scrollIntoView({ behavior: NS.reducirMovimiento() ? 'auto' : 'smooth', block: 'start' });
  });
  window.addEventListener('popstate', function () { leerURL(); aplicar({ sinURL: true }); });

  leerURL();
  if (estado.oca.length || estado.aro.length || estado.pre) {
    panel.hidden = false;
    btnFiltros.setAttribute('aria-expanded', 'true');
  }
  aplicar({ sinURL: true });
})();
