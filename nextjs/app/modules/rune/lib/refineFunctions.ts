import { unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { getDeckById } from './deckFunctions';
import { getCardsByDeckId, updateCard } from './cardFunctions';
import type { RequestChannel } from '@/lib/permissions';
import { callLLM, readLLMOutput } from './llmFunctions';
import { loadPromptFile } from './promptLoader';
import { fetchNotionPageContent } from './notionFunctions';
import { RefineDeckPayload, RefineCardPayload, ProposedChange, RefineDeckProposal } from '../types/generation';

// Calls LLM with existing cards + feedback, computes a diff of proposed changes.
// Does NOT apply changes — returns them for user review.
export async function proposeDeckRefinement(
  userId: string,
  deckId: string,
  feedback: string,
): Promise<RefineDeckProposal> {
  const startTime = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Deck refinement in progress... [${elapsedSeconds}s elapsed]`);
  }, 15000);

  try {
    // Fetch deck and cards
    const deck = await getDeckById(userId, deckId);
    const cards = await getCardsByDeckId(userId, deckId);

    // Build existing cards JSON for the prompt
    const existingCardsJson = JSON.stringify(
      cards.map((c) => ({ id: c.id, front: c.front, back: c.back, notes: c.notes })),
      null,
      2,
    );

    // Optionally fetch Notion source content
    let sourceContent = 'None';
    if (deck.source_url) {
      try {
        const notionPage = await fetchNotionPageContent(deck.source_url);
        sourceContent = notionPage.content;
        console.log(`[RefineDeck] Fetched Notion source content (${sourceContent.length} chars)`);
      } catch (error) {
        console.warn(`[RefineDeck] Failed to fetch Notion source content:`, error);
        sourceContent = 'Failed to fetch source content.';
      }
    }

    // Build prompt
    const taskPrompt = loadPromptFile('refineDeck.md')
      .replace('{{FEEDBACK}}', feedback)
      .replace('{{EXISTING_CARDS}}', existingCardsJson)
      .replace('{{SOURCE_CONTENT}}', sourceContent)
      .replace('{{DECK_ID}}', deckId)
      .replace('{{DECK_NAME}}', deck.name);

    // Call LLM
    console.log(`[RefineDeck] Calling LLM for deck '${deck.name}'`);
    const outputFile = await callLLM(taskPrompt);
    const rawContent = readLLMOutput(outputFile);
    try { unlinkSync(outputFile); } catch { } // Clear temp file

    // Parse response
    const payload = parseRefineDeckResponse(rawContent);

    // Compute diff between existing cards and LLM output
    const existingMap = new Map(cards.map((c) => [c.id, c]));
    const changes: ProposedChange[] = [];

    // Cards returned by LLM with an existing ID
    const keptIds = new Set<string>();

    for (const refined of payload.cards) {
      if (refined.id && existingMap.has(refined.id)) {
        // Existing card — check if modified
        keptIds.add(refined.id);
        const original = existingMap.get(refined.id)!;
        const frontChanged = refined.front.trim() !== original.front;
        const backChanged = refined.back.trim() !== original.back;
        const notesChanged = (refined.notes?.trim() || null) !== (original.notes || null);

        if (frontChanged || backChanged || notesChanged) {
          changes.push({
            type: 'modified',
            cardId: refined.id,
            originalFront: original.front,
            originalBack: original.back,
            originalNotes: original.notes,
            proposedFront: refined.front.trim(),
            proposedBack: refined.back.trim(),
            proposedNotes: refined.notes?.trim() || null,
          });
        }
        // Unchanged cards are not included in the proposal
      } else {
        // New card
        changes.push({
          type: 'added',
          cardId: null,
          originalFront: null,
          originalBack: null,
          originalNotes: null,
          proposedFront: refined.front.trim(),
          proposedBack: refined.back.trim(),
          proposedNotes: refined.notes?.trim() || null,
        });
      }
    }

    // Cards in DB but NOT in LLM output — proposed for deletion
    for (const [cardId, original] of existingMap) {
      if (!keptIds.has(cardId)) {
        changes.push({
          type: 'deleted',
          cardId,
          originalFront: original.front,
          originalBack: original.back,
          originalNotes: original.notes,
          proposedFront: null,
          proposedBack: null,
          proposedNotes: null,
        });
      }
    }

    const totalSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[RefineDeck] Proposal complete in ${totalSeconds}s. ${changes.length} changes proposed`);

    return { changes };
  } finally {
    clearInterval(heartbeat);
  }
}

// Refines a single card based on user feedback via lightweight LLM call.
export async function refineCard(
  userId: string,
  cardId: string,
  feedback: string,
  via: RequestChannel = 'web',
): Promise<RefineCardPayload> {
  // Fetch the card to get current content
  const { getCardById } = await import('./cardFunctions');
  const card = await getCardById(userId, cardId);

  const filledPrompt = loadPromptFile('refineCard.md')
    .replace('{{FEEDBACK}}', feedback)
    .replace('{{CARD_FRONT}}', card.front)
    .replace('{{CARD_BACK}}', card.back)
    .replace('{{CARD_NOTES}}', card.notes || 'None');

  console.log(`[RefineCard] Calling LLM for card '${card.front.substring(0, 50)}'`);

  const responseText = await callClaudeLightweight(filledPrompt);
  console.log(`[RefineCard] Claude response: ${responseText}`);

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse card refinement response as JSON');
  }

  let parsed: RefineCardPayload;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    const preview = jsonMatch[0].substring(0, 200);
    throw new Error(`Failed to parse card refinement response as JSON. Preview: ${preview}`);
  }

  if (!parsed.front || !parsed.back) {
    throw new Error('Refined card must have front and back fields');
  }

  // Update the card in the database. category / isDraft / sourceRef are passed as
  // undefined so updateCard leaves them alone — refine only rewrites the card's text,
  // and must not clear a category, draft flag, or user-typed citation as a side effect.
  await updateCard(userId, cardId, parsed.front, parsed.back, parsed.notes || null, undefined, undefined, undefined, via);

  console.log(`[RefineCard] Card updated successfully`);
  return parsed;
}

// Parse and validate the LLM response for deck refinement
function parseRefineDeckResponse(rawContent: string): RefineDeckPayload {
  let cleanedResponse = rawContent.trim();
  const fenceMatch = cleanedResponse.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleanedResponse = fenceMatch[1].trim();
  }

  let payload: RefineDeckPayload;
  try {
    payload = JSON.parse(cleanedResponse);
  } catch {
    const preview = cleanedResponse.substring(0, 200);
    throw new Error(`Failed to parse deck refinement response as JSON. Preview: ${preview}`);
  }

  if (!payload.cards || !Array.isArray(payload.cards)) {
    throw new Error('Refinement response must contain a cards array');
  }

  // Validate each card
  for (let i = 0; i < payload.cards.length; i++) {
    const card = payload.cards[i];
    if (!card.front || !card.back) {
      throw new Error(`Refined card ${i + 1}: front and back are required`);
    }
  }

  return payload;
}

// Spawn Claude CLI with no tools for lightweight single-card refinement
function callClaudeLightweight(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      [
        '-p',
        '--output-format', 'text',
        '--no-session-persistence',
      ],
      {
        timeout: 60000,
        shell: true,
        env: { ...process.env },
      },
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      reject(new Error(`Claude CLI error: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
      }
    });

    console.log('[RefineCard] Spawning Claude CLI...');
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
