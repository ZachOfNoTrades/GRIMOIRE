import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '@/lib/mcp/context';
import { json, text } from '@/lib/mcp/format';

import { getAllDecks, getDeckById, createDeck, updateDeck, deleteDeck } from '@/app/modules/rune/lib/deckFunctions';
import { getCardsByDeckId, getCardById, insertCard, updateCard, deleteCard, upsertCards } from '@/app/modules/rune/lib/cardFunctions';
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
        back: z.string().min(1),
        notes: z.string().nullable().optional(),
        category: z.string().nullable().optional().describe('Optional category label for grouping/filtering cards; omit or null for uncategorized.'),
        isDraft: z.boolean().optional().describe('Draft status: true hides the card from study and the due count; omit or false to publish it normally.'),
      },
    },
    async ({ deckId, front, back, notes, category, isDraft }) =>
      json(await insertCard(userId, deckId, front, back, notes ?? null, category ?? null, isDraft ?? false)),
  );

  server.registerTool(
    'rune_update_card',
    {
      description: 'Update a card\'s front, back, notes, category, and/or draft status. Does not affect SM-2 progress.',
      inputSchema: {
        cardId: z.string(),
        front: z.string().min(1),
        back: z.string().min(1),
        notes: z.string().nullable().optional(),
        category: z.string().nullable().optional().describe('Category label: pass a string to set it, null to clear it, or omit to leave the existing category unchanged.'),
        isDraft: z.boolean().optional().describe('Draft status: true hides the card from study and the due count, false publishes it; omit to leave unchanged.'),
      },
    },
    async ({ cardId, front, back, notes, category, isDraft }) => {
      // `category` and `isDraft` are passed through as-is (undefined when omitted) so
      // updateCard's tri-state applies: omit = leave unchanged, otherwise set.
      await updateCard(userId, cardId, front, back, notes ?? null, category, isDraft);
      return text('Card updated.');
    },
  );

  server.registerTool(
    'rune_upsert_cards',
    {
      description:
        'Create and/or update multiple cards in a deck in one call. Each entry with a cardId ' +
        'that belongs to this deck is updated in place (front/back/notes/category/draft — SM-2 ' +
        'progress is preserved); each entry without a cardId (or with an unrecognized one) is inserted as ' +
        'a new card. Cards not included in the list are left untouched — nothing is deleted. ' +
        'Returns the resulting cards in the same order as the input.',
      inputSchema: {
        deckId: z.string(),
        cards: z.array(z.object({
          cardId: z.string().nullable().optional().describe('Existing card ID to update; omit or null to create a new card.'),
          front: z.string().min(1),
          back: z.string().min(1),
          notes: z.string().nullable().optional(),
          category: z.string().nullable().optional().describe('Category label: string to set, null to clear, or omit to leave an updated card\'s existing category unchanged (new cards default to uncategorized).'),
          isDraft: z.boolean().optional().describe('Draft status: true hides the card from study and the due count, false publishes it; omit to leave an updated card unchanged (new cards default to published).'),
        })).min(1),
      },
    },
    async ({ deckId, cards }) =>
      json(await upsertCards(
        userId,
        deckId,
        // Spread category/isDraft only when the key is present so `undefined` reaches the
        // lib as "leave unchanged" rather than being coerced to a concrete value.
        cards.map((c) => ({
          id: c.cardId ?? null,
          front: c.front,
          back: c.back,
          notes: c.notes ?? null,
          ...('category' in c ? { category: c.category ?? null } : {}),
          ...('isDraft' in c ? { isDraft: c.isDraft } : {}),
        })),
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
