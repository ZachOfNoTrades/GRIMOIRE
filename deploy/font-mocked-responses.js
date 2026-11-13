// Answer next/font's Google Fonts requests from the backup a good build saved in FONT_BACKUP_DIR
// NOTE: next/font reads this file when NEXT_FONT_GOOGLE_MOCKED_RESPONSES names it, and reads a font URL starting with / from disk
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const backup_dir = process.env.FONT_BACKUP_DIR;

function SavedName(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

const responses = {};
for (const file of fs.readdirSync(path.join(backup_dir, "css"))) {
  const { url, css } = JSON.parse(fs.readFileSync(path.join(backup_dir, "css", file), "utf8"));
  responses[url] = css.replace(/src: url\((.+?)\)/g, (match, font_url) =>
    `src: url(${path.join(backup_dir, "files", SavedName(font_url) + path.extname(new URL(font_url).pathname))})`);
}
module.exports = responses;
