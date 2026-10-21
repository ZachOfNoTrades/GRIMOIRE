import { getRuneConnection, closeRuneConnection } from './db';
import { normalizeEmail, DeckViewer } from './shareFunctions';
import {
  TroubleCard,
  TROUBLE_MIN_LAPSES,
  TROUBLE_RECENT_WINDOW,
  TROUBLE_MIN_RECENT_MISSES,
  TROUBLE_MAX_EASE,
} from '../types/trouble';

// Find the viewer's trouble cards across every deck they own or that is shared with them, worst first.
// NOTE: Reviews and progress are the viewer's own, so a shared deck lists the cards this viewer struggles with.
export async function getTroubleCards(viewer: DeckViewer): Promise<TroubleCard[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', viewer.id)
      .input('email', viewer.email ? normalizeEmail(viewer.email) : '')
      .input('recentWindow', TROUBLE_RECENT_WINDOW)
      .input('minLapses', TROUBLE_MIN_LAPSES)
      .input('minRecentMisses', TROUBLE_MIN_RECENT_MISSES)
      .input('maxEase', TROUBLE_MAX_EASE)
      .query(`
        WITH accessible_decks AS (
          SELECT d.id, d.name FROM decks d WHERE d.user_id = @userId AND d.is_archived = 0
          UNION
          SELECT d.id, d.name
          FROM deck_shares s
          INNER JOIN decks d ON d.id = s.deck_id AND d.is_archived = 0
          WHERE s.email = @email
        ),
        reviews AS (
          SELECT cr.card_id, cr.rating, cr.created_at,
            ROW_NUMBER() OVER (PARTITION BY cr.card_id ORDER BY cr.created_at DESC) AS recency,
            MAX(CASE WHEN cr.rating >= 3 THEN 1 ELSE 0 END) OVER (
              PARTITION BY cr.card_id ORDER BY cr.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) AS passed_before -- 1 once any earlier rating was Good or Easy
          FROM card_reviews cr
          WHERE cr.user_id = @userId
        ),
        review_stats AS (
          SELECT card_id,
            COUNT(*) AS review_count,
            SUM(CASE WHEN rating = 1 AND passed_before = 1 THEN 1 ELSE 0 END) AS lapse_count,
            SUM(CASE WHEN recency <= @recentWindow AND rating <= 2 THEN 1 ELSE 0 END) AS recent_miss_count,
            STRING_AGG(CASE WHEN recency <= @recentWindow THEN CAST(rating AS varchar(1)) END, ',')
              WITHIN GROUP (ORDER BY created_at DESC) AS recent_ratings
          FROM reviews
          GROUP BY card_id
        )
        SELECT c.id, c.deck_id, ad.name AS deck_name, c.front, c.back, c.notes, c.category, c.source_ref,
          rs.review_count, rs.lapse_count, rs.recent_miss_count, rs.recent_ratings,
          cp.ease_factor, cp.next_review_at, cp.last_reviewed_at
        FROM review_stats rs
        INNER JOIN cards c ON c.id = rs.card_id AND c.is_disabled = 0 AND c.is_draft = 0
        INNER JOIN accessible_decks ad ON ad.id = c.deck_id
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
        WHERE rs.lapse_count >= @minLapses
          OR rs.recent_miss_count >= @minRecentMisses
          OR cp.ease_factor <= @maxEase
        ORDER BY rs.recent_miss_count DESC, rs.lapse_count DESC, cp.ease_factor ASC
      `);

    return result.recordset.map((row) => ({
      ...row,
      recent_ratings: row.recent_ratings ? String(row.recent_ratings).split(',').map(Number) : [],
    })) as TroubleCard[];
  } catch (error) {
    console.error('Error fetching trouble cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
