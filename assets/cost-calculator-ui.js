/* API 料金 見積もり計算機の画面処理(計算ロジックは cost-calculator.js) */
(function () {
  'use strict';
  var C = window.CostCalculator;
  var form = document.getElementById('calc-form');
  var errBox = document.getElementById('calc-errors');
  var ids = {
    model: 'calc-model', people: 'calc-people', days: 'calc-days', fx: 'calc-fx', usOnly: 'calc-us-only',
    input: 'calc-input', cacheWrite5m: 'calc-cw5m', cacheWrite1h: 'calc-cw1h', cacheRead: 'calc-cr', output: 'calc-output'
  };
  function el(k) { return document.getElementById(ids[k]); }
  function setText(id, text) { document.getElementById(id).textContent = text; }

  function render() {
    var r = C.estimate({
      model: el('model').value,
      people: el('people').value,
      days: el('days').value,
      fxRate: el('fx').value,
      usOnly: el('usOnly').checked,
      tokens: {
        input: el('input').value,
        cacheWrite5m: el('cacheWrite5m').value,
        cacheWrite1h: el('cacheWrite1h').value,
        cacheRead: el('cacheRead').value,
        output: el('output').value
      }
    });

    errBox.textContent = '';
    if (!r.ok) {
      r.errors.forEach(function (m) { var p = document.createElement('p'); p.textContent = m; errBox.appendChild(p); });
      errBox.hidden = false;
      ['res-day', 'res-person', 'res-total', 'res-jpy'].forEach(function (id) { setText(id, '—'); });
      return;
    }
    errBox.hidden = true;
    setText('res-day', C.formatUsd(r.perPersonDayUsd));
    setText('res-person', C.formatUsd(r.perPersonMonthUsd));
    setText('res-total', C.formatUsd(r.totalMonthUsd));
    setText('res-jpy', r.totalMonthJpy === null ? '為替レートを入れると表示します' : '約 ' + C.formatJpy(r.totalMonthJpy));
    setText('res-bd-input', C.formatUsd(r.breakdown.input));
    setText('res-bd-cw5m', C.formatUsd(r.breakdown.cacheWrite5m));
    setText('res-bd-cw1h', C.formatUsd(r.breakdown.cacheWrite1h));
    setText('res-bd-cr', C.formatUsd(r.breakdown.cacheRead));
    setText('res-bd-output', C.formatUsd(r.breakdown.output));
  }

  document.getElementById('calc-preset').addEventListener('click', function () {
    var p = C.EXAMPLE_PRESET;
    el('model').value = p.model;
    el('input').value = p.input;
    el('cacheWrite5m').value = p.cacheWrite5m;
    el('cacheWrite1h').value = p.cacheWrite1h;
    el('cacheRead').value = p.cacheRead;
    el('output').value = p.output;
    render();
  });

  document.getElementById('calc-fx-example').addEventListener('click', function () {
    el('fx').value = '150';
    render();
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  render();
})();
