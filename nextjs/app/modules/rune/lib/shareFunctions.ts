import sql from 'mssql';
import { NextResponse } from 'next/server';
import { getRuneConnection } from './db';
import { getMainConnection } from '@/lib/db';
import { DeckSummary } from '../types/deck';
import { DeckAccess, DeckRole, DeckShare, DeckShareRole } from '../types/share';

// Deck access + sharing. Every deck route resolves the caller's role here instead of the
// old "d.user_id = @userId" ownership check, then does its work as the deck's OWNER for
// anything stored on the deck (cards keep the owner's user_id no matter who wrote them)
// and as the CALLER for anything personal (study progress, reviews, sessions).
//
// A share is keyed on an email address, not a user id. The requester's own sign-in email
// is matched against it at access time, which is what makes sharing fire-and-forget: a
// share to an address with no account yet is stored exactly like any other and starts
// working the day that person signs in. Nothing here ever tells the sharer whether the
// address belongs to anyone.

// The identity a request carries. `email` is absent for some API-key callers; such a caller
// can still reach decks they own, just none shared to them.
export interface DeckViewer {
  id: string;
  email?: string | null;
}

const ROLE_RANK: Record<DeckRole, number> = { view: 1, edit: 2, owner: 3 };

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deliberately loose — one @, something on both sides, a dot in the domain. Deliverability
// is never checked (there's nothing to deliver), so this only catches obvious typos.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidShareEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function isDeckShareRole(value: unknown): value is DeckShareRole {
  return value === 'view' || value === 'edit';
}

function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function viewerEmail(viewer: DeckViewer): string | null {
  return viewer.email ? normalizeEmail(viewer.email) : null;
}

// Resolves what `viewer` may do with a deck. A deck they have no access to throws the same
// "No deck found" as a deck that doesn't exist, so a guessed id reveals nothing.
export async function getDeckAccess(viewer: DeckViewer, deckId: string): Promise<DeckAccess> {
  // A malformed id would otherwise reach the uniqueidentifier comparison and 500.
  if (!GUID_RE.test(deckId)) {
    throw new Error(`No deck found for id: '${deckId}'`);
  }

  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .input('email', sql.NVarChar(320), viewerEmail(viewer))
    .query<{ owner_id: string; share_role: DeckShareRole | null; is_favorite: boolean | null; is_disabled: boolean | null }>(`
      SELECT d.user_id AS owner_id, s.role AS share_role, s.is_favorite, s.is_disabled
      FROM decks d
      LEFT JOIN deck_shares s ON s.deck_id = d.id AND s.email = @email
      WHERE d.id = @deckId
    `);

  const row = result.recordset[0];
  if (!row) {
    throw new Error(`No deck found for id: '${deckId}'`);
  }

  if (sameId(row.owner_id, viewer.id)) {
    return { ownerId: row.owner_id, role: 'owner', shareFavorite: null, shareDisabled: null };
  }

  if (row.share_role) {
    return {
      ownerId: row.owner_id,
      role: row.share_role,
      shareFavorite: !!row.is_favorite,
      shareDisabled: !!row.is_disabled,
    };
  }

  throw new Error(`No deck found for id: '${deckId}'`);
}

// getDeckAccess plus a minimum role. Having SOME access but not enough is a 403 rather than
// a 404 — the caller can already see the deck, so there is nothing left to hide.
export async function requireDeckAccess(viewer: DeckViewer, deckId: string, minimum: DeckRole): Promise<DeckAccess> {
  const access = await getDeckAccess(viewer, deckId);
  if (ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new Error('Deck access denied');
  }
  return access;
}

// Maps the access errors above (and the card-scope one below) to their responses, so each
// route's catch block can hand them off in one line. Null for anything else.
export function deckAccessErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes('No deck found')) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }
  if (error.message.includes('Deck access denied')) {
    return NextResponse.json({ error: "You don't have permission to do that on this deck" }, { status: 403 });
  }
  return null;
}

