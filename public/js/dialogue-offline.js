'use strict';
// 离线情景对话：从 /data/dialogue-bundle.json 加载，API 不可用时的回退
(function (global) {
  var BUNDLE_URL = '/data/dialogue-bundle.json';
  var bundle = null;
  var loadPromise = null;

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[^a-z0-9'\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchAnswer(response, answers) {
    var r = norm(response);
    if (!r) return false;
    for (var i = 0; i < answers.length; i++) {
      if (r === norm(answers[i])) return true;
    }
    return false;
  }

  function loadBundle() {
    if (bundle) return Promise.resolve(bundle);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(BUNDLE_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('dialogue-bundle load failed: ' + res.status);
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

  function getMeta() {
    return loadBundle().then(function (b) {
      return Object.assign({}, b.meta, { offline: true });
    });
  }

  function listDialogues(category) {
    return loadBundle().then(function (b) {
      var list = b.summaries || [];
      if (category) list = list.filter(function (d) { return d.category === category; });
      return { count: list.length, dialogues: list, offline: true };
    });
  }

  function getDialogue(id) {
    return loadBundle().then(function (b) {
      var d = b.details && b.details[id];
      if (!d) throw new Error('对话不存在');
      return Object.assign({}, d, { offline: true });
    });
  }

  function gradeDialogue(id, turn, response) {
    return loadBundle().then(function (b) {
      var keys = (b.gradeKeys && b.gradeKeys[id]) || {};
      var answers = keys[String(turn)];
      if (!answers || !answers.length) throw new Error('无法离线判分');
      var d = b.details[id];
      var correct = matchAnswer(response, answers);
      var turnCn = '';
      if (d && d.turns && d.turns[turn]) turnCn = d.turns[turn].cn || '';
      return {
        correct: correct,
        answer: answers.length === 1 ? answers[0] : answers,
        cn: turnCn,
        srsKey: null,
        offline: true,
      };
    });
  }

  function emptyStats() {
    return {
      total: 0,
      correct: 0,
      accuracy: 0,
      completed: 0,
      completedMap: {},
      offline: true,
    };
  }

  function getStats() {
    return Promise.resolve(emptyStats());
  }

  var api = {
    loadBundle: loadBundle,
    getMeta: getMeta,
    listDialogues: listDialogues,
    getDialogue: getDialogue,
    gradeDialogue: gradeDialogue,
    getStats: getStats,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.NCEDialogueOffline = api;
  }
})(typeof window !== 'undefined' ? window : self);
