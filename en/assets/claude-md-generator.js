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
    { id: 'noGuess', label: 'Don\'t write anything that isn\'t in the source material (leave it marked [needs confirmation])',
      text: 'Do not write anything that is not in the source material (dates, amounts, names, decisions). Where something is unclear, leave it marked as `[needs confirmation]`' },
    { id: 'keepOriginal', label: 'Do not modify the original file; save to a new file',
      text: 'Do not modify the original file. Save the result to a new file' },
    { id: 'confirmOverwrite', label: 'Ask for confirmation before deleting or overwriting',
      text: 'Before deleting or overwriting a file, name the target file and ask for confirmation' },
    { id: 'noExternal', label: 'Do not send anything outside the company (email, uploads, git push)',
      text: 'Do not send anything outside the company (email, web uploads, `git push`)' },
    { id: 'reportDecisions', label: 'Report any handling decisions not covered by the request in a list',
      text: 'If you decide on your own how to handle something the request didn\'t specify, list the handling you chose in a report at the end' },
    { id: 'verify', label: 'When finished, check that the results match using a sample',
      text: 'When finished, check that the results match using sample data, and report how you checked' },
    { id: 'csvBom', label: 'Save CSV files as UTF-8 with BOM (so they open correctly in Excel)',
      text: 'When creating a CSV, save it as UTF-8 (with BOM) so the text doesn\'t get garbled when opened in Excel' },
    { id: 'dateFormat', label: 'Write dates in yyyy/mm/dd format',
      text: 'Write dates in yyyy/mm/dd format' },
    { id: 'readable', label: 'Prioritize code that other people can read and fix over brevity',
      text: 'For code, prioritize being readable and fixable by others over being short' }
  ];

  var RULE_IDS = RULES.map(function (r) { return r.id; });

  var PURPOSES = {
    business: { heading: '# About this folder', place: 'Folder' },
    dev: { heading: '# About this repository', place: 'Repository' }
  };

  var LANGS = {
    ja: 'Japanese',
    en: 'English'
  };

  var STYLES = {
    desu: 'Polite (desu/masu) style',
    dearu: 'Plain (da/dearu) style',
    none: ''
  };

  // 記事「CLAUDE.mdは3行から始める」の例
  var MINIMAL_EXAMPLE = {
    role: 'I work as corporate IT at a small company, building internal tools to improve how we work',
    tools: 'I mostly use Microsoft 365, Power Automate, Excel, and Python',
    priority: 'Prioritize code that other people can read and fix over code that is short'
  };

  var DEFAULT_OPTIONS = {
    mode: 'full',            // 'minimal'(3行版) | 'full'
    purpose: 'business',     // 'business' | 'dev'
    role: MINIMAL_EXAMPLE.role,
    tools: MINIMAL_EXAMPLE.tools,
    priority: MINIMAL_EXAMPLE.priority,
    lang: 'en',              // 'ja' | 'en'
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
    if (s === '' || s === '.') return { ok: false, error: 'The folder path is empty.' };
    if (/^[A-Za-z]:/.test(s) || s.charAt(0) === '/' || s.charAt(0) === '~') {
      return { ok: false, error: '"' + s + '": Enter a path relative to the working folder (e.g., data/raw).' };
    }
    if (/[()"*?\[\]{}!<>|`$]/.test(s) || /[\u0000-\u001f]/.test(s)) {
      return { ok: false, error: '"' + s + '": It contains characters that can\'t be used. ( ) \" * ? [ ] { } ! < > | ` $ are not allowed.' };
    }
    var parts = s.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '..' || parts[i] === '.') return { ok: false, error: '"' + s + '": Paths containing ".." or "." are not supported.' };
      if (parts[i].trim() !== parts[i]) return { ok: false, error: '"' + s + '": The folder name has spaces before or after it.' };
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

    if (o.mode !== 'minimal' && o.mode !== 'full') errors.push('The version specified is not valid.');
    if (!PURPOSES[o.purpose]) errors.push('The specified purpose is not valid.');
    if (!Object.prototype.hasOwnProperty.call(LANGS, o.lang)) errors.push('The language specification is not valid.');
    if (!Object.prototype.hasOwnProperty.call(STYLES, o.style)) errors.push('The writing style setting is invalid.');

    var role = oneLine(o.role);
    var tools = oneLine(o.tools);
    var priority = oneLine(o.priority);
    [['Role', role], ['Frequently used tools', tools], ['Priority', priority]].forEach(function (p) {
      if (p[1].length > MAX_TEXT) errors.push(p[0] + ' must be ' + MAX_TEXT + ' characters or fewer.');
    });
    if (SECRET_HINT.test(role + ' ' + tools + ' ' + priority)) {
      warnings.push('The text contains words that look like a password, API key, or token. CLAUDE.md is often shared, so don\'t write secrets in it.');
    }

    var ruleSel = Array.isArray(o.rules) ? o.rules : [];
    for (var r = 0; r < ruleSel.length; r++) {
      if (RULE_IDS.indexOf(ruleSel[r]) === -1) errors.push('Invalid option for rules to follow: ' + ruleSel[r]);
    }

    var dirList = parseDirList(o.forbiddenDirs);
    errors = errors.concat(dirList.errors);
    if (dirList.dirs.length > MAX_DIRS) errors.push('Folders that must not be touched: at most ' + MAX_DIRS + ' entries.');

    var outputDir = '';
    if (String(o.outputDir == null ? '' : o.outputDir).trim() !== '') {
      var od = normalizeDir(o.outputDir);
      if (od.ok) outputDir = od.path;
      else errors.push('Output location: ' + od.error);
      if (od.ok && dirList.dirs.indexOf(od.path) !== -1) errors.push('The output location also includes folders that must not be touched.');
    }

    if (errors.length) {
      return { markdown: '', lineCount: 0, maxLines: MAX_LINES, warnings: warnings, errors: errors, dirs: dirList.dirs };
    }

    var P = PURPOSES[o.purpose];

    if (o.mode === 'minimal') {
      lines.push('# Work Environment Notes', '');
      lines.push('- ' + (role || '(Your role: what you use it for)'));
      lines.push('- ' + (tools || '(tools you use often)'));
      lines.push('- ' + (priority || '(Priority order when in doubt)'));
      if (!role || !tools || !priority) warnings.push('Blank fields are output as ( ) placeholder text. Rewrite them in your own words.');
    } else {
      lines.push(P.heading, '');
      lines.push('- ' + (role || '(Your role: what you use it for)'));
      lines.push('- ' + (tools || '(tools you use often)'));
      lines.push('- ' + (priority || '(Priority order when in doubt)'));
      if (!role || !tools || !priority) warnings.push('Blank fields are output as ( ) placeholder text. Rewrite them in your own words.');

      if (outputDir || dirList.dirs.length) {
        lines.push('', '## How to use this folder', '');
        if (outputDir) lines.push('- `' + outputDir + '/`: where files created by Claude Code are placed. Do not distribute them within the company until you have checked them');
        dirList.dirs.forEach(function (d) {
          lines.push('- `' + d + '/`: Claude Code must not read or write it (block it in `.claude/settings.json`)');
        });
      }

      lines.push('', '## Rules to follow', '');
      var langStyle = 'Write replies and generated files in ' + LANGS[o.lang] + (STYLES[o.style] ? ', ' + STYLES[o.style] : '') + '';
      lines.push('- ' + langStyle);
      RULES.forEach(function (rule) {
        if (ruleSel.indexOf(rule.id) !== -1) lines.push('- ' + rule.text);
      });
      if (dirList.dirs.length) {
        var list = dirList.dirs.map(function (d) { return '`' + d + '/`'; }).join(', ');
        lines.push('- ' + list + ': do not try to read their contents. If needed, ask the user to run a script instead');
      }

      if (o.includeHowToEdit) {
        lines.push('', '## How to fix this file', '');
        lines.push('- If you explain the same thing twice, add one line. If a line on the same topic already exists, rewrite it instead of adding one');
        lines.push('- Write what you want to prohibit in `.claude/settings.json`, not here');
        lines.push('- ' + MAX_LINES + ' lines or fewer. Do not include passwords, API keys, personal information, or customer names');
      }
    }

    var markdown = lines.join('\n') + '\n';
    var lineCount = countLines(markdown);
    if (lineCount > MAX_LINES) {
      errors.push(lineCount + ' lines now; keep it to ' + MAX_LINES + ' lines or fewer by removing items.');
      return { markdown: '', lineCount: lineCount, maxLines: MAX_LINES, warnings: warnings, errors: errors, dirs: dirList.dirs };
    }
    if (o.mode === 'full' && dirList.dirs.length) {
      warnings.push('"Do not read" in CLAUDE.md is a request, not a mechanism that blocks access. Also add the same folder to deny in settings.json.');
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
