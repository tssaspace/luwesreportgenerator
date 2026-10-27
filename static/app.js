(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- form fields (persisted, photos are not) ---------------- */
  var FIELDS = ['workTitle', 'wo', 'dateStart', 'dateEnd', 'timeStart', 'timeEnd', 'location', 'pic', 'lampiran',
                's1Name', 's1Org', 's2Name', 's2Org', 's3Name', 's3Org', 'filename'];
  var DEFAULTS = { s1Name: 'Joseph Elroy', s1Org: 'PT. Luwes Inovasi Mandiri' };
  var KEY = 'pmgen.v1';

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      var o = {};
      FIELDS.forEach(function (f) { o[f] = $('#' + f).value; });
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* storage may be blocked: the app still works */ }
  }
  function fields() {
    var o = {};
    FIELDS.forEach(function (f) { o[f] = $('#' + f).value.trim(); });
    return o;
  }

  /* ---------------- photo lists ---------------- */
  var state = { docs: [], checks: [] };
  var seq = 0;
  var CFG = {
    docs:   { table: '#docTable', count: '#docCount', cls: 'doc', label: 'Dokumentasi' },
    checks: { table: '#chkTable', count: '#chkCount', cls: 'chk', label: 'Ceklis' }
  };

  function tbody(kind) { return $('tbody', $(CFG[kind].table)); }
  function find(kind, id) { return state[kind].filter(function (x) { return x.id === id; })[0]; }
  function circled(n) { return PMDoc.circled(n); }

  function addItem(kind, focus) {
    var it = { id: ++seq, caption: '', bytes: null, w: 0, h: 0, url: '', name: '' };
    state[kind].push(it);
    render(kind);
    if (focus) {
      var row = $('tr[data-id="' + it.id + '"]', tbody(kind));
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return it;
  }

  function removeItem(kind, id) {
    var it = find(kind, id);
    if (it && it.url) URL.revokeObjectURL(it.url);
    state[kind] = state[kind].filter(function (x) { return x.id !== id; });
    render(kind);
  }

  function render(kind) {
    var tb = tbody(kind), c = CFG[kind];
    tb.innerHTML = '';
    if (!state[kind].length) {
      var e = document.createElement('tr');
      e.className = 'empty';
      e.innerHTML = '<td colspan="5">Belum ada foto. Tekan <strong>+ Tambah Baris</strong> atau <strong>Upload banyak foto</strong>.</td>';
      tb.appendChild(e);
    }
    state[kind].forEach(function (it, i) { tb.appendChild(rowEl(kind, it, i + 1)); });
    $(c.count).textContent = state[kind].filter(function (x) { return x.bytes; }).length;
    summary();
  }

  function rowEl(kind, it, n) {
    var tr = document.createElement('tr');
    tr.dataset.id = it.id;
    tr.className = c(kind);
    function c(k) { return CFG[k].cls; }
    var third = kind === 'docs'
      ? '<input type="text" class="cap" placeholder="Contoh: Pemeriksaan Tiltmeter Sensor" aria-label="Caption foto ' + n + '" autocomplete="off">'
      : '<span class="fname"></span>';
    tr.innerHTML =
      '<td class="c-grip"><button type="button" class="grip" aria-label="Pindahkan baris ' + n + ' (seret, atau tombol panah atas/bawah)" title="Seret untuk mengurutkan">⠿</button></td>' +
      '<td class="c-no"></td>' +
      '<td class="c-photo"><div class="photocell"><button type="button" class="thumb" aria-label="Pilih foto untuk baris ' + n + '"></button>' +
      '<button type="button" class="filebtn">Upload</button></div></td>' +
      '<td>' + third + '</td>' +
      '<td class="c-act"><button type="button" class="iconbtn del" aria-label="Hapus baris ' + n + '" title="Hapus">✕</button></td>';
    tr.querySelector('.c-no').textContent = kind === 'docs' ? circled(n) : n;
    paintPhoto(tr, it);
    if (kind === 'docs') {
      var cap = tr.querySelector('.cap');
      cap.value = it.caption;
      cap.addEventListener('input', function () { it.caption = cap.value; });
    } else {
      tr.querySelector('.fname').textContent = it.name || '—';
    }
    var pick = function () { openPicker(kind, it.id); };
    tr.querySelector('.thumb').addEventListener('click', pick);
    tr.querySelector('.filebtn').addEventListener('click', pick);
    tr.querySelector('.del').addEventListener('click', function () { removeItem(kind, it.id); });
    var th = tr.querySelector('.thumb');
    th.addEventListener('dragover', function (e) { e.preventDefault(); });
    th.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setPhoto(kind, it.id, f);
    });
    wireDrag(kind, tr);
    return tr;
  }

  function paintPhoto(tr, it) {
    var th = tr.querySelector('.thumb'), fb = tr.querySelector('.filebtn');
    th.innerHTML = '';
    th.classList.toggle('has', !!it.url);
    if (it.url) {
      var im = document.createElement('img');
      im.src = it.url; im.alt = it.name || 'Foto';
      th.appendChild(im);
    } else th.textContent = 'Klik / drop';
    fb.textContent = it.url ? 'Ganti' : 'Upload';
    fb.classList.toggle('has', !it.url);
    tr.classList.remove('missing');
  }

  /* ---------------- images: decode, fix EXIF rotation, normalise to JPEG ---------------- */
  var MAXPX = 2200;
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('format tidak didukung')); };
      im.src = u;
    });
  }
  function toJpeg(file) {
    return decode(file).then(function (src) {
      var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
      var k = Math.min(1, MAXPX / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);   // PNG transparency -> white
      ctx.drawImage(src, 0, 0, cw, ch);
      if (src.close) src.close();
      return new Promise(function (res, rej) {
        cv.toBlob(function (b) {
          if (!b) return rej(new Error('gagal memproses gambar'));
          b.arrayBuffer().then(function (buf) { res({ bytes: new Uint8Array(buf), w: cw, h: ch }); });
        }, 'image/jpeg', 0.9);
      });
    });
  }

  function setPhoto(kind, id, file) {
    var it = find(kind, id);
    if (!it) return Promise.resolve();
    return toJpeg(file).then(function (r) {
      if (it.url) URL.revokeObjectURL(it.url);
      it.bytes = r.bytes; it.w = r.w; it.h = r.h; it.name = file.name;
      it.url = URL.createObjectURL(new Blob([r.bytes], { type: 'image/jpeg' }));
      var tr = $('tr[data-id="' + id + '"]', tbody(kind));
      if (tr) {
        paintPhoto(tr, it);
        var fn = tr.querySelector('.fname'); if (fn) fn.textContent = it.name;
      }
      $(CFG[kind].count).textContent = state[kind].filter(function (x) { return x.bytes; }).length;
      summary();
    }).catch(function (e) {
      showError(['Foto "' + file.name + '" tidak bisa dibaca (' + e.message + '). Coba format JPG atau PNG.']);
    });
  }

  var pending = null;
  var picker = $('#picker'), pickerMulti = $('#pickerMulti');
  function openPicker(kind, id) { pending = { kind: kind, id: id }; picker.value = ''; picker.click(); }
  picker.addEventListener('change', function () {
    if (picker.files[0] && pending) setPhoto(pending.kind, pending.id, picker.files[0]);
  });
  var multiKind = null;
  pickerMulti.addEventListener('change', function () {
    var files = Array.prototype.slice.call(pickerMulti.files)
      .sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
    var kind = multiKind;
    // reuse empty rows first, then append
    var empties = state[kind].filter(function (x) { return !x.bytes; });
    var jobs = files.map(function (f, i) {
      var it = empties[i] || (function () { var n = { id: ++seq, caption: '', bytes: null, w: 0, h: 0, url: '', name: '' }; state[kind].push(n); return n; })();
      return { id: it.id, file: f };
    });
    render(kind);
    jobs.reduce(function (p, j) { return p.then(function () { return setPhoto(kind, j.id, j.file); }); }, Promise.resolve());
  });

  $$('[data-add]').forEach(function (b) { b.addEventListener('click', function () { addItem(b.dataset.add, true); }); });
  $$('[data-multi]').forEach(function (b) {
    b.addEventListener('click', function () { multiKind = b.dataset.multi; pickerMulti.value = ''; pickerMulti.click(); });
  });

  /* ---------------- drag to reorder (pointer events: mouse + touch) ---------------- */
  function commitOrder(kind) {
    var ids = $$('tr[data-id]', tbody(kind)).map(function (r) { return +r.dataset.id; });
    state[kind] = ids.map(function (id) { return find(kind, id); });
    renumber(kind);
  }
  function renumber(kind) {
    $$('tr[data-id]', tbody(kind)).forEach(function (r, i) {
      r.querySelector('.c-no').textContent = kind === 'docs' ? circled(i + 1) : i + 1;
    });
  }
  function wireDrag(kind, tr) {
    var grip = tr.querySelector('.grip');
    grip.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      var tb = tr.parentNode, y = e.clientY, raf = 0;
      grip.setPointerCapture(e.pointerId);
      tr.classList.add('dragging');
      function place() {
        var sibs = $$('tr[data-id]', tb).filter(function (r) { return r !== tr; });
        var before = null;
        for (var i = 0; i < sibs.length; i++) {
          var b = sibs[i].getBoundingClientRect();
          if (y < b.top + b.height / 2) { before = sibs[i]; break; }
        }
        var cur = tr.nextElementSibling;
        if (before !== cur) { tb.insertBefore(tr, before); renumber(kind); }
      }
      function tick() {
        if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 70) window.scrollBy(0, 14);
        place();
        raf = requestAnimationFrame(tick);
      }
      function move(ev) { y = ev.clientY; place(); }
      var done = false;
      var ev = ['pointerup', 'pointercancel', 'mouseup', 'lostpointercapture'];
      function up() {
        if (done) return;
        done = true;
        place();
        cancelAnimationFrame(raf);
        grip.removeEventListener('pointermove', move);
        window.removeEventListener('pointermove', move);
        ev.forEach(function (n) { grip.removeEventListener(n, up); window.removeEventListener(n, up); });
        tr.classList.remove('dragging');
        commitOrder(kind);
        tr.classList.add('dropflash');
        setTimeout(function () { tr.classList.remove('dropflash'); }, 600);
      }
      grip.addEventListener('pointermove', move);
      window.addEventListener('pointermove', move);
      ev.forEach(function (n) { grip.addEventListener(n, up); window.addEventListener(n, up); });
      raf = requestAnimationFrame(tick);
    });
    // keyboard alternative
    grip.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      var tb = tr.parentNode;
      if (e.key === 'ArrowUp' && tr.previousElementSibling && tr.previousElementSibling.dataset.id) tb.insertBefore(tr, tr.previousElementSibling);
      else if (e.key === 'ArrowDown' && tr.nextElementSibling) tb.insertBefore(tr.nextElementSibling, tr);
      commitOrder(kind);
      grip.focus();
    });
  }

  /* ---------------- derived text ---------------- */
  function pageEstimate() {
    var n = state.docs.length, pairs = Math.ceil(n / 2);
    var docPages = !n ? 0 : (pairs <= 2 ? 1 : 1 + Math.ceil((pairs - 2) / 3));
    return 1 + docPages + state.checks.length;
  }
  function summary() {
    var d = state.docs.length, c = state.checks.length;
    $('#summary').innerHTML = 'Isi dokumen: <strong>1</strong> halaman ringkasan · <strong>' + d + '</strong> foto dokumentasi · <strong>' + c +
      '</strong> halaman ceklis. Perkiraan total <strong>' + pageEstimate() + ' halaman</strong>.';
  }
  function previews() {
    var f = fields();
    $('#datePreview').textContent = PMDoc.dateText(f) || '–';
    $('#timePreview').textContent = PMDoc.timeText(f) || '–';
    $('#filename').placeholder = autoName();
  }
  function safe(s) { return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim(); }
  function autoName() {
    var f = fields(), d = f.dateStart || '';
    var tag = f.wo || f.location || '';
    return safe('PM Report' + (tag ? ' - ' + tag : '') + (d ? ' - ' + d : ''));
  }

  /* ---------------- kind switch ---------------- */
  var dev = $('#devDialog');
  $$('#kind button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.kind === 'cm') { dev.showModal(); return; }
    });
  });
  $('#devClose').addEventListener('click', function () { dev.close(); });

  /* ---------------- generate ---------------- */
  function showError(list) {
    var r = $('#result');
    r.innerHTML = '<div class="msg err"><strong>Belum bisa dibuat:</strong><ul>' +
      list.map(function (m) { return '<li>' + m.replace(/</g, '&lt;') + '</li>'; }).join('') + '</ul></div>';
    r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function validate() {
    var f = fields(), errs = [];
    $$('input.bad').forEach(function (i) { i.classList.remove('bad'); });
    function bad(id, msg) { $('#' + id).classList.add('bad'); errs.push(msg); }
    if (!f.workTitle) bad('workTitle', 'Work Title wajib diisi.');
    if (!f.dateStart) bad('dateStart', 'Tanggal mulai wajib diisi.');
    if (f.dateStart && f.dateEnd && f.dateEnd < f.dateStart) bad('dateEnd', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (f.lampiran && !/^\d+$/.test(f.lampiran)) bad('lampiran', 'Lampiran harus berupa angka (atau kosongkan).');
    ['docs', 'checks'].forEach(function (k) {
      state[k].forEach(function (it, i) {
        if (!it.bytes) {
          errs.push(CFG[k].label + ' baris ' + (i + 1) + ' belum ada foto. Upload fotonya atau hapus barisnya.');
          var tr = $('tr[data-id="' + it.id + '"]', tbody(k));
          if (tr) tr.classList.add('missing');
        }
      });
    });
    if (!state.docs.length && !state.checks.length) errs.push('Tambahkan minimal satu foto dokumentasi atau foto ceklis.');
    return errs;
  }

  var lastUrl = '';
  $('#submit').addEventListener('click', function () {
    var errs = validate();
    if (errs.length) return showError(errs);
    var btn = $('#submit');
    btn.disabled = true; btn.textContent = 'Membuat dokumen…';
    $('#result').innerHTML = '';
    var f = fields();
    PMDoc.build(window.JSZip, {
      fields: f,
      docs: state.docs.map(function (x) { return { caption: x.caption.trim(), bytes: x.bytes, w: x.w, h: x.h }; }),
      checks: state.checks.map(function (x) { return { bytes: x.bytes, w: x.w, h: x.h }; })
    }).then(function (out) {
      var name = (safe(f.filename.replace(/\.docx$/i, '')) || autoName()) + '.docx';
      var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = lastUrl; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      var mb = (blob.size / 1048576).toFixed(1);
      $('#result').innerHTML = '<div class="msg ok"><strong>Selesai.</strong> ' + name.replace(/</g, '&lt;') + ' (' + mb +
        ' MB) sudah diunduh. <a href="' + lastUrl + '" download="' + name.replace(/"/g, '') + '">Unduh lagi</a></div>';
    }).catch(function (e) {
      showError(['Terjadi kesalahan saat membuat dokumen: ' + e.message]);
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Generate Dokumen';
    });
  });

  /* ---------------- init ---------------- */
  var saved = readSaved();
  FIELDS.forEach(function (f) {
    var el = $('#' + f);
    el.value = saved[f] != null ? saved[f] : (DEFAULTS[f] || '');
    el.addEventListener('input', function () { save(); previews(); el.classList.remove('bad'); });
  });
  render('docs'); render('checks'); previews();
  if (location.hash === '#test') window.__pm = { state: state, addItem: addItem, setPhoto: setPhoto };
  window.addEventListener('beforeunload', function (e) {
    if (location.hash !== '#test' && (state.docs.some(function (x) { return x.bytes; }) || state.checks.some(function (x) { return x.bytes; }))) {
      e.preventDefault(); e.returnValue = '';
    }
  });
})();
