const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

if (!GEMINI_API_KEY) {
  console.warn(
    "GEMINI_API_KEY is missing. Translation will not work until it is set."
  );
}

const cache = new Map();

/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

// Maximum subtitle dialogue lines in ONE Gemini API request.
const BATCH_SIZE = 1000;

/*
|--------------------------------------------------------------------------
| LANGUAGE NAMES
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
| ROMAN HINDI
|--------------------------------------------------------------------------
*/

function isRomanHindiMode(targetMode) {
  return (
    targetMode === "roman_hindi" ||
    targetMode === "romanHindi"
  );
}

/*
|--------------------------------------------------------------------------
| SINGLE TEXT TRANSLATION
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

  const sourceLanguage =
    languageName(srcLang);

  let targetLanguage =
    languageName(tgtLang);

  if (isRomanHindiMode(targetMode)) {
    targetLanguage =
      "Hindi written naturally using Roman/Latin letters";
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
3. Preserve names, numbers, punctuation, and meaning.
4. Keep the translation natural and conversational.
5. Do not include labels such as "Translation:".
6. If the target is Roman Hindi, use natural Hindi written only with Latin/Roman letters.
7. Do not use Devanagari characters for Roman Hindi.
8. Return only the translated text.

Subtitle:
${text}
`;

  const response =
    await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

  const result =
    String(response.text || "").trim();

  if (!result) {
    throw new Error(
      "Gemini returned an empty translation."
    );
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| BATCH TRANSLATION
|--------------------------------------------------------------------------
|
| 1000 subtitle lines = 1 Gemini API request
|
|--------------------------------------------------------------------------
*/

