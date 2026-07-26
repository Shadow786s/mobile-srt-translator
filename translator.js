const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// 300 cues per Gemini request
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 300);

// Retry settings
const MAX_RETRIES = 3;

if (!GEMINI_API_KEY) {
  console.warn(
    "GEMINI_API_KEY is missing. Translation will not work until it is set."
  );
}

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

const cache = new Map();

/*
|--------------------------------------------------------------------------
| Language Names
|--------------------------------------------------------------------------
*/

const LANGUAGE_NAMES = {
  auto: "the automatically detected source language",

  eng_Latn: "English",
  zho_Hans: "Simplified Chinese",
  zho_Hant: "Traditional Chinese",
  hin_Deva: "Hindi",
  jpn_Jpan: "Japanese",
  kor_Hang: "Korean",
  spa_Latn: "Spanish",
  fra_Latn: "French",
  deu_Latn: "German",
  por_Latn: "Portuguese",
  ita_Latn: "Italian",
  rus_Cyrl: "Russian",
  tur_Latn: "Turkish",
  ind_Latn: "Indonesian",
  vie_Latn: "Vietnamese",
  ben_Beng: "Bengali",
  urd_Arab: "Urdu",
  mar_Deva: "Marathi",
  tam_Taml: "Tamil",
  tel_Telu: "Telugu",
  tha_Thai: "Thai",
  arb_Arab: "Arabic",

  en: "English",
  zh: "Chinese",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  tr: "Turkish",
  id: "Indonesian",
  vi: "Vietnamese",
  bn: "Bengali",
  ur: "Urdu",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
  th: "Thai",
  ar: "Arabic"
};

function languageName(code) {
  return (
    LANGUAGE_NAMES[code] ||
    String(code || "the target language")
  );
}

/*
|--------------------------------------------------------------------------
| Roman Hindi
|--------------------------------------------------------------------------
*/

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

    if (
      Object.prototype.hasOwnProperty.call(
        DEVANAGARI_SPECIAL,
        ch
      )
    ) {
      out += DEVANAGARI_SPECIAL[ch];
      continue;
    }

    out += ch;
  }

  return out
    .replace(/\baaa\b/g, "aa")
    .replace(/\baai\b/g, "ai")
    .replace(/\s+/g, " ")
    .trim();
}

/*
|--------------------------------------------------------------------------
| Clean Gemini JSON
|--------------------------------------------------------------------------
*/

function cleanJsonResponse(text) {
  let value = String(text || "").trim();

  // Remove markdown code fences
  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Find first JSON array
  const first = value.indexOf("[");
  const last = value.lastIndexOf("]");

  if (first !== -1 && last !== -1 && last > first) {
    value = value.slice(first, last + 1);
  }

  return value;
}

/*
|--------------------------------------------------------------------------
| Parse Batch JSON
|--------------------------------------------------------------------------
*/

function parseBatchResponse(text, expectedCount) {
  const cleaned = cleanJsonResponse(text);

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(
      "Gemini returned invalid JSON for batch translation."
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Gemini batch response is not an array."
    );
  }

  const results = parsed.map((item) => {
    if (typeof item === "string") {
      return item.trim();
    }

    if (item && typeof item.translation === "string") {
      return item.translation.trim();
    }

    if (item && typeof item.text === "string") {
      return item.text.trim();
    }

    return "";
  });

  if (results.length !== expectedCount) {
    throw new Error(
      `Gemini returned ${results.length} translations, expected ${expectedCount}.`
    );
  }

  if (results.some((item) => !item)) {
    throw new Error(
      "Gemini returned an empty translation inside the batch."
    );
  }

  return results;
}

/*
|--------------------------------------------------------------------------
| Gemini Batch Translation
|--------------------------------------------------------------------------
*/

