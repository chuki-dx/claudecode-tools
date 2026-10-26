/* スキル(SKILL.md)雛形生成の画面処理(生成ロジックは skill-generator.js) */
(function () {
  'use strict';
  var G = window.SkillGenerator;
  var form = document.getElementById('sk-form');
  var out = document.getElementById('sk-output-text');
  var status = document.getElementById('sk-status');
  var pathEl = document.getElementById('sk-path');
  var warnBox = document.getElementById('sk-warnings');
  var copyBtn = document.getElementById('sk-copy');
  var dlBtn = document.getElementById('sk-download');
  var copyMsg = document.getElementById('sk-copy-msg');
  var presetSel = document.getElementById('sk-preset');
  var current = null;

  var FIELDS = {
    name: 'sk-name',
    title: 'sk-title',
    description: 'sk-desc',
    whenToUse: 'sk-when',
    steps: 'sk-steps',
    prohibitions: 'sk-prohibit',
    output: 'sk-output'
  };

  Object.keys(G.PRESETS).forEach(function (key) {
    var opt = document.createElement('option');
    opt.value = key;
    opt.textContent = G.PRESETS[key].label + '(' + key + ')';
    presetSel.appendChild(opt);
  });

  function loadPreset(key) {
    var p = G.PRESETS[key];
    if (!p) return;
    Object.keys(FIELDS).forEach(function (k) {
      document.getElementById(FIELDS[k]).value = p[k] || '';
    });
  }

  function radioValue(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function readOptions() {
    var o = { location: radioValue('location') };
    Object.keys(FIELDS).forEach(function (k) {
      o[k] = document.getElementById(FIELDS[k]).value;
    });
    return o;
  }

  function render() {
    var r = G.buildSkill(readOptions());
    current = r;

    warnBox.textContent = '';
    var msgs = r.errors.concat(r.warnings);
    msgs.forEach(function (m) {
      var p = document.createElement('p');
      p.textContent = m;
      warnBox.appendChild(p);
    });
    warnBox.hidden = msgs.length === 0;

    if (r.errors.length) {
      out.textContent = '(SKILL.md will appear here once you fix the input)';
      pathEl.textContent = '-';
      status.textContent = 'Could not generate: ' + r.errors.join(' ');
      status.className = 'status ng';
      copyBtn.disabled = true;
      dlBtn.disabled = true;
      return;
    }
    out.textContent = r.markdown;
    pathEl.textContent = r.path;
    status.textContent = 'Checked the skill name and frontmatter. Call it with /' + r.name + ' (description: ' + r.description.length + ' characters).';
    status.className = 'status ok';
    copyBtn.disabled = false;
    dlBtn.disabled = false;
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  copyBtn.addEventListener('click', function () {
    if (!current || !current.markdown) return;
    var text = current.markdown;
    function done(ok) {
      copyMsg.textContent = ok ? 'Copied.' : 'Could not copy. Select the displayed content and copy it manually.';
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  });

  dlBtn.addEventListener('click', function () {
    if (!current || !current.markdown) return;
    var blob = new Blob([current.markdown], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'SKILL.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    copyMsg.textContent = 'Saved SKILL.md. Place it in ' + current.folder + '.';
  });

  presetSel.addEventListener('change', function () {
    loadPreset(presetSel.value);
    render();
  });
  form.addEventListener('input', function (e) { if (e.target !== presetSel) render(); });
  form.addEventListener('change', function (e) { if (e.target !== presetSel) render(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });

  loadPreset('minutes-summary');
  presetSel.value = 'minutes-summary';
  render();
})();
