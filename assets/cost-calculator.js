/*
 * Claude Code API 料金 見積もり計算機の計算ロジック。
 * DOM に触らない純粋な関数だけを置く(ブラウザでも Node でも動く)。
 *
 * 単価は 2026-10-14 に公式の料金ページ(https://platform.claude.com/docs/en/about-claude/pricing)で
 * 確認した値。単位は 100万トークンあたりの USD。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CostCalculator = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRICES_AS_OF = '2026-10-14';

  var PRICES = {
    'claude-opus-5-5': { label: 'Claude Opus 5.5', input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.20, output: 20 },
    'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5', input: 2, cacheWrite5m: 2.50, cacheWrite1h: 4, cacheRead: 0.10, output: 10 },
    'claude-haiku-5-5': { label: 'Claude Haiku 5.5(プロンプト10万トークン以下)', input: 0.10, cacheWrite5m: 0.125, cacheWrite1h: 0.20, cacheRead: 0.01, output: 0.50 }
  };

  // 有料記事の架空データ(架空A・5日分)のうち Sonnet 5.5 の合計を 5 で割った、1人1日あたりの値
  var EXAMPLE_PRESET = {
    model: 'claude-sonnet-5-5',
    input: 1040,
    cacheWrite5m: 0,
    cacheWrite1h: 190000,
    cacheRead: 2170000,
    output: 31000
  };

  var US_ONLY_MULTIPLIER = 1.1;
  var TOKEN_FIELDS = ['input', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output'];

  function toNumber(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).replace(/[,\s，]/g, '').trim();
    if (s === '') return NaN;
    return Number(s);
  }

  /**
   * 月額を見積もる。
   * input: { model, people, days, tokens: { input, cacheWrite5m, cacheWrite1h, cacheRead, output }, fxRate, usOnly }
   *   tokens は 1人1日あたりのトークン数。fxRate(円/USD)は空なら円は出さない。
   * 戻り値: { ok, errors, perPersonDayUsd, perPersonMonthUsd, totalMonthUsd, totalMonthJpy, breakdown }
   */
  function estimate(input) {
    var errors = [];
    var p = PRICES[input && input.model];
    if (!p) errors.push('モデルを選んでください。');

    var people = toNumber(input && input.people);
    if (!(people >= 1) || Math.floor(people) !== people) errors.push('人数は1以上の整数で入力してください。');

    var days = toNumber(input && input.days);
    if (!(days >= 0) || days > 31) errors.push('稼働日数は0〜31の数で入力してください。');

    var tokens = {};
    var labels = { input: '入力', cacheWrite5m: '5分キャッシュ書き込み', cacheWrite1h: '1時間キャッシュ書き込み', cacheRead: 'キャッシュ読み込み', output: '出力' };
    TOKEN_FIELDS.forEach(function (f) {
      var raw = input && input.tokens ? input.tokens[f] : undefined;
      var n = (raw === '' || raw == null) ? 0 : toNumber(raw);
      if (!(n >= 0) || !isFinite(n)) errors.push(labels[f] + 'のトークン数は0以上の数で入力してください。');
      tokens[f] = n;
    });

    var fxRaw = input ? input.fxRate : undefined;
    var fx = null;
    if (!(fxRaw === '' || fxRaw == null)) {
      fx = toNumber(fxRaw);
      if (!(fx > 0) || !isFinite(fx)) { errors.push('為替レートは0より大きい数で入力してください。'); fx = null; }
    }

    if (errors.length) return { ok: false, errors: errors };

    var mult = input.usOnly ? US_ONLY_MULTIPLIER : 1;
    var breakdown = {
      input: tokens.input * p.input / 1e6 * mult,
      cacheWrite5m: tokens.cacheWrite5m * p.cacheWrite5m / 1e6 * mult,
      cacheWrite1h: tokens.cacheWrite1h * p.cacheWrite1h / 1e6 * mult,
      cacheRead: tokens.cacheRead * p.cacheRead / 1e6 * mult,
      output: tokens.output * p.output / 1e6 * mult
    };
    var perDay = breakdown.input + breakdown.cacheWrite5m + breakdown.cacheWrite1h + breakdown.cacheRead + breakdown.output;
    var perMonth = perDay * days;
    var total = perMonth * people;

    return {
      ok: true,
      errors: [],
      model: input.model,
      multiplier: mult,
      perPersonDayUsd: perDay,
      perPersonMonthUsd: perMonth,
      totalMonthUsd: total,
      totalMonthJpy: fx === null ? null : total * fx,
      breakdown: breakdown
    };
  }

  function formatUsd(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatJpy(n) {
    return Math.round(n).toLocaleString('ja-JP') + ' 円';
  }

  return {
    PRICES_AS_OF: PRICES_AS_OF,
    PRICES: PRICES,
    EXAMPLE_PRESET: EXAMPLE_PRESET,
    US_ONLY_MULTIPLIER: US_ONLY_MULTIPLIER,
    TOKEN_FIELDS: TOKEN_FIELDS,
    estimate: estimate,
    formatUsd: formatUsd,
    formatJpy: formatJpy
  };
});
