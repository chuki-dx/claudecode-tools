/* 外へのリンク(商品・広告・公式ページ)と data-click の付いたボタンが押された回数を数える小さなスクリプト(ツールサイト用)
   (試験サイト・英語サイトは外部と通信しない版 site_exam/assets/click.js。押したものの種類の決め方は同じ)
   送るもの: 押したものの種類(例: gumroad:kana-writing・a8:講座の名前の代わりの短い id・out:www.ipa.go.jp)と、押したページのパスだけ。
   Cookie・保存・第三者のサービスは使わない
   送り先: 運営者のサーバ(jpexam.ai-income.jp/px.gif。閲覧数の count.js と同じ受け口)
   ブラウザでトラッキング拒否(Do Not Track / Global Privacy Control)が有効なときと、公開先以外(手元の確認)では送らない
   運営者の端末(運営者が自分で付けた Cookie / localStorage の ainc_own=1 がある)では、閲覧数の代わりに「運営者の端末」の合図だけ送る */
(function () {
  "use strict";
  try {
    var n = navigator;
    if (location.hostname !== "chuki-dx.github.io") return;
    if(/(?:^|;\s*)ainc_own=1/.test(document.cookie)||(function(){try{return localStorage.getItem('ainc_own')==='1'}catch(e){return false}})()){var o=new Image(1,1);o.src='https://jpexam.ai-income.jp/px.gif?own=1';return;}
    if (n.doNotTrack === "1" || window.doNotTrack === "1" || n.globalPrivacyControl === true || n.webdriver) return;
  } catch (e) {
    return;
  }

  function last(path) {
    var p = path.replace(/\/+$/, "").split("/");
    return p[p.length - 1] || "";
  }

  /* リンク先から種類を決める。自分のサイト内のページ移動は数えない(PV で分かる) */
  function idFor(a) {
    var u = new URL(a.href, location.href);
    var h = u.hostname.replace(/^www\./, "");
    var own = u.hostname === location.hostname;
    if (own) {
      return /\.(pdf|zip|apkg|ics|csv)$/i.test(u.pathname) ? "dl:" + last(u.pathname) : "";
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (/(^|\.)gumroad\.com$/.test(h)) return "gumroad:" + last(u.pathname);
    if (/(^|\.)amazon\.[a-z.]+$/.test(h) || h === "amzn.to") {
      var m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      return "amazon:" + (m ? m[1] : last(u.pathname));
    }
    if (/(^|\.)a8\.net$/.test(h)) return "a8:" + (u.searchParams.get("a8mat") || "").slice(0, 24);
    if (h === "af.moshimo.com") return "moshimo:" + (u.searchParams.get("a_id") || "");
    if (h === "note.com" || h === "zenn.dev") return h.split(".")[0] + ":" + last(u.pathname);
    return "out:" + h;
  }

  function clean(id) {
    return String(id).toLowerCase().replace(/[^a-z0-9:._-]/g, "").slice(0, 60);
  }

  function send(id) {
    var url = "https://jpexam.ai-income.jp/px.gif?p=" + encodeURIComponent("/claudecode-tools/_click/" + id + "/") +
      "&f=" + encodeURIComponent(location.pathname.slice(0, 200)) + "&t=" + Date.now();
    try {
      /* ページを離れても届くように keepalive。使えないブラウザは画像で送る */
      fetch(url, { method: "GET", mode: "no-cors", keepalive: true, credentials: "omit", referrerPolicy: "origin" });
    } catch (e) {
      var img = new Image(1, 1);
      img.referrerPolicy = "origin";
      img.src = url;
    }
  }

  document.addEventListener("click", function (ev) {
    try {
      var el = ev.target && ev.target.closest ? ev.target.closest("[data-click], a[href]") : null;
      if (!el) return;
      var id = clean(el.getAttribute("data-click") || (el.tagName === "A" ? idFor(el) : ""));
      if (id && /^[a-z0-9]/.test(id)) send(id);
    } catch (e) {
      /* 数えられなくてもリンク・ボタンの動作には影響しない */
    }
  }, true);
})();
