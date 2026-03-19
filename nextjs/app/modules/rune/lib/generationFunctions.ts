import { unlinkSync } from 'fs';
import { getRuneConnection, closeRuneConnection } from './db';
import { callLLM, readLLMOutput, parseLLMResponse, validateGeneratedCards } from './llmFunctions';
import { loadPromptFile } from './promptLoader';
import { fetchNotionPageContent } from './notionFunctions';
import { createDeck } from './deckFunctions';
import { insertCards } from './cardFunctions';

export interface GenerateDeckResult {
  deckId: string;
  cardsGenerated: number;
  notionPageTitle: string;
}

// Creates a new deck, fetches Notion page content, generates flash cards via LLM, and inserts them.
export async function generateDeckFromNotion(
  deckName: string,
  deckDescription: string | null,
  notionUrl: string,
  customPrompt: string | null,
): Promise<GenerateDeckResult> {
  const startTime = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Card generation in progress... [${elapsedSeconds}s elapsed]`);
  }, 15000);

  try {
    // Create the deck
    const deck = await createDeck(deckName, deckDescription);
    const deckId = deck.id;

    // Fetch Notion page content
    const notionPage = await fetchNotionPageContent(notionUrl);

    if (notionPage.content.trim().length === 0) {
      throw new Error('Notion page has no content');
    }

    // Generate and insert cards
    const cardsGenerated = await generateAndInsertCards(
      deckId,
      deckName,
      notionPage.content,
      customPrompt,
    );

    const totalSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[GenerateDeck] Complete in ${totalSeconds}s. ${cardsGenerated} cards created for deck '${deckName}'`);

    return {
      deckId,
      cardsGenerated,
      notionPageTitle: notionPage.title,
    };
  } finally {
    clearInterval(heartbeat);
  }
}

// Generates cards via LLM from Notion content and inserts them into the deck.
async function generateAndInsertCards(
  deckId: string,
  deckName: string,
  notionContent: string,
  customPrompt: string | null,
): Promise<number> {
  // Get starting order_index for new cards
  let pool;
  let startIndex: number;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('deckId', deckId)
      .query(`SELECT ISNULL(MAX(order_index), 0) + 1 AS next_index FROM cards WHERE deck_id = @deckId`);
    startIndex = result.recordset[0].next_index;
  } catch (error) {
    console.error('Error fetching start index:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }

  // Build prompt from template
  const taskPrompt = loadPromptFile('generateCards.md')
    .replace('{{NOTION_CONTENT}}', notionContent)
    .replace('{{DECK_ID}}', deckId)
    .replace('{{DECK_NAME}}', deckName)
    .replace(/\{\{START_INDEX\}\}/g, String(startIndex))
    .replace('{{CUSTOM_PROMPT}}', customPrompt?.trim() || 'None');

  // Call LLM
  console.log(`[GenerateCards] Calling LLM for deck '${deckName}'`);
  const outputFile = await callLLM(taskPrompt);
  const rawContent = readLLMOutput(outputFile);
  try { unlinkSync(outputFile); } catch { } // Clear temp file

  // Parse and validate
  const payload = parseLLMResponse(rawContent);
  const validation = validateGeneratedCards(payload);
  if (!validation.valid) {
    throw new Error(`Card generation validation failed: ${validation.errors.join('; ')}`);
  }

  // Insert cards into database
  return await insertCards(deckId, payload.cards, 'notion');
}
