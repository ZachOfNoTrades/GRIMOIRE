import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '@/lib/mcp/context';
import { json, text } from '@/lib/mcp/format';

import { getAllDecks, getDeckById, createDeck, updateDeck, deleteDeck } from '@/app/modules/rune/lib/deckFunctions';
import { getCardsByDeckId, getCardById, insertCard, updateCard, deleteCard, upsertCards } from '@/app/modules/rune/lib/cardFunctions';
import { CARD_SOURCE_REF_MAX, CARD_CATEGORY_MAX } from '@/app/modules/rune/types/card';
import {
  createStudySession,
  submitCardReview,
  completeStudySession,
} from '@/app/modules/rune/lib/studyFunctions';

export function registerRuneTools(server: McpServer, ctx: McpContext) {
  const userId = ctx.user.id;

  server.registerTool(
    'rune_list_decks',
    {
      description: 'All flashcard decks the user owns.',
      inputSchema: {},
    },
    async () => json(await getAllDecks(userId)),
  );

  server.registerTool(
    'rune_get_deck',
    {
      description: 'Metadata for a single deck.',
      inputSchema: { deckId: z.string() },
    },
    async ({ deckId }) => json(await getDeckById(userId, deckId)),
  );

  server.registerTool(
    'rune_list_cards',
    {
      description: 'All cards in a deck with each card\'s SM-2 progress (ease factor, interval, repetitions).',
      inputSchema: { deckId: z.string() },
    },
    async ({ deckId }) => json(await getCardsByDeckId(userId, deckId)),
  );

  server.registerTool(
    'rune_get_card',
    {
      description: 'Detail for a single card including SM-2 progress.',
      inputSchema: { cardId: z.string() },
    },
    async ({ cardId }) => json(await getCardById(userId, cardId)),
  );

  server.registerTool(
    'rune_create_deck',
    {
      description: 'Create a new flashcard deck.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        sourceUrl: z.string().nullable().optional(),
      },
    },
    async ({ name, description, sourceUrl }) =>
      json(await createDeck(userId, name, description ?? null, sourceUrl ?? null)),
  );

  server.registerTool(
    'rune_update_deck',
    {
      description: 'Update a deck\'s name, description, and/or source URL.',
      inputSchema: {
        deckId: z.string(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        sourceUrl: z.string().nullable().optional(),
      },
    },
    async ({ deckId, name, description, sourceUrl }) => {
      await updateDeck(userId, deckId, name, description ?? null, sourceUrl ?? null);
      return text('Deck updated.');
    },
  );

  server.registerTool(
    'rune_delete_deck',
    {
      description: 'Permanently delete a deck and all of its cards, progress, and review history.',
      inputSchema: { deckId: z.string() },
    },
    async ({ deckId }) => {
      await deleteDeck(userId, deckId);
      return text(`Deleted deck ${deckId}.`);
    },
  );

  server.registerTool(
    'rune_create_card',
    {
      description: 'Add a new card to a deck.',
      inputSchema: {
        deckId: z.string(),
        front: z.string().min(1),
        back: z.string().nullable().optional().describe('The answer. Omit, or pass null / an empty string, to create the card without an answer — an answerless card still studies normally (the user self-rates); use is_draft to hold a card out of study.'),
        notes: z.string().nullable().optional(),
        category: z.string().max(CARD_CATEGORY_MAX).nullable().optional().describe('Optional category label for grouping/filtering cards; omit or null for uncategorized.'),
        isDraft: z.boolean().optional().describe('Draft status: true hides the card from study and the due count; omit or false to publish it normally.'),
        sourceRef: z.string().max(CARD_SOURCE_REF_MAX).nullable().optional().describe('Where this card\'s material came from, in the user\'s own words — a URL, or free text like "Per Chief\'s lecture". Shown under the notes on the study card. Omit or null for none.'),
      },
    },
    async ({ deckId, front, back, notes, category, isDraft, sourceRef }) =>
      json(await insertCard(userId, deckId, front, back ?? '', notes ?? null, category ?? null, isDraft ?? false, sourceRef ?? null, 'mcp')),
  );

  server.registerTool(
    'rune_update_card',
    {
      description: 'Update a card\'s front, back, notes, category, source reference, and/or draft status. Does not affect SM-2 progress.',
      inputSchema: {
        cardId: z.string(),
        front: z.string().min(1),
        back: z.string().nullable().optional().describe('The answer: pass a string to set it, null or an empty string to clear it (the card still studies, self-rated), or omit to leave the existing answer unchanged.'),
        notes: z.string().nullable().optional(),
        category: z.string().max(CARD_CATEGORY_MAX).nullable().optional().describe('Category label: pass a string to set it, null to clear it, or omit to leave the existing category unchanged.'),
        isDraft: z.boolean().optional().describe('Draft status: true hides the card from study and the due count, false publishes it; omit to leave unchanged.'),
        sourceRef: z.string().max(CARD_SOURCE_REF_MAX).nullable().optional().describe('Where this card\'s material came from, in the user\'s own words — a URL, or free text like "Per Chief\'s lecture". Pass a string to set it, null to clear it, or omit to leave the existing reference unchanged.'),
      },
    },
    async ({ cardId, front, back, notes, category, isDraft, sourceRef }) => {
      // `back`, `category`, `isDraft` and `sourceRef` are passed through as-is (undefined
      // when omitted) so updateCard's tri-state applies: omit = leave unchanged, otherwise
      // set. An explicit null back is normalized to '' — the no-answer representation.
      await updateCard(userId, cardId, front, back === undefined ? undefined : (back ?? ''), notes ?? null, category, isDraft, sourceRef, 'mcp');
      return text('Card updated.');
    },
  );

  server.registerTool(
    'rune_upsert_cards',
    {
      description:
        'Create and/or update multiple cards in a deck in one call. Each entry with a cardId ' +
        'that belongs to this deck is updated in place (front/back/notes/category/sourceRef/draft — SM-2 ' +
        'progress is preserved); each entry without a cardId (or with an unrecognized one) is inserted as ' +
        'a new card. Cards not included in the list are left untouched — nothing is deleted. ' +
        'A card may be created or left with a blank back (a self-graded card) — those study normally; use is_draft to hold one out of study. ' +
        'Returns the resulting cards in the same order as the input.',
      inputSchema: {
        deckId: z.string(),
        cards: z.array(z.object({
          cardId: z.string().nullable().optional().describe('Existing card ID to update; omit or null to create a new card.'),
          front: z.string().min(1),
          back: z.string().nullable().optional().describe('The answer: a string to set it, null or an empty string to clear it (the card still studies, self-rated), or omit to leave an updated card\'s existing answer unchanged (new cards default to no answer).'),
          notes: z.string().nullable().optional(),
          category: z.string().max(CARD_CATEGORY_MAX).nullable().optional().describe('Category label: string to set, null to clear, or omit to leave an updated card\'s existing category unchanged (new cards default to uncategorized).'),
          isDraft: z.boolean().optional().describe('Draft status: true hides the card from study and the due count, false publishes it; omit to leave an updated card unchanged (new cards default to published).'),
          sourceRef: z.string().max(CARD_SOURCE_REF_MAX).nullable().optional().describe('Where this card\'s material came from, in the user\'s own words — a URL, or free text like "Per Chief\'s lecture". String to set, null to clear, or omit to leave an updated card\'s existing reference unchanged (new cards default to none).'),
        })).min(1),
      },
    },
    async ({ deckId, cards }) =>
      json(await upsertCards(
        userId,
        deckId,
        // Spread category/isDraft/sourceRef only when the key is present so `undefined`
        // reaches the lib as "leave unchanged" rather than being coerced to a concrete value.
        cards.map((c) => ({
          id: c.cardId ?? null,
          front: c.front,
          notes: c.notes ?? null,
          // `back` is spread only when present so an omitted answer reaches the lib as
          // "leave unchanged" for an update, rather than blanking the card.
          ...('back' in c ? { back: c.back ?? '' } : {}),
          ...('category' in c ? { category: c.category ?? null } : {}),
          ...('isDraft' in c ? { isDraft: c.isDraft } : {}),
          ...('sourceRef' in c ? { sourceRef: c.sourceRef ?? null } : {}),
        })),
        'mcp',
      )),
  );

  server.registerTool(
    'rune_delete_card',
    {
      description: 'Permanently delete a card and its progress and review history.',
      inputSchema: { cardId: z.string() },
    },
    async ({ cardId }) => {
      await deleteCard(userId, cardId);
      return text(`Deleted card ${cardId}.`);
    },
  );

  server.registerTool(
    'rune_start_study_session',
    {
      description: 'Open a new study session for a deck. Returns the studySessionId to pass to rune_submit_review.',
      inputSchema: { deckId: z.string() },
    },
    async ({ deckId }) => {
      const studySessionId = await createStudySession(userId, deckId);
      return json({ studySessionId });
    },
  );

  server.registerTool(
    'rune_submit_review',
    {
      description: 'Record a review of a card during an open study session. Rating is 1=Again, 2=Hard, 3=Good, 4=Easy.',
      inputSchema: {
        cardId: z.string(),
        studySessionId: z.string(),
        rating: z.number().int().min(1).max(4),
        responseTimeMs: z.number().int().min(0).nullable().optional(),
      },
    },
    async ({ cardId, studySessionId, rating, responseTimeMs }) => {
      await submitCardReview(userId, cardId, studySessionId, rating, responseTimeMs ?? null);
      return text('Review recorded.');
    },
  );

  server.registerTool(
    'rune_complete_study_session',
    {
      description: 'Close out a study session after all reviews are submitted.',
      inputSchema: {
        studySessionId: z.string(),
        durationSeconds: z.number().int().min(0),
      },
    },
    async ({ studySessionId, durationSeconds }) => {
      await completeStudySession(userId, studySessionId, durationSeconds);
      return text('Study session completed.');
    },
  );
}
