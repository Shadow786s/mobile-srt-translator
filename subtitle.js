function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseSRT(content) {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const subtitles = [];

  for (const block of blocks) {
    const lines = block.split("\n").map(line => line.trimEnd());
    if (lines.length < 2) continue;

    let number = null;
    let timestampIndex = 0;

    if (/^\d+$/.test(lines[0].trim())) {
      number = lines[0].trim();
      timestampIndex = 1;
    }

    const timestamp = lines[timestampIndex]?.trim();
    if (!timestamp || !timestamp.includes("-->")) continue;

    const text = lines.slice(timestampIndex + 1).join("\n").trimEnd();

    subtitles.push({
      number: number || String(subtitles.length + 1),
      timestamp,
      text
    });
  }

  return subtitles;
}

function parseVTT(content) {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const subtitles = [];
  let cueNumber = 1;

  for (const block of blocks) {
    const lines = block.split("\n").map(line => line.trimEnd());
    if (!lines.length) continue;

    if (lines[0].trim() === "WEBVTT") continue;
    if (lines[0].startsWith("NOTE")) continue;

    let timestampIndex = lines.findIndex(line => line.includes("-->"));
    if (timestampIndex === -1) continue;

    const timestamp = lines[timestampIndex].trim();
    const text = lines.slice(timestampIndex + 1).join("\n").trimEnd();
    if (!text) continue;

    subtitles.push({
      number: String(cueNumber++),
      timestamp,
      text
    });
  }

  return subtitles;
}

function parseSubtitle(content, extension) {
  if (extension === ".vtt") return parseVTT(content);
  return parseSRT(content);
}

function buildSRT(subtitles) {
  return subtitles
    .map(subtitle => [
      subtitle.number,
      subtitle.timestamp,
      subtitle.text
    ].join("\n"))
    .join("\n\n");
}

function splitTextIntoLines(text) {
  return normalizeNewlines(text).split("\n");
}

module.exports = {
  parseSubtitle,
  buildSRT,
  splitTextIntoLines
};