async function translateBatchWithGemini(
  texts,
  srcLang,
  tgtLang,
  targetMode = "native"
) {
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY is missing. Please add GEMINI_API_KEY in Render Environment Variables."
    );
  }

  const sourceLanguage = languageName(srcLang);

  let targetLanguage = languageName(tgtLang);

  if (
    targetMode === "roman_hindi" ||
    targetMode === "romanHindi"
  ) {
    targetLanguage =
      "Hindi written naturally in Roman Hindi using Latin letters";
  }

  const numberedTexts = texts
    .map(
      (text, index) =>
        `${index + 1}. ${String(text).replace(/\n/g, " ")}`
    )
    .join("\n");

  const prompt = `
You are a professional subtitle translator.

Translate ALL subtitle lines below.

Source language:
${sourceLanguage}

Target language:
${targetLanguage}

IMPORTANT OUTPUT RULES:

1. Return ONLY a valid JSON array.
2. Do not use Markdown.
3. Do not use code fences.
4. Do not add explanations.
5. The JSON array MUST contain exactly ${texts.length} items.
6. Item 1 must be the translation of line 1.
7. Item 2 must be the translation of line 2.
8. Continue in exactly the same order.
9. Each array item must be a plain string.
10. Do not combine multiple lines into one item.
11. Do not skip any line.
12. Preserve names, numbers, punctuation, and meaning where appropriate.
13. Keep translations natural and conversational.
14. If target is Roman Hindi, use ONLY Latin/Roman letters.
15. For Roman Hindi, do NOT use Devanagari characters.
16. Return JSON only.

Example format:
["First translated line", "Second translated line"]

Subtitle lines:
${numberedTexts}
`;

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response =
        await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt
        });

      const rawText =
        String(response.text || "").trim();

      if (!rawText) {
        throw new Error(
          "Gemini returned an empty response."
        );
      }

      return parseBatchResponse(
        rawText,
        texts.length
      );

    } catch (error) {
      lastError = error;

      console.error(
        `Gemini batch attempt ${attempt}/${MAX_RETRIES} failed:`,
        error.message
      );

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1500 * attempt)
        );
      }
    }
  }

  throw lastError;
}

/*
|--------------------------------------------------------------------------
| Safe Batch Translation
|--------------------------------------------------------------------------
|
| 300 -> retry
| If still fails:
| 150 -> retry
| If still fails:
| 75 -> retry
| If still fails:
| one-by-one fallback
|
|--------------------------------------------------------------------------
*/

async function translateBatchSafe(
  texts,
  srcLang,
  tgtLang,
  targetMode = "native"
) {
  if (!texts.length) {
    return [];
  }

  try {
    return await translateBatchWithGemini(
      texts,
      srcLang,
      tgtLang,
      targetMode
    );
  } catch (error) {
    console.error(
      `Batch of ${texts.length} failed.`
    );

    // If already small, translate individually
    if (texts.length <= 1) {
      throw error;
    }

    // Split batch into half
    const middle =
      Math.ceil(texts.length / 2);

    const firstHalf =
      texts.slice(0, middle);

    const secondHalf =
      texts.slice(middle);

    console.log(
      `Splitting failed batch ${texts.length} -> ${firstHalf.length} + ${secondHalf.length}`
    );

    const firstResult =
      await translateBatchSafe(
        firstHalf,
        srcLang,
        tgtLang,
        targetMode
      );

    const secondResult =
      await translateBatchSafe(
        secondHalf,
        srcLang,
        tgtLang,
        targetMode
      );

    return [
      ...firstResult,
      ...secondResult
    ];
  }
}

/*
|--------------------------------------------------------------------------
| Single Text Translation
|--------------------------------------------------------------------------
*/

async function translateText(
  text,
  srcLang,
  tgtLang,
  options = {}
) {
  const targetMode =
    options.targetMode || "native";

  const cleanText =
    String(text ?? "").trim();

  if (!cleanText) {
    return text;
  }

  const cacheKey =
    JSON.stringify({
      cleanText,
      srcLang,
      tgtLang,
      targetMode
    });

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const result =
    await translateBatchSafe(
      [cleanText],
      srcLang,
      tgtLang,
      targetMode
    );

  const translated = result[0];

  cache.set(
    cacheKey,
    translated
  );

  return translated;
}

/*
|--------------------------------------------------------------------------
| Subtitle Batch Translation
|--------------------------------------------------------------------------
*/

async function translateSubtitleText(
  text,
  srcLang,
  tgtLang,
  options = {}
) {
  const targetMode =
    options.targetMode || "native";

  const lines =
    String(text ?? "").split("\n");

  const output = [];

  // Translate non-empty lines in batches
  for (
    let start = 0;
    start < lines.length;
    start += BATCH_SIZE
  ) {
    const batchLines =
      lines.slice(
        start,
        start + BATCH_SIZE
      );

    const nonEmptyIndexes = [];
    const nonEmptyTexts = [];

    batchLines.forEach(
      (line, index) => {
        if (line.trim()) {
          nonEmptyIndexes.push(index);
          nonEmptyTexts.push(line);
        }
      }
    );

    if (!nonEmptyTexts.length) {
      output.push(...batchLines);
      continue;
    }

    const translated =
      await translateBatchSafe(
        nonEmptyTexts,
        srcLang,
        tgtLang,
        targetMode
      );

    const translatedMap =
      new Map();

    nonEmptyIndexes.forEach(
      (originalIndex, i) => {
        translatedMap.set(
          originalIndex,
          translated[i]
        );
      }
    );

    batchLines.forEach(
      (line, index) => {
        if (!line.trim()) {
          output.push(line);
        } else {
          output.push(
            translatedMap.get(index)
          );
        }
      }
    );
  }

  return output.join("\n");
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  translateText,
  translateSubtitleText,
  transliterateHindiToRoman
};
