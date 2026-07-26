require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");

const {
  parseSubtitle,
  buildSRT
} = require("./subtitle");

const {
  translateText,
  translateSubtitleCues
} = require("./translator");

const app = express();

/*
|--------------------------------------------------------------------------
| File Upload
|--------------------------------------------------------------------------
*/

const upload = multer({
  storage:
    multer.memoryStorage(),

  limits: {
    fileSize:
      50 * 1024 * 1024
  }
});

/*
|--------------------------------------------------------------------------
| Language Codes
|--------------------------------------------------------------------------
*/

const COMMON_LANGUAGE_CODES = {
  auto: "auto",

  English: "eng_Latn",
  "Chinese (Simplified)": "zho_Hans",
  "Chinese (Traditional)": "zho_Hant",
  Hindi: "hin_Deva",
  Japanese: "jpn_Jpan",
  Korean: "kor_Hang",
  Spanish: "spa_Latn",
  French: "fra_Latn",
  German: "deu_Latn",
  Portuguese: "por_Latn",
  Italian: "ita_Latn",
  Russian: "rus_Cyrl",
  Turkish: "tur_Latn",
  Indonesian: "ind_Latn",
  Vietnamese: "vie_Latn",
  Bengali: "ben_Beng",
  Urdu: "urd_Arab",
  Marathi: "mar_Deva",
  Tamil: "tam_Taml",
  Telugu: "tel_Telu",
  Thai: "tha_Thai",
  Arabic: "arb_Arab"
};

/*
|--------------------------------------------------------------------------
| Language Detection
|--------------------------------------------------------------------------
*/

function normalizeNewlines(
  text
) {
  return String(
    text || ""
  )
    .replace(
      /\r\n/g,
      "\n"
    )
    .replace(
      /\r/g,
      "\n"
    );
}

function detectLanguageCode(
  text
) {
  const sample =
    normalizeNewlines(
      text
    ).slice(
      0,
      4000
    );

  if (
    /[\u4E00-\u9FFF]/.test(
      sample
    )
  ) {
    return "zho_Hans";
  }

  if (
    /[\u3040-\u30FF]/.test(
      sample
    )
  ) {
    return "jpn_Jpan";
  }

  if (
    /[\uAC00-\uD7AF]/.test(
      sample
    )
  ) {
    return "kor_Hang";
  }

  if (
    /[\u0900-\u097F]/.test(
      sample
    )
  ) {
    return "hin_Deva";
  }

  if (
    /[\u0B80-\u0BFF]/.test(
      sample
    )
  ) {
    return "tam_Taml";
  }

  if (
    /[\u0C00-\u0C7F]/.test(
      sample
    )
  ) {
    return "tel_Telu";
  }

  if (
    /[\u0600-\u06FF]/.test(
      sample
    )
  ) {
    return "arb_Arab";
  }

  if (
    /[\u0400-\u04FF]/.test(
      sample
    )
  ) {
    return "rus_Cyrl";
  }

  if (
    /[\u0980-\u09FF]/.test(
      sample
    )
  ) {
    return "ben_Beng";
  }

  return "eng_Latn";
}

function resolveLanguageCode(
  value,
  fallbackText = ""
) {
  if (
    !value ||
    value === "auto"
  ) {
    return detectLanguageCode(
      fallbackText
    );
  }

  if (
    COMMON_LANGUAGE_CODES[
      value
    ]
  ) {
    return (
      COMMON_LANGUAGE_CODES[
        value
      ]
    );
  }

  return String(
    value
  ).trim();
}

/*
|--------------------------------------------------------------------------
| Express
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
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
| Normal Text Translation
|--------------------------------------------------------------------------
*/

