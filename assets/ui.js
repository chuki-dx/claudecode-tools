/* 画面の動き(scripts/lib_site_design.py が全ページに足す)
   - 配色の切り替え(ライト/ダーク)。選んだ配色はこのタブの中だけで覚える(window.name)。Cookie・localStorage には保存しない
   - コードのコピーボタン、トースト(コピーしたときなど)
   - 解説記事: 読んだ位置のバー、目次の現在地
   - カードのカーソル追従の光、ヘッダーの影
   通信はしない。動かなくてもページの表示・ツールの動作には影響しない */
(function () {
  'use strict';
  var doc = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /* ---------- 配色 ---------- */
  var KEY = /(?:^|;)dxl-theme=(light|dark)(?:;|$)/;
  function chosen() {
    var t = doc.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : '';
  }
  function effective() {
    return chosen() || (darkQuery && darkQuery.matches ? 'dark' : 'light');
  }
  function syncMode() { doc.setAttribute('data-mode', effective()); }
  function remember(theme) {
    try {
      var name = window.name || '';
      if (name && !KEY.test(name) && name.indexOf('dxl-theme=') !== 0) return; /* ほかの用途の window.name は触らない */
      window.name = 'dxl-theme=' + theme;
    } catch (e) { /* 覚えられなくても切り替えはできる */ }
  }
  syncMode();
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', syncMode);

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.hidden = false;
    var label = function () {
      toggle.setAttribute('aria-label', effective() === 'dark' ? 'ライトの配色にする' : 'ダークの配色にする');
    };
    label();
    toggle.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      doc.setAttribute('data-theme', next);
      remember(next);
      syncMode();
      label();
    });
  }

  /* ---------- トースト ---------- */
  var host = null;
  function toast(text, warn) {
    if (!text) return;
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      host.setAttribute('aria-hidden', 'true'); /* 読み上げは各ページの role=status が行う */
      document.body.appendChild(host);
    }
    var t = document.createElement('div');
    t.className = 'toast' + (warn ? ' is-warn' : '');
    t.textContent = text;
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () {
      t.classList.add('is-out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, reduceMotion ? 0 : 320);
    }, 2400);
  }
  window.DxlToast = toast;

  /* ツールの「コピーしました」などのメッセージ(id が -copy-msg で終わる要素)をトーストでも出す */
  if (window.MutationObserver) {
    Array.prototype.forEach.call(document.querySelectorAll('[id$="-copy-msg"]'), function (el) {
      new MutationObserver(function () {
        var text = (el.textContent || '').trim();
        if (text) toast(text, /できません/.test(text));
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------- コードのコピーボタン ---------- */
  function copyText(text, done) {
    function fallback() {
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
      done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }
  function guessLabel(text) {
    var s = text.replace(/^\s+/, '');
    if (/^[{[]/.test(s)) return 'JSON';
    if (/^---\n/.test(s) || /^#{1,3} /.test(s)) return 'Markdown';
    if (/^(PS |\$ |claude |npm |npx |winget |irm |curl |git |cd |python )/.test(s)) return 'Shell';
    return 'Code';
  }
  /* JSON の色分け(文字列・キー・数値・記号)。中身は textContent のまま変えない */
  function highlightJson(pre) {
    var code = pre.querySelector('code') || pre;
    if (code.children.length) return;
    var text = code.textContent || '';
    var re = /("(?:[^"\\\n]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}\[\],])/g;
    var frag = document.createDocumentFragment();
    var last = 0, m;
    function span(cls, t) { var s = document.createElement('span'); s.className = cls; s.textContent = t; frag.appendChild(s); }
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) { span(m[2] ? 'tk' : 'ts', m[1]); if (m[2]) frag.appendChild(document.createTextNode(m[2])); }
      else if (m[3] || m[4]) span('tn', m[0]);
      else span('tp', m[0]);
      last = re.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    code.textContent = '';
    code.appendChild(frag);
  }
  Array.prototype.forEach.call(document.querySelectorAll('pre'), function (pre) {
    /* ツールの出力欄(code に id がある)と、トップの飾りのコードは除く(ツールには専用のコピーボタンがある) */
    if (pre.classList.contains('window-code') || pre.querySelector('code[id]') || pre.closest('.hero-visual')) return;
    var wrap = document.createElement('div');
    wrap.className = 'codeblock';
    wrap.setAttribute('data-label', guessLabel(pre.textContent || ''));
    if (wrap.getAttribute('data-label') === 'JSON') highlightJson(pre);
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'コピー';
    btn.setAttribute('aria-label', 'このコードをコピー');
    btn.addEventListener('click', function () {
      copyText(pre.textContent || '', function (ok) {
        btn.textContent = ok ? 'コピーしました' : 'コピーできません';
        btn.classList.toggle('is-done', ok);
        toast(ok ? 'コードをコピーしました' : 'コピーできませんでした。選択してコピーしてください', !ok);
        setTimeout(function () { btn.textContent = 'コピー'; btn.classList.remove('is-done'); }, 1800);
      });
    });
    wrap.appendChild(btn);
  });

  /* ---------- ヘッダーの影 ---------- */
  var header = document.querySelector('.site-header');
  var ticking = false;
  var bar = null;
  var article = document.querySelector('.pg-guide article');
  if (article) {
    bar = document.createElement('div');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
  function onScroll() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (bar && article) {
      var r = article.getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.6;
      var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- 目次: 広い画面では開く、今読んでいる見出しを強調 ---------- */
  var toc = document.querySelector('details.toc');
  if (toc) {
    var wide = window.matchMedia ? window.matchMedia('(min-width: 1200px)') : null;
    if (wide && wide.matches) toc.open = true;
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var targets = links.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
    if ('IntersectionObserver' in window && targets.every(Boolean)) {
      var visible = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
        var current = null;
        for (var i = 0; i < targets.length; i++) {
          if (targets[i].getBoundingClientRect().top < window.innerHeight * 0.35) current = i;
        }
        links.forEach(function (a, i) { a.classList.toggle('is-active', i === current); });
      }, { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] });
      targets.forEach(function (t) { io.observe(t); });
    }
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        if (wide && !wide.matches) toc.open = false;
      });
    });
  }

  /* ---------- 現在のページのナビを見える位置に(狭い画面) ---------- */
  var cur = document.querySelector('.site-header nav a[aria-current="page"]');
  if (cur && cur.parentNode && cur.parentNode.scrollWidth > cur.parentNode.clientWidth) {
    var nav = cur.parentNode;
    nav.scrollLeft = Math.max(0, cur.offsetLeft - nav.clientWidth / 2 + cur.offsetWidth / 2);
  }

  /* ---------- カードの光(カーソル追従) ---------- */
  if (!reduceMotion && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest('.tool-card, .guide-list > li.card, .link-grid a');
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ---------- スクロールで浮かび上がる(トップ・一覧のカードだけ) ---------- */
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var items = document.querySelectorAll('.pg-home .tool-card, .pg-home .link-grid li, .pg-guides .guide-list > li');
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var el = e.target;
          el.classList.add('is-in');
          ro.unobserve(el);
          setTimeout(function () { el.style.transitionDelay = ''; el.classList.remove('reveal', 'is-in'); }, 900);
        }
      });
    }, { rootMargin: '0px 0px -40px 0px' });
    Array.prototype.forEach.call(items, function (el, i) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) return; /* 最初から見えているものは動かさない */
      el.classList.add('reveal');
      el.style.transitionDelay = ((i % 3) * 60) + 'ms';
      ro.observe(el);
    });
  }
})();
