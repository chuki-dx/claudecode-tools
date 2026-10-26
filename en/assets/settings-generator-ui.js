/* settings.json ジェネレーターの画面処理(生成ロジックは settings-generator.js) */
(function () {
  'use strict';
  var G = window.SettingsGenerator;
  var form = document.getElementById('gen-form');
  var out = document.getElementById('gen-output');
  var status = document.getElementById('gen-status');
  var tbody = document.getElementById('gen-rules');
  var warnBox = document.getElementById('gen-warnings');
  var copyBtn = document.getElementById('gen-copy');
  var dlBtn = document.getElementById('gen-download');
  var copyMsg = document.getElementById('gen-copy-msg');
  var dataPath = document.getElementById('opt-data-path');
  var blockData = document.getElementById('opt-block-data');
  var current = null;

  function radioValue(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function readOptions() {
    return {
      includeSchema: document.getElementById('opt-schema').checked,
      shells: radioValue('shells'),
      blockEnv: document.getElementById('opt-env').checked,
      blockSecretsDir: document.getElementById('opt-secrets').checked,
      blockNetwork: document.getElementById('opt-network').checked,
      gitPush: radioValue('gitpush'),
      blockDataDir: blockData.checked,
      dataPath: dataPath.value,
      askDelete: document.getElementById('opt-ask-delete').checked,
      askWeb: document.getElementById('opt-ask-web').checked,
      allowGitRead: document.getElementById('opt-allow-git').checked
    };
  }

  var LIST_LABEL = { deny: 'deny (prohibit)', ask: 'ask (confirm each time)', allow: 'allow (permit without asking)' };

  function td(text, cls) {
    var el = document.createElement('td');
    if (cls) el.className = cls;
    el.textContent = text;
    return el;
  }

  function render() {
    dataPath.disabled = !blockData.checked;
    var r = G.buildSettings(readOptions());
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
      out.textContent = '(Fix the input and settings.json will appear here)';
      status.textContent = 'Could not generate: ' + r.errors.join(' ');
      status.className = 'status ng';
      copyBtn.disabled = true;
      dlBtn.disabled = true;
      tbody.textContent = '';
      return;
    }

    out.textContent = r.json;
    var v = G.validateJson(r.json);
    if (v.ok) {
      status.textContent = 'Confirmed it loads with JSON.parse (' + r.rules.length + ' rules).';
      status.className = 'status ok';
    } else {
      status.textContent = 'Validation error: ' + v.error;
      status.className = 'status ng';
    }
    copyBtn.disabled = !v.ok;
    dlBtn.disabled = !v.ok;

    tbody.textContent = '';
    r.rules.forEach(function (m) {
      var tr = document.createElement('tr');
      var code = document.createElement('code');
      code.textContent = m.rule;
      var c1 = document.createElement('td');
      c1.appendChild(code);
      tr.appendChild(c1);
      tr.appendChild(td(LIST_LABEL[m.list]));
      var c3 = document.createElement('td');
      var b = document.createElement('span');
      b.className = 'badge ' + (m.verified ? 'ok' : 'warn');
      b.textContent = (m.verified ? '✓ ' : '') + m.status;
      c3.appendChild(b);
      if (m.note) {
        var n = document.createElement('div');
        n.className = 'hint';
        n.textContent = m.note;
        c3.appendChild(n);
      }
      tr.appendChild(c3);
      tbody.appendChild(tr);
    });
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
    if (!current) return;
    var text = current.json;
    function done(ok) {
      copyMsg.textContent = ok ? 'Copied.' : 'Could not copy. Select the JSON shown and copy it manually.';
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  });

  dlBtn.addEventListener('click', function () {
    if (!current) return;
    var blob = new Blob([current.json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    copyMsg.textContent = 'settings.json saved. Place it in the .claude folder of your work folder.';
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  render();
})();
