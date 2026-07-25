const { InferenceClient } = require("@huggingface/inference");

const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = process.env.HF_MODEL || "facebook/nllb-200-distilled-600M";

if (!HF_TOKEN) {
  console.warn("HF_TOKEN is missing. Translation will not work until it is set.");
}

const client = new InferenceClient(HF_TOKEN || "");
const cache = new Map();

const DEVANAGARI = {
  vowels: {
    "अ": "a",
    "आ": "aa",
    "इ": "i",
    "ई": "ii",
    "उ": "u",
    "ऊ": "uu",
    "ऋ": "ri",
    "ॠ": "rii",
    "ऌ": "li",
    "ॡ": "lii",
    "ए": "e",
    "ऐ": "ai",
    "ओ": "o",
    "औ": "au",
    "ऑ": "o",
    "ऍ": "e"
  },
  consonants: {
    "क": "k",
    "ख": "kh",
    "ग": "g",
    "घ": "gh",
    "ङ": "ng",
    "च": "ch",
    "छ": "chh",
    "ज": "j",
    "झ": "jh",
    "ञ": "ny",
    "ट": "t",
    "ठ": "th",
    "ड": "d",
    "ढ": "dh",
    "ण": "n",
    "त": "t",
    "थ": "th",
    "द": "d",
    "ध": "dh",
    "न": "n",
    "प": "p",
    "फ": "ph",
    "ब": "b",
    "भ": "bh",
    "म": "m",
    "य": "y",
    "र": "r",
    "ल": "l",
    "व": "v",
    "श": "sh",
    "ष": "sh",
    "स": "s",
    "ह": "h",
    "क़": "q",
    "ख़": "kh",
    "ग़": "gh",
    "ज़": "z",
    "ड़": "d",
    "ढ़": "dh",
    "फ़": "f",
    "य़": "y"
  },
  matras: {
    "ा": "aa",
    "ि": "i",
    "ी": "ii",
    "ु": "u",
    "ू": "uu",
    "ृ": "ri",
    "ॄ": "rii",
    "ॅ": "e",
    "े": "e",
    "ै": "ai",
    "ॉ": "o",
    "ो": "o",
    "ौ": "au"
  }
};

const DEVANAGARI_SPECIAL = {
  "ं": "n",
  "ँ": "n",
  "ः": "h",
  "ऽ": "'",
  "़": "",
  "्": ""
};

function transliterateHindiToRoman(text) {
  const normalized = String(text || "").normalize("NFC");
  let out = "";

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (DEVANAGARI.vowels[ch]) {
      out += DEVANAGARI.vowels[ch];
      continue;
    }

    if (DEVANAGARI.consonants[ch]) {
      const base = DEVANAGARI.consonants[ch];

      if (next === "्") {
        out += base;
        i += 1;
        continue;
      }

      if (DEVANAGARI.matras[next]) {
        out += base + DEVANAGARI.matras[next];
        i += 1;
        continue;
      }

      out += base + "a";
      continue;
    }

    if (DEVANAGARI.matras[ch]) {
      out += DEVANAGARI.matras[ch];
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(DEVANAGARI_SPECIAL, ch)) {
      out += DEVANAGARI_SPECIAL[ch];
      continue;
    }

    out += ch;
  }

  return out
    .replace(/\baaa\b/g, "aa")
    .replace(/\baai\b/g, "ai");
}

async function translateWithHF(text, srcLang, tgtLang) {
  const response = await client.translation({
    model: HF_MODEL,
    inputs: text,
    parameters: {
      src_lang: srcLang,
      tgt_lang: tgtLang
    }
  });

  if (Array.isArray(response)) {
    const first = response[0];
    if (first && typeof first.translation_text === "string") {
      return first.translation_text;
    }
  }

  if (response && typeof response.translation_text === "string") {
    return response.translation_text;
  }

  throw new Error("Unexpected translation response from Hugging Face.");
}

async function translateText(text, srcLang, tgtLang, options = {}) {
  const targetMode = options.targetMode || "native";
  const source = srcLang;
  const target = tgtLang;
  const cleanText = String(text ?? "").trimEnd();

  if (!cleanText.trim()) return text;

  const cacheKey = JSON.stringify({ cleanText, source, target, targetMode });
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let translated;

  if (targetMode === "roman_hindi" || targetMode === "romanHindi") {
    const hindi = await translateWithHF(cleanText, source, "hin_Deva");
    translated = transliterateHindiToRoman(hindi);
  } else {
    translated = await translateWithHF(cleanText, source, target);
  }

  cache.set(cacheKey, translated);
  return translated;
}

async function translateSubtitleText(text, srcLang, tgtLang, options = {}) {
  const lines = String(text ?? "").split("\n");
  const out = [];

  for (const line of lines) {
    if (!line.trim()) {
      out.push(line);
      continue;
    }

    const translated = await translateText(line, srcLang, tgtLang, options);
    out.push(translated);
  }

  return out.join("\n");
}

module.exports = {
  translateText,
  translateSubtitleText,
  transliterateHindiToRoman
};
