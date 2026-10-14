/*
 * CLAUDE.md テンプレート生成の生成ロジック。
 * DOM に触らない純粋な関数だけを置く(ブラウザでも Node でも動く)。
 *
 * 書き方は、中小DXラボの記事「CLAUDE.mdは3行から始める」、Zenn の本の第2章・第5章、
 * 「情シスが配る Claude Code 社内標準セット」の CLAUDE.md ひな形にそろえる。
 * 行数の上限(200行)は、公式ドキュメント(memory、執筆時点 2026年10月)の目安による。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ClaudeMdGenerator = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_LINES = 200;
  var MAX_TEXT = 200;      // 1行の入力の文字数の上限
  var MAX_DIRS = 20;       // 触ってはいけないフォルダの数の上限

  // 「守ってほしいこと」の選択肢。text は CLAUDE.md にそのまま入る1行
  var RULES = [
    { id: 'noGuess', label: '元の資料に無いことは書かない([要確認] で残す)',
      text: '元の資料に書かれていないこと(日付・金額・人名・決定事項)は書かない。分からないところは `[要確認]` と書いて残す' },
    { id: 'keepOriginal', label: '元のファイルは変更せず、新しいファイルに保存する',
      text: '元のファイルは変更しない。結果は新しいファイルに保存する' },
    { id: 'confirmOverwrite', label: '消す・上書きする前に確認をとる',
      text: 'ファイルを消す・上書きする前に、対象のファイル名を示して確認をとる' },
    { id: 'noExternal', label: '社外への送信はしない(メール・アップロード・git push)',
      text: '社外への送信(メール・Web へのアップロード・`git push`)はしない' },
    { id: 'reportDecisions', label: '依頼に無い扱いを決めたら一覧で報告する',
      text: '依頼に書かれていない扱いを自分で決めたときは、決めた扱いを最後に一覧で報告する' },
    { id: 'verify', label: '完成したら、サンプルで結果が合うか確かめる',
      text: '完成したら、サンプルのデータで結果が合うかを確かめ、確かめた方法を報告する' },
    { id: 'csvBom', label: 'CSV は UTF-8(BOM 付き)で保存する(Excel で開くため)',
      text: 'CSV を作るときは UTF-8(BOM 付き)で保存する(Excel で開いたときに文字化けしないため)' },
    { id: 'dateFormat', label: '日付は yyyy/mm/dd 形式で書く',
      text: '日付は yyyy/mm/dd 形式で書く' },
    { id: 'readable', label: 'コードは短さより、他の人が読んで直せることを優先する',
      text: 'コードは「短さ」より「他の人が読んで直せること」を優先する' }
  ];

  var RULE_IDS = RULES.map(function (r) { return r.id; });

  var PURPOSES = {
    business: { heading: '# このフォルダについて', place: 'フォルダ' },
    dev: { heading: '# このリポジトリについて', place: 'リポジトリ' }
  };

  var LANGS = {
    ja: '日本語',
    en: '英語'
  };

  var STYLES = {
    desu: 'です・ます調',
    dearu: 'である調',
    none: ''
  };

  // 記事「CLAUDE.mdは3行から始める」の例
  var MINIMAL_EXAMPLE = {
    role: '私は中小企業の情シス担当で、社内の業務改善ツールを作っています',
    tools: 'よく使うのは Microsoft 365、Power Automate、Excel、Python です',
    priority: 'コードは「短さ」より「他の人が読んで直せること」を優先してください'
  };

  var DEFAULT_OPTIONS = {
    mode: 'full',            // 'minimal'(3行版) | 'full'
    purpose: 'business',     // 'business' | 'dev'
    role: MINIMAL_EXAMPLE.role,
    tools: MINIMAL_EXAMPLE.tools,
    priority: MINIMAL_EXAMPLE.priority,
    lang: 'ja',              // 'ja' | 'en'
    style: 'desu',           // 'desu' | 'dearu' | 'none'
    rules: ['noGuess', 'keepOriginal', 'confirmOverwrite', 'noExternal'],
    forbiddenDirs: 'data/raw',
    outputDir: 'output',
    includeHowToEdit: true
  };

  // 秘密情報らしき入力に注意を出すための簡単な目印(止めはしない)
  var SECRET_HINT = /(パスワード|password|passwd|api[ _-]?key|apikey|secret|token|トークン|sk-[A-Za-z0-9]{8,})/i;

  function merge(opts) {
    var o = {};
    var k;
    for (k in DEFAULT_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_OPTIONS, k)) {
        o[k] = Array.isArray(DEFAULT_OPTIONS[k]) ? DEFAULT_OPTIONS[k].slice() : DEFAULT_OPTIONS[k];
      }
    }
    if (opts) { for (k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k) && opts[k] !== undefined) o[k] = opts[k]; } }
    return o;
  }

  /** 1行の入力を整える(改行・タブは空白に、前後の空白と先頭の箇条書き記号を取る) */
  function oneLine(s) {
    var t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    t = t.replace(/^[-*・]\s*/, '');
    return t;
  }

  /**
   * フォルダのパスを、作業フォルダからの相対パス(区切りは /)にそろえる。
   * 戻り値: { ok: true, path } または { ok: false, error }
   */
  function normalizeDir(input) {
    var s = String(input == null ? '' : input).trim();
    s = s.replace(/\\/g, '/');
    while (s.indexOf('./') === 0) s = s.slice(2);
    s = s.replace(/\/+/g, '/').replace(/\/+$/, '');
    if (s.slice(-3) === '/**') s = s.slice(0, -3);
    if (s === '' || s === '.') return { ok: false, error: 'フォルダのパスが空です。' };
    if (/^[A-Za-z]:/.test(s) || s.charAt(0) === '/' || s.charAt(0) === '~') {
      return { ok: false, error: '「' + s + '」: 作業フォルダからの相対パスで入力してください(例: data/raw)。' };
    }
    if (/[()"*?\[\]{}!<>|`$]/.test(s) || /[\u0000-\u001f]/.test(s)) {
      return { ok: false, error: '「' + s + '」: 使えない記号が含まれています。( ) " * ? [ ] { } ! < > | ` $ は使えません。' };
    }
    var parts = s.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '..' || parts[i] === '.') return { ok: false, error: '「' + s + '」: 「..」や「.」を含むパスは扱いません。' };
      if (parts[i].trim() !== parts[i]) return { ok: false, error: '「' + s + '」: フォルダ名の前後に空白があります。' };
    }
    return { ok: true, path: s };
  }

  /** 改行・カンマ・読点区切りのフォルダ一覧を配列にする(空行は無視、重複は1つに) */
  function parseDirList(text) {
    var raw = String(text == null ? '' : text).split(/[\r\n,、]+/);
    var dirs = [];
    var errors = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].trim() === '') continue;
      var r = normalizeDir(raw[i]);
      if (!r.ok) { errors.push(r.error); continue; }
      if (dirs.indexOf(r.path) === -1) dirs.push(r.path);
    }
    return { dirs: dirs, errors: errors };
  }

  function countLines(text) {
    if (text === '') return 0;
    var n = text.split('\n').length;
    // 最後の改行のあとの空の行は数えない
    if (text.charAt(text.length - 1) === '\n') n--;
    return n;
  }

  /**
   * 選んだ内容から CLAUDE.md を組み立てる。
   * 戻り値: { markdown, lineCount, maxLines, warnings: [], errors: [], dirs: [] }
   */
  function buildClaudeMd(options) {
    var o = merge(options);
    var errors = [];
    var warnings = [];
    var lines = [];

    if (o.mode !== 'minimal' && o.mode !== 'full') errors.push('版の指定が正しくありません。');
    if (!PURPOSES[o.purpose]) errors.push('用途の指定が正しくありません。');
    if (!Object.prototype.hasOwnProperty.call(LANGS, o.lang)) errors.push('言語の指定が正しくありません。');
    if (!Object.prototype.hasOwnProperty.call(STYLES, o.style)) errors.push('文体の指定が正しくありません。');

    var role = oneLine(o.role);
    var tools = oneLine(o.tools);
    var priority = oneLine(o.priority);
    [['立場', role], ['よく使う道具', tools], ['優先順位', priority]].forEach(function (p) {
      if (p[1].length > MAX_TEXT) errors.push(p[0] + 'は ' + MAX_TEXT + ' 文字以内にしてください。');
    });
    if (SECRET_HINT.test(role + ' ' + tools + ' ' + priority)) {
      warnings.push('パスワード・API キー・トークンらしき言葉があります。CLAUDE.md は共有されることが多いので、秘密情報は書かないでください。');
    }

    var ruleSel = Array.isArray(o.rules) ? o.rules : [];
    for (var r = 0; r < ruleSel.length; r++) {
      if (RULE_IDS.indexOf(ruleSel[r]) === -1) errors.push('守ってほしいことの選択肢が正しくありません: ' + ruleSel[r]);
    }

    var dirList = parseDirList(o.forbiddenDirs);
    errors = errors.concat(dirList.errors);
    if (dirList.dirs.length > MAX_DIRS) errors.push('触ってはいけないフォルダは ' + MAX_DIRS + ' 個までにしてください。');

    var outputDir = '';
    if (String(o.outputDir == null ? '' : o.outputDir).trim() !== '') {
      var od = normalizeDir(o.outputDir);
      if (od.ok) outputDir = od.path;
      else errors.push('出力の置き場所: ' + od.error);
      if (od.ok && dirList.dirs.indexOf(od.path) !== -1) errors.push('出力の置き場所が、触ってはいけないフォルダにも入っています。');
    }

    if (errors.length) {
      return { markdown: '', lineCount: 0, maxLines: MAX_LINES, warnings: warnings, errors: errors, dirs: dirList.dirs };
    }

    var P = PURPOSES[o.purpose];

    if (o.mode === 'minimal') {
      lines.push('# 業務環境メモ', '');
      lines.push('- ' + (role || '(自分の立場: 何のために使うか)'));
      lines.push('- ' + (tools || '(よく触る道具)'));
      lines.push('- ' + (priority || '(判断に迷ったときの優先順位)'));
      if (!role || !tools || !priority) warnings.push('空欄の項目は ( ) の仮の文で出力しています。自分の言葉に書き換えてください。');
    } else {
      lines.push(P.heading, '');
      lines.push('- ' + (role || '(自分の立場: 何のために使うか)'));
      lines.push('- ' + (tools || '(よく触る道具)'));
      lines.push('- ' + (priority || '(判断に迷ったときの優先順位)'));
      if (!role || !tools || !priority) warnings.push('空欄の項目は ( ) の仮の文で出力しています。自分の言葉に書き換えてください。');

      if (outputDir || dirList.dirs.length) {
        lines.push('', '## フォルダの使い方', '');
        if (outputDir) lines.push('- `' + outputDir + '/`: Claude Code が作ったファイルの置き場所。確認するまで社内に配らない');
        dirList.dirs.forEach(function (d) {
          lines.push('- `' + d + '/`: Claude Code からは読まない・書かない(`.claude/settings.json` で禁止する)');
        });
      }

      lines.push('', '## 守ること', '');
      var langStyle = '返答と作るファイルは' + LANGS[o.lang] + (STYLES[o.style] ? '、' + STYLES[o.style] : '') + 'で書く';
      lines.push('- ' + langStyle);
      RULES.forEach(function (rule) {
        if (ruleSel.indexOf(rule.id) !== -1) lines.push('- ' + rule.text);
      });
      if (dirList.dirs.length) {
        var list = dirList.dirs.map(function (d) { return '`' + d + '/`'; }).join('、');
        lines.push('- ' + list + ' の中身を読もうとしない。必要なら利用者にスクリプトの実行を頼む');
      }

      if (o.includeHowToEdit) {
        lines.push('', '## このファイルの直し方', '');
        lines.push('- 同じ説明を2回したら1行足す。同じ話題の行があれば、足さずに書き換える');
        lines.push('- 禁止したいことは、ここではなく `.claude/settings.json` に書く');
        lines.push('- ' + MAX_LINES + '行以内に保つ。パスワード・API キー・個人情報・顧客名は書かない');
      }
    }

    var markdown = lines.join('\n') + '\n';
    var lineCount = countLines(markdown);
    if (lineCount > MAX_LINES) {
      errors.push(lineCount + ' 行になりました。' + MAX_LINES + ' 行以内に収まるよう、項目を減らしてください。');
      return { markdown: '', lineCount: lineCount, maxLines: MAX_LINES, warnings: warnings, errors: errors, dirs: dirList.dirs };
    }
    if (o.mode === 'full' && dirList.dirs.length) {
      warnings.push('CLAUDE.md の「読まない」はお願いで、止める仕組みではありません。同じフォルダを settings.json の deny にも入れてください。');
    }
    return { markdown: markdown, lineCount: lineCount, maxLines: MAX_LINES, warnings: warnings, errors: errors, dirs: dirList.dirs };
  }

  return {
    MAX_LINES: MAX_LINES,
    MAX_DIRS: MAX_DIRS,
    MAX_TEXT: MAX_TEXT,
    RULES: RULES,
    MINIMAL_EXAMPLE: MINIMAL_EXAMPLE,
    DEFAULT_OPTIONS: merge(null),
    normalizeDir: normalizeDir,
    parseDirList: parseDirList,
    countLines: countLines,
    buildClaudeMd: buildClaudeMd
  };
});
