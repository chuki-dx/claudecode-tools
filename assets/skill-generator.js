/*
 * Claude Code スキル(SKILL.md)雛形生成の生成ロジック。
 * DOM に触らない純粋な関数だけを置く(ブラウザでも Node でも動く)。
 *
 * frontmatter は name と description の2項目だけにする。これは「情シスが配る Claude Code 社内標準セット」
 * で、Claude Code 2.1.296 が5本とも読み込んだ(claude plugin validate も通った)形と同じ。
 * 公式ドキュメント(skills、執筆時点 2026年10月)では、項目はすべて省略可能で、description は推奨、
 * description と when_to_use は合わせて 1,536 文字で切られる、とされている。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SkillGenerator = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var NAME_MAX = 64;
  var DESC_MAX = 1536;
  var MAX_ITEMS = 30;      // 手順・禁止事項の行数の上限
  var MAX_OUTPUT_LINES = 80;
  // 公式ドキュメントで予約されている名前(大文字小文字を区別しない)
  var RESERVED = ['synced', 'anthropic-skills'];

  var LOCATIONS = {
    project: { label: 'このフォルダだけ', dir: '.claude/skills/' },
    user: { label: '自分の全プロジェクト', dir: '~/.claude/skills/' }
  };

  // 社内標準セットの5本のうち3本を、短くしたもの(全文は有料記事)
  var PRESETS = {
    'minutes-summary': {
      label: '議事録の要約',
      name: 'minutes-summary',
      title: '議事録の要約',
      description: '会議の文字起こしやメモから、決定事項・ToDo・保留事項をまとめた議事録の要約を作る。',
      whenToUse: '議事録の要約、会議のまとめ、決まったことの整理を頼まれたとき',
      steps: '要約する元の文章を確かめる。無ければ、どのファイルかを聞く\n決定事項・ToDo・保留事項に分けて要約する',
      output: '# 議事録の要約: <会議名>(<開催日>)\n\n## 決定事項\n- \n\n## ToDo\n| 内容 | 担当 | 期限 |\n|---|---|---|\n\n## 保留事項\n- ',
      prohibitions: '合意した発言が無いものを決定事項に入れない。迷ったら保留事項に入れる\n文字起こしに無い日付・金額・人名を補わない'
    },
    'inquiry-reply-draft': {
      label: '問い合わせ回答の下書き',
      name: 'inquiry-reply-draft',
      title: '社内問い合わせへの回答の下書き',
      description: '社内からの問い合わせ(PC・アカウント・社内システムの使い方など)への回答の下書きを作る。',
      whenToUse: '問い合わせへの返信、回答文の作成を頼まれたとき',
      steps: '問い合わせの内容と、分からない点を整理する\n回答の下書きと、担当者への確認事項を分けて書く',
      output: '## 回答の下書き\n\n## 担当者への確認事項\n- ',
      prohibitions: 'パスワードや認証コードは受け取らない・聞かない\n根拠の無い手順を言い切らない。分からない点は確認事項に回す'
    },
    'weekly-report-draft': {
      label: '週報のたたき台',
      name: 'weekly-report-draft',
      title: '週報のたたき台',
      description: '日々のメモから週報のたたき台を作る。',
      whenToUse: '週報、今週のまとめ、来週の予定の整理を頼まれたとき',
      steps: 'その週のメモを日付順に読む\nやったこと・来週の予定・課題に分けてまとめる',
      output: '# 週報: YYYY年M月D日〜M月D日\n\n## 今週やったこと\n- \n\n## 来週の予定\n- \n\n## 課題・相談\n- ',
      prohibitions: 'メモに無い成果や数字を書き足さない'
    }
  };

  var DEFAULT_OPTIONS = {
    name: '',
    title: '',
    description: '',
    whenToUse: '',
    steps: '',
    output: '',
    prohibitions: '',
    location: 'project'     // 'project' | 'user'
  };

  function merge(opts) {
    var o = {};
    var k;
    for (k in DEFAULT_OPTIONS) { if (Object.prototype.hasOwnProperty.call(DEFAULT_OPTIONS, k)) o[k] = DEFAULT_OPTIONS[k]; }
    if (opts) { for (k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k) && opts[k] !== undefined) o[k] = opts[k]; } }
    return o;
  }

  function oneLine(s) {
    return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  /** 入力をスキル名の形(英小文字・数字・ハイフン)に寄せる。全角英数字は半角にする */
  function suggestName(input) {
    var s = String(input == null ? '' : input);
    if (s.normalize) s = s.normalize('NFKC');
    s = s.toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX).replace(/-+$/, '');
    return s;
  }

  /** スキル名を確かめる。戻り値: { ok: true, name } または { ok: false, error, suggestion } */
  function validateName(input) {
    var s = String(input == null ? '' : input).trim();
    if (s === '') return { ok: false, error: 'スキル名を入力してください(例: minutes-summary)。', suggestion: '' };
    var lower = s.toLowerCase();
    for (var i = 0; i < RESERVED.length; i++) {
      if (lower === RESERVED[i] || lower.indexOf(RESERVED[i] + ':') === 0) {
        return { ok: false, error: '「' + s + '」は Claude Code が予約している名前のため使えません。', suggestion: '' };
      }
    }
    if (s.length > NAME_MAX) return { ok: false, error: 'スキル名は ' + NAME_MAX + ' 文字以内にしてください。', suggestion: suggestName(s) };
    if (!NAME_RE.test(s)) {
      var sug = suggestName(s);
      return {
        ok: false,
        error: 'スキル名は英小文字・数字と、間をつなぐハイフン(-)だけで書いてください(例: minutes-summary)。' + (sug ? '' : '日本語だけの名前は使えません。'),
        suggestion: sug && NAME_RE.test(sug) ? sug : ''
      };
    }
    return { ok: true, name: s };
  }

  /**
   * YAML の1行の値として安全に書く。そのままで読める場合は引用符を付けない
   * (社内標準セットと同じ見た目)。「: 」や「 #」など、YAML で意味を持つ書き方を含む場合は
   * ダブルクォートで囲み、\ と " をエスケープする。
   */
  function yamlScalar(value) {
    var s = oneLine(value);
    var needsQuote =
      s === '' ||
      /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) ||
      /:\s/.test(s) || /:$/.test(s) ||
      /\s#/.test(s) ||
      /^(true|false|yes|no|on|off|null|~)$/i.test(s) ||
      /^[-+]?(\d[\d_]*)?(\.\d+)?([eE][-+]?\d+)?$/.test(s) ||
      /^0x[0-9a-f]+$/i.test(s) ||
      /[\u0000-\u001f\u007f]/.test(s);
    if (!needsQuote) return s;
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  /** 改行区切りの入力を行の配列にする(空行と、先頭の番号・箇条書き記号は取る) */
  function parseItems(text) {
    return String(text == null ? '' : text).split(/\r?\n/).map(function (l) {
      return l.replace(/^\s*(?:[-*・]|\d+[.)．、]|[①-⑳])\s*/, '').replace(/\t/g, ' ').trim();
    }).filter(function (l) { return l !== ''; });
  }

  /** 説明文といつ使うかを、社内標準セットと同じ「〜。〜ときに使う。」の1文にまとめる */
  function composeDescription(description, whenToUse) {
    var d = oneLine(description);
    var w = oneLine(whenToUse);
    if (d && !/[。.!?！？]$/.test(d)) d += '。';
    if (w) {
      w = w.replace(/[。.]$/, '');
      if (!/(使う|使います)$/.test(w)) {
        if (/(とき|時|場合)$/.test(w)) w += 'に使う';
        else if (/[たるいう]$/.test(w)) w += 'ときに使う';   // 「頼まれた」「作る」など
        else w += 'のときに使う';                           // 「週報の整理」など
      }
      w += '。';
    }
    return d + w;
  }

  function fenceFor(text) {
    var fence = '~~~';
    while (text.indexOf(fence) !== -1) fence += '~';
    return fence;
  }

  /**
   * 入力から SKILL.md を組み立てる。
   * 戻り値: { markdown, path, folder, name, description, warnings: [], errors: [] }
   */
  function buildSkill(options) {
    var o = merge(options);
    var errors = [];
    var warnings = [];

    var nv = validateName(o.name);
    if (!nv.ok) errors.push(nv.error + (nv.suggestion ? '候補: ' + nv.suggestion : ''));
    if (!LOCATIONS[o.location]) errors.push('置き場所の指定が正しくありません。');

    var description = composeDescription(o.description, o.whenToUse);
    if (!oneLine(o.description)) errors.push('説明(description)を入力してください。Claude はこの文を読んで、いつスキルを使うかを決めます。');
    if (description.length > DESC_MAX) errors.push('説明といつ使うかは、合わせて ' + DESC_MAX + ' 文字以内にしてください(今は ' + description.length + ' 文字)。');
    if (!oneLine(o.whenToUse)) warnings.push('「いつ使うか」が空です。利用者がふだん使う言葉(例: 議事録の要約を頼まれたとき)を書くと、自動で使われやすくなります。');

    var steps = parseItems(o.steps);
    var prohibitions = parseItems(o.prohibitions);
    if (steps.length > MAX_ITEMS) errors.push('手順は ' + MAX_ITEMS + ' 行以内にしてください。');
    if (prohibitions.length > MAX_ITEMS) errors.push('禁止事項は ' + MAX_ITEMS + ' 行以内にしてください。');
    var outputText = String(o.output == null ? '' : o.output).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    if (outputText.split('\n').length > MAX_OUTPUT_LINES) errors.push('出力の形は ' + MAX_OUTPUT_LINES + ' 行以内にしてください。');
    if (!steps.length) warnings.push('手順が空です。番号付きの手順があると、毎回同じ進め方になりやすくなります。');

    var title = oneLine(o.title) || oneLine(o.description).replace(/[。.]$/, '').slice(0, 40) || (nv.ok ? nv.name : '');

    if (errors.length) {
      return { markdown: '', path: '', folder: '', name: nv.ok ? nv.name : '', description: description, warnings: warnings, errors: errors };
    }

    var name = nv.name;
    var lines = ['---', 'name: ' + name, 'description: ' + yamlScalar(description), '---', ''];
    lines.push('# ' + title, '');
    lines.push('依頼の内容を確かめ、下の手順と出力の形で進めます。', '');
    if (steps.length) {
      lines.push('## 進め方', '');
      steps.forEach(function (s, i) { lines.push((i + 1) + '. ' + s); });
      lines.push('');
    }
    if (prohibitions.length) {
      lines.push('## してはいけないこと', '');
      prohibitions.forEach(function (s) { lines.push('- ' + s); });
      lines.push('');
    }
    if (outputText.trim() !== '') {
      var fence = fenceFor(outputText);
      lines.push('## 出力の形', '');
      lines.push(fence + 'markdown');
      outputText.split('\n').forEach(function (l) { lines.push(l); });
      lines.push(fence, '');
    }
    var markdown = lines.join('\n').replace(/\n+$/, '') + '\n';
    var folder = LOCATIONS[o.location].dir + name + '/';
    return {
      markdown: markdown,
      path: folder + 'SKILL.md',
      folder: folder,
      name: name,
      description: description,
      warnings: warnings,
      errors: errors
    };
  }

  return {
    NAME_RE: NAME_RE,
    NAME_MAX: NAME_MAX,
    DESC_MAX: DESC_MAX,
    RESERVED: RESERVED,
    LOCATIONS: LOCATIONS,
    PRESETS: PRESETS,
    DEFAULT_OPTIONS: merge(null),
    suggestName: suggestName,
    validateName: validateName,
    yamlScalar: yamlScalar,
    parseItems: parseItems,
    composeDescription: composeDescription,
    buildSkill: buildSkill
  };
});