async function translateBatchWithGemini(
  lines,
  srcLang,
  tgtLang,
  targetMode = "native"
) {
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY is missing. Please add GEMINI_API_KEY in Render Environment Variables."
    );
  }

  const sourceLanguage =
    languageName(srcLang);

  let targetLanguage =
    languageName(tgtLang);

  if (isRomanHindiMode(targetMode)) {
    targetLanguage =
      "Hindi written naturally using Roman/Latin letters";
  }

  /*
  |--------------------------------------------------------------------------
  | Number every subtitle line
  |--------------------------------------------------------------------------
  */

  const numberedLines = lines
    .map((line, index) => {
      return `[${index + 1}] ${line}`;
    })
    .join("\n");

  const prompt = `
You are a professional subtitle translator.

Translate ALL subtitle lines below.

Source language:
${sourceLanguage}

Target language:
${targetLanguage}

IMPORTANT RULES:

1. Translate every subtitle line.
2. There are exactly ${lines.length} subtitle lines.
3. Return exactly ${lines.length} translated lines.
4. Keep the exact same order.
5. Keep the numbering [1], [2], [3], etc.
6. Never skip a subtitle.
7. Never merge two subtitles.
8. Never split one subtitle into multiple lines.
9. Do not add explanations.
10. Do not add "Translation:".
11. Preserve names, numbers, punctuation, and meaning.
12. Keep translations natural and conversational.
13. If the target is Roman Hindi, use ONLY Latin/Roman letters.
14. Do not use Devanagari characters for Roman Hindi.
15. Return ONLY numbered translated subtitles.

Example:

Input:
[1] Hello
[2] How are you?

Output:
[1] Namaste
[2] Aap kaise ho?

Now translate the following:

${numberedLines}
`;

  try {
    console.log(
      `Sending ${lines.length} subtitle lines in one Gemini request...`
    );

    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt
      });

    const result =
      String(response.text || "").trim();

    if (!result) {
      throw new Error(
        "Gemini returned an empty batch translation."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Parse numbered Gemini response
    |--------------------------------------------------------------------------
    */

    const translated =
      new Array(lines.length);

    const responseLines =
      result.split(/\r?\n/);

    for (const responseLine of responseLines) {
      const match =
        responseLine.match(
          /^\s*\[(\d+)\]\s*(.*)$/
        );

      if (!match) {
        continue;
      }

      const number =
        Number(match[1]);

      const translatedText =
        match[2].trim();

      if (
        number >= 1 &&
        number <= lines.length
      ) {
        translated[number - 1] =
          translatedText;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Verify ALL lines were returned
    |--------------------------------------------------------------------------
    */

    const missing =
      translated.some(
        value =>
          typeof value !== "string"
      );

    if (missing) {
      throw new Error(
        "Gemini did not return all subtitle lines correctly."
      );
    }

    return translated;

  } catch (error) {
    console.error(
      "Gemini batch translation error:",
      error
    );

    const message =
      error?.message ||
      "Unknown Gemini API error.";

    if (
      message.includes("429") ||
      message.includes("RESOURCE_EXHAUSTED") ||
      message.toLowerCase().includes("quota")
    ) {
      throw new Error(
        "Gemini API quota exceeded. Please wait and try again later."
      );
    }

    throw new Error(
      `Gemini batch translation failed: ${message}`
    );
  }
}

/*
|--------------------------------------------------------------------------
| SINGLE TEXT API
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
| SUBTITLE TRANSLATION
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

  /*
  |--------------------------------------------------------------------------
  | Empty subtitle text
  |--------------------------------------------------------------------------
  */

  if (!lines.length) {
    return text;
  }

  /*
  |--------------------------------------------------------------------------
  | Keep blank lines separate
  |--------------------------------------------------------------------------
  */

  const nonEmptyLines = [];

  const lineMap = [];

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    if (lines[i].trim()) {
      lineMap.push(
        nonEmptyLines.length
      );

      nonEmptyLines.push(
        lines[i]
      );
    } else {
      lineMap.push(null);
    }
  }

  if (!nonEmptyLines.length) {
    return text;
  }

  /*
  |--------------------------------------------------------------------------
  | Translate in batches of 1000
  |--------------------------------------------------------------------------
  */

  const translatedNonEmptyLines = [];

  for (
    let start = 0;
    start < nonEmptyLines.length;
    start += BATCH_SIZE
  ) {
    const batch =
      nonEmptyLines.slice(
        start,
        start + BATCH_SIZE
      );

    console.log(
      `Translating batch ${
        Math.floor(start / BATCH_SIZE) + 1
      }`
    );

    console.log(
      `Subtitle lines ${
        start + 1
      } to ${
        start + batch.length
      }`
    );

    /*
    |--------------------------------------------------------------------------
    | Check cache
    |--------------------------------------------------------------------------
    */

    const batchResults =
      new Array(batch.length);

    const linesToTranslate = [];

    const indexesToTranslate = [];

    for (
      let i = 0;
      i < batch.length;
      i += 1
    ) {
      const cleanText =
        String(batch[i]).trimEnd();

      const cacheKey =
        JSON.stringify({
          cleanText,
          srcLang,
          tgtLang,
          targetMode
        });

      if (cache.has(cacheKey)) {
        batchResults[i] =
          cache.get(cacheKey);
      } else {
        linesToTranslate.push(
          cleanText
        );

        indexesToTranslate.push(i);
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Send uncached lines
    |--------------------------------------------------------------------------
    */

    if (
      linesToTranslate.length > 0
    ) {
      const translated =
        await translateBatchWithGemini(
          linesToTranslate,
          srcLang,
          tgtLang,
          targetMode
        );

      for (
        let i = 0;
        i < translated.length;
        i += 1
      ) {
        const originalIndex =
          indexesToTranslate[i];

        batchResults[
          originalIndex
        ] = translated[i];

        const cacheKey =
          JSON.stringify({
            cleanText:
              linesToTranslate[i],
            srcLang,
            tgtLang,
            targetMode
          });

        cache.set(
          cacheKey,
          translated[i]
        );
      }
    }

    translatedNonEmptyLines.push(
      ...batchResults
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Restore blank lines
  |--------------------------------------------------------------------------
  */

  const output = [];

  let translatedIndex = 0;

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    if (!lines[i].trim()) {
      output.push(lines[i]);
    } else {
      output.push(
        translatedNonEmptyLines[
          translatedIndex
        ]
      );

      translatedIndex += 1;
    }
  }

  return output.join("\n");
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  translateText,
  translateSubtitleText
};
