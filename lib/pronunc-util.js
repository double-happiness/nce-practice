'use strict';

// 真人发音索引键：小写、去标点、空格转连字符
function pronuncSlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 从朗读文本生成可能的索引键（单词 / 短短语）
function pronuncLookupKeys(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  const slug = pronuncSlug(raw);
  const keys = [slug, raw.replace(/\s+/g, ' ')];
  if (raw.includes(' ')) keys.push(raw.replace(/\s+/g, ''));
  return [...new Set(keys.filter(Boolean))];
}

// 是否适合查真人发音库（整句走 TTS）
function isPronuncLookupCandidate(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length <= 4 && t.length <= 48;
}

module.exports = { pronuncSlug, pronuncLookupKeys, isPronuncLookupCandidate };
