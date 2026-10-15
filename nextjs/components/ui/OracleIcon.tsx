/**
 * The Oracle module icon: an eye in a hexagon frame (one battlemap cell), a crystal pupil, and
 * four floating hexes. Paints in `currentColor`, so it follows the app's theme like a Lucide icon;
 * the pupil's light center is a cut-out. Sized by the caller.
 * Source: Designer project Diamond Sword, artboard oracle_final (artboards/artboard-72-copy-9.svg).
 */
export default function OracleIcon({ className }: { className?: string }) {
  return (
    // ICON
    <svg aria-hidden="true" className={`oracle-icon${className ? ` ${className}` : ""}`} viewBox="-0.5 0 512 512" fill="currentColor" fillRule="evenodd">
      <path d="M445.98 402.03 L255.5 512 L65.02 402.03 L65.12 330.43 L107.08 354.74 L107.05 377.84 L255.5 463.5 L403.95 377.84 L403.92 354.74 L445.88 330.43 Z M65.33 182.61 L255.5 73.17 L445.68 182.61 L445.77 254.21 L403.74 230.02 L403.71 206.92 L255.5 121.67 L107.29 206.92 L107.26 230.02 L65.22 254.21 Z" />
      <path d="M255.33 417.5 L39.17 293 L75.48 271.99 L75.48 271.98 L255.07 168.05 L434.88 271.62 L434.88 271.62 L471.23 292.56 Z M387.23 292.64 L255.12 216.55 L123.17 292.92 L255.28 369.01 Z" />
      <path d="M285.54,269.38v50.61l-30,29.02l-30,-29.02v-50.61l30,-32.83zM255.54,266.19l-10,10.95v34.37l10,9.68l10,-9.68v-34.37z" />
      <path d="M196.67 0 L160.3 20.97 L160.24 62.97 L196.58 84 L232.98 63.05 L233.04 21.05 Z" />
      <path d="M314.33 0 L277.96 21.05 L278.02 63.05 L314.42 84 L350.76 62.97 L350.7 20.97 Z" />
      <path d="M474.55 92.22 L438.2 113.27 L438.26 155.27 L474.66 176.22 L511 155.17 L510.94 113.17 Z" />
      <path d="M36.45 92.22 L0.06 113.17 L0 155.17 L36.34 176.22 L72.74 155.27 L72.8 113.27 Z" />
    </svg>
  );
}
