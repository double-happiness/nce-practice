'use strict';
// 离线教材词表：从 /data/word-bundle.json 加载，供 API 不可用时的回退检索
(function (global) {
  var BUNDLE_URL = '/data/word-bundle.json';
  var bundle = null;
  var loadPromise = null;

  function normKey(w) {
    return String(w == null ? '' : w).trim().toLowerCase();
  }

  function normalizeQuery(q) {
    var raw = String(q == null ? '' : q).trim();
    if (!raw) return '';
    return /[\u4e00-\u9fff]/.test(raw) ? raw : raw.toLowerCase();
  }

  function charCount(s) {
    return Array.from(String(s)).length;
  }

  function isEnglishWordQuery(kw) {
    return /^[a-z]+(?:'[a-z]+)?$/i.test(kw);
  }

  function isEnglishPhraseQuery(kw) {
    if (!/^[a-z]+(?:'[a-z]+)?(?:\s+[a-z]+(?:'[a-z]+)?)+$/i.test(kw.trim())) return false;
    return kw.replace(/\s+/g, '').length >= 5;
  }

  function isChineseQuery(kw) {
    return /[\u4e00-\u9fff]/.test(kw);
  }

  function cnSegments(cn) {
    return String(cn || '')
      .split(/[；;，,、/|]/)
      .map(function (s) { return s.replace(/[（(][^）)]*[）)]/g, '').trim(); })
      .filter(Boolean);
  }

  function cnMainGloss(cn) {
    return String(cn || '').replace(/[（(][^）)]*[）)]/g, '').trim();
  }

  function matchChineseDefinition(cn, kw) {
    var text = String(cn || '');
    if (!text || !kw) return -1;
    var qlen = charCount(kw);
    var best = -1;

    cnSegments(text).forEach(function (seg) {
      if (seg === kw) best = Math.max(best, 100);
      else if (qlen >= 2 && seg.indexOf(kw) === 0) best = Math.max(best, 90);
      else if (qlen >= 2 && seg.indexOf(kw) >= 0) best = Math.max(best, 80);
      else if (qlen === 1 && (seg === kw || seg.indexOf(kw) === 0)) best = Math.max(best, 75);
    });

    var main = cnMainGloss(text);
    if (main && main !== text) {
      if (main === kw) best = Math.max(best, 100);
      else if (qlen >= 2 && main.indexOf(kw) === 0) best = Math.max(best, 88);
      else if (qlen >= 2 && main.indexOf(kw) >= 0) best = Math.max(best, 78);
      else if (qlen === 1 && main.indexOf(kw) === 0) best = Math.max(best, 75);
    }

    return best;
  }

  function egEnglishPart(eg) {
    var s = String(eg || '').trim();
    var idx = s.search(/\s[\u4e00-\u9fff（(]/);
    return (idx > 0 ? s.slice(0, idx) : s).trim().toLowerCase();
  }

  function phraseWordMatch(text, phrase) {
    var words = String(phrase || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    var parts = String(text || '').toLowerCase().split(/[^a-z']+/).filter(Boolean);
    if (!words.length || parts.length < words.length) return false;
    for (var i = 0; i <= parts.length - words.length; i++) {
      var ok = true;
      for (var j = 0; j < words.length; j++) {
        if (parts[i + j] !== words[j]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  function matchScore(e, kw) {
    if (!kw) return 0;
    if (e.key === kw) return 100;

    if (isEnglishWordQuery(kw)) {
      if (e.key.indexOf(kw) === 0) return 80;
      return -1;
    }

    if (isEnglishPhraseQuery(kw)) {
      var egEn = egEnglishPart(e.eg);
      if (egEn && phraseWordMatch(egEn, kw)) return 70;
      return -1;
    }

    if (isChineseQuery(kw)) {
      return matchChineseDefinition(e.cn, kw);
    }

    var phon = String(e.phon).toLowerCase().replace(/\s/g, '');
    var qPhon = kw.replace(/\s/g, '');
    if (phon && qPhon && phon.indexOf(qPhon) >= 0) return 30;
    if (e.key.indexOf(kw) === 0) return 50;
    return -1;
  }

  function refineChineseResults(pairs, kw) {
    if (!pairs.length) return pairs;
    var qlen = charCount(kw);
    if (qlen === 1) return pairs.filter(function (x) { return x.score >= 75; });
    var top = Math.max.apply(null, pairs.map(function (x) { return x.score; }));
    if (top >= 100) return pairs.filter(function (x) { return x.score >= 80; });
    if (top >= 90) return pairs.filter(function (x) { return x.score >= 78; });
    return pairs;
  }

  function toApiWord(e) {
    return {
      word: e.word,
      phon: e.phon || '',
      pos: e.pos || '',
      cn: e.cn || '',
      eg: e.eg || '',
      book: e.book,
      lesson: e.lesson,
      lessonTitle: e.lessonTitle || '',
      source: 'textbook',
      level: 0,
    };
  }

  function filterByBook(list, book) {
    if (!book) return list;
    var b = String(book);
    return list.filter(function (e) { return String(e.book) === b; });
  }

  function loadBundle() {
    if (bundle) return Promise.resolve(bundle);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(BUNDLE_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('word-bundle load failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        bundle = data;
        return bundle;
      })
      .catch(function (err) {
        loadPromise = null;
        throw err;
      });
    return loadPromise;
  }

  function findWord(key) {
    return loadBundle().then(function (b) {
      var k = normKey(key);
      if (!k) return null;
      var hit = (b.words || []).find(function (e) { return e.key === k; });
      return hit ? toApiWord(hit) : null;
    });
  }

  function listWords(book) {
    return loadBundle().then(function (b) {
      var list = filterByBook(b.words || [], book);
      list = list.slice().sort(function (a, b) {
        return (a.lesson || 999) - (b.lesson || 999) || a.key.localeCompare(b.key);
      });
      return { count: list.length, words: list.map(toApiWord) };
    });
  }

  function searchWords(q, book) {
    return loadBundle().then(function (b) {
      var kw = normalizeQuery(q);
      var list = filterByBook(b.words || [], book);

      if (kw) {
        var pairs = list
          .map(function (e) { return { e: e, score: matchScore(e, kw) }; })
          .filter(function (x) { return x.score >= 0; });

        if (isEnglishWordQuery(kw) && pairs.some(function (x) { return x.score === 100; })) {
          pairs = pairs.filter(function (x) { return x.score === 100; });
        }
        if (isChineseQuery(kw)) {
          pairs = refineChineseResults(pairs, kw);
        }

        list = pairs
          .sort(function (a, b) {
            return b.score - a.score || (a.e.lesson || 0) - (b.e.lesson || 0);
          })
          .map(function (x) { return x.e; });
      } else {
        list = list.slice().sort(function (a, b) {
          return (a.lesson || 999) - (b.lesson || 999) || a.key.localeCompare(b.key);
        });
      }

      return { count: list.length, words: list.map(toApiWord), offline: true };
    });
  }

  var api = {
    loadBundle: loadBundle,
    searchWords: searchWords,
    findWord: findWord,
    listWords: listWords,
    normKey: normKey,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.NCEWordOffline = api;
  }
})(typeof window !== 'undefined' ? window : self);
