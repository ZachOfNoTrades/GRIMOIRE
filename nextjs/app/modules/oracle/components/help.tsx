import type { HelpSection } from "@/components/ui/HelpButton";

// In-app help copy, kept in one place so the home page and the campaign pages cannot drift.

export const HOME_HELP: HelpSection[] = [
  {
    heading: "Getting started",
    body: "Tap New campaign, then open its Prep tab: write or generate the world, then add a session and paste your rough notes into it. Build cast turns those notes into entries. The Table tab is where you run the night.",
  },
  {
    heading: "Player display",
    body: "Each campaign has a display code. On the shared screen, open the Display link shown on the Table tab. Players see the map on the left and a reference panel on the right, and only ever what you have revealed.",
  },
  {
    heading: "Ideas banner",
    body: "Along the bottom of the Table tab, ideas scroll past: things a character might say, complications, rewards, and reference pictures. Tap one to use it. Set how fast new ones arrive in Settings.",
  },
];

export const TABLE_HELP: HelpSection[] = [
  {
    heading: "Map and fog",
    body: (
      <ul>
        <li>Drag the party token to move it. Players see everything inside the circle around it.</li>
        <li>Where the party has been stays on their map, dimmed, showing buildings but never creatures. Where they have not been is black.</li>
        <li>Right-click bare ground to move the party there, reveal or hide a circle, paint fog by hand (the Brush slider or <kbd>[</kbd> and <kbd>]</kbd> sets the width) or add an entry.</li>
        <li>Scroll or pinch to zoom the map; drag the ground to look around. Shift+click the zoom buttons for small steps. Click the number beside Vision to type an exact value.</li>
        <li>Right-click an entry on the map to reveal it to the players, show its details, zoom to it or delete it. Right-click while placing or painting stops it.</li>
      </ul>
    ),
  },
  {
    heading: "Details",
    body: "Tap a creature, person or pin on the map, or search at the top of the Details panel. DM only notes and stats never reach the players. Show to players puts the entry on the display's panel.",
  },
  {
    heading: "Knowledge checks",
    body: "Pick the skill, then tap the result the players reached: a 1 earns a mistaken belief, 2-9 trivia, 10-14 a slight edge, 15-19 a moderate one and 20 or more a secret. Reveal adds it to what the players know about that entry and shows it on the display.",
  },
  {
    heading: "Ideas banner",
    body: (
      <ul>
        <li>Ideas scroll past and come round again; using one removes it. Pointing at the banner pauses it.</li>
        <li>Tap an idea for three ready answers; picking one writes it to the Log.</li>
        <li><strong>Pin</strong> keeps an idea at the front until you use it.</li>
        <li>Tap a picture to add it to the session as a creature, person, location or item, then tap the map where it goes.</li>
      </ul>
    ),
  },
];

export const PREP_HELP: HelpSection[] = [
  {
    heading: "Sessions",
    body: "One per night at the table. Open a session for its notes, the cast those notes need, and its recap. Go live on the one you are running: every idea at the Table is written against its notes and recap.",
  },
  {
    heading: "World",
    body: "A few sentences on tone and setting. Every generated idea, fact and map is written to fit it. Generate writes them from the campaign name, anything already in the box and your session notes; Rewrite improves what is there.",
  },
  {
    heading: "Maps",
    body: "Add map draws one from a description, or starts blank. Edit sets the name, description, scale and the picture under the map, which can be moved and resized to line up with the grid. ",
  },
  {
    heading: "Pictures",
    body: "Get a picture searches the web or, once an OpenRouter key is set up, generates one. Pictures can be shown on the player display, attached to an entry or put under a map.",
  },
];

export const SESSION_HELP: HelpSection[] = [
  {
    heading: "Rough notes",
    body: "Paste your plan for the night in any shape. Build cast proposes the creatures, people and places it needs; nothing is saved until you tap Add to campaign. Entries whose name already exists are skipped.",
  },
  {
    heading: "Go live",
    body: "Makes this the session the Table is running. The ideas banner and knowledge checks are all written against the live session's notes and recap.",
  },
  {
    heading: "Recap",
    body: "What happened, in your words. Write it after the night or as you go. The next session's ideas draw on it.",
  },
];