// Confirms a card belongs to the given deck. Card writes are made as the deck's owner, and
// the card lib only scopes by owner — so without this, an editor of ONE shared deck could
// pass the id of a card from another of the owner's decks and change it.
export async function assertCardInDeck(deckId: string, cardId: string): Promise<void> {
  if (!GUID_RE.test(cardId)) {
    throw new Error(`No card found for id: '${cardId}'`);
  }
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .input('cardId', sql.UniqueIdentifier, cardId)
    .query(`SELECT 1 AS ok FROM cards WHERE id = @cardId AND deck_id = @deckId`);
  if (result.recordset.length === 0) {
    throw new Error(`No card found for id: '${cardId}'`);
  }
}

// ---------------------------------------------------------------- owner: manage shares

export async function listDeckShares(deckId: string): Promise<DeckShare[]> {
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .query<DeckShare>(`
      SELECT id, email, role, created_at
      FROM deck_shares
      WHERE deck_id = @deckId
      ORDER BY created_at, email
    `);
  return result.recordset;
}

export async function countDeckShares(deckId: string): Promise<number> {
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .query<{ n: number }>(`SELECT COUNT(*) AS n FROM deck_shares WHERE deck_id = @deckId`);
  return Number(result.recordset[0]?.n ?? 0);
}

// Creates the share, or changes its role if that address already has one. Idempotent, and
// identical in effect whether or not the address has an account.
export async function shareDeck(deckId: string, email: string, role: DeckShareRole): Promise<void> {
  const pool = await getRuneConnection();
  await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .input('email', sql.NVarChar(320), normalizeEmail(email))
    .input('role', sql.VarChar(10), role)
    .query(`
      MERGE deck_shares WITH (HOLDLOCK) AS t
      USING (SELECT @deckId AS deck_id, @email AS email) AS s
        ON t.deck_id = s.deck_id AND t.email = s.email
      WHEN MATCHED THEN
        UPDATE SET role = @role, modified_at = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (deck_id, email, role) VALUES (@deckId, @email, @role);
    `);
}

export async function updateDeckShareRole(deckId: string, shareId: string, role: DeckShareRole): Promise<void> {
  if (!GUID_RE.test(shareId)) throw new Error(`No share found for id: '${shareId}'`);
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .input('shareId', sql.UniqueIdentifier, shareId)
    .input('role', sql.VarChar(10), role)
    .query(`UPDATE deck_shares SET role = @role, modified_at = GETDATE() WHERE id = @shareId AND deck_id = @deckId`);
  if (result.rowsAffected[0] === 0) {
    throw new Error(`No share found for id: '${shareId}'`);
  }
}

export async function deleteDeckShare(deckId: string, shareId: string): Promise<void> {
  if (!GUID_RE.test(shareId)) throw new Error(`No share found for id: '${shareId}'`);
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .input('shareId', sql.UniqueIdentifier, shareId)
    .query(`DELETE FROM deck_shares WHERE id = @shareId AND deck_id = @deckId`);
  if (result.rowsAffected[0] === 0) {
    throw new Error(`No share found for id: '${shareId}'`);
  }
}

// ---------------------------------------------------------------- sharee

// A sharee removing a deck from their own list. Their study progress is left in place, so
// a later re-share picks up where they stopped.
export async function leaveDeckShare(viewer: DeckViewer, deckId: string): Promise<void> {
  const email = viewerEmail(viewer);
  if (!email) throw new Error(`No deck found for id: '${deckId}'`);
  const pool = await getRuneConnection();
  await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .input('email', sql.NVarChar(320), email)
    .query(`DELETE FROM deck_shares WHERE deck_id = @deckId AND email = @email`);
}

// The sharee's own star / pause, stored on their share row so it never touches the owner's.
export async function setShareFlags(
  viewer: DeckViewer,
  deckId: string,
  flags: { isFavorite?: boolean; isDisabled?: boolean }
): Promise<void> {
  const email = viewerEmail(viewer);
  if (!email) throw new Error(`No deck found for id: '${deckId}'`);
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('deckId', sql.UniqueIdentifier, deckId)
    .input('email', sql.NVarChar(320), email)
    .input('fav', sql.Bit, flags.isFavorite === undefined ? null : flags.isFavorite ? 1 : 0)
    .input('disabled', sql.Bit, flags.isDisabled === undefined ? null : flags.isDisabled ? 1 : 0)
    .query(`
      UPDATE deck_shares
      SET is_favorite = COALESCE(@fav, is_favorite),
          is_disabled = COALESCE(@disabled, is_disabled),
          modified_at = GETDATE()
      WHERE deck_id = @deckId AND email = @email
    `);
  if (result.rowsAffected[0] === 0) {
    throw new Error(`No deck found for id: '${deckId}'`);
  }
}

