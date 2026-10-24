/*
 * Home screen for LG webOS (Developer Mode, no root): a pinned dock row, an app grid, one glass
 * highlight that springs between tiles, plus weather, next match, news and optional PC widgets.
 *
 * Based on webos-vibehack by OmkarK97 (MIT), itself a port of tv-vibehack by Gathin.
 * Written to run on webOS 5 (Chrome 68): no ?. / ??, no flex gap, no inset, no aspect-ratio.
 *
 * webOS does not let third-party apps list installed apps, so sync-apps.py writes them into apps.js.
 */
(function () {
  'use strict';

  var COLUMNS = Math.max(1, CONFIG.columns || 4);
  var TILE_W = 210, TILE_H = 118;
  var CELL_W = (1920 - 2 * 112) / COLUMNS;
  var ROW_PITCH = 178;
  var DOCK_TOP = 530;           // tile top of the dock row: below the info cards
  var DOCK_GAP = 30;            // extra space below the dock
  var FOCUS_SCALE = 1.1;
  var GLASS_PAD = 12;           // room for the glass glow around the scaled tile
  var VIEW_TOP = 80, VIEW_BOTTOM = 1060;    // area grid rows scroll into

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27 };

  var GREETINGS = [[5, 'Boa noite'], [12, 'Bom dia'], [18, 'Boa tarde'], [24, 'Boa noite']];
  var DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
    'outubro', 'novembro', 'dezembro'];

  var ICON_INPUT = 'M18,7V4c0,-1.1 -0.9,-2 -2,-2H8C6.9,2 6,2.9 6,4v3H5v6l3,6v3h8v-3l3,-6V7H18zM8,4h8v3h-2V5h-1v2h-2V5h-1v2H8V4z';
  var ICON_LIVETV = 'M21,6h-7.59l3.29,-3.29L16,2l-4,4l-4,-4l-0.71,0.71L10.59,6H3c-1.1,0 -2,0.89 -2,2v12c0,1.1 0.9,2 2,2h18c1.1,0 2,-0.89 2,-2V8C23,6.89 22.1,6 21,6zM21,20H3V8h18V20zM9,10v8l7,-4L9,10z';

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), tilesEl = $('tiles'), glass = $('glass'), hero = $('hero');
  var ambients = [$('ambientA'), $('ambientB')], ambientFront = 0, ambientColor = null;
  var pills = [$('btnInputs'), $('btnWifi'), $('btnSettings')];
  var panel = $('inputsPanel');

  var items = [];               // {app, el, color}
  var zone = 'grid';            // 'grid' | 'top' | 'inputs'
  var focused = 0, pillFocus = 0, inputFocus = 0, inputRows = [];
  var offset = 0, heroShown = false, glassShown = false;
  var editing = null;           // {item, snapshot} while a tile is being moved

  // ---- luna bus ------------------------------------------------------------------------------

  var bridges = [];   // keep a reference: a collected bridge drops its callback

  function luna(uri, params, cb) {
    try {
      var b = new PalmServiceBridge();
      b.onservicecallback = function (msg) {
        var res;
        try { res = JSON.parse(msg); } catch (e) { res = { returnValue: false }; }
        if (cb) cb(res);
        if (!params || !params.subscribe) bridges.splice(bridges.indexOf(b), 1);
      };
      bridges.push(b);
      b.call(uri, JSON.stringify(params || {}));
    } catch (e) {
      if (cb) cb({ returnValue: false, errorText: String(e) });   // not on a TV (desktop preview)
    }
  }

  function launch(id, title, params) {
    luna('luna://com.webos.applicationManager/launch', { id: id, params: params || {} }, function (res) {
      if (res.returnValue === false) toast('Não foi possível abrir ' + (title || id));
    });
  }

  var toastTimer;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('shown'); }, 2200);
  }

  function getText(url, ok, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 15000;
    xhr.onload = function () { if (xhr.status >= 200 && xhr.status < 300) ok(xhr.responseText); else fail(); };
    xhr.onerror = xhr.ontimeout = fail;
    xhr.send();
  }

  // ---- apps ----------------------------------------------------------------------------------

  function orderedApps() {
    var all = (window.TV_APPS && TV_APPS.apps) || [];
    var byId = {};
    all.forEach(function (a) { byId[a.id] = a; });
    var hidden = {};
    (CONFIG.hiddenApps || []).forEach(function (id) { hidden[id] = true; });
    var byTitle = function (a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1; };

    // An order arranged on the TV wins, until dockApps in config.js changes.
    var saved = loadOrder();
    if (saved) {
      var placed = [];
      saved.forEach(function (id) {
        if (byId[id] && !hidden[id]) { placed.push(byId[id]); hidden[id] = true; }
      });
      return placed.concat(all.filter(function (a) { return !hidden[a.id]; }).sort(byTitle));
    }

    var dock = [];
    (CONFIG.dockApps || []).forEach(function (id) {
      if (byId[id] && !hidden[id] && dock.length < COLUMNS) { dock.push(byId[id]); hidden[id] = true; }
    });
    var rest = all.filter(function (a) { return !hidden[a.id]; });
    rest.sort(byTitle);
    return dock.concat(rest);
  }

  var ORDER_KEY = 'tvhome.order';

  function loadOrder() {
    try {
      var s = JSON.parse(localStorage.getItem(ORDER_KEY));
      return s && s.dock === (CONFIG.dockApps || []).join(',') ? s.ids : null;
    } catch (e) {
      return null;
    }
  }

  function saveOrder() {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify({
        dock: (CONFIG.dockApps || []).join(','),
        ids: items.map(function (it) { return it.app.id; })
      }));
    } catch (e) { /* storage unavailable: the order lasts until the app restarts */ }
  }

  function rowOf(i) { return Math.floor(i / COLUMNS); }
  function tileLeft(i) { return 112 + (i % COLUMNS) * CELL_W + (CELL_W - TILE_W) / 2; }
  function tileTop(i) { var r = rowOf(i); return DOCK_TOP + r * ROW_PITCH + (r > 0 ? DOCK_GAP : 0); }

  function build() {
    tilesEl.innerHTML = '';
    items = orderedApps().map(function (app) {
      var el = document.createElement('div');
      el.className = 'item';
      var card = document.createElement('div');
      card.className = 'card';
      var img = document.createElement('img');
      var item = { app: app, el: el, card: card, color: null };
      img.onload = function () { paintTile(item, img); };
      img.src = app.icon;
      card.appendChild(img);
      el.appendChild(card);
      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = app.title;
      el.appendChild(name);
      el.addEventListener('mouseover', function () {
        if (zone !== 'inputs' && !editing) focusTile(items.indexOf(item));
      });
      el.addEventListener('click', function () {
        if (editing) finishEdit(true);
        else launch(app.id, app.title);
      });
      tilesEl.appendChild(el);
      return item;
    });
    layout();
  }

  /** Places every tile by its position in items; tiles glide when the order changes. */
  function layout() {
    items.forEach(function (it, i) {
      it.el.style.left = tileLeft(i) + 'px';
      it.el.style.top = tileTop(i) + 'px';
      it.el.classList.toggle('dock', rowOf(i) === 0);
    });

    var band = $('dockBand');
    var n = Math.min(COLUMNS, items.length);
    band.style.display = n ? 'block' : 'none';
    band.style.left = (tileLeft(0) - 28) + 'px';
    band.style.top = (DOCK_TOP - 28) + 'px';
    band.style.width = ((n - 1) * CELL_W + TILE_W + 56) + 'px';
    band.style.height = (TILE_H + 56) + 'px';
  }

  function animateIn() {
    items.forEach(function (it, i) {
      it.el.classList.remove('shown');
      setTimeout(function () { it.el.classList.add('shown'); }, 60 + Math.min(i, 16) * 40);
    });
  }

  /**
   * Store icons are square logos on a solid colour: fill the wide tile with that colour so the logo
   * reads as a banner. LG's system icons are glyphs on transparent: use the app's own colour.
   */
  function paintTile(item, img) {
    var px = null, edge = null;
    try {
      var c = document.createElement('canvas');
      c.width = 12; c.height = 12;
      var g = c.getContext('2d');
      g.drawImage(img, 0, 0, 12, 12);
      px = g.getImageData(0, 0, 12, 12).data;
      edge = edgeColor(img);
    } catch (e) { /* tainted canvas: fall back to the app's colour */ }

    var glyphColor = null;
    if (edge && edge[3] > 200) {
      item.card.style.background = 'rgb(' + edge[0] + ',' + edge[1] + ',' + edge[2] + ')';
    } else {
      item.card.classList.add('glyph');
      item.card.style.background = glyphBackground(item.app.iconColor);
      glyphColor = glyphBackground(item.app.iconColor) === '#2c2c2e' ? null : parseColor(item.app.iconColor);
    }
    item.color = glyphColor || (px ? vividColor(px) : parseColor(item.app.iconColor));
    if (items[focused] === item) setAmbient(item.color);
  }

  function edgeColor(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    var corner = g.getImageData(2, 2, 1, 1).data;
    return corner[3] > 200 ? corner : g.getImageData(2, Math.floor(h / 2), 1, 1).data;
  }

  function glyphBackground(hex) {
    var c = parseColor(hex);
    if (!c) return '#2c2c2e';
    var hsv = rgbToHsv(c);
    if (hsv[1] < 0.15 && (hsv[2] > 0.85 || hsv[2] < 0.1)) return '#2c2c2e';
    return 'rgb(' + c.join(',') + ')';
  }

  function vividColor(px) {
    var best = null, bestScore = -1, sum = [0, 0, 0], n = 0;
    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      var p = [px[i], px[i + 1], px[i + 2]];
      sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++;
      var hsv = rgbToHsv(p);
      var score = hsv[1] * Math.min(1, hsv[2] * 1.4);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!n) return [68, 68, 68];
    if (bestScore < 0.25) {
      var avg = rgbToHsv([sum[0] / n, sum[1] / n, sum[2] / n]);
      avg[2] = Math.max(avg[2], 0.55);
      return hsvToRgb(avg);
    }
    var h = rgbToHsv(best);
    h[1] = Math.min(1, h[1] * 1.1);
    h[2] = Math.max(0.5, h[2]);
    return hsvToRgb(h);
  }

  function parseColor(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var v = parseInt(m[1], 16);
    return [v >> 16 & 255, v >> 8 & 255, v & 255];
  }

  function rgbToHsv(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max ? d / max : 0, max];
  }

  function hsvToRgb(hsv) {
    var h = hsv[0], s = hsv[1], v = hsv[2];
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgb.map(function (k) { return Math.round((k + m) * 255); });
  }

  // ---- focus & glass -------------------------------------------------------------------------

  function focusTile(i) {
    if (!items.length) return;
    i = Math.max(0, Math.min(i, items.length - 1));
    setZone('grid');
    if (items[focused]) items[focused].el.classList.remove('focused');
    focused = i;
    items[i].el.classList.add('focused');

    var top = tileTop(i), row = rowOf(i);
    if (row === 0) {
      offset = 0;
    } else {
      if (top - offset + TILE_H + 70 > VIEW_BOTTOM) offset = top + TILE_H + 70 - VIEW_BOTTOM;
      if (top - offset - 24 < VIEW_TOP) offset = top - 24 - VIEW_TOP;
    }
    stage.style.transform = 'translateY(' + (-offset) + 'px)';
    // Hide the header and the info cards together once the grid would run into them.
    var info = $('infoRow');
    var headerBottom = info.offsetTop + info.offsetHeight;
    document.body.classList.toggle('scrolled', DOCK_TOP - 28 - offset < headerBottom + 24);

    var w = TILE_W * FOCUS_SCALE + 2 * GLASS_PAD, h = TILE_H * FOCUS_SCALE + 2 * GLASS_PAD;
    var x = tileLeft(i) + TILE_W / 2 - w / 2, y = top + TILE_H / 2 - h / 2;
    glass.style.width = w + 'px';
    glass.style.height = h + 'px';
    glass.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    if (!glassShown) {
      glass.style.transition = 'none';
      glass.offsetWidth;
      glass.style.transition = '';
      glass.style.opacity = '1';
      glassShown = true;
    }

    if (row === 0) showHero(items[i]);
    else hideHero();
    setAmbient(items[i].color);
  }

  function hideGlass() {
    glassShown = false;
    glass.style.opacity = '0';
  }

  function showHero(item) {
    var label = item.app.title;
    hero.style.top = (DOCK_TOP - 28 - 40 - 64) + 'px';
    if (!heroShown) {
      hero.textContent = label;
      hero.style.transform = 'none';
      hero.style.opacity = '1';
      heroShown = true;
    } else if (hero.textContent !== label) {
      hero.style.opacity = '0';
      hero.style.transform = 'translateX(-24px)';
      clearTimeout(hero.swap);
      hero.swap = setTimeout(function () {
        hero.textContent = label;
        hero.style.transition = 'none';
        hero.style.transform = 'translateX(24px)';
        hero.offsetWidth;
        hero.style.transition = '';
        hero.style.transform = 'none';
        hero.style.opacity = '1';
      }, 120);
    }
    setAmbient(item.color);
  }

  function hideHero() {
    if (!heroShown) return;
    heroShown = false;
    hero.style.opacity = '0';
  }

  function setAmbient(color) {
    if (!color) return;
    var key = color.join(',');
    if (key === ambientColor) return;
    ambientColor = key;
    var back = ambients[1 - ambientFront];
    back.style.background = 'radial-gradient(circle 1190px at 32% 42%, rgba(' + key + ',0.36) 0%, rgba(' +
      key + ',0.15) 50%, rgba(' + key + ',0) 100%)';
    back.style.opacity = '1';
    ambients[ambientFront].style.opacity = '0';
    ambientFront = 1 - ambientFront;
  }

  function focusPill(i) {
    setZone('top');
    document.body.classList.remove('scrolled');
    pills[pillFocus].classList.remove('focused');
    pillFocus = Math.max(0, Math.min(i, pills.length - 1));
    pills[pillFocus].classList.add('focused');
  }

  function setZone(z) {
    if (zone === z) return;
    if (zone === 'top') pills[pillFocus].classList.remove('focused');
    if (zone === 'grid') {
      if (items[focused]) items[focused].el.classList.remove('focused');
      hideGlass();
    }
    zone = z;
  }

  function pillAbove(i) {
    var cx = tileLeft(i) + TILE_W / 2, best = 0, bestD = Infinity;
    pills.forEach(function (p, k) {
      var r = p.getBoundingClientRect();
      var d = Math.abs(r.left + r.width / 2 - cx);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  }

  // ---- top bar -------------------------------------------------------------------------------

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function updateClock() {
    var now = new Date(), h = now.getHours();
    for (var k = 0; k < GREETINGS.length; k++) {
      if (h < GREETINGS[k][0]) { $('greeting').textContent = GREETINGS[k][1]; break; }
    }
    $('clock').textContent = two(h) + ':' + two(now.getMinutes());
    $('ampm').textContent = '';
    $('date').textContent = DAYS[now.getDay()] + ', ' + now.getDate() + ' de ' + MONTHS[now.getMonth()];
  }

  // ---- weather (Open-Meteo, no API key) ------------------------------------------------------

  var WEATHER = CONFIG.weather || { city: 'São Paulo', lat: -23.55, lon: -46.63, timezone: 'America/Sao_Paulo' };

  // Inline SVG glyphs: webOS 5 has no colour-emoji font, emojis render as boxes.
  var WX_SUN = '<circle cx="12" cy="12" r="4.5" fill="#FFD54F"/><g stroke="#FFD54F" stroke-width="2" stroke-linecap="round"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g>';
  var WX_MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#E0E0E0"/>';
  var WX_CLOUD = '<path d="M7 19h10a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6 11a4 4 0 0 0 1 8z" fill="#ECEFF1"/>';
  var WX_PART = '<circle cx="8" cy="8" r="3.5" fill="#FFD54F"/><path d="M9 20h9a4 4 0 0 0 .3-8A5.5 5.5 0 0 0 8 13a3.5 3.5 0 0 0 1 7z" fill="#ECEFF1"/>';
  var WX_RAIN = '<path d="M7 15h10a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6 7a4 4 0 0 0 1 8z" fill="#CFD8DC"/><g stroke="#64B5F6" stroke-width="2" stroke-linecap="round"><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></g>';
  var WX_STORM = '<path d="M7 14h10a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6 6a4 4 0 0 0 1 8z" fill="#B0BEC5"/><path d="M13 14l-3 5h3l-2 4 5-6h-3l2-3z" fill="#FFD54F"/>';

  function weatherInfo(code, isDay) {
    if (code === 0) return [isDay ? WX_SUN : WX_MOON, 'Céu limpo'];
    if (code <= 2) return [isDay ? WX_PART : WX_CLOUD, 'Poucas nuvens'];
    if (code === 3) return [WX_CLOUD, 'Nublado'];
    if (code === 45 || code === 48) return [WX_CLOUD, 'Neblina'];
    if (code >= 51 && code <= 57) return [WX_RAIN, 'Garoa'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return [WX_RAIN, 'Chuva'];
    if (code >= 95) return [WX_STORM, 'Tempestade'];
    return [WX_CLOUD, ''];
  }

  function updateWeather() {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WEATHER.lat + '&longitude=' + WEATHER.lon +
      '&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=' + encodeURIComponent(WEATHER.timezone || 'America/Sao_Paulo') + '&forecast_days=6';
    getText(url, function (txt) {
      try {
        var d = JSON.parse(txt), c = d.current;
        var info = weatherInfo(c.weather_code, c.is_day === 1);
        $('wxIcon').innerHTML = '<svg viewBox="0 0 24 24">' + info[0] + '</svg>';
        $('wxTemp').textContent = Math.round(c.temperature_2m) + '°';
        $('wxDesc').textContent = info[1];
        $('wxRange').textContent = 'Máx ' + Math.round(d.daily.temperature_2m_max[0]) + '°   ·   Mín ' +
          Math.round(d.daily.temperature_2m_min[0]) + '°';
        // Next 5 days (index 1..5).
        var days = $('wxDays'), SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        days.innerHTML = '';
        for (var i = 1; i < d.daily.time.length && i <= 5; i++) {
          var p = d.daily.time[i].split('-');
          var dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
          var el = document.createElement('div'); el.className = 'wxDay';
          el.innerHTML = '<b>' + SHORT[dow] + '</b><svg viewBox="0 0 24 24">' + weatherInfo(d.daily.weather_code[i], true)[0] +
            '</svg><span>' + Math.round(d.daily.temperature_2m_max[i]) + '°</span><span class="min">' +
            Math.round(d.daily.temperature_2m_min[i]) + '°</span>';
          days.appendChild(el);
        }
      } catch (e) { /* keep the last reading */ }
    }, function () {});
  }

  // ---- next match (ESPN public API, no key) --------------------------------------------------

  var TEAM_ID = CONFIG.team && CONFIG.team.id;
  var LEAGUES = { 'Brazilian Serie A': 'Brasileirão', 'Brazilian Serie B': 'Série B', 'CONMEBOL Libertadores': 'Libertadores',
    'CONMEBOL Sudamericana': 'Sul-Americana', 'Copa do Brasil': 'Copa do Brasil', 'Campeonato Paulista': 'Paulistão',
    'FIFA Club World Cup': 'Mundial de Clubes' };
  var nextGame = null, gameTimer = null;

  function pickGame(events) {
    var now = Date.now();
    for (var i = 0; i < events.length; i++) {
      var e = events[i], st = e.competitions[0].status.type;
      var t = new Date(e.date).getTime();
      if (st.state === 'in') return e;                                   // live
      if (st.state === 'post' && now - t < 4 * 3600 * 1000) return e;    // keep a fresh result for a while
      if (st.state === 'pre') return e;                                  // next one
    }
    return null;
  }

  function updateGame() {
    if (!TEAM_ID) return;
    getText('https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/' + TEAM_ID + '/schedule?fixture=true',
      function (txt) {
        try {
          nextGame = pickGame(JSON.parse(txt).events || []);
          renderGame();
        } catch (e) { /* keep the last one */ }
        scheduleGame();
      }, scheduleGame);
  }

  function scheduleGame() {
    clearTimeout(gameTimer);
    var live = nextGame && nextGame.competitions[0].status.type.state === 'in';
    gameTimer = setTimeout(updateGame, (live ? 60 : 15 * 60) * 1000);
  }

  function renderGame() {
    var g = nextGame;
    if (!g) { $('gWhen').textContent = 'Sem jogos marcados'; return; }
    var c = g.competitions[0], st = c.status.type;
    var home = c.competitors.filter(function (x) { return x.homeAway === 'home'; })[0];
    var away = c.competitors.filter(function (x) { return x.homeAway === 'away'; })[0];
    function fill(side, team) {
      $('g' + side).textContent = team.team.shortDisplayName || team.team.displayName;
      var logo = team.team.logos && team.team.logos[0] ? team.team.logos[0].href : '';
      // ESPN's image combiner returns a small version of the 500px logo.
      $('g' + side + 'Logo').src = logo ? 'https://a.espncdn.com/combiner/i?img=' +
        logo.replace('https://a.espncdn.com', '') + '&h=128&w=128' : '';
    }
    fill('Home', home); fill('Away', away);
    var league = LEAGUES[g.league && g.league.name] || (g.league && g.league.name) || '';
    var leg = c.leg ? ' · ' + (c.leg.value === 1 ? 'Ida' : 'Volta') : '';
    $('gameTag').textContent = (st.state === 'in' ? 'Ao vivo' : st.state === 'post' ? 'Resultado' : 'Próximo jogo') +
      (league ? ' · ' + league : '') + leg;
    var mid = $('gMid');
    if (st.state === 'pre') {
      mid.className = ''; mid.textContent = 'x';
    } else {
      mid.className = 'score';
      mid.textContent = (home.score && (home.score.displayValue || home.score)) + ' x ' +
        (away.score && (away.score.displayValue || away.score));
    }
    $('gVenue').textContent = c.venue ? c.venue.fullName : '';
    renderGameClock();
  }

  // Date line and countdown; re-run every clock tick.
  function renderGameClock() {
    var g = nextGame;
    if (!g) return;
    var c = g.competitions[0], st = c.status.type, cnt = $('gCount');
    var t = new Date(g.date), now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var day = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    var diffDays = Math.round((day - today) / 86400000);
    var dayTxt = diffDays === 0 ? 'Hoje' : diffDays === 1 ? 'Amanhã' :
      DAYS[t.getDay()] + ', ' + two(t.getDate()) + '/' + two(t.getMonth() + 1);
    var timeTxt = (g.timeValid === false || c.timeValid === false) ? 'horário a definir' : two(t.getHours()) + ':' + two(t.getMinutes());
    $('gWhen').textContent = dayTxt + ' · ' + timeTxt;
    if (st.state === 'in') {
      cnt.className = 'live'; cnt.textContent = '● AO VIVO ' + (c.status.displayClock || '');
    } else if (st.state === 'post') {
      cnt.className = ''; cnt.textContent = 'Encerrado';
    } else {
      cnt.className = '';
      var ms = t.getTime() - now.getTime();
      if (ms <= 0) { cnt.textContent = 'Começando'; return; }
      var m = Math.floor(ms / 60000), dd = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
      cnt.textContent = 'Faltam ' + (dd ? dd + 'd ' : '') + (dd || hh ? hh + 'h ' : '') + mm + 'min';
    }
  }

  // ---- optional PC service: status chips + landscape photo of the day ------------------------

  var PC = CONFIG.pcServices || '';

  function updateStatus() {
    if (!PC) return;
    getText(PC + '/status.json', function (txt) {
      try {
        var s = JSON.parse(txt), row = $('statusRow');
        row.innerHTML = '';
        (s.items || []).forEach(function (it) {
          var chip = document.createElement('div');
          chip.className = 'chip' + (it.ok ? '' : ' down');
          chip.innerHTML = '<i></i>';
          chip.appendChild(document.createTextNode(it.name + (it.detail ? ' ' + it.detail : '')));
          row.appendChild(chip);
        });
      } catch (e) { /* ignore */ }
    }, function () {
      $('statusRow').innerHTML = '<div class="chip down"><i></i>PC fora do ar</div>';
    });
  }

  var bgUrl = '';
  function updateBackground() {
    if (!PC) return;
    getText(PC + '/bg.json', function (txt) {
      try {
        var b = JSON.parse(txt);
        if (!b.url || b.url === bgUrl) return;
        var img = new Image();
        img.onload = function () {
          bgUrl = b.url;
          $('bgPhoto').style.backgroundImage = 'url("' + b.url + '")';
          document.body.classList.add('photo');
        };
        img.src = b.url;
      } catch (e) { /* keep the gradient */ }
    }, function () {});
  }

  // ---- news (Google News RSS, pt-BR) ---------------------------------------------------------

  var NEWS_FEEDS = (CONFIG.news || []).slice(0, 2).map(function (n, i) {
    return { el: 'news' + i, title: n.title, q: n.query };
  });
  var newsData = {}, newsPage = 0, NEWS_PER_PAGE = 2;

  function rssUrl(q) {
    return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=pt-BR&gl=BR&ceid=BR:pt-419';
  }

  function splitTitle(t) {
    var i = t.lastIndexOf(' - ');
    return i > 0 ? { title: t.slice(0, i), src: t.slice(i + 3) } : { title: t, src: '' };
  }

  // Direct RSS first; if the TV blocks it (CORS), fall back to the rss2json proxy.
  function loadFeed(feed) {
    var url = rssUrl(feed.q);
    getText(url, function (xml) {
      try {
        var doc = new DOMParser().parseFromString(xml, 'text/xml');
        var list = [].slice.call(doc.getElementsByTagName('item'), 0, 8).map(function (it) {
          return splitTitle(it.getElementsByTagName('title')[0].textContent);
        });
        if (!list.length) throw new Error('empty');
        newsData[feed.el] = list; renderNews();
      } catch (e) { loadFeedProxy(feed, url); }
    }, function () { loadFeedProxy(feed, url); });
  }

  function loadFeedProxy(feed, url) {
    getText('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url), function (txt) {
      try {
        var list = (JSON.parse(txt).items || []).slice(0, 8).map(function (it) { return splitTitle(it.title || ''); });
        if (list.length) { newsData[feed.el] = list; renderNews(); }
      } catch (e) { /* keep the last headlines */ }
    }, function () {});
  }

  function renderNews() {
    NEWS_FEEDS.forEach(function (f) {
      var list = newsData[f.el];
      if (!list || !list.length) return;
      var pages = Math.ceil(list.length / NEWS_PER_PAGE);
      var start = (newsPage % pages) * NEWS_PER_PAGE;
      var box = $(f.el).getElementsByClassName('newsList')[0];
      box.innerHTML = '';
      list.slice(start, start + NEWS_PER_PAGE).forEach(function (n) {
        var item = document.createElement('div'); item.className = 'newsItem';
        var t = document.createElement('div'); t.className = 'newsTitle'; t.textContent = n.title;
        var s = document.createElement('div'); s.className = 'newsSrc'; s.textContent = n.src;
        item.appendChild(t); item.appendChild(s); box.appendChild(item);
      });
    });
  }

  function rotateNews() {
    var boxes = document.getElementsByClassName('newsList');
    [].forEach.call(boxes, function (b) { b.classList.add('fade'); });
    setTimeout(function () {
      newsPage++;
      renderNews();
      [].forEach.call(boxes, function (b) { b.classList.remove('fade'); });
    }, 500);
  }

  function updateNews() { NEWS_FEEDS.forEach(loadFeed); }

  function setupCards() {
    $('wxCity').textContent = WEATHER.city;
    if (!TEAM_ID) $('game').style.display = 'none';
    for (var i = 0; i < 2; i++) {
      var f = NEWS_FEEDS[i];
      if (f) $('news' + i).getElementsByClassName('newsTag')[0].textContent = f.title;
      else $('news' + i).style.display = 'none';
    }
  }

  // ---- network pill --------------------------------------------------------------------------

  function watchNetwork() {
    luna('luna://com.palm.connectionmanager/getStatus', { subscribe: true }, function (res) {
      if (res.returnValue === false && !res.wifi && !res.wired) return;
      var text = 'Wi-Fi';
      if (res.wired && res.wired.state === 'connected') text = 'Ethernet';
      else if (res.wifi && res.wifi.state === 'connected') text = res.wifi.ssid || 'Wi-Fi';
      else if (res.isInternetConnectionAvailable === false) text = 'Sem internet';
      $('wifiLabel').textContent = text;
    });
  }

  function activatePill(i) {
    if (i === 0) showInputs();
    else if (i === 1) launch('com.palm.app.settings', 'Configurações', { target: 'network' });
    else launch('com.palm.app.settings', 'Configurações');
  }

  // ---- inputs dropdown -----------------------------------------------------------------------

  function showInputs() {
    panel.innerHTML = '';
    inputRows = [];
    var inputs = (window.TV_APPS && TV_APPS.inputs) || [];
    inputs.forEach(function (inp) { addInputRow(ICON_INPUT, inp.label, inp.appId); });
    if (CONFIG.liveTvApp) {
      if (inputRows.length) {
        var sep = document.createElement('div'); sep.className = 'separator'; panel.appendChild(sep);
      }
      addInputRow(ICON_LIVETV, 'TV ao vivo', CONFIG.liveTvApp);
    }
    if (!inputRows.length) { toast('Nenhuma entrada encontrada'); return; }

    var r = pills[0].getBoundingClientRect();
    panel.style.left = r.left + 'px';
    panel.style.top = (r.bottom + 20) + 'px';
    panel.style.minWidth = Math.max(r.width, 300) + 'px';
    panel.classList.remove('hidden');
    pills[pillFocus].classList.remove('focused');
    zone = 'inputs';
    focusInput(0);
  }

  function addInputRow(icon, label, appId) {
    var row = document.createElement('div');
    row.className = 'inputRow';
    row.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + icon + '"/></svg>';
    row.appendChild(document.createTextNode(label));
    var idx = inputRows.length;
    row.addEventListener('mouseover', function () { focusInput(idx); });
    row.addEventListener('click', function () { hideInputs(); launch(appId, label); });
    row.appId = appId;
    row.label = label;
    inputRows.push(row);
    panel.appendChild(row);
  }

  function focusInput(i) {
    if (inputRows[inputFocus]) inputRows[inputFocus].classList.remove('focused');
    inputFocus = Math.max(0, Math.min(i, inputRows.length - 1));
    inputRows[inputFocus].classList.add('focused');
  }

  function hideInputs() {
    panel.classList.add('hidden');
    zone = 'none';
    focusPill(0);
  }

  // ---- rearranging ---------------------------------------------------------------------------

  /** Hold OK on a tile: it wiggles, the arrows move it, OK places it, Back puts everything back. */
  function startEdit() {
    var it = items[focused];
    if (!it) return;
    editing = { item: it, snapshot: items.slice() };
    it.el.classList.add('moving');
    document.body.classList.add('editing');
    toast('Setas para mover  ·  OK para soltar  ·  Voltar para cancelar');
  }

  function moveTo(to) {
    if (to < 0 || to >= items.length || to === focused) return;
    items.splice(to, 0, items.splice(focused, 1)[0]);
    focused = to;
    layout();
    focusTile(to);
  }

  function finishEdit(keep) {
    var it = editing.item;
    if (!keep) {
      items = editing.snapshot;
      layout();
    }
    editing = null;
    it.el.classList.remove('moving');
    document.body.classList.remove('editing');
    if (keep) saveOrder();
    focused = items.indexOf(it);
    focusTile(focused);
  }

  // ---- keys ----------------------------------------------------------------------------------

  var LONG_PRESS_MS = 600;
  var okDown = false, okTimer = null;

  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== KEY.OK) return;
    okDown = false;
    if (!okTimer) return;
    clearTimeout(okTimer);
    okTimer = null;
    var it = items[focused];
    if (zone === 'grid' && it && !editing) launch(it.app.id, it.app.title);
  });

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === KEY.OK && okDown) { e.preventDefault(); return; }
    if (k === KEY.OK) okDown = true;
    if (editing) {
      if (k === KEY.LEFT) moveTo(focused - 1);
      else if (k === KEY.RIGHT) moveTo(focused + 1);
      else if (k === KEY.UP) moveTo(focused - COLUMNS);
      else if (k === KEY.DOWN) moveTo(Math.min(focused + COLUMNS, items.length - 1));
      else if (k === KEY.OK) finishEdit(true);
      else if (k === KEY.BACK || k === KEY.ESC) finishEdit(false);
      else return;
    } else if (zone === 'inputs') {
      if (k === KEY.UP) focusInput(inputFocus - 1);
      else if (k === KEY.DOWN) focusInput(inputFocus + 1);
      else if (k === KEY.OK) { var row = inputRows[inputFocus]; hideInputs(); launch(row.appId, row.label); }
      else if (k === KEY.BACK || k === KEY.ESC || k === KEY.LEFT || k === KEY.RIGHT) hideInputs();
      else return;
    } else if (zone === 'top') {
      if (k === KEY.LEFT) focusPill(pillFocus - 1);
      else if (k === KEY.RIGHT) focusPill(pillFocus + 1);
      else if (k === KEY.DOWN) focusTile(rowOf(focused) === 0 ? focused : 0);
      else if (k === KEY.OK) activatePill(pillFocus);
      else if (k === KEY.BACK) { /* home screen: Back goes nowhere */ }
      else return;
    } else {
      var col = focused % COLUMNS, last = items.length - 1;
      if (k === KEY.LEFT) { if (col > 0) focusTile(focused - 1); }
      else if (k === KEY.RIGHT) { if (col < COLUMNS - 1 && focused < last) focusTile(focused + 1); }
      else if (k === KEY.UP) {
        if (rowOf(focused) === 0) focusPill(pillAbove(focused));
        else focusTile(focused - COLUMNS);
      } else if (k === KEY.DOWN) {
        if (rowOf(focused) < rowOf(last)) focusTile(Math.min(focused + COLUMNS, last));
      } else if (k === KEY.OK) {
        okTimer = setTimeout(function () { okTimer = null; startEdit(); }, LONG_PRESS_MS);
      } else if (k === KEY.BACK) { /* home screen: Back goes nowhere */ }
      else return;
    }
    e.preventDefault();
  });

  pills.forEach(function (p, i) {
    p.addEventListener('mouseover', function () { if (zone !== 'inputs') focusPill(i); });
    p.addEventListener('click', function () { activatePill(i); });
  });

  // ---- lifecycle -----------------------------------------------------------------------------

  function resume() {
    if (editing) finishEdit(false);
    updateClock();
    if (zone === 'inputs') panel.classList.add('hidden');
    pills.forEach(function (p) { p.classList.remove('focused'); });
    zone = 'none';
    animateIn();
    focusTile(focused);
  }

  document.addEventListener('webOSRelaunch', resume);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) resume(); });

  setupCards();
  build();
  updateClock();
  setInterval(function () { updateClock(); renderGameClock(); }, 10000);
  updateWeather();
  setInterval(updateWeather, 15 * 60 * 1000);
  updateGame();
  updateNews();
  setInterval(updateNews, 20 * 60 * 1000);
  setInterval(rotateNews, 9000);
  updateStatus();
  setInterval(updateStatus, 60 * 1000);
  updateBackground();
  // Every 5 min while there is no photo yet (the PC may still be fetching it), then hourly.
  (function bgTick() {
    setTimeout(function () { updateBackground(); bgTick(); }, (bgUrl ? 60 : 5) * 60 * 1000);
  })();
  watchNetwork();
  animateIn();
  zone = 'none';
  focusTile(0);
})();
