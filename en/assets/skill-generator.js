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
    project: { label: 'This folder only', dir: '.claude/skills/' },
    user: { label: 'All your projects', dir: '~/.claude/skills/' }
  };

  // 社内標準セットの5本のうち3本を、短くしたもの(全文は有料記事)
  var PRESETS = {
    'minutes-summary': {
      label: 'Meeting minutes summary',
      name: 'minutes-summary',
      title: 'Meeting minutes summary',
      description: 'Creates meeting minutes summaries from transcripts or notes, covering decisions, to-dos, and pending items.',
      whenToUse: 'When asked to summarize meeting minutes, wrap up a meeting, or organize what was decided',
      steps: 'Check the source text to summarize. If there isn\'t one, ask which file to use\nSummarize it, split into decisions, to-dos, and pending items',
      output: '# Meeting minutes summary: <meeting name> (<meeting date>)\n\n## Decisions\n- \n\n## To-dos\n| Item | Owner | Due |\n|---|---|---|\n\n## On hold\n-',
      prohibitions: 'Do not put anything in decisions unless someone clearly agreed to it. When in doubt, put it in open items\nDo not add dates, amounts, or names that are not in the transcript'
    },
    'inquiry-reply-draft': {
      label: 'Draft reply to an inquiry',
      name: 'inquiry-reply-draft',
      title: 'Draft replies to internal inquiries',
      description: 'Drafts replies to internal inquiries (how to use PCs, accounts, internal systems, etc.).',
      whenToUse: 'When asked to reply to an inquiry or draft a response',
      steps: 'Sort out the content of the inquiry and what is unclear\nWrite the draft reply and the points to confirm with the person in charge separately',
      output: '## Draft response\n\n## Questions for the person in charge\n-',
      prohibitions: 'Do not accept or ask for passwords or authentication codes\nDo not state unfounded procedures as fact. Put anything unclear under items to confirm'
    },
    'weekly-report-draft': {
      label: 'Weekly report draft',
      name: 'weekly-report-draft',
      title: 'Weekly report draft',
      description: 'Create a first draft of a weekly report from daily notes.',
      whenToUse: 'When you\'re asked to put together a weekly report, this week\'s summary, or next week\'s plan',
      steps: 'Read that week\'s notes in date order\nSummarize them under: what was done, plans for next week, and issues',
      output: '# Weekly report: M/D to M/D, YYYY\n\n## What I did this week\n- \n\n## Plan for next week\n- \n\n## Issues and requests for advice\n-',
      prohibitions: 'Don\'t add results or numbers that aren\'t in the notes'
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
    if (s === '') return { ok: false, error: 'Enter a skill name (example: minutes-summary).', suggestion: '' };
    var lower = s.toLowerCase();
    for (var i = 0; i < RESERVED.length; i++) {
      if (lower === RESERVED[i] || lower.indexOf(RESERVED[i] + ':') === 0) {
        return { ok: false, error: '"' + s + '" is a name reserved by Claude Code and cannot be used.', suggestion: '' };
      }
    }
    if (s.length > NAME_MAX) return { ok: false, error: 'The skill name must be ' + NAME_MAX + ' characters or fewer.', suggestion: suggestName(s) };
    if (!NAME_RE.test(s)) {
      var sug = suggestName(s);
      return {
        ok: false,
        error: 'Write the skill name using only lowercase English letters, numbers, and hyphens (-) between them (example: minutes-summary).' + (sug ? '' : ' A name made only of non-ASCII characters cannot be used.'),
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
    if (d && !/[。.!?！？]$/.test(d)) d += '.';
    if (w) {
      w = w.replace(/[。.]$/, '');
      if (!/^use\b/i.test(w)) { w = 'Use when ' + w.charAt(0).toLowerCase() + w.slice(1);
        if (/(とき|時|場合)$/.test(w)) w += '';
        else if (/[たるいう]$/.test(w)) w += '';   // 「頼まれた」「作る」など
        else w += '';                           // 「週報の整理」など
      }
      w += '.';
    }
    return d + (d && w ? ' ' : '') + w;
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
    if (!nv.ok) errors.push(nv.error + (nv.suggestion ? 'Suggestion: ' + nv.suggestion : ''));
    if (!LOCATIONS[o.location]) errors.push('The output location is not valid.');

    var description = composeDescription(o.description, o.whenToUse);
    if (!oneLine(o.description)) errors.push('Enter a description. Claude reads this text to decide when to use the skill.');
    if (description.length > DESC_MAX) errors.push('The description and "when to use" together must be ' + DESC_MAX + ' characters or fewer (currently ' + description.length + ' characters).');
    if (!oneLine(o.whenToUse)) warnings.push('"When to use" is empty. Adding the words users normally use (e.g., when asked to summarize meeting minutes) makes the skill more likely to be used automatically.');

    var steps = parseItems(o.steps);
    var prohibitions = parseItems(o.prohibitions);
    if (steps.length > MAX_ITEMS) errors.push('Steps: at most ' + MAX_ITEMS + ' lines.');
    if (prohibitions.length > MAX_ITEMS) errors.push('Prohibitions: at most ' + MAX_ITEMS + ' lines.');
    var outputText = String(o.output == null ? '' : o.output).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    if (outputText.split('\n').length > MAX_OUTPUT_LINES) errors.push('Output format: at most ' + MAX_OUTPUT_LINES + ' lines.');
    if (!steps.length) warnings.push('The steps are empty. Numbered steps make it more likely that Claude works the same way every time.');

    var title = oneLine(o.title) || oneLine(o.description).replace(/[。.]$/, '').slice(0, 40) || (nv.ok ? nv.name : '');

    if (errors.length) {
      return { markdown: '', path: '', folder: '', name: nv.ok ? nv.name : '', description: description, warnings: warnings, errors: errors };
    }

    var name = nv.name;
    var lines = ['---', 'name: ' + name, 'description: ' + yamlScalar(description), '---', ''];
    lines.push('# ' + title, '');
    lines.push('I\'ll confirm what you\'re asking for, then proceed with the steps and output format below.', '');
    if (steps.length) {
      lines.push('## Steps', '');
      steps.forEach(function (s, i) { lines.push((i + 1) + '. ' + s); });
      lines.push('');
    }
    if (prohibitions.length) {
      lines.push('## Things not to do', '');
      prohibitions.forEach(function (s) { lines.push('- ' + s); });
      lines.push('');
    }
    if (outputText.trim() !== '') {
      var fence = fenceFor(outputText);
      lines.push('## Output format', '');
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
