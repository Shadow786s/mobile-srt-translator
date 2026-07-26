const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    })
  : null;

if (!GEMINI_API_KEY) {
  console.warn(
    "GEMINI_API_KEY is missing."
  );
}

/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

// 1000 subtitle cues = 1 Gemini API request
const BATCH_SIZE = 300;

/*
|--------------------------------------------------------------------------
| LANGUAGE NAMES
|--------------------------------------------------------------------------
*/

const LANGUAGE_NAMES = {
  auto: "automatically detected source language",

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
  arb_Arab: "Arabic"
};

function languageName(code) {
  return (
    LANGUAGE_NAMES[code] ||
    String(
      code ||
      "the target language"
    )
  );
}

function isRomanHindiMode(
  targetMode
) {
  return (
    targetMode === "roman_hindi" ||
    targetMode === "romanHindi"
  );
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
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY is missing. Please add it in Render Environment Variables."
    );
  }

  const targetMode =
    options.targetMode || "native";

  const cleanText =
    String(text ?? "").trim();

  if (!cleanText) {
    return text;
  }

  const sourceLanguage =
    languageName(srcLang);

  let targetLanguage =
    languageName(tgtLang);

  if (
    isRomanHindiMode(targetMode)
  ) {
    targetLanguage =
      "Hindi written naturally using Roman Hindi / Latin letters";
  }

  const prompt = `
You are a professional subtitle translator.

Translate the following subtitle.

Source language:
${sourceLanguage}

Target language:
${targetLanguage}

Rules:
1. Translate only the dialogue.
2. Do not add explanations.
3. Keep the meaning natural and conversational.
4. Preserve names and numbers.
5. Preserve punctuation where appropriate.
6. Do not add labels.
7. If the target is Roman Hindi, use only Latin/Roman letters.
8. Do not use Devanagari for Roman Hindi.
9. Return only the translation.

Subtitle:
${cleanText}
`;

  try {
    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt
      });

    const result =
      String(
        response.text || ""
      ).trim();

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

    if (
      message.includes("429") ||
      message.includes(
        "RESOURCE_EXHAUSTED"
      ) ||
      message
        .toLowerCase()
        .includes("quota")
    ) {
      throw new Error(
        "Gemini API quota exceeded. Please wait and try again later."
      );
    }

    throw new Error(
      `Gemini translation failed: ${message}`
    );
  }
}

/*
|--------------------------------------------------------------------------
| Batch Translation
|--------------------------------------------------------------------------
|
| Input:
|
| [
|   { id: 1, text: "Hello" },
|   { id: 2, text: "How are you?" }
| ]
|
| Output:
|
| [
|   { id: 1, text: "Namaste" },
|   { id: 2, text: "Aap kaise ho?" }
| ]
|
|--------------------------------------------------------------------------
*/

