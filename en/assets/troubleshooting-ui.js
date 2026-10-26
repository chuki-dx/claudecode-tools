/* つまずき早見表の画面処理(データと絞り込みは troubleshooting.js) */
(function () {
  'use strict';
  var T = window.Troubleshooting;
  var form = document.getElementById('ts-form');
  var query = document.getElementById('ts-query');
  var catSel = document.getElementById('ts-category');
  var tbody = document.getElementById('ts-rows');
  var status = document.getElementById('ts-status');

  T.CATEGORIES.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    catSel.appendChild(opt);
  });

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  function sourceCell(row) {
    var td = document.createElement('td');
    var b = document.createElement('span');
    b.className = 'badge ' + (row.basis === 'observed' ? 'ok' : 'warn');
    b.textContent = T.BASIS_LABEL[row.basis];
    td.appendChild(b);
    var ul = document.createElement('ul');
    ul.className = 'source-list';
    row.sources.forEach(function (key) {
      var s = T.SOURCES[key];
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = s.url;
      if (/^https?:/.test(s.url)) a.rel = 'noopener';
      a.textContent = s.title;
      li.appendChild(a);
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = s.tag;
      li.appendChild(tag);
      ul.appendChild(li);
    });
    td.appendChild(ul);
    return td;
  }

  function render() {
    var rows = T.filterRows(T.ROWS, { query: query.value, category: catSel.value });
    tbody.textContent = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var sym = document.createElement('td');
      var cat = document.createElement('div');
      cat.className = 'hint';
      cat.textContent = row.category;
      sym.appendChild(cat);
      var strong = document.createElement('strong');
      strong.textContent = row.symptom;
      sym.appendChild(strong);
      tr.appendChild(sym);
      tr.appendChild(cell(row.cause));
      tr.appendChild(cell(row.fix));
      tr.appendChild(sourceCell(row));
      tbody.appendChild(tr);
    });
    if (rows.length) {
      status.textContent = T.ROWS.length + ' rows total, showing ' + rows.length + '.';
      status.className = 'status ok';
    } else {
      status.textContent = 'No rows match. Shorten the keyword or set the category to "All".';
      status.className = 'status ng';
    }
  }

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  render();
})();
