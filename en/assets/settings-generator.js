/*
 * Claude Code 権限設定(settings.json)ジェネレーターの生成ロジック。
 * DOM に触らない純粋な関数だけを置く(ブラウザでも Node でも動く)。
 *
 * ルールの書き方は、中小DXラボの検証記事(2026-10、Claude Code 2.1.296、Windows 11)に
 * 載せたものだけを使う。verified: true は、その検証で「止まった」と確認したルール。
 *
 * PowerShell ツール向けの git ルール(PowerShell(git push *) など)は、公式ドキュメントの
 * 記載に従って出す(2026-10-23 確認、https://code.claude.com/docs/en/permissions の「PowerShell」節)。
 * 公式には「PowerShell のルールは Bash のルールと同じ形」とあり、例として
 * "PowerShell(git commit *)" が載っている。実機では確かめていないので verified: false のまま。
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

  var VERIFIED_LABEL = 'Verified on a real machine 2026-10, Claude Code 2.1.296';
  var SCHEMA_URL = 'https://json.schemastore.org/claude-code-settings.json';
  var DEFAULT_DATA_PATH = 'data/raw';
  var PS_DOC_URL = 'https://code.claude.com/docs/en/permissions';
  var PS_DOC_CHECKED = '2026-10-23';
  var PS_GIT_NOTE = 'Syntax follows the official docs example PowerShell(git commit *) (checked ' + PS_DOC_CHECKED + '). Not verified on a real machine';
  var TRUST_NOTE = 'allow is not applied until you accept the project trust prompt';

  // 検証記事に載せたルールと、確認の状況
  var CATALOG = {
    'Read(./.env)': { verified: true, note: 'Both reading .env with the Read tool and cat .env in Bash were blocked' },
    'Read(./.env.*)': { verified: false, note: '' },
    'Read(./secrets/**)': { verified: false, note: '' },
    'Read(./data/raw/**)': { verified: true, note: 'Reading a CSV in data/raw/ with the Read tool was blocked' },
    'Bash(curl *)': { verified: true, note: 'curl https://example.com was blocked in Bash' },
    'Bash(wget *)': { verified: false, note: '' },
    'Bash(git push *)': { verified: false, note: '' },
    'PowerShell(git push *)': { verified: false, note: PS_GIT_NOTE },
    'PowerShell(Invoke-WebRequest *)': { verified: true, note: 'Invoke-WebRequest hung in the PowerShell tool' },
    'PowerShell(Invoke-RestMethod *)': { verified: false, note: '' },
    'Bash(rm *)': { verified: false, note: '' },
    'PowerShell(Remove-Item *)': { verified: false, note: '' },
    'WebFetch': { verified: false, note: '' },
    'WebSearch': { verified: false, note: '' },
    'Bash(git status)': { verified: false, note: TRUST_NOTE },
    'Bash(git diff *)': { verified: false, note: TRUST_NOTE },
    'Bash(git log *)': { verified: false, note: TRUST_NOTE },
    'PowerShell(git status)': { verified: false, note: PS_GIT_NOTE + '. ' + TRUST_NOTE },
    'PowerShell(git diff *)': { verified: false, note: PS_GIT_NOTE + '. ' + TRUST_NOTE },
    'PowerShell(git log *)': { verified: false, note: PS_GIT_NOTE + '. ' + TRUST_NOTE }
  };

  var DEFAULT_OPTIONS = {
    includeSchema: true,
    shells: 'both',          // 'bash' | 'powershell' | 'both'
    blockEnv: true,          // Read(./.env), Read(./.env.*)
    blockSecretsDir: true,   // Read(./secrets/**)
    blockNetwork: true,      // curl / wget / Invoke-WebRequest / Invoke-RestMethod
    gitPush: 'ask',          // 'deny' | 'ask' | 'none'(シェルに合わせて Bash(...) / PowerShell(...))
    blockDataDir: true,
    dataPath: DEFAULT_DATA_PATH,
    askDelete: true,         // Bash(rm *) / PowerShell(Remove-Item *)
    askWeb: true,            // WebFetch / WebSearch
    allowGitRead: false      // git status / git diff * / git log *(シェルに合わせて Bash(...) / PowerShell(...))
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
    if (s === '' || s === '.') return { ok: false, error: 'Enter a folder path (example: data/raw).' };
    if (/^[A-Za-z]:/.test(s) || s.charAt(0) === '/' || s.charAt(0) === '~') {
      return { ok: false, error: 'Enter a path relative to the working folder (e.g. data/raw). Paths that start with a drive name or / are not supported by this tool.' };
    }
    if (/[()"*?\[\]{}!<>|`$]/.test(s) || /[\u0000-\u001f]/.test(s)) {
      return { ok: false, error: 'Contains characters that are not allowed. ( ) " * ? [ ] { } ! < > | ` $ cannot be used.' };
    }
    var parts = s.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '..' || parts[i] === '.') return { ok: false, error: 'Paths containing ".." or "." are not supported.' };
      if (parts[i].trim() !== parts[i]) return { ok: false, error: 'There are spaces before or after the folder name.' };
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
      var m = { list: list, rule: rule, verified: !!c.verified, note: c.note, status: c.verified ? VERIFIED_LABEL : 'Not verified individually' };
      if (override) { for (var k in override) { if (Object.prototype.hasOwnProperty.call(override, k)) m[k] = override[k]; } }
      meta.push(m);
    }

    if (o.shells !== 'bash' && o.shells !== 'powershell' && o.shells !== 'both') {
      errors.push('The shell specified is not valid.');
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
          status: 'The syntax Read(./data/raw/**) is confirmed; this path is unverified',
          note: 'Confirmed that the same syntax, Read(./data/raw/**), is blocked'
        });
      }
    }

    if (o.blockNetwork) {
      if (useBash) { add('deny', 'Bash(curl *)'); add('deny', 'Bash(wget *)'); }
      if (usePs) { add('deny', 'PowerShell(Invoke-WebRequest *)'); add('deny', 'PowerShell(Invoke-RestMethod *)'); }
    }

    if (o.gitPush === 'deny' || o.gitPush === 'ask') {
      if (useBash) add(o.gitPush, 'Bash(git push *)');
      if (usePs) add(o.gitPush, 'PowerShell(git push *)');
    } else if (o.gitPush !== 'none') {
      errors.push('The git push specification is not valid.');
    }

    if (o.askDelete) {
      if (useBash) add('ask', 'Bash(rm *)');
      if (usePs) add('ask', 'PowerShell(Remove-Item *)');
    }
    if (o.askWeb) { add('ask', 'WebFetch'); add('ask', 'WebSearch'); }

    if (o.allowGitRead) {
      if (useBash) { add('allow', 'Bash(git status)'); add('allow', 'Bash(git diff *)'); add('allow', 'Bash(git log *)'); }
      if (usePs) { add('allow', 'PowerShell(git status)'); add('allow', 'PowerShell(git diff *)'); add('allow', 'PowerShell(git log *)'); }
      warnings.push('allow rules are not used until you start claude in an interactive session in that folder once and accept the trust prompt (deny and ask take effect regardless of that approval).');
    }

    if (usePs && (o.gitPush === 'deny' || o.gitPush === 'ask' || o.allowGitRead)) {
      warnings.push('Git rules for the PowerShell tool (such as PowerShell(git push *)) follow the official docs (' + PS_DOC_URL + ', ' + PS_DOC_CHECKED + '). I have not verified them on a real machine.');
    }

    var permissions = {};
    ['deny', 'ask', 'allow'].forEach(function (k) { if (lists[k].length) permissions[k] = lists[k].slice(); });
    if (!meta.length) warnings.push('No rules are selected.');

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
      return { ok: false, error: 'Cannot be read as JSON: ' + e.message };
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'The top level is not an object.' };
    if (!obj.permissions || typeof obj.permissions !== 'object' || Array.isArray(obj.permissions)) return { ok: false, error: 'There is no permissions key.' };
    var keys = Object.keys(obj.permissions);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k !== 'deny' && k !== 'ask' && k !== 'allow') return { ok: false, error: 'Unexpected key: ' + k };
      var arr = obj.permissions[k];
      if (!Array.isArray(arr)) return { ok: false, error: k + ' is not an array.' };
      for (var j = 0; j < arr.length; j++) {
        if (typeof arr[j] !== 'string' || arr[j] === '') return { ok: false, error: k + ' contains an element that is not a string.' };
      }
    }
    return { ok: true, value: obj };
  }

  return {
    VERIFIED_LABEL: VERIFIED_LABEL,
    SCHEMA_URL: SCHEMA_URL,
    PS_DOC_URL: PS_DOC_URL,
    PS_DOC_CHECKED: PS_DOC_CHECKED,
    DEFAULT_OPTIONS: merge(null),
    CATALOG: CATALOG,
    normalizeDataPath: normalizeDataPath,
    buildSettings: buildSettings,
    validateJson: validateJson
  };
});