// Decks shared WITH the viewer, in the same summary shape as their own decks (counts and due
// from the viewer's own progress) plus the role and the owner's name. Decks the viewer owns
// are excluded even if someone shared one back to them — it's already in their own list.
export async function getSharedDecks(viewer: DeckViewer): Promise<DeckSummary[]> {
  const email = viewerEmail(viewer);
  if (!email) return [];

  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, viewer.id)
    .input('email', sql.NVarChar(320), email)
    .query(`
      SELECT
        d.id, d.name, d.description, d.user_id AS owner_id, s.role AS access_role,
        s.is_favorite, s.is_disabled,
        COUNT(c.id) AS card_count,
        -- Same due predicate as getAllDecks, with the sharee's own pause in place of the owner's.
        COUNT(CASE WHEN c.id IS NOT NULL AND s.is_disabled = 0 AND c.is_draft = 0 AND (cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE()) THEN 1 END) AS due_count,
        MAX(cp.last_reviewed_at) AS last_reviewed_at
      FROM deck_shares s
      INNER JOIN decks d ON d.id = s.deck_id AND d.is_archived = 0 AND d.user_id <> @userId
      LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
      LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
      WHERE s.email = @email
      GROUP BY d.id, d.name, d.description, d.user_id, s.role, s.is_favorite, s.is_disabled
    `);

  const ownerNames = await lookupOwnerNames(result.recordset.map((row) => row.owner_id));

  return result.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    is_favorite: !!row.is_favorite,
    is_disabled: !!row.is_disabled,
    card_count: row.card_count,
    due_count: row.due_count,
    last_reviewed_at: row.last_reviewed_at,
    access_role: row.access_role,
    owner_name: ownerNames.get(String(row.owner_id).toLowerCase()) ?? null,
  }));
}

// Owner display names live in MAIN; fetched separately and joined in memory (the DB name is
// env-configured, so no three-part-name joins).
export async function lookupOwnerNames(ownerIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ownerIds.map((id) => String(id).toLowerCase())));
  const names = new Map<string, string>();
  if (unique.length === 0) return names;

  const pool = await getMainConnection();
  const request = pool.request();
  const params = unique.map((id, i) => {
    request.input(`id${i}`, sql.UniqueIdentifier, id);
    return `@id${i}`;
  });
  const result = await request.query<{ id: string; name: string | null; email: string }>(
    `SELECT id, name, email FROM users WHERE id IN (${params.join(', ')})`
  );
  for (const row of result.recordset) {
    names.set(String(row.id).toLowerCase(), row.name || row.email);
  }
  return names;
}

// ---------------------------------------------------------------- uploads

function escapeLike(value: string): string {
  return value.replace(/[\[\]%_]/g, (ch) => `[${ch}]`);
}

// Card images/videos are stored under the UPLOADER's folder, so a shared deck's media lives
// in someone else's folder (the owner's, or an editor's). Access follows the card, not the
// folder: the file may be read by anyone who can open a deck with a card that embeds it.
export async function canViewUpload(viewer: DeckViewer, uploaderId: string, filename: string): Promise<boolean> {
  const pattern = `%/uploads/${escapeLike(uploaderId)}/${escapeLike(filename)}%`;
  const pool = await getRuneConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, viewer.id)
    .input('email', sql.NVarChar(320), viewerEmail(viewer))
    .input('pattern', sql.NVarChar(600), pattern)
    .query(`
      SELECT TOP 1 1 AS ok
      FROM cards c
      INNER JOIN decks d ON d.id = c.deck_id
      LEFT JOIN deck_shares s ON s.deck_id = d.id AND s.email = @email
      WHERE (d.user_id = @userId OR s.id IS NOT NULL)
        AND (c.front LIKE @pattern OR c.back LIKE @pattern OR c.notes LIKE @pattern)
    `);
  return result.recordset.length > 0;
}
