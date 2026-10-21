/* 画面の動き(scripts/lib_site_design.py が全ページに足す)
   - 配色の切り替え(既定はダーク。ライト/ダーク)。選んだ配色はこのタブの中だけで覚える(window.name)。Cookie・localStorage には保存しない
   - 狭い画面のメニュー(ハンバーガー)、ナビのホバーで滑る下地
   - コードのコピーボタン、トースト(コピーしたときなど)、ページ上部へ戻るボタン
   - 解説記事: 読んだ位置のバー、目次の現在地
   - トップ: 設定ファイルのタイピング表示、数字のカウントアップ、カーソルを追う光
   - スクロールで浮かび上がる表示、カードの傾きと光、ボタンの吸い付き・波紋
   通信はしない。動かなくてもページの表示・ツールの動作には影響しない。
   prefers-reduced-motion: reduce のときは動きを付けない */
(function () {
  'use strict';
  var doc = document.documentElement;
  if (!doc.classList.contains('js')) doc.classList.add('js');
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var reduceMotion = mq('(prefers-reduced-motion: reduce)').matches;
  var finePointer = mq('(hover: hover) and (pointer: fine)').matches;
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  var each = function (sel, fn, root) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); };

  /* ---------- 配色(既定はダーク) ---------- */
  var KEY = /(?:^|;)dxl-theme=(light|dark)(?:;|$)/;
  function chosen() {
    var t = doc.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : '';
  }
  function effective() { return chosen() || 'dark'; }
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function syncMode() {
    var m = effective();
    doc.setAttribute('data-mode', m);
    if (themeMeta) themeMeta.setAttribute('content', m === 'dark' ? '#07080d' : '#f6f7fb');
  }
  function remember(theme) {
    try {
      var name = window.name || '';
      if (name && !KEY.test(name) && name.indexOf('dxl-theme=') !== 0) return; /* ほかの用途の window.name は触らない */
      window.name = 'dxl-theme=' + theme;
    } catch (e) { /* 覚えられなくても切り替えはできる */ }
  }
  syncMode();

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.hidden = false;
    var label = function () {
      toggle.setAttribute('aria-label', effective() === 'dark' ? 'ライトの配色にする' : 'ダークの配色にする');
    };
    label();
    toggle.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      var apply = function () {
        doc.setAttribute('data-theme', next);
        remember(next);
        syncMode();
        label();
      };
      if (document.startViewTransition && !reduceMotion) document.startViewTransition(apply);
      else apply();
    });
  }

  /* ---------- 狭い画面のメニュー ---------- */
  var header = document.querySelector('.site-header');
  var nav = document.getElementById('site-nav');
  var navBtn = document.querySelector('.nav-toggle');
  var narrow = mq('(max-width: 1180px)');
  if (header && nav && navBtn) {
    var backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
    var setOpen = function (open, focusBtn) {
      header.classList.toggle('nav-open', open);
      backdrop.classList.toggle('is-shown', open);
      navBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      navBtn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      if (!open && focusBtn) navBtn.focus();
    };
    var syncNav = function () {
      navBtn.hidden = !narrow.matches;
      if (!narrow.matches) setOpen(false);
    };
    syncNav();
    if (narrow.addEventListener) narrow.addEventListener('change', syncNav);
    navBtn.addEventListener('click', function () {
      var open = !header.classList.contains('nav-open');
      setOpen(open);
      if (open) { var first = nav.querySelector('a'); if (first) first.focus({ preventScroll: true }); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) setOpen(false, true);
    });
    document.addEventListener('click', function (e) {
      if (header.classList.contains('nav-open') && !header.contains(e.target)) setOpen(false);
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  }

  /* ---------- ナビのホバーで滑る下地(広い画面) ---------- */
  if (nav && finePointer && !reduceMotion) {
    var ind = document.createElement('span');
    ind.className = 'nav-indicator';
    ind.setAttribute('aria-hidden', 'true');
    nav.insertBefore(ind, nav.firstChild);
    nav.addEventListener('pointerover', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a || narrow.matches) return;
      ind.style.setProperty('--nx', a.offsetLeft + 'px');
      ind.style.setProperty('--nw', a.offsetWidth + 'px');
      nav.classList.add('is-hovering');
    });
    nav.addEventListener('pointerleave', function () { nav.classList.remove('is-hovering'); });
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
    each('[id$="-copy-msg"]', function (el) {
      new MutationObserver(function () {
        var text = (el.textContent || '').trim();
        if (text) toast(text, /できません/.test(text));
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
    /* ツールの結果が変わったら出力欄を一瞬光らせる */
    if (!reduceMotion) {
      each('.tool-output pre code[id], .tool-output .result-list', function (el) {
        var box = el.tagName === 'CODE' ? el.parentNode : el;
        var timer = null;
        new MutationObserver(function () {
          clearTimeout(timer);
          timer = setTimeout(function () {
            box.classList.remove('is-updated');
            void box.offsetWidth;
            box.classList.add('is-updated');
          }, 60);
        }).observe(el, { childList: true, characterData: true, subtree: true });
      });
    }
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
  each('pre', function (pre) {
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

  /* ---------- ヘッダーの影・読んだ位置のバー・上へ戻るボタン ---------- */
  var ticking = false;
  var bar = null;
  var article = document.querySelector('.pg-guide article');
  if (article) {
    bar = document.createElement('div');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
  var toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'ページの先頭へ戻る');
  toTop.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  toTop.tabIndex = -1;
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    var target = document.querySelector('.brand');
    if (target) target.focus({ preventScroll: true });
  });
  document.body.appendChild(toTop);
  function onScroll() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    var shown = y > window.innerHeight * 1.2;
    toTop.classList.toggle('is-shown', shown);
    toTop.tabIndex = shown ? 0 : -1;
    if (bar && article) {
      var r = article.getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.6;
      var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; raf(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- 目次: 広い画面では開く、今読んでいる見出しを強調 ---------- */
  var toc = document.querySelector('details.toc');
  if (toc) {
    var wide = mq('(min-width: 1200px)');
    if (wide.matches) toc.open = true;
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var targets = links.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
    if ('IntersectionObserver' in window && targets.every(Boolean)) {
      var io = new IntersectionObserver(function () {
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
        if (!wide.matches) toc.open = false;
      });
    });
  }

  /* ---------- 現在のページのナビを見える位置に(JS のメニューが無い狭い画面の横スクロール用) ---------- */
  var cur = document.querySelector('.site-header nav a[aria-current="page"]');
  if (cur && cur.parentNode && cur.parentNode.scrollWidth > cur.parentNode.clientWidth + 1) {
    var navEl = cur.parentNode;
    navEl.scrollLeft = Math.max(0, cur.offsetLeft - navEl.clientWidth / 2 + cur.offsetWidth / 2);
  }

  if (reduceMotion) { each('.hero-visual', function (v) { v.classList.add('is-done'); }); return; } /* ここから下は動きだけ */

  /* ---------- トップ: 設定ファイルのタイピング ---------- */
  each('pre[data-type]', function (pre) {
    var visual = pre.closest('.hero-visual');
    var nodes = [];
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) nodes.push({ node: c, text: c.nodeValue });
        else walk(c);
      }
    })(pre);
    nodes.forEach(function (o) { o.node.nodeValue = ''; });
    var caret = document.createElement('span');
    caret.className = 'caret';
    pre.classList.add('is-typing');
    var ni = 0, ci = 0;
    function place() {
      var n = nodes[ni] && nodes[ni].node;
      if (n && n.parentNode) n.parentNode.insertBefore(caret, n.nextSibling);
    }
    function step() {
      if (ni >= nodes.length) {
        pre.classList.remove('is-typing');
        pre.classList.add('is-typed');
        pre.querySelector('code').appendChild(caret);
        if (visual) visual.classList.add('is-done');
        return;
      }
      var o = nodes[ni];
      var chunk = o.text.charAt(ci) === ' ' ? o.text.slice(ci).match(/^ +/)[0] : o.text.charAt(ci);
      ci += chunk.length;
      o.node.nodeValue = o.text.slice(0, ci);
      place();
      if (ci >= o.text.length) { ni++; ci = 0; }
      var ch = chunk.charAt(0);
      setTimeout(step, ch === '\n' ? 90 : (/[,\]}]/.test(ch) ? 60 : 16 + Math.random() * 22));
    }
    setTimeout(step, 700);
  });

  /* ---------- 数字のカウントアップ ---------- */
  var counters = document.querySelectorAll('[data-count]');
  function countUp(el) {
    var end = parseInt(el.getAttribute('data-count'), 10);
    if (!(end > 0)) return;
    var start = null, dur = 1400 + Math.min(end, 80) * 6;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = String(Math.round(end * eased));
      if (p < 1) raf(frame);
    }
    el.textContent = '0';
    raf(frame);
  }
  if (counters.length && 'IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { co.unobserve(e.target); countUp(e.target); }
      });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(counters, function (el) {
      if (parseInt(el.getAttribute('data-count'), 10) > 0) { el.textContent = '0'; co.observe(el); }
    });
  }

  /* ---------- スクロールで浮かび上がる ---------- */
  if ('IntersectionObserver' in window) {
    var SEL = [
      '.section-title', '.tool-list > li', '.link-grid li', '.guide-list > li', '.offer-list > li', '.stat',
      '.band', '.follow-box', '.paid-cta', '.related', '.summary-box', '.tool-cta',
      'main > h2', 'main > section > h2', 'article > h2', 'article > h3', '.codeblock', '.table-scroll',
      'article > section', 'main > section:not(.tool-panel):not(.hero)', 'details:not(.toc)', '.tool-panel', '.footer-mark'
    ].join(',');
    var all = Array.prototype.slice.call(document.querySelectorAll(SEL));
    /* 入れ子は外側だけ動かす */
    var picked = all.filter(function (el) {
      for (var p = el.parentElement; p; p = p.parentElement) { if (all.indexOf(p) >= 0 && p.classList) return false; }
      return true;
    });
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        ro.unobserve(el);
        el.classList.add('is-in');
        setTimeout(function () { el.style.transitionDelay = ''; el.classList.remove('reveal', 'r-blur', 'r-scale', 'is-in'); }, 1300);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    var vh = window.innerHeight;
    picked.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh || r.height === 0) return; /* 最初から見えているもの・隠れているものは動かさない */
      el.classList.add('reveal');
      if (el.matches('.section-title, article > h2, main > h2, .footer-mark')) el.classList.add('r-blur');
      else if (el.matches('.offer-list > li, .stat, .band')) el.classList.add('r-scale');
      var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      if (el.matches('.tool-list > li, .link-grid li, .guide-list > li, .offer-list > li, .stat')) el.style.transitionDelay = ((sib % 4) * 70) + 'ms';
      ro.observe(el);
    });
    /* 見出しの下線の伸び(記事) */
    each('article > h2', function (h) {
      var r = h.getBoundingClientRect();
      if (r.top < vh) return;
      var o = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { h.classList.add('is-in'); o.disconnect(); }
      }, { threshold: 0.5 });
      o.observe(h);
    });
  }

  /* ---------- ボタンの波紋 ---------- */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('button, .btn');
    if (!b || b.disabled || b.classList.contains('theme-toggle') || b.classList.contains('nav-toggle')) return;
    var r = b.getBoundingClientRect();
    var s = document.createElement('span');
    s.className = 'ripple';
    s.setAttribute('aria-hidden', 'true');
    s.style.left = (e.clientX - r.left) + 'px';
    s.style.top = (e.clientY - r.top) + 'px';
    b.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 700);
  }, { passive: true });

  if (!finePointer) return; /* ここから下はマウスのときだけ */

  /* ---------- カードの傾きと光(カーソル追従) ---------- */
  var TILT = '.tool-card, .guide-list > li.card, .offer-list > li';
  each(TILT, function (el) { el.classList.add('tilt'); });
  var active = null;
  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest(TILT + ', .link-grid a, .stat');
    if (active && active !== card) {
      active.classList.remove('is-tilting');
      active.style.removeProperty('--rx');
      active.style.removeProperty('--ry');
      active = null;
    }
    if (!card) return;
    var r = card.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    card.style.setProperty('--mx', x + 'px');
    card.style.setProperty('--my', y + 'px');
    if (card.classList.contains('tilt')) {
      var max = r.width > 520 ? 3 : 6;
      card.style.setProperty('--rx', ((0.5 - y / r.height) * max).toFixed(2) + 'deg');
      card.style.setProperty('--ry', ((x / r.width - 0.5) * max).toFixed(2) + 'deg');
      card.classList.add('is-tilting');
      active = card;
    }
  }, { passive: true });

  /* ---------- 主ボタンの吸い付き ---------- */
  each('.btn-primary, .btn-ghost', function (b) {
    b.classList.add('magnetic');
    b.addEventListener('pointermove', function (e) {
      var r = b.getBoundingClientRect();
      b.style.setProperty('--bx', ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px');
      b.style.setProperty('--by', ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px');
    });
    b.addEventListener('pointerleave', function () { b.style.removeProperty('--bx'); b.style.removeProperty('--by'); });
  });

  /* ---------- トップ: カーソルを追う光 ---------- */
  var hero = document.querySelector('.hero');
  var heroBg = hero && hero.querySelector('.hero-bg');
  if (hero && heroBg) {
    var pending = null;
    hero.addEventListener('pointermove', function (e) {
      pending = e;
      raf(function () {
        if (!pending) return;
        var r = heroBg.getBoundingClientRect();
        heroBg.style.setProperty('--px', (pending.clientX - r.left) + 'px');
        heroBg.style.setProperty('--py', (pending.clientY - r.top) + 'px');
        pending = null;
      });
    }, { passive: true });
  }
})();