app.post(
  "/api/translate-text",
  async (
    req,
    res
  ) => {
    try {
      const {
        text,
        from,
        to,
        targetMode
      } =
        req.body || {};

      if (
        !text ||
        !String(
          text
        ).trim()
      ) {
        return res
          .status(400)
          .json({
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
        success:
          true,

        translation
      });

    } catch (
      error
    ) {
      console.error(
        error
      );

      res
        .status(500)
        .json({
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
  upload.single(
    "subtitle"
  ),
  async (
    req,
    res
  ) => {
    try {

      /*
      |--------------------------------------------------------------------------
      | Check File
      |--------------------------------------------------------------------------
      */

      if (
        !req.file
      ) {
        return res
          .status(400)
          .json({
            error:
              "Subtitle file missing."
          });
      }

      /*
      |--------------------------------------------------------------------------
      | User Options
      |--------------------------------------------------------------------------
      */

      const from =
        req.body.from ||
        "auto";

      const to =
        req.body.to ||
        "Hindi";

      const targetMode =
        req.body.targetMode ||
        "native";

      /*
      |--------------------------------------------------------------------------
      | Read File
      |--------------------------------------------------------------------------
      */

      const extension =
        path.extname(
          req.file.originalname
        ).toLowerCase();

      const content =
        req.file.buffer.toString(
          "utf8"
        );

      /*
      |--------------------------------------------------------------------------
      | Parse SRT/VTT
      |--------------------------------------------------------------------------
      */

      const subtitles =
        parseSubtitle(
          content,
          extension
        );

      if (
        !subtitles.length
      ) {
        return res
          .status(400)
          .json({
            error:
              "No subtitle cues found."
          });
      }

      /*
      |--------------------------------------------------------------------------
      | Detect Source Language
      |--------------------------------------------------------------------------
      */

      const allText =
        subtitles
          .map(
            subtitle =>
              subtitle.text
          )
          .join(
            "\n"
          );

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
      | Start Streaming Response
      |--------------------------------------------------------------------------
      */

      res.status(
        200
      );

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
      | BATCH SIZE
      |--------------------------------------------------------------------------
      |
      | The translator.js uses:
      |
      | 1000 subtitle cues = 1 Gemini request
      |
      |--------------------------------------------------------------------------
      */

      const BATCH_SIZE =
        300;

      const translated =
        [];

      const total =
        subtitles.length;

      /*
      |--------------------------------------------------------------------------
      | Process Batches
      |--------------------------------------------------------------------------
      */

      for (
        let start = 0;
        start < total;
        start +=
          BATCH_SIZE
      ) {

        const batch =
          subtitles.slice(
            start,
            start +
              BATCH_SIZE
          );

        console.log(
          `Translating ${
            start + 1
          } - ${
            start +
            batch.length
          } of ${
            total
          } subtitles`
        );

        /*
        |--------------------------------------------------------------------------
        | Send current batch to translator
        |--------------------------------------------------------------------------
        */

        const translatedBatch =
          await translateSubtitleCues(
            batch,
            sourceCode,
            targetCode,
            {
              targetMode
            }
          );

        /*
        |--------------------------------------------------------------------------
        | Add translated batch
        |--------------------------------------------------------------------------
        */

        translated.push(
          ...translatedBatch
        );

        /*
        |--------------------------------------------------------------------------
        | Progress
        |--------------------------------------------------------------------------
        */

        const current =
          Math.min(
            start +
              batch.length,
            total
          );

        const percent =
          Math.round(
            (
              current /
              total
            ) *
              100
          );

        res.write(
          JSON.stringify({
            type:
              "progress",

            current,

            total,

            percent
          }) +
            "\n"
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Build Final SRT
      |--------------------------------------------------------------------------
      */

      const output =
        buildSRT(
          translated
        );

      /*
      |--------------------------------------------------------------------------
      | Send Complete
      |--------------------------------------------------------------------------
      */

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
        }) +
          "\n"
      );

      res.end();

    } catch (
      error
    ) {

      console.error(
        "SRT translation error:",
        error
      );

      if (
        !res.headersSent
      ) {
        return res
          .status(500)
          .json({
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
          }) +
            "\n"
        );

      } catch {}

      res.end();
    }
  }
);

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

const PORT =
  process.env.PORT ||
  3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);
