'use strict';

// 从 Wikimedia Commons（经 Free Dictionary API）拉取真人英语发音，供离线优先播放。
// 用法：node scripts/fetch-pronunc.js [--limit N] [--force] [--dry-run]
//
// 音频许可：Wikimedia Commons 上传者授权（多为 CC BY / BY-SA），详见 pronunc-index.json 各条 license 字段。

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const data = require('../lib/data');
const { pronuncSlug } = require('../lib/pronunc-util');

const AUDIO_DIR = path.join(__dirname, '..', 'public', 'audio', 'pronunc');
const INDEX_PATH = path.join(__dirname, '..', 'public', 'audio', 'pronunc-index.json');
const DELAY_MS = 280;

const COMMON = [
  'hello', 'hi', 'good morning', 'good afternoon', 'good evening', 'good night', 'goodbye', 'bye',
  'thank you', 'thanks', 'please', 'sorry', 'excuse me', 'pardon me', 'yes', 'no', 'ok', 'okay',
  'welcome', 'how are you', 'fine thank you', 'nice to meet you', 'see you', 'of course',
  'good', 'very good', 'well done', 'come in', 'sit down', 'stand up', 'look', 'listen',
  'repeat', 'again', 'slowly', 'quickly', 'here', 'there', 'this', 'that', 'what', 'where', 'when', 'who', 'why', 'how',
  'man', 'woman', 'boy', 'girl', 'teacher', 'student', 'friend', 'family', 'mother', 'father',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'nce-practice/1.0 (pronunciation fetch)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve, reject);
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${url}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'nce-practice/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(resolve));
      ws.on('error', reject);
    }).on('error', reject);
  });
}

function pickAudio(entry) {
  const ph = (entry.phonetics || []).filter((p) => p.audio);
  if (!ph.length) return null;
  const uk = ph.find((p) => /uk|gb/i.test(p.audio));
  const us = ph.find((p) => /us/i.test(p.audio));
  const au = ph.find((p) => /au/i.test(p.audio));
  const pick = uk || us || au || ph[0];
  let accent = 'uk';
  if (pick === us) accent = 'us';
  else if (pick === au) accent = 'au';
  return {
    url: pick.audio,
    accent,
    license: pick.license || null,
    sourceUrl: pick.sourceUrl || null,
  };
}

function collectWords() {
  const set = new Set(COMMON.map((w) => w.toLowerCase()));
  for (const l of data.getLessons()) {
    for (const w of l.words || []) {
      if (w.word) set.add(String(w.word).toLowerCase().trim());
    }
  }
  return [...set].sort();
}

async function fetchOne(word, opts) {
  const slug = pronuncSlug(word);
  if (!slug) return null;
  const dest = path.join(AUDIO_DIR, slug + '.mp3');
  const rel = '/audio/pronunc/' + slug + '.mp3';

  if (!opts.force && fs.existsSync(dest)) {
    return { slug, word, file: rel, cached: true };
  }

  const url = 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word);
  let entries;
  try {
    entries = await fetchJson(url);
  } catch (e) {
    return { slug, word, error: e.message };
  }
  if (!Array.isArray(entries) || !entries.length) return { slug, word, error: 'not found' };

  const audio = pickAudio(entries[0]);
  if (!audio || !audio.url) return { slug, word, error: 'no audio' };

  if (opts.dryRun) {
    return { slug, word, file: rel, accent: audio.accent, dryRun: true, url: audio.url };
  }

  await downloadFile(audio.url, dest);
  return {
    slug,
    word,
    file: rel,
    accent: audio.accent,
    license: audio.license,
    sourceUrl: audio.sourceUrl,
    source: 'wikimedia-via-dictionaryapi.dev',
  };
}

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  let index = {};
  if (fs.existsSync(INDEX_PATH)) {
    try { index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch (e) { index = {}; }
  }

  let words = collectWords();
  if (limit > 0) words = words.slice(0, limit);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  console.log('Fetching human pronunciations for', words.length, 'entries…');

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const r = await fetchOne(word, { force, dryRun });
    if (!r) continue;
    if (r.cached) {
      skip++;
    } else if (r.error) {
      fail++;
      if (fail <= 15) console.log('  skip', word, '-', r.error);
    } else if (r.file) {
      ok++;
      index[r.slug] = {
        word: r.word,
        file: r.file,
        accent: r.accent || 'uk',
        source: r.source || 'wikimedia',
        license: r.license || undefined,
        sourceUrl: r.sourceUrl || undefined,
      };
      if (r.word !== r.slug) index[r.word.toLowerCase().replace(/\s+/g, '-')] = index[r.slug];
    }
    if ((i + 1) % 50 === 0) console.log('  …', i + 1, '/', words.length);
    await sleep(DELAY_MS);
  }

  if (!dryRun) {
    const meta = {
      _meta: {
        updated: new Date().toISOString(),
        count: Object.keys(index).filter((k) => !k.startsWith('_')).length,
        note: 'Wikimedia Commons 真人发音，CC 许可；播放时优先于浏览器 TTS',
      },
    };
    const out = { ...meta, ...index };
    fs.writeFileSync(INDEX_PATH, JSON.stringify(out, null, 2) + '\n');
  }

  console.log('Done:', ok, 'new/downloaded,', skip, 'already cached,', fail, 'failed');
  if (!dryRun) console.log('Index:', INDEX_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
