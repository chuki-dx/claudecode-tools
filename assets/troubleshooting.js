/*
 * Claude Code つまずき早見表のデータと絞り込みのロジック。
 * DOM に触らない純粋な関数だけを置く(ブラウザでも Node でも動く)。
 *
 * 載せるのは、中小DXラボの記事・本で実際に起きた、または記事の中で公式ドキュメントを確かめて書いた事柄だけ。
 * 実機での確認は Windows 11 と Claude Code 2.1.296(2026年10月)。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Troubleshooting = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOOK = 'https://zenn.dev/chukidx_dev/books/claude-code-for-joshisu';

  // 出典。paid が true のものは有料(画面では価格と一緒に表示する)
  var SOURCES = {
    kit: { title: '情シスが配る Claude Code 社内標準セット', url: 'https://note.com/chuki_dx_note/n/n9524803d393b', paid: true, tag: '有料記事・1,480円(note)' },
    training: { title: '総務・経理に Claude Code を渡す前の3日間研修キット', url: 'https://note.com/chuki_dx_note/n/n77dcb062f5fc', paid: true, tag: '有料記事・1,480円(note)' },
    usage: { title: '部署で使う Claude Code の使用量を把握して月額を見積もる', url: 'https://note.com/chuki_dx_note/n/n068fdd9ea3f5', paid: true, tag: '有料記事・980円(note)' },
    book4: { title: '情シスのための Claude Code 導入・運用ガイド 第4章 セキュリティの設定', url: BOOK, paid: true, tag: '有料の本・2,500円(Zenn、第2章まで無料)' },
    book5: { title: '情シスのための Claude Code 導入・運用ガイド 第5章 CLAUDE.md を育てる', url: BOOK, paid: true, tag: '有料の本・2,500円(Zenn、第2章まで無料)' },
    first3: { title: 'CLAUDE.mdは3行から始める', url: 'https://note.com/chuki_dx_note/n/n8eea75ce93e9', paid: false, tag: '無料記事(note)' },
    settingsTool: { title: 'Claude Code 権限設定(settings.json)ジェネレーター', url: '../settings-generator/index.html', paid: false, tag: '無料ツール(このサイト)' },
    skillTool: { title: 'Claude Code スキル(SKILL.md)雛形生成', url: '../skill-generator/index.html', paid: false, tag: '無料ツール(このサイト)' }
  };

  var CATEGORIES = ['権限設定', 'CLAUDE.md', 'スキル', '文字コード・Excel', 'PowerShell', '使い方・研修', '使用量'];

  // basis: 'observed' = 私たちの実機で起きた / 'docs' = 公式ドキュメントの記載を記事で確かめた(実機では未確認)
  //        'guide' = 本・記事に書いた確認の手順(個別の事例ではない)
  var ROWS = [
    {
      id: 'allow-trust', category: '権限設定', basis: 'observed',
      symptom: 'allow に入れたコマンドなのに確認が出る。claude -p で「allow ルールを無視する」という警告が出る',
      cause: 'そのフォルダで信頼の確認(trust)をまだ承認していない。プロジェクトの allow は承認するまで使われない(deny と ask は承認と関係なく効く)',
      fix: '対話の画面でそのフォルダの claude を一度起動し、信頼の確認を承認する。配ったあとは、利用者にこの1回をしてもらう',
      sources: ['kit', 'settingsTool']
    },
    {
      id: 'deny-script', category: '権限設定', basis: 'observed',
      symptom: 'deny に Read(./.env) を入れたのに、Python スクリプト経由で .env の中身が読めた',
      cause: 'Read の deny は、Claude の読み取りツールと cat などの読み取りコマンドには効くが、スクリプトが自分でファイルを開く読み方には効かない(公式ドキュメントに書かれた仕様)',
      fix: '本物の API キーや実データは作業フォルダに置かない。deny は「うっかり」を防ぐ網として使い、強く止めたいならサンドボックス(Windows では WSL 2)や管理用設定を検討する',
      sources: ['book4', 'settingsTool']
    },
    {
      id: 'deny-curl-path', category: '権限設定', basis: 'docs',
      symptom: 'Bash(curl *) を deny に入れたが、すべての外部送信が止まるのか不安',
      cause: '公式ドキュメントでは、curl をパスで呼ぶ書き方(/usr/bin/curl など)や sh -c で包む書き方は止めないとされている。curl https://… の形は実機で止まった',
      fix: 'deny は「ふつうに書くコマンド」を止める網と考える。外部送信を確実に止めたい場合は、サンドボックスや管理用設定を公式ドキュメントで確認する',
      sources: ['book4', 'settingsTool']
    },
    {
      id: 'deny-test-claudemd', category: '権限設定', basis: 'observed',
      symptom: 'deny が効くかテストしたいのに、Claude が .env や実データを読みにいかないので確かめられない',
      cause: 'CLAUDE.md に「読まない」と書いてあると、Claude は読み取りを試みない(CLAUDE.md を外すと試みて deny で止まった)',
      fix: 'テストのときだけ CLAUDE.md を一時的に別名にし、--allowedTools "Read,Bash" を付けて読み取りを頼む。確かめ終わったら名前を戻す',
      sources: ['kit']
    },
    {
      id: 'deny-not-loaded', category: '権限設定', basis: 'guide',
      symptom: 'deny を書いたのに効いていないように見える',
      cause: '設定ファイルを置いた場所や、パスの書き方が違っていることがある',
      fix: '/permissions でルールが読み込まれているかを見る。業務フォルダの .claude/settings.json に置いたかを確かめ、ダミーのファイルで読めないことを試してから使い始める',
      sources: ['book4', 'settingsTool']
    },
    {
      id: 'user-claudemd', category: 'CLAUDE.md', basis: 'observed',
      symptom: '自分の PC と他の人の PC で返答の傾向が違う。頼んでいない一文が返答の最後に付く',
      cause: '自分用の ~/.claude/CLAUDE.md(すべてのプロジェクトに効く個人の指示)も一緒に読み込まれている',
      fix: '研修や配布の前の確かめは、受講者・利用者と同じ条件のアカウントで行う。チームで共有したい内容はプロジェクト用の CLAUDE.md に移す',
      sources: ['training', 'book5']
    },
    {
      id: 'claudemd-long', category: 'CLAUDE.md', basis: 'docs',
      symptom: 'CLAUDE.md に書いたことが守られにくくなってきた。行数が増えて古い記述と新しい記述が混ざっている',
      cause: '公式ドキュメントでは1ファイル200行以下が目安。長くなるほど読み込みの負担が増え、守られにくくなる。食い違う行があると、どちらに従うか分からなくなる',
      fix: '言われなくても守っていること・使わなくなった手順を削る。同じ話題の行は書き換える。禁止したいことは settings.json に移す',
      sources: ['first3', 'book5']
    },
    {
      id: 'claudemd-update', category: 'CLAUDE.md', basis: 'observed',
      symptom: '標準セットの更新を配ったのに、業務フォルダの CLAUDE.md が古いまま',
      cause: '部署で書き足した CLAUDE.md を消さないよう、配置スクリプトは既にあるファイルを上書きしない作りにしている',
      fix: 'スキップされた CLAUDE.md は、変更点を手で反映する。部署の書き足しは決めた見出しの下だけにしておくと反映しやすい',
      sources: ['kit']
    },
    {
      id: 'skill-missing', category: 'スキル', basis: 'observed',
      symptom: 'スキルが一覧に出ない',
      cause: 'SKILL.md の置き場所か、frontmatter(先頭の --- で囲んだ部分)の書き方が違う',
      fix: '.claude/skills/<名前>/SKILL.md の位置と、先頭行が --- で始まっているかを確かめ、claude plugin validate .claude/skills を実行する',
      sources: ['kit', 'skillTool']
    },
    {
      id: 'skill-not-used', category: 'スキル', basis: 'observed',
      symptom: 'スキルが自動で使われない',
      cause: 'description の言葉と、利用者の頼み方の言葉が合っていない',
      fix: 'description に、利用者がふだん使う言葉(「議事録の要約」「会議のまとめ」など)を足す。/スキル名 で直接呼ぶこともできる',
      sources: ['kit', 'skillTool']
    },
    {
      id: 'ps-bom', category: 'PowerShell', basis: 'observed',
      symptom: 'PowerShell スクリプトの日本語が文字化けする。構文エラーになる',
      cause: 'Windows PowerShell 5.1 は、BOM の無い UTF-8 のスクリプトを別の文字コードとして読む',
      fix: 'スクリプトを UTF-8(BOM 付き)で保存し直す',
      sources: ['kit', 'training']
    },
    {
      id: 'ps-policy', category: 'PowerShell', basis: 'observed',
      symptom: '「このシステムではスクリプトの実行が無効になっている」と出て、スクリプトが動かない',
      cause: '実行ポリシーで止まっている',
      fix: 'powershell -NoProfile -ExecutionPolicy Bypass -File <スクリプト> の形で実行する(この1回だけの指定で、PC の設定は変えない)',
      sources: ['kit', 'training']
    },
    {
      id: 'csv-excel', category: '文字コード・Excel', basis: 'observed',
      symptom: 'Claude Code に作らせた CSV を Excel で開くと文字化けする',
      cause: 'CSV が BOM の無い UTF-8 で保存されている(別のツールで保存し直して BOM が消えた場合も同じ)',
      fix: '依頼に「UTF-8(BOM 付き)で保存」と書く。CLAUDE.md の「守ること」に入れておくと毎回書かずに済む',
      sources: ['training', 'usage']
    },
    {
      id: 'csv-python-bom', category: '文字コード・Excel', basis: 'observed',
      symptom: 'Python で読んだ CSV の1列目の名前が合わない(先頭に見えない文字が付く)',
      cause: 'ファイル先頭の BOM が、1列目の列名に \\ufeff として付いている',
      fix: 'encoding="utf-8-sig" で読むよう頼む',
      sources: ['training']
    },
    {
      id: 'wrong-folder', category: '使い方・研修', basis: 'observed',
      symptom: '「ファイルが見つからない」と言われる',
      cause: '作業するフォルダ以外で Claude Code を起動している',
      fix: 'cd で作業するフォルダに移ってから、起動し直す',
      sources: ['training']
    },
    {
      id: 'script-not-run', category: '使い方・研修', basis: 'observed',
      symptom: 'スクリプトを作ったのに実行されない',
      cause: '実行の許可が出ていない。または許可したコマンドの形と違う',
      fix: '確認画面で中身を読んで許可するか、利用者が自分で実行する',
      sources: ['training']
    },
    {
      id: 'different-answer', category: '使い方・研修', basis: 'observed',
      symptom: '同じ依頼なのに、隣の人と返答の文面が違う',
      cause: 'AI の返答は毎回同じではない',
      fix: '文面ではなく、件数・合計・元のファイルが変わっていないか、といった確かめられる条件で判定する',
      sources: ['training']
    },
    {
      id: 'ai-decided', category: '使い方・研修', basis: 'observed',
      symptom: '頼んでいない扱い(空欄の扱い、重複の扱いなど)を AI が勝手に決めている',
      cause: '依頼に書いていない点は AI が補う',
      fix: '依頼に「決めた扱いは一覧で報告する」と足す。CLAUDE.md の「守ること」に入れておく方法もある',
      sources: ['training']
    },
    {
      id: 'original-changed', category: '使い方・研修', basis: 'observed',
      symptom: '元のファイルが変わってしまった',
      cause: '依頼に「元は変更しない」が無かった。または確認画面で許可した',
      fix: '練習用フォルダなら作り直すか、退避したフォルダから戻す。依頼と CLAUDE.md に「元のファイルは変更しない」を入れる',
      sources: ['training']
    },
    {
      id: 'log-zero', category: '使用量', basis: 'observed',
      symptom: '使用量のログを集計すると0件になる。古い期間の記録が無い',
      cause: '期間の指定が違う、または記録が消えている。ローカルの記録は既定で30日たつと削除される(設定 cleanupPeriodDays)',
      fix: '期間の指定を外して、記録がある日を確かめる。月に1回、同じ手順で集計して結果を残しておく',
      sources: ['usage']
    },
    {
      id: 'usage-mismatch', category: '使用量', basis: 'observed',
      symptom: 'ログの集計結果が /usage の表示と合わない',
      cause: '/usage は今のセッションや直近の期間の表示で、集計した範囲と違う',
      fix: '期間とプロジェクトをそろえて比べる。どちらも請求額そのものではないことを前提にする',
      sources: ['usage']
    },
    {
      id: 'python-missing', category: '使用量', basis: 'observed',
      symptom: '集計スクリプトを動かすと「python が見つからない」と出る',
      cause: 'Python が入っていない、または PATH に無い',
      fix: 'py -3 で実行するか、Python をインストールする',
      sources: ['usage']
    }
  ];

  var BASIS_LABEL = {
    observed: '実機で起きた(2026-10, Claude Code 2.1.296)',
    docs: '公式ドキュメントの記載を確認(実機では未確認)',
    guide: '本・記事の確認手順'
  };

  /** 検索用に文字をそろえる(全角英数字を半角に、大文字を小文字に) */
  function norm(s) {
    var t = String(s == null ? '' : s);
    if (t.normalize) t = t.normalize('NFKC');
    return t.toLowerCase();
  }

  function haystack(row) {
    return norm([row.symptom, row.cause, row.fix, row.category].join(' '));
  }

  /**
   * キーワード(空白区切りはすべて含むもの)と分類で絞り込む。
   * filters: { query, category }。category が空なら全分類。
   */
  function filterRows(rows, filters) {
    var f = filters || {};
    var words = norm(f.query).split(/\s+/).filter(function (w) { return w !== ''; });
    var cat = f.category || '';
    return rows.filter(function (row) {
      if (cat && row.category !== cat) return false;
      if (!words.length) return true;
      var h = haystack(row);
      for (var i = 0; i < words.length; i++) {
        if (h.indexOf(words[i]) === -1) return false;
      }
      return true;
    });
  }

  return {
    SOURCES: SOURCES,
    CATEGORIES: CATEGORIES,
    ROWS: ROWS,
    BASIS_LABEL: BASIS_LABEL,
    norm: norm,
    filterRows: filterRows
  };
});
