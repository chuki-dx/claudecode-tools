/*
 * Claude Code 権限設定(settings.json)ジェネレーターの生成ロジック。
 * DOM に触らない純粋な関数だけを置く(ブラウザでも Node でも動く)。
 *
 * ルールの書き方は、中小DXラボの検証記事(2026-10、Claude Code 2.1.296、Windows 11)に
 * 載せたものだけを使う。verified: true は、その検証で「止まった」と確認したルール。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SettingsGenerator = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERIFIED_LABEL = '実機確認済み 2026-10, Claude Code 2.1.296';
  var SCHEMA_URL = 'https://json.schemastore.org/claude-code-settings.json';
  var DEFAULT_DATA_PATH = 'data/raw';

  // 検証記事に載せたルールと、確認の状況
  var CATALOG = {
    'Read(./.env)': { verified: true, note: 'Read ツールで .env を読む / Bash で cat .env、の両方が止まった' },
    'Read(./.env.*)': { verified: false, note: '' },
    'Read(./secrets/**)': { verified: false, note: '' },
    'Read(./data/raw/**)': { verified: true, note: 'Read ツールで data/raw/ の CSV を読むのが止まった' },
    'Bash(curl *)': { verified: true, note: 'Bash で curl https://example.com が止まった' },
    'Bash(wget *)': { verified: false, note: '' },
    'Bash(git push *)': { verified: false, note: '' },
    'PowerShell(Invoke-WebRequest *)': { verified: true, note: 'PowerShell ツールで Invoke-WebRequest が止まった' },
    'PowerShell(Invoke-RestMethod *)': { verified: false, note: '' },
    'Bash(rm *)': { verified: false, note: '' },
    'PowerShell(Remove-Item *)': { verified: false, note: '' },
    'WebFetch': { verified: false, note: '' },
    'WebSearch': { verified: false, note: '' },
    'Bash(git status)': { verified: false, note: 'allow はプロジェクトの信頼の確認を承認するまで使われない' },
    'Bash(git diff *)': { verified: false, note: 'allow はプロジェクトの信頼の確認を承認するまで使われない' },
    'Bash(git log *)': { verified: false, note: 'allow はプロジェクトの信頼の確認を承認するまで使われない' }
  };

  var DEFAULT_OPTIONS = {
    includeSchema: true,
    shells: 'both',          // 'bash' | 'powershell' | 'both'
    blockEnv: true,          // Read(./.env), Read(./.env.*)
    blockSecretsDir: true,   // Read(./secrets/**)
    blockNetwork: true,      // curl / wget / Invoke-WebRequest / Invoke-RestMethod
    gitPush: 'ask',          // 'deny' | 'ask' | 'none'
    blockDataDir: true,
    dataPath: DEFAULT_DATA_PATH,
    askDelete: true,         // Bash(rm *) / PowerShell(Remove-Item *)
    askWeb: true,            // WebFetch / WebSearch
    allowGitRead: false      // Bash(git status) / Bash(git diff *) / Bash(git log *)
  };

  function merge(opts) {
    var o = {};
    var k;
    for (k in DEFAULT_OPTIONS) { if (Object.prototype.hasOwnProperty.call(DEFAULT_OPTIONS, k)) o[k] = DEFAULT_OPTIONS[k]; }
    if (opts) { for (k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k) && opts[k] !== undefined) o[k] = opts[k]; } }
    return o;
  }

  /**
   * 実データフォルダのパスを、作業フォルダからの相対パス(区切りは /)にそろえる。
   * 戻り値: { ok: true, path } または { ok: false, error }
   */
  function normalizeDataPath(input) {
    var s = String(input == null ? '' : input).trim();
    s = s.replace(/\\/g, '/');
    while (s.indexOf('./') === 0) s = s.slice(2);
    s = s.replace(/\/+/g, '/').replace(/\/+$/, '');
    if (s.slice(-3) === '/**') s = s.slice(0, -3);
    if (s === '' || s === '.') return { ok: false, error: 'フォルダのパスを入力してください(例: data/raw)。' };
    if (/^[A-Za-z]:/.test(s) || s.charAt(0) === '/' || s.charAt(0) === '~') {
      return { ok: false, error: '作業フォルダからの相対パスで入力してください(例: data/raw)。ドライブ名や / から始まるパスはこのツールでは扱いません。' };
    }
    if (/[()"*?\[\]{}!<>|`$]/.test(s) || /[\u0000-\u001f]/.test(s)) {
      return { ok: false, error: '使えない記号が含まれています。( ) " * ? [ ] { } ! < > | ` $ は使えません。' };
    }
    var parts = s.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '..' || parts[i] === '.') return { ok: false, error: '「..」や「.」を含むパスは扱いません。' };
      if (parts[i].trim() !== parts[i]) return { ok: false, error: 'フォルダ名の前後に空白があります。' };
    }
    return { ok: true, path: s };
  }

  /**
   * 選んだ方針から settings.json を組み立てる。
   * 戻り値: { settings, json, rules: [{ list, rule, verified, status, note }], warnings: [], errors: [] }
   */
  function buildSettings(options) {
    var o = merge(options);
    var useBash = o.shells === 'bash' || o.shells === 'both';
    var usePs = o.shells === 'powershell' || o.shells === 'both';
    var lists = { deny: [], ask: [], allow: [] };
    var meta = [];
    var warnings = [];
    var errors = [];

    function add(list, rule, override) {
      if (lists[list].indexOf(rule) !== -1) return;
      lists[list].push(rule);
      var c = CATALOG[rule] || { verified: false, note: '' };
      var m = { list: list, rule: rule, verified: !!c.verified, note: c.note, status: c.verified ? VERIFIED_LABEL : '個別には未確認' };
      if (override) { for (var k in override) { if (Object.prototype.hasOwnProperty.call(override, k)) m[k] = override[k]; } }
      meta.push(m);
    }

    if (o.shells !== 'bash' && o.shells !== 'powershell' && o.shells !== 'both') {
      errors.push('シェルの指定が正しくありません。');
    }

    if (o.blockEnv) {
      add('deny', 'Read(./.env)');
      add('deny', 'Read(./.env.*)');
    }
    if (o.blockSecretsDir) add('deny', 'Read(./secrets/**)');

    if (o.blockDataDir) {
      var p = normalizeDataPath(o.dataPath);
      if (!p.ok) {
        errors.push(p.error);
      } else if (p.path === DEFAULT_DATA_PATH) {
        add('deny', 'Read(./data/raw/**)');
      } else {
        add('deny', 'Read(./' + p.path + '/**)', {
          verified: false,
          status: '書き方は Read(./data/raw/**) で確認・このパスは未確認',
          note: '同じ書き方の Read(./data/raw/**) で止まることを確認'
        });
      }
    }

    if (o.blockNetwork) {
      if (useBash) { add('deny', 'Bash(curl *)'); add('deny', 'Bash(wget *)'); }
      if (usePs) { add('deny', 'PowerShell(Invoke-WebRequest *)'); add('deny', 'PowerShell(Invoke-RestMethod *)'); }
    }

    if (o.gitPush === 'deny' || o.gitPush === 'ask') {
      add(o.gitPush, 'Bash(git push *)');
      if (!useBash) warnings.push('git push のルールは Bash の書き方(Bash(git push *))だけを載せています。PowerShell ツール向けの書き方は検証記事で扱っていません。');
    } else if (o.gitPush !== 'none') {
      errors.push('git push の指定が正しくありません。');
    }

    if (o.askDelete) {
      if (useBash) add('ask', 'Bash(rm *)');
      if (usePs) add('ask', 'PowerShell(Remove-Item *)');
    }
    if (o.askWeb) { add('ask', 'WebFetch'); add('ask', 'WebSearch'); }

    if (o.allowGitRead) {
      add('allow', 'Bash(git status)');
      add('allow', 'Bash(git diff *)');
      add('allow', 'Bash(git log *)');
      warnings.push('allow のルールは、そのフォルダで一度 claude を対話の画面で起動し、信頼の確認を承認するまで使われません(deny と ask は承認と関係なく効きます)。');
    }

    var permissions = {};
    ['deny', 'ask', 'allow'].forEach(function (k) { if (lists[k].length) permissions[k] = lists[k].slice(); });
    if (!meta.length) warnings.push('ルールが1つも選ばれていません。');

    var settings = {};
    if (o.includeSchema) settings.$schema = SCHEMA_URL;
    settings.permissions = permissions;

    return {
      settings: settings,
      json: JSON.stringify(settings, null, 2) + '\n',
      rules: meta,
      warnings: warnings,
      errors: errors
    };
  }

  /** 生成した JSON 文字列が JSON として読めるか、permissions の形が正しいかを確かめる */
  function validateJson(text) {
    var obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'JSON として読めません: ' + e.message };
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: '最上位がオブジェクトではありません。' };
    if (!obj.permissions || typeof obj.permissions !== 'object' || Array.isArray(obj.permissions)) return { ok: false, error: 'permissions がありません。' };
    var keys = Object.keys(obj.permissions);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k !== 'deny' && k !== 'ask' && k !== 'allow') return { ok: false, error: '想定外のキー: ' + k };
      var arr = obj.permissions[k];
      if (!Array.isArray(arr)) return { ok: false, error: k + ' が配列ではありません。' };
      for (var j = 0; j < arr.length; j++) {
        if (typeof arr[j] !== 'string' || arr[j] === '') return { ok: false, error: k + ' に文字列でない要素があります。' };
      }
    }
    return { ok: true, value: obj };
  }

  return {
    VERIFIED_LABEL: VERIFIED_LABEL,
    SCHEMA_URL: SCHEMA_URL,
    DEFAULT_OPTIONS: merge(null),
    CATALOG: CATALOG,
    normalizeDataPath: normalizeDataPath,
    buildSettings: buildSettings,
    validateJson: validateJson
  };
});
