import type { HelpSection } from "@/components/ui/HelpButton";

// In-app help copy, kept in one place so the home page and the campaign pages cannot drift.

export const HOME_HELP: HelpSection[] = [
  {
    heading: "Getting started",
    body: "Tap New campaign, then open its Prep tab: paste your rough session notes and tap Build session to turn them into scenes and a cast. The Table tab is where you run the session.",
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
        <li><strong>Move party</strong>: drag the party token. Players see everything inside the circle around it.</li>
        <li>Where the party has been stays on their map, dimmed, showing buildings but never creatures. Where they have not been is black.</li>
        <li><strong>Reveal</strong> and <strong>Hide</strong> paint the explored area by hand. <strong>Pin</strong> adds a new entry where you tap.</li>
        <li><strong>Edit with AI</strong> changes the map in words; <strong>Undo</strong> puts back the version before the last change.</li>
      </ul>
    ),
  },
  {
    heading: "Details",
    body: "Tap a creature, person or pin on the map, or search at the top of the Details panel. DM only notes and stats never reach the players. Show to players puts the entry on the display's panel.",
  },
  {
    heading: "Knowledge checks",
    body: "Players roll and tell you the number. Pick the skill, then tap the result they reached: a higher result earns a more valuable fact. Reveal adds it to what the players know about that entry and shows it on the display.",
  },
  {
    heading: "Ideas banner",
    body: (
      <ul>
        <li>Ideas scroll past and drop off the left edge. Pointing at the banner pauses it.</li>
        <li>Tap an idea for three ready answers; picking one writes it to the Log.</li>
        <li><strong>Pin</strong> keeps an idea at the front until you use it.</li>
        <li>Tap a picture to add it to the session as a creature, person or location beside the party.</li>
        <li>Type in the bar underneath to ask for anything else.</li>
      </ul>
    ),
  },
];

export const PREP_HELP: HelpSection[] = [
  {
    heading: "Notes to session",
    body: "Paste notes in any shape and tap Build session. You get a proposed scene list and cast to review; nothing is saved until you tap Add to campaign. Entries whose name already exists are skipped.",
  },
  {
    heading: "World",
    body: "A few sentences on tone and setting. Every generated idea, fact and map is written to fit it.",
  },
  {
    heading: "Maps",
    body: "New map draws one from a description. On the Table tab, Edit with AI changes the active map in words, and Undo puts back the version before the last change.",
  },
  {
    heading: "Pictures",
    body: "Get a picture searches the web or, once an OpenRouter key is set up, generates one. Pictures can be shown on the player display or attached to an entry.",
  },
];
