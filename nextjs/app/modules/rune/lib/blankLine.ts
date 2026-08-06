// Markdown has no way to express an empty paragraph — any run of blank lines
// between two blocks collapses to a single block break — so a deliberate blank
// line the user typed in the card editor (e.g. breathing room between two
// pasted images) was silently dropped the moment the card was serialized to
// markdown and saved.
//
// Card text is stored as markdown, so the fix is a sentinel that survives a
// markdown round-trip: an intentional blank line is written as a paragraph
// holding a lone non-breaking space. Markdown keeps that as a real paragraph
// (U+00A0 is not markdown whitespace, so the line is not blank to the parser),
// the study/deck renderer paints it as the empty line the user typed, and the
// editor turns it back into a genuinely empty paragraph on load so the caret
// behaves normally.
export const BLANK_LINE = "\u00A0";
