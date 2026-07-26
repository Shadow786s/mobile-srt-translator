require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");

const {
  parseSubtitle,
  buildSRT
} = require("./subtitle");

const {
  translateSubtitleText,
  translateText
} = require("./translator");

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const COMMON_LANGUAGE_CODES = {
  auto: "auto",

  "English": "eng_Latn",
  "Chinese (Simplified)": "zho_Hans",
  "Chinese (Traditional)": "zho_Hant",
  "Hindi": "hin_Deva",
  "Japanese": "jpn_Jpan",
  "Korean": "kor_Hang",
  "Spanish": "spa_Latn",
  "French": "fra_Latn",
  "German": "deu_Latn",
  "Portuguese": "por_Latn",
  "Italian": "ita_Latn",
  "Russian": "rus_Cyrl",
  "Turkish": "tur_Latn",
  "Indonesian": "ind_Latn",
  "Vietnamese": "vie_Latn",
  "Bengali": "ben_Beng",
  "Urdu": "urd_Arab",
  "Marathi": "mar_Deva",
  "Tamil": "tam_Taml",
  "Telugu": "tel_Telu",
  "Thai": "tha_Thai",
  "Arabic": "arb_Arab"
};

function normalizeNewlines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function detectLanguageCode(text) {
  const sample =
    normalizeNewlines(text)
      .slice(0, 4000);

  if (/[\u4E00-\u9FFF]/.test(sample)) {
    return "zho_Hans";
  }

  if (/[\u3040-\u30FF]/.test(sample)) {
    return "jpn_Jpan";
  }

  if (/[\uAC00-\uD7AF]/.test(sample)) {
    return "kor_Hang";
  }

  if (/[\u0900-\u097F]/.test(sample)) {
    return "hin_Deva";
  }

  if (/[\u0B80-\u0BFF]/.test(sample)) {
    return "tam_Taml";
  }

  if (/[\u0C00-\u0C7F]/.test(sample)) {
    return "tel_Telu";
  }

  if (/[\u0A80-\u0AFF]/.test(sample)) {
    return "guj_Gujr";
  }

  if (/[\u0600-\u06FF]/.test(sample)) {
    return "arb_Arab";
  }

  if (/[\u0400-\u04FF]/.test(sample)) {
    return "rus_Cyrl";
  }

  if (/[\u0980-\u09FF]/.test(sample)) {
    return "ben_Beng";
  }

  return "eng_Latn";
}

function resolveLanguageCode(
  value,
  fallbackText = ""
) {
  if (!value || value === "auto") {
    return detectLanguageCode(
      fallbackText
    );
  }

  if (COMMON_LANGUAGE_CODES[value]) {
    return COMMON_LANGUAGE_CODES[value];
  }

  return String(value).trim();
}

function progressPayload(
  current,
  total
) {
  const percent =
    total === 0
      ? 100
      : Math.round(
          (current / total) * 100
        );

  return {
    type: "progress",
    current,
    total,
    percent
  };
}

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get(
  "/healthz",
  (_req, res) => {
    res.json({
      ok: true
    });
  }
);

/*
|--------------------------------------------------------------------------
| Text Translation
|--------------------------------------------------------------------------
*/

app.post(
  "/api/translate-text",
  async (req, res) => {
    try {
      const {
        text,
        from,
        to,
        targetMode
      } = req.body || {};

      if (
        !text ||
        !String(text).trim()
      ) {
        return res.status(400).json({
          error:
            "Text is required."
        });
      }

      const sourceCode =
        resolveLanguageCode(
          from,
          text
        );

      const targetCode =
        resolveLanguageCode(
          to,
          text
        );

      const translation =
        await translateText(
          text,
          sourceCode,
          targetCode,
          {
            targetMode:
              targetMode ||
              "native"
          }
        );

      res.json({
        success: true,
        translation
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          error.message ||
          "Translation failed."
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SRT Translation
|--------------------------------------------------------------------------
*/

app.post(
  "/api/translate-srt",
  upload.single("subtitle"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error:
            "Subtitle file missing."
        });
      }

      const from =
        req.body.from ||
        "auto";

      const to =
        req.body.to ||
        "Hindi";

      const targetMode =
        req.body.targetMode ||
        "native";

      const extension =
        path.extname(
          req.file.originalname
        ).toLowerCase();

      const content =
        req.file.buffer.toString(
          "utf8"
        );

      const subtitles =
        parseSubtitle(
          content,
          extension
        );

      if (!subtitles.length) {
        return res.status(400).json({
          error:
            "No subtitle cues found."
        });
      }

      const allText =
        subtitles
          .map(
            (s) => s.text
          )
          .join("\n");

      const sourceCode =
        resolveLanguageCode(
          from,
          allText
        );

      const targetCode =
        resolveLanguageCode(
          to,
          allText
        );

      /*
      |--------------------------------------------------------------------------
      | Streaming response
      |--------------------------------------------------------------------------
      */

      res.status(200);

      res.setHeader(
        "Content-Type",
        "application/x-ndjson; charset=utf-8"
      );

      res.setHeader(
        "Cache-Control",
        "no-cache, no-transform"
      );

      res.setHeader(
        "Connection",
        "keep-alive"
      );

      if (
        typeof res.flushHeaders ===
        "function"
      ) {
        res.flushHeaders();
      }

      /*
      |--------------------------------------------------------------------------
      | IMPORTANT
      |
      | translateSubtitleText() internally
      | batches 300 lines per Gemini request.
      |
      | It returns the complete translated text.
      |--------------------------------------------------------------------------
      */

      const subtitleText =
        subtitles
          .map(
            (s) => s.text
          )
          .join("\n");

      const translatedText =
        await translateSubtitleText(
          subtitleText,
          sourceCode,
          targetCode,
          {
            targetMode
          }
        );

      const translatedLines =
        translatedText.split("\n");

      /*
      |--------------------------------------------------------------------------
      | Rebuild subtitle objects
      |--------------------------------------------------------------------------
      |
      | Original subtitle numbers and timestamps
      | remain untouched.
      |--------------------------------------------------------------------------
      */

      const translated =
        subtitles.map(
          (subtitle, index) => ({
            number:
              subtitle.number,

            timestamp:
              subtitle.timestamp,

            text:
              translatedLines[index] ??
              subtitle.text
          })
        );

      /*
      |--------------------------------------------------------------------------
      | Send progress
      |--------------------------------------------------------------------------
      */

      res.write(
        JSON.stringify(
          progressPayload(
            translated.length,
            subtitles.length
          )
        ) + "\n"
      );

      /*
      |--------------------------------------------------------------------------
      | Build final SRT
      |--------------------------------------------------------------------------
      */

      const output =
        buildSRT(
          translated
        );

      res.write(
        JSON.stringify({
          type:
            "complete",

          filename:
            "translated.srt",

          content:
            output,

          subtitleCount:
            translated.length
        }) + "\n"
      );

      res.end();

    } catch (error) {
      console.error(
        "SRT translation error:",
        error
      );

      if (!res.headersSent) {
        return res.status(500).json({
          error:
            error.message ||
            "Translation failed."
        });
      }

      try {
        res.write(
          JSON.stringify({
            type:
              "error",

            message:
              error.message ||
              "Translation failed."
          }) + "\n"
        );
      } catch {}

      res.end();
    }
  }
);

/*
|--------------------------------------------------------------------------
| Server
|--------------------------------------------------------------------------
*/

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `Gemini batch size: ${
        process.env.BATCH_SIZE ||
        300
      } cues`
    );
  }
);
