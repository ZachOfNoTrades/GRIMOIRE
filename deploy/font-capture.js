// Save the Google Fonts responses a next build downloads, as the backup mocked-responses.js serves
const Module = require("module");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const capture_dir = process.env.FONT_CAPTURE_DIR;

// Name a saved response by a hash of its URL
function SavedName(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

function Save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".part", data);
  fs.renameSync(file + ".part", file); // Rename temporary file to permanent to avoid a half-written file
}

// Wrap next/font's Google Fonts fetchers as they load, saving each answer
const load = Module._load;
Module._load = function (request, parent, is_main) {
  const loaded_exports = load.apply(this, arguments);
  if (!capture_dir || !loaded_exports || loaded_exports.__font_capture) return loaded_exports;
  try {
    if (typeof loaded_exports.fetchCSSFromGoogleFonts === "function") {
      const fetch_css = loaded_exports.fetchCSSFromGoogleFonts;
      loaded_exports.fetchCSSFromGoogleFonts = async (url, ...rest) => {
        const css = await fetch_css(url, ...rest);
        Save(path.join(capture_dir, "css", SavedName(url) + ".json"), JSON.stringify({ url, css }));
        return css;
      };
      loaded_exports.__font_capture = true;
    }
    if (typeof loaded_exports.fetchFontFile === "function") {
      const fetch_font = loaded_exports.fetchFontFile;
      loaded_exports.fetchFontFile = async (url, ...rest) => {
        const font = await fetch_font(url, ...rest);
        Save(path.join(capture_dir, "files", SavedName(url) + path.extname(new URL(url).pathname)), font);
        return font;
      };
      loaded_exports.__font_capture = true;
    }
  } catch (err) {
    console.error(`font capture: ${err.message}`);
  }
  return loaded_exports;
};
