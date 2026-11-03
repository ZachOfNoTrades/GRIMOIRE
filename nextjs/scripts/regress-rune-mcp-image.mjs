#!/usr/bin/env node
// Regression check: rune_attach_card_image adds a picture to a card through the MCP server and refuses bad input
// Usage: GRIMOIRE_API_KEY=grm_xxx node scripts/regress-rune-mcp-image.mjs
// NOTE: Runs only as the test account agent-test@grimoire.local, and deletes only the deck it creates
import { deflateSync } from 'zlib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.GRIMOIRE_BASE || 'http://localhost:3000';
const KEY = process.env.GRIMOIRE_API_KEY;
if (!KEY) {
  console.error('Missing GRIMOIRE_API_KEY env var.');
  process.exit(2);
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

// Build a valid PNG of random pixels, stored uncompressed so its size follows its width and height
function makePng(width, height) {
  const crc = (bytes) => {
    let value = ~0;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    return ~value >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = 1 + width * 3;
  const pixels = Buffer.alloc(row * height);
  for (let index = 0; index < pixels.length; index++) {
    if (index % row !== 0) pixels[index] = Math.floor(Math.random() * 256);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${KEY}` } },
});
const client = new Client({ name: 'regress-rune-mcp-image', version: '0.1.0' });
await client.connect(transport);

// Call a tool and return its parsed answer, or `{ error }` when it refuses
const call = async (name, args) => {
  try {
    const result = await client.callTool({ name, arguments: args });
    const output = result.content?.[0]?.text ?? '';
    if (result.isError) return { error: output };
    try { return JSON.parse(output); } catch { return { message: output }; }
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
};

const whoami = await call('whoami', {});
if (!/agent-test/.test(JSON.stringify(whoami))) {
  console.error('Refusing to run as anyone but a test account.');
  process.exit(2);
}

const deck = await call('rune_create_deck', { name: `regress-mcp-image-${Date.now()}` });
try {
  const card = await call('rune_create_card', { deckId: deck.id, front: 'Front text', back: 'Back text', notes: 'Notes text', sourceRef: 'Kept source' });
  const small = makePng(8, 8).toString('base64');

  // Add a picture to each field
  const back = await call('rune_attach_card_image', { cardId: card.id, field: 'back', imageBase64: small });
  check('back answers with a url', typeof back.url === 'string', JSON.stringify(back));
  await call('rune_attach_card_image', { cardId: card.id, field: 'front', imageBase64: `data:image/png;base64,${small}` });
  await call('rune_attach_card_image', { cardId: card.id, field: 'notes', imageBase64: small });
  await call('rune_attach_card_image', { cardId: card.id, field: 'back', imageBase64: small });
  const saved = await call('rune_get_card', { cardId: card.id });
  check('front keeps its text and gains a picture', /^Front text\n\n!\[\]\(\/modules\/rune\/api\/uploads\/.+\.png\)$/.test(saved.front), saved.front);
  check('notes keep their text and gain a picture', /^Notes text\n\n!\[\]\(.+\)$/.test(saved.notes), saved.notes);
  check('a second picture lands after the first', (saved.back.match(/!\[\]\(/g) ?? []).length === 2 && saved.back.startsWith('Back text\n\n'), saved.back);
  check('the source and channel are right', saved.source_ref === 'Kept source' && saved.modified_via === 'mcp', `${saved.source_ref} ${saved.modified_via}`);

  // Fetch the stored file
  const file = await fetch(`${BASE}${back.url}`, { headers: { 'X-API-Key': KEY } });
  check('the stored file is served as the same PNG', file.status === 200 && file.headers.get('content-type') === 'image/png' && Buffer.from(await file.arrayBuffer()).toString('base64') === small);

  // Add a picture to an empty field
  const bare = await call('rune_create_card', { deckId: deck.id, front: 'Bare' });
  await call('rune_attach_card_image', { cardId: bare.id, field: 'back', imageBase64: small });
  await call('rune_attach_card_image', { cardId: bare.id, field: 'notes', imageBase64: small });
  const bareSaved = await call('rune_get_card', { cardId: bare.id });
  check('an empty back and notes hold only the picture', /^!\[\]\(/.test(bareSaved.back) && /^!\[\]\(/.test(bareSaved.notes), `${bareSaved.back} | ${bareSaved.notes}`);

  // Send files either side of the MCP request limit
  const large = makePng(960, 960);
  const largeResult = await call('rune_attach_card_image', { cardId: bare.id, field: 'front', imageBase64: large.toString('base64') });
  check(`a ${(large.length / 1048576).toFixed(1)} MB image is accepted`, typeof largeResult.url === 'string', largeResult.error ?? '');
  const oversized = await call('rune_attach_card_image', { cardId: bare.id, field: 'front', imageBase64: makePng(1300, 1300).toString('base64') });
  check('an image over the request limit is refused', /too large/i.test(oversized.error ?? ''), oversized.error);

  // Send input that must be refused
  const refusals = [
    ['no image', { cardId: card.id, field: 'back' }, /exactly one/],
    ['both image sources', { cardId: card.id, field: 'back', imageBase64: small, imageUrl: 'https://example.com/a.png' }, /exactly one/],
    ['a bad field', { cardId: card.id, field: 'category', imageBase64: small }, /.+/],
    ['text that is not base64', { cardId: card.id, field: 'back', imageBase64: '<script>alert(1)</script>' }, /not valid base64/],
    ['an empty image', { cardId: card.id, field: 'back', imageBase64: '   ' }, /exactly one|not valid base64/],
    ['a file that is not an image', { cardId: card.id, field: 'back', imageBase64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') }, /Unsupported image/],
    ['a card that does not exist', { cardId: '00000000-0000-0000-0000-000000000000', field: 'back', imageBase64: small }, /No card found/],
    ['a card id that is not one', { cardId: "'; DROP TABLE cards;--", field: 'back', imageBase64: small }, /.+/],
    ['a loopback link', { cardId: card.id, field: 'back', imageUrl: 'http://127.0.0.1:3000/favicon.ico' }, /private address/],
    ['a private network link', { cardId: card.id, field: 'back', imageUrl: 'http://[fd00::1]/' }, /private address/],
    ['localhost', { cardId: card.id, field: 'back', imageUrl: 'http://localhost:3000/' }, /private address/],
    ['a cloud metadata link', { cardId: card.id, field: 'back', imageUrl: 'http://169.254.169.254/latest/meta-data/' }, /private address/],
    ['a file link', { cardId: card.id, field: 'back', imageUrl: 'file:///etc/passwd' }, /http/],
    ['a malformed link', { cardId: card.id, field: 'back', imageUrl: 'not a url' }, /Invalid URL/],
  ];
  const before = (await call('rune_get_card', { cardId: card.id })).back;
  for (const [label, args, expected] of refusals) {
    const result = await call('rune_attach_card_image', args);
    check(`refuses ${label}`, expected.test(result.error ?? ''), result.error ?? JSON.stringify(result));
  }
  check('refused calls leave the card unchanged', (await call('rune_get_card', { cardId: card.id })).back === before);

  // Attach to the same card concurrently
  const race = await call('rune_create_card', { deckId: deck.id, front: 'Race' });
  await Promise.all(Array.from({ length: 6 }, () => call('rune_attach_card_image', { cardId: race.id, field: 'back', imageBase64: small })));
  const raceSaved = await call('rune_get_card', { cardId: race.id });
  check('six calls at once keep six pictures', (raceSaved.back.match(/!\[\]\(/g) ?? []).length === 6, raceSaved.back.length);
} finally {
  await call('rune_delete_deck', { deckId: deck.id });
  await client.close();
}

console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exit(failures ? 1 : 0);
