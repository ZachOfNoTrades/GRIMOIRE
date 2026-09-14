import type { HelpSection } from "@/components/ui/HelpButton";

// In-app help copy, shared by the host pages and the phone controller.

export const HOST_HELP: HelpSection[] = [
  {
    heading: "Hosting a game",
    body: (
      <>
        Start a game and open its board on a screen everyone can see. Players scan the QR code or go to the
        join address and type the code — no account needed. Each player picks a name and a colour on their phone.
      </>
    ),
  },
  {
    heading: "Who can change what",
    body: (
      <>
        The board and anyone seated can change anyone&apos;s life, commander damage and status, the way whoever is
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
        <strong> New code</strong> retires the current code; seated players keep playing. <strong>Remove</strong>{" "}
        takes a player out entirely.
      </>
    ),
  },
  {
    heading: "Resuming a game",
    body: (
      <>
        An ended game — or one left idle for 12 hours — can be picked back up with <strong>Resume</strong> from its board
        or from Your games, for 30 days. Life and commander damage are kept and the game gets a new code; each player
        scans it and taps <strong>Continue as</strong> their name to take their seat back.
      </>
    ),
  },
  {
    heading: "Players without a phone",
    body: (
      <>
        <strong>Add player</strong> in an empty seat adds someone who is playing without a phone. Their card works
        straight from the board, and anyone seated can change it from their phone too. <strong>Hand to a phone</strong>{" "}
        (under Manage seats) lets them take the seat over from a phone later, keeping their totals.
      </>
    ),
  },
  {
    heading: "Lost phone",
    body: (
      <>
        <strong>Free seat</strong> signs that seat&apos;s phone out but keeps its life and commander damage. Anyone with
        the code can then take the seat over from another phone, even after the game has started.
      </>
    ),
  },
  {
    heading: "Commander damage",
    body: (
      <>
        Open <strong>Commander damage taken</strong> on a player&apos;s card and step the counter for the commander that
        hit them. It also takes that much life. 21 from one commander puts a player out.
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
    heading: "Your card",
    body: <>Tap the left half of your number to lose 1 life and the right half to gain 1. The buttons below do 5 at a time.</>,
  },
  {
    heading: "Other players",
    body: (
      <>
        You can change anyone&apos;s life, commander damage and status from their card. Quick taps are sent together a moment
        later; the small number beside a total is what hasn&apos;t reached the table yet.
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
        remembers your seat, so reopening the link puts you straight back in.
      </>
    ),
  },
];