async function translateBatch(
  items,
  srcLang,
  tgtLang,
  options = {}
) {
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY is missing. Please add it in Render Environment Variables."
    );
  }

  if (!items.length) {
    return [];
  }

  const targetMode =
    options.targetMode || "native";

  const sourceLanguage =
    languageName(srcLang);

  let targetLanguage =
    languageName(tgtLang);

  if (
    isRomanHindiMode(targetMode)
  ) {
    targetLanguage =
      "Hindi written naturally using Roman Hindi / Latin letters";
  }

  /*
  |--------------------------------------------------------------------------
  | Create JSON input
  |--------------------------------------------------------------------------
  */

  const input = items.map(
    item => ({
      id: item.id,
      text: item.text
    })
  );

  const prompt = `
You are a professional subtitle translator.

Translate all subtitle entries in the JSON array below.

Source language:
${sourceLanguage}

Target language:
${targetLanguage}

IMPORTANT RULES:

1. Translate every entry.
2. Do not skip any entry.
3. Do not merge entries.
4. Do not split entries.
5. Keep every "id" exactly unchanged.
6. Keep the same number of entries.
7. Translate only the "text" field.
8. Preserve names and numbers.
9. Keep the meaning natural and conversational.
10. If the target is Roman Hindi, use ONLY Latin/Roman letters.
11. Do not use Devanagari characters for Roman Hindi.
12. Return ONLY valid JSON.
13. Do not use Markdown code fences.
14. Do not add explanations.

Input JSON:
${JSON.stringify(input)}
`;

  try {
    console.log(
      `Sending ${items.length} subtitle cues in one Gemini request.`
    );

    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt
      });

    let result =
      String(
        response.text || ""
      ).trim();

    if (!result) {
      throw new Error(
        "Gemini returned an empty batch translation."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Remove accidental Markdown fences
    |--------------------------------------------------------------------------
    */

    result =
      result
        .replace(
          /^```json\s*/i,
          ""
        )
        .replace(
          /^```\s*/i,
          ""
        )
        .replace(
          /\s*```$/i,
          ""
        )
        .trim();

    let parsed;

    try {
      parsed =
        JSON.parse(result);

    } catch (parseError) {
      throw new Error(
        "Gemini returned invalid JSON for batch translation."
      );
    }

    if (
      !Array.isArray(parsed)
    ) {
      throw new Error(
        "Gemini batch response is not an array."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate response
    |--------------------------------------------------------------------------
    */

    if (
      parsed.length !==
      items.length
    ) {
      throw new Error(
        `Gemini returned ${parsed.length} entries instead of ${items.length}.`
      );
    }

    const resultMap =
      new Map();

    for (
      const item of parsed
    ) {
      if (
        !item ||
        typeof item.id !==
          "number" ||
        typeof item.text !==
          "string"
      ) {
        throw new Error(
          "Invalid item received from Gemini."
        );
      }

      resultMap.set(
        item.id,
        item.text.trim()
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Rebuild in original order
    |--------------------------------------------------------------------------
    */

    const output =
      items.map(
        item => {
          if (
            !resultMap.has(
              item.id
            )
          ) {
            throw new Error(
              `Missing translation for subtitle ID ${item.id}.`
            );
          }

          return {
            id: item.id,

            text:
              resultMap.get(
                item.id
              )
          };
        }
      );

    return output;

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
      message.includes(
        "RESOURCE_EXHAUSTED"
      ) ||
      message
        .toLowerCase()
        .includes("quota")
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
| Translate Subtitle Cues
|--------------------------------------------------------------------------
|
| This function receives complete subtitle objects.
|
| It does NOT alter:
| - subtitle number
| - timestamp
|
| It translates ONLY:
| - text
|
|--------------------------------------------------------------------------
*/

async function translateSubtitleCues(
  subtitles,
  srcLang,
  tgtLang,
  options = {}
) {
  const translated =
    [];

  for (
    let start = 0;
    start < subtitles.length;
    start += BATCH_SIZE
  ) {
    const batch =
      subtitles.slice(
        start,
        start + BATCH_SIZE
      );

    /*
    |--------------------------------------------------------------------------
    | Prepare batch
    |--------------------------------------------------------------------------
    */

    const items =
      batch.map(
        (subtitle, index) => ({
          id:
            start + index + 1,

          text:
            subtitle.text
        })
      );

    console.log(
      `Translating subtitle cues ${
        start + 1
      } to ${
        start + batch.length
      } of ${
        subtitles.length
      }`
    );

    /*
    |--------------------------------------------------------------------------
    | ONE Gemini request for this batch
    |--------------------------------------------------------------------------
    */

    const batchResult =
      await translateBatch(
        items,
        srcLang,
        tgtLang,
        options
      );

    /*
    |--------------------------------------------------------------------------
    | Attach translations to
    | original subtitle objects
    |--------------------------------------------------------------------------
    */

    for (
      let i = 0;
      i < batch.length;
      i += 1
    ) {
      translated.push({
        number:
          batch[i].number,

        timestamp:
          batch[i].timestamp,

        text:
          batchResult[i].text
      });
    }
  }

  return translated;
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  translateText,
  translateBatch,
  translateSubtitleCues,
  BATCH_SIZE
};
