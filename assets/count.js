/* 閲覧数を数えるための小さなスクリプト(scripts/build_site.py が全ページに足す)
   送るもの: 開いたページのパスと、直前に見ていた別サイトのドメイン名と、リンクに付いた utm_source(threads / bluesky など。短い英数字のときだけ)だけ。Cookie・保存・第三者のサービスは使わない
   送り先: 運営者のサーバ(jpexam.ai-income.jp/px.gif。1x1 の画像を返すだけ)
   ブラウザでトラッキング拒否(Do Not Track / Global Privacy Control)が有効なときと、公開先以外(手元の確認)では送らない */
(function () {
  "use strict";
  try {
    if (location.hostname !== "chuki-dx.github.io") return;
    var n = navigator;
    if (n.doNotTrack === "1" || window.doNotTrack === "1" || n.globalPrivacyControl === true || n.webdriver) return;
    var ref = "";
    if (document.referrer) {
      var host = new URL(document.referrer).hostname;
      if (host && host !== location.hostname) ref = host;
    }
    var q = "p=" + encodeURIComponent(location.pathname.slice(0, 200));
    if (ref) q += "&r=" + encodeURIComponent(ref.slice(0, 100));
    var utm = (new URLSearchParams(location.search).get("utm_source") || "").toLowerCase();
    if (/^[a-z0-9_.-]{1,30}$/.test(utm)) q += "&u=" + encodeURIComponent(utm);
    var img = new Image(1, 1);
    img.referrerPolicy = "origin";
    img.src = "https://jpexam.ai-income.jp/px.gif?" + q;
  } catch (e) {
    /* 数えられなくてもページの表示・ツールの動作には影響しない */
  }
})();
