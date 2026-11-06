#!/usr/bin/env node
// Regression check: the Tasks header on Models settings stacks its buttons on a phone instead of running past the page edge
// Usage: node scripts/regress-llm-settings-header-wrap.mjs
// NOTE: Needs no database or browser; it reads the page's source and the global stylesheet, as the page needs a signed-in user and live data
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nextjs_path = fileURLToPath(new URL('../', import.meta.url));

let failures = 0;
const Check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

// Read the declarations of the first rule whose selector matches exactly, inside the given text
const RuleBody = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
};

// Confirm the Tasks header puts its title and its buttons in the wrapping header classes
const page_source = readFileSync(join(nextjs_path, 'app/settings/ui/llm/page.tsx'), 'utf8');
const header_match = /<div className="settings-section-header">([\s\S]*?)All OpenRouter<\/Button>\s*<\/div>\s*<\/div>/.exec(page_source);
Check('the Tasks header uses the section header class', header_match !== null);
Check('the Tasks title sits in the header', /settings-section-title[^>]*>Tasks</.test(header_match?.[1] ?? ''));
Check('the set-all buttons sit in one actions group', /<div className="settings-section-actions">[\s\S]*All Claude<\/Button>/.test(header_match?.[1] ?? ''));

// Confirm the header wraps, the buttons keep their labels on one line, and a phone stacks them across the full width
const css = readFileSync(join(nextjs_path, 'app/globals.css'), 'utf8');
const header_rule = RuleBody(css, '.settings-section-header');
const actions_rule = RuleBody(css, '.settings-section-actions');
Check('the section header wraps', /flex-wrap:\s*wrap/.test(header_rule ?? ''));
Check('the actions keep each label on one line', /white-space:\s*nowrap/.test(actions_rule ?? ''));
Check('the actions wrap when they run out of room', /flex-wrap:\s*wrap/.test(actions_rule ?? ''));
const phone_block = /@media \(max-width: 480px\) \{\s*\.settings-section-actions \{([^}]*)\}\s*\.settings-section-actions > \* \{([^}]*)\}/.exec(css);
Check('a phone gives the actions their own line', /flex-basis:\s*100%/.test(phone_block?.[1] ?? ''));
Check('a phone stretches each button across the line', /flex:\s*1 1 auto/.test(phone_block?.[2] ?? ''));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
