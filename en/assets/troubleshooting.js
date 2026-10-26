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
    kit: { title: 'Company-standard Claude Code set for corporate IT to distribute', url: 'https://note.com/chuki_dx_note/n/n9524803d393b', paid: true, tag: 'Paid article, ¥1,480 (note)' },
    training: { title: '3-day training kit before handing Claude Code to general affairs and accounting staff', url: 'https://note.com/chuki_dx_note/n/n77dcb062f5fc', paid: true, tag: 'Paid article, ¥1,480 (note)' },
    usage: { title: 'Understand your department\'s Claude Code usage and estimate the monthly cost', url: 'https://note.com/chuki_dx_note/n/n068fdd9ea3f5', paid: true, tag: 'Paid article · ¥980 (note)' },
    book4: { title: 'Claude Code Setup and Operations Guide for IT Admins, Chapter 4: Security Settings', url: BOOK, paid: true, tag: 'Paid book, ¥2,500 (Zenn, free through Chapter 2)' },
    book5: { title: 'Claude Code Rollout and Operations Guide for IT Admins, Chapter 5: Growing Your CLAUDE.md (Japanese)', url: BOOK, paid: true, tag: 'Paid book, ¥2,500 (Zenn, free through Chapter 2)' },
    first3: { title: 'Start CLAUDE.md with three lines', url: 'https://note.com/chuki_dx_note/n/n8eea75ce93e9', paid: false, tag: 'Free article (note)' },
    settingsTool: { title: 'Claude Code Permissions (settings.json) Generator', url: '../settings-generator/index.html', paid: false, tag: 'Free tools (this site)' },
    skillTool: { title: 'Claude Code Skill (SKILL.md) Scaffold Generator', url: '../skill-generator/index.html', paid: false, tag: 'Free tools (this site)' }
  };

  var CATEGORIES = ['Permissions', 'CLAUDE.md', 'Skills', 'Character encoding / Excel', 'PowerShell', 'Usage and training', 'Usage'];

  // basis: 'observed' = 私たちの実機で起きた / 'docs' = 公式ドキュメントの記載を記事で確かめた(実機では未確認)
  //        'guide' = 本・記事に書いた確認の手順(個別の事例ではない)
  var ROWS = [
    {
      id: 'allow-trust', category: 'Permissions', basis: 'observed',
      symptom: 'A command you put in allow still prompts for confirmation. claude -p shows a warning that it "ignores allow rules"',
      cause: 'You haven\'t yet accepted the trust prompt for that folder. A project\'s allow rules aren\'t used until you accept it (deny and ask take effect regardless of trust)',
      fix: 'Launch claude once in that folder in interactive mode and approve the trust prompt. After you distribute the files, have each user do this one time',
      sources: ['kit', 'settingsTool']
    },
    {
      id: 'deny-script', category: 'Permissions', basis: 'observed',
      symptom: 'I put Read(./.env) in deny, but the contents of .env could still be read through a Python script',
      cause: 'A Read deny rule works on Claude\'s read tools and on read commands such as cat, but not on scripts that open files themselves (this is documented behavior in the official docs)',
      fix: 'Don\'t keep real API keys or real data in your working folder. Use deny as a safety net against accidents, and if you need a stronger block, consider a sandbox (WSL 2 on Windows) or managed settings',
      sources: ['book4', 'settingsTool']
    },
    {
      id: 'deny-curl-path', category: 'Permissions', basis: 'docs',
      symptom: 'I put Bash(curl *) in deny, but I\'m not sure whether it blocks all outbound transfers',
      cause: 'According to the official docs, calling curl by path (such as /usr/bin/curl) or wrapping it in sh -c is not blocked. The curl https://… form was blocked on a real machine',
      fix: 'Think of deny as a net that stops commands written in the usual way. If you need to reliably block outbound data transfers, check the sandbox and managed settings in the official docs',
      sources: ['book4', 'settingsTool']
    },
    {
      id: 'deny-test-claudemd', category: 'Permissions', basis: 'observed',
      symptom: 'I want to test whether deny works, but Claude doesn\'t try to read .env or real data, so I can\'t verify it',
      cause: 'If CLAUDE.md says not to read a file, Claude does not try to read it (with CLAUDE.md removed, it tried and was stopped by deny)',
      fix: 'Only for the test, temporarily rename CLAUDE.md, then ask Claude to read it with --allowedTools \"Read,Bash\". Rename it back when you\'re done checking',
      sources: ['kit']
    },
    {
      id: 'deny-not-loaded', category: 'Permissions', basis: 'guide',
      symptom: 'I wrote a deny rule, but it seems not to be working',
      cause: 'The settings file may be in the wrong location, or the path may be written incorrectly',
      fix: 'Use /permissions to check that the rules are loaded. Confirm you placed them in .claude/settings.json in your work folder, and try reading a dummy file to confirm it is blocked before you start using it',
      sources: ['book4', 'settingsTool']
    },
    {
      id: 'user-claudemd', category: 'CLAUDE.md', basis: 'observed',
      symptom: 'Responses tend to differ between your PC and other people\'s PCs. An unrequested sentence is added at the end of the response',
      cause: 'Your personal ~/.claude/CLAUDE.md (personal instructions that apply to all projects) is also being loaded',
      fix: 'Before training or distribution, run your checks with an account under the same conditions as the trainees or users. Move anything the team should share into the project\'s CLAUDE.md',
      sources: ['training', 'book5']
    },
    {
      id: 'claudemd-long', category: 'CLAUDE.md', basis: 'docs',
      symptom: 'What I wrote in CLAUDE.md is being followed less reliably. The file has grown longer, with old and new instructions mixed together',
      cause: 'The official docs suggest keeping each file under 200 lines. The longer it gets, the heavier the load to read it and the less likely it is to be followed. If lines contradict each other, it becomes unclear which one to follow',
      fix: 'Remove rules Claude already follows without being told and procedures you no longer use. Rewrite lines that cover the same topic. Move anything you want to prohibit into settings.json',
      sources: ['first3', 'book5']
    },
    {
      id: 'claudemd-update', category: 'CLAUDE.md', basis: 'observed',
      symptom: 'I distributed an update to the standard set, but CLAUDE.md in the work folder is still outdated',
      cause: 'The deployment script is designed not to overwrite files that already exist, so that CLAUDE.md files a department has added to are not erased',
      fix: 'For any CLAUDE.md that was skipped, apply the changes by hand. Limiting department additions to under the agreed headings makes this easier',
      sources: ['kit']
    },
    {
      id: 'skill-missing', category: 'Skills', basis: 'observed',
      symptom: 'The skill does not appear in the list',
      cause: 'SKILL.md is in the wrong location, or the frontmatter (the part enclosed in --- at the top) is written incorrectly',
      fix: 'Check the location of .claude/skills/<name>/SKILL.md and that the first line starts with ---, then run claude plugin validate .claude/skills',
      sources: ['kit', 'skillTool']
    },
    {
      id: 'skill-not-used', category: 'Skills', basis: 'observed',
      symptom: 'The skill isn\'t used automatically',
      cause: 'The wording in description doesn\'t match the wording users use when they ask',
      fix: 'Add words your users normally use (such as "meeting minutes summary" or "meeting recap") to the description. You can also call the skill directly with /skill-name',
      sources: ['kit', 'skillTool']
    },
    {
      id: 'ps-bom', category: 'PowerShell', basis: 'observed',
      symptom: 'Japanese text in a PowerShell script is garbled, or causes syntax errors',
      cause: 'Windows PowerShell 5.1 reads UTF-8 scripts without a BOM as a different character encoding',
      fix: 'Re-save the script as UTF-8 with BOM',
      sources: ['kit', 'training']
    },
    {
      id: 'ps-policy', category: 'PowerShell', basis: 'observed',
      symptom: 'The script won\'t run, with the error "running scripts is disabled on this system"',
      cause: 'Blocked by the execution policy',
      fix: 'Run it in the form powershell -NoProfile -ExecutionPolicy Bypass -File <script> (this applies to this one run only and doesn\'t change the PC\'s settings)',
      sources: ['kit', 'training']
    },
    {
      id: 'csv-excel', category: 'Character encoding / Excel', basis: 'observed',
      symptom: 'A CSV created by Claude Code shows garbled characters when opened in Excel',
      cause: 'The CSV is saved as UTF-8 without a BOM (the same happens if the BOM was lost when the file was re-saved in another tool)',
      fix: 'Write "save as UTF-8 (with BOM)" in your request. If you add it under "Rules to follow" in CLAUDE.md, you don\'t have to repeat it every time',
      sources: ['training', 'usage']
    },
    {
      id: 'csv-python-bom', category: 'Character encoding / Excel', basis: 'observed',
      symptom: 'The name of the first column in a CSV read with Python doesn\'t match (an invisible character is attached at the start)',
      cause: 'The BOM at the start of the file is attached to the first column name as \\ufeff',
      fix: 'Ask it to read the file with encoding="utf-8-sig"',
      sources: ['training']
    },
    {
      id: 'wrong-folder', category: 'Usage and training', basis: 'observed',
      symptom: 'You get "file not found"',
      cause: 'Claude Code was started outside the working folder',
      fix: 'Use cd to move to your working folder, then start it again',
      sources: ['training']
    },
    {
      id: 'script-not-run', category: 'Usage and training', basis: 'observed',
      symptom: 'I created a script but it doesn\'t run',
      cause: 'Permission to run the command hasn\'t been granted, or the command\'s form differs from the one you allowed',
      fix: 'Read the contents on the confirmation screen and approve it, or run it yourself',
      sources: ['training']
    },
    {
      id: 'different-answer', category: 'Usage and training', basis: 'observed',
      symptom: 'The same request gets a differently worded reply than the person next to you gets',
      cause: 'AI responses are not the same every time',
      fix: 'Judge by verifiable conditions, such as counts, totals, and whether the original file is unchanged, not by how the text reads',
      sources: ['training']
    },
    {
      id: 'ai-decided', category: 'Usage and training', basis: 'observed',
      symptom: 'The AI is deciding on its own how to handle things you didn\'t ask about (such as blank values and duplicates)',
      cause: 'The AI fills in anything your request doesn\'t specify',
      fix: 'Add "report the handling you decided on as a list" to the request. You can also put it under "Rules to follow" in CLAUDE.md',
      sources: ['training']
    },
    {
      id: 'original-changed', category: 'Usage and training', basis: 'observed',
      symptom: 'The original file got changed',
      cause: 'The request didn\'t include "don\'t modify the original," or you approved it on the confirmation screen',
      fix: 'For a practice folder, recreate it or restore it from the backup folder. Add "do not modify the original files" to the request and to CLAUDE.md',
      sources: ['training']
    },
    {
      id: 'log-zero', category: 'Usage', basis: 'observed',
      symptom: 'Aggregating the usage logs returns 0 entries. Records for older periods are missing',
      cause: 'The period specified is wrong, or the records are gone. Local records are deleted after 30 days by default (setting cleanupPeriodDays)',
      fix: 'Remove the date range and check which days have records. Run the same tally once a month and keep the results.',
      sources: ['usage']
    },
    {
      id: 'usage-mismatch', category: 'Usage', basis: 'observed',
      symptom: 'The log totals don\'t match what /usage shows',
      cause: '/usage shows the current session or a recent period, which differs from the range you tallied',
      fix: 'Compare using the same period and project. Assume that neither figure is the actual billed amount',
      sources: ['usage']
    },
    {
      id: 'python-missing', category: 'Usage', basis: 'observed',
      symptom: 'Running the aggregation script shows "python not found"',
      cause: 'Python is not installed, or it is not on PATH',
      fix: 'Run it with py -3, or install Python',
      sources: ['usage']
    }
  ];

  var BASIS_LABEL = {
    observed: 'Occurred on a real machine (2026-10, Claude Code 2.1.296)',
    docs: 'Checked against the official docs (not verified on a real machine)',
    guide: 'Steps for checking books and articles'
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
