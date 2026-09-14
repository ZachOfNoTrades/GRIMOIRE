import type { HelpSection } from "@/components/ui/HelpButton";

// In-app help copy, shared by the host pages and the phone controller.

export const HOST_HELP: HelpSection[] = [
  {
    heading: "Hosting a game",
    body: (
      <>
        Start a game and open its board on a screen everyone can see. Players scan the QR code or go to the
        join address and type the code — no account needed. Each player picks a name and a color on their phone.
        While joining is open, set the starting life and the number of players under the code; changing starting life
        moves everyone&apos;s total by the same amount.
        On any card, tap the left or right half of the number for −1 or +1; the buttons below do 5.
      </>
    ),
  },
  {
    heading: "Who can change what",
    body: (
      <>
        The board and anyone in the game can change anyone&apos;s life, commander damage and status, the way whoever is
        closest updates the count at a real table.
      </>
    ),
  },
  {
    heading: "Keeping strangers out",
    body: (
      <>
        <strong>Start game</strong> closes joining. <strong>Reopen joining</strong> lets a late arrival in. The{" "}
        <strong>X</strong> in the top-right corner of a card on the board takes that player out of the game.
      </>
    ),
  },
  {
    heading: "Table layout",
    body: (
      <>
        The grid button on the board arranges the cards like the table — 2 × 2, 1 left and 2 right, and so on, for the
        game&apos;s player count; the last one you picked for each player count is used for your next game. Each player
        keeps their spot, so removing someone leaves that spot open. Drag a card by the handle in its top-left corner onto
        another card to swap the two players, or onto an open spot to move there (or focus the handle and use the arrow
        keys).
      </>
    ),
  },
  {
    heading: "Resuming a game",
    body: (
      <>
        An ended game — or one left idle for 12 hours — can be picked back up with <strong>Resume</strong> from its board
        or from Your games, for 30 days. Life and commander damage are kept and the game gets a new code; each player
        scans it and taps <strong>Rejoin as</strong> their name.
      </>
    ),
  },
  {
    heading: "Players without a phone",
    body: (
      <>
        <strong>Add player</strong> in an open spot adds someone who is playing without a phone, as &ldquo;Player 3&rdquo;
        with a free color. Click the name on their card to rename them, and the palette button beside it to change the
        color. Their card works straight from the board, and anyone in the game can change it from their phone too.
      </>
    ),
  },
  {
    heading: "Commander damage",
    body: (
      <>
        Open <strong>Commander damage taken</strong> on a player&apos;s card and step the counter for the commander that
        hit them. It also takes that much life. 21 from one commander puts a player out. Turn it off in Damnation settings
        for other formats.
      </>
    ),
  },
  {
    heading: "Wiki search",
    body: (
      <>
        The Wiki button searches mtg.wiki. The site is set for the whole server with the DAMNATION_WIKI_SEARCH_TEMPLATE
        environment variable: any search address with <code>{"{query}"}</code> where the search text goes.
      </>
    ),
  },
];

export const PLAYER_HELP: HelpSection[] = [
  {
    heading: "Changing life",
    body: (
      <>
        Every card works the same way: tap the left half of the number to lose 1 life and the right half to gain 1. The
        buttons below do 5 at a time.
      </>
    ),
  },
  {
    heading: "Other players",
    body: (
      <>
        You can change anyone&apos;s life, commander damage and status from their card. Taps on the same counter are sent
        together once you pause for 3 seconds; the small number beside a total is what hasn&apos;t
        reached the table yet.
      </>
    ),
  },
  {
    heading: "Connection",
    body: (
      <>
        If the connection drops, keep tapping — changes wait and send once you&apos;re back, exactly once. This phone
        remembers you, so reopening the link puts you straight back in. <strong>Leave</strong> (top corner) takes you out of the game.
      </>
    ),
  },
];
