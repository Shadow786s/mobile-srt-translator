const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

  // Common ISO-style codes, for flexibility
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
| Devanagari -> Roman Hindi
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
| Gemini API Translation
|--------------------------------------------------------------------------
*/

async function translateWithGemini(
  text,
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
      "Hindi written in natural Roman Hindi using Latin letters";
  }

  const prompt = `
You are a professional subtitle translator.

Translate the following subtitle text.

Source language:
${sourceLanguage}

Target language:
${targetLanguage}

Rules:
1. Translate only the actual subtitle dialogue.
2. Do not add explanations.
3. Do not add quotation marks unless they are part of the original dialogue.
4. Preserve names, numbers, punctuation, and meaning where appropriate.
5. Keep the translation natural and conversational.
6. Do not include labels such as "Translation:".
7. Do not translate or alter HTML tags if any appear.
8. If the target is Roman Hindi, write natural Hindi using Latin/Roman letters.
9. For Roman Hindi, do not use Devanagari characters.
10. Return only the translated text.

Subtitle:
${text}
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

    const result = String(response.text || "").trim();

    if (!result) {
      throw new Error(
        "Gemini returned an empty translation."
      );
    }

    return result;

  } catch (error) {
    console.error(
      "Gemini translation error:",
      error
    );

    const message =
      error?.message ||
      "Unknown Gemini API error.";

    throw new Error(
      `Gemini translation failed: ${message}`
    );
  }
}

/*
|--------------------------------------------------------------------------
| Main Translation
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
    String(text ?? "").trimEnd();

  if (!cleanText.trim()) {
    return text;
  }

  const cacheKey = JSON.stringify({
    cleanText,
    srcLang,
    tgtLang,
    targetMode
  });

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const translated =
    await translateWithGemini(
      cleanText,
      srcLang,
      tgtLang,
      targetMode
    );

  cache.set(
    cacheKey,
    translated
  );

  return translated;
}

/*
|--------------------------------------------------------------------------
| Subtitle Translation
|--------------------------------------------------------------------------
*/

async function translateSubtitleText(
  text,
  srcLang,
  tgtLang,
  options = {}
) {
  const lines =
    String(text ?? "").split("\n");

  const out = [];

  for (const line of lines) {
    if (!line.trim()) {
      out.push(line);
      continue;
    }

    const translated =
      await translateText(
        line,
        srcLang,
        tgtLang,
        options
      );

    out.push(translated);
  }

  return out.join("\n");
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
