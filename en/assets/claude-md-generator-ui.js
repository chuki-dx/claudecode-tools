/* CLAUDE.md テンプレート生成の画面処理(生成ロジックは claude-md-generator.js) */
(function () {
  'use strict';
  var G = window.ClaudeMdGenerator;
  var form = document.getElementById('md-form');
  var out = document.getElementById('md-output-text');
  var status = document.getElementById('md-status');
  var warnBox = document.getElementById('md-warnings');
  var copyBtn = document.getElementById('md-copy');
  var dlBtn = document.getElementById('md-download');
  var copyMsg = document.getElementById('md-copy-msg');
  var fullOnly = document.getElementById('full-only');
  var rulesBox = document.getElementById('md-rules');
  var current = null;

  // 初期値
  var D = G.DEFAULT_OPTIONS;
  document.getElementById('md-role').value = D.role;
  document.getElementById('md-tools').value = D.tools;
  document.getElementById('md-priority').value = D.priority;
  document.getElementById('md-dirs').value = D.forbiddenDirs;
  document.getElementById('md-output').value = D.outputDir;

  G.RULES.forEach(function (rule) {
    var div = document.createElement('div');
    div.className = 'opt';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'rule-' + rule.id;
    input.value = rule.id;
    input.checked = D.rules.indexOf(rule.id) !== -1;
    var label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = rule.label;
    div.appendChild(input);
    div.appendChild(label);
    rulesBox.appendChild(div);
  });

  function radioValue(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function readOptions() {
    var rules = [];
    G.RULES.forEach(function (rule) {
      if (document.getElementById('rule-' + rule.id).checked) rules.push(rule.id);
    });
    return {
      mode: radioValue('mode'),
      purpose: radioValue('purpose'),
      role: document.getElementById('md-role').value,
      tools: document.getElementById('md-tools').value,
      priority: document.getElementById('md-priority').value,
      lang: document.getElementById('md-lang').value,
      style: document.getElementById('md-style').value,
      rules: rules,
      forbiddenDirs: document.getElementById('md-dirs').value,
      outputDir: document.getElementById('md-output').value,
      includeHowToEdit: document.getElementById('md-howto').checked
    };
  }

  function render() {
    var o = readOptions();
    fullOnly.hidden = o.mode === 'minimal';
    var r = G.buildClaudeMd(o);
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
      out.textContent = '(Fix your inputs and CLAUDE.md will appear here)';
      status.textContent = 'Could not generate: ' + r.errors.join(' ');
      status.className = 'status ng';
      copyBtn.disabled = true;
      dlBtn.disabled = true;
      return;
    }
    out.textContent = r.markdown;
    status.textContent = r.lineCount + ' lines / guideline: ' + r.maxLines + ' lines or fewer (' + (o.mode === 'minimal' ? '3-line version' : 'template') + ')。';
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
    a.download = 'CLAUDE.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    copyMsg.textContent = 'CLAUDE.md saved. Place it directly under your working folder.';
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  render();
})();
