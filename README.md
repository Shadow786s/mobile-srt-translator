# Mobile SRT Translator

A personal-use mobile-friendly subtitle translator for SRT/VTT and quick text translation.

## What it does

- Upload `.srt` or `.vtt`
- Translate cues one by one while keeping cue numbers and timestamps
- Download translated `.srt`
- Quick text translation
- Hindi and Roman Hindi output
- Mobile-first UI

## How translation works

This project uses Hugging Face Inference Providers on the backend via `@huggingface/inference` with the translation task. The translation endpoint accepts `inputs` plus `src_lang` and `tgt_lang`, and returns `translation_text`. The recommended model here is `facebook/nllb-200-distilled-600M`, which supports 200 languages. Hugging Face’s current free-user credits are limited, and Render’s free web services are intended for testing/hobby use rather than production. See the official docs for details. citeturn145026view0turn685227view0turn474683view0turn730620search0turn730620search2turn474683view2

## Files

```text
mobile-srt-translator/
├── public/index.html
├── server.js
├── subtitle.js
├── translator.js
├── package.json
├── .env.example
└── .gitignore
```

## Setup locally

1. Install Node.js 18+.
2. Run:
   ```bash
   npm install
   ```
3. Create `.env` from `.env.example`.
4. Add your Hugging Face token:
   ```env
   HF_TOKEN=hf_your_token_here
   ```
5. Start the app:
   ```bash
   npm start
   ```
6. Open:
   ```text
   http://localhost:3000
   ```

## Deploy on Render

1. Push this folder to GitHub.
2. In Render, create a **Web Service** and connect the GitHub repo.
3. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables:
   - `HF_TOKEN`
   - `HF_MODEL` (optional, default is `facebook/nllb-200-distilled-600M`)

Render documents that free web services are available, with important limitations and not intended for production apps. citeturn730620search2turn730620search11

## Hugging Face token

Get your HF access token from account settings, then store it only on the backend as `HF_TOKEN`. The JS docs show `InferenceClient` in Node.js/browser-friendly environments and the translation method with `src_lang` and `tgt_lang`. citeturn145026view2turn474683view0turn685227view0

## Notes

- `Roman Hindi` is created by transliterating Hindi output into Latin script.
- NLLB-200 is a research model and its model card warns that it is not released for production deployment and is not intended for document translation; it is best for personal subtitle lines and short chunks. citeturn474683view2
