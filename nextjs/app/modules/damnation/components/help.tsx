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
        closest updates the count at a real table. Undo on a phone reverses that phone&apos;s own last change; Undo on the board
        reverses the latest change at the table.
      </>
    ),
  },
  {
    heading: "Keeping strangers out",
    body: (
      <>
        <strong>Start game</strong> closes joining. <strong>Reopen joining</strong> lets a late arrival in.
        <strong> New code</strong> retires the current code; players already in keep playing. <strong>Remove</strong>{" "}
        (under Manage players) takes a player out of the game.
      </>
    ),
  },
  {
    heading: "Table layout",
    body: (
      <>
        The grid button on the board arranges the cards like the table — 2 × 2, 1 left and 2 right, and so on, for the
        game&apos;s player count. Cards fill the layout in order; under <strong>Manage players</strong>, the arrows move a
        player earlier or later. Narrow screens use the automatic grid.
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
        In an open spot, click <strong>Add player</strong>, type a name and press Enter to add someone who is playing
        without a phone. Click the square beside it first to pick their color. Their card works straight from the board,
        and anyone in the game can change it from their phone too.
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
        The Wiki button searches mtg.wiki by default. Change the site in Damnation settings with any search address that
        has <code>{"{query}"}</code> where the search text goes.
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
        together once you pause for 5 seconds, as one change to undo; the small number beside a total is what hasn&apos;t
        reached the table yet.
      </>
    ),
  },
  {
    heading: "Undo",
    body: <>Undo reverses your own most recent change. Press it again to go further back.</>,
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
