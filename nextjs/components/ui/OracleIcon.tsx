/**
 * The Oracle module icon: an eye in a hexagon (one battlemap cell) with six eyestalks, a beholder.
 * Two forms in one element: the full icon, and below about 30 px (where the stalks and gaps fall
 * under a pixel) the frame and eye alone. A container query picks one by the rendered size. Both
 * paint in `currentColor`, so the icon follows the app's theme like a Lucide icon.
 * Construction: design-docs/product-icons.md §5; generator: Designer project Diamond Sword,
 * source/oracle-beholder.cjs (SMALL=1 for the small form).
 */
export default function OracleIcon({ className }: { className?: string }) {
  return (
    // ICON
    <span aria-hidden="true" className={`oracle-icon${className ? ` ${className}` : ""}`}>
      {/* FULL */}
      <svg className="oracle-icon-full" viewBox="2.2 2.2 507.6 507.6" fill="currentColor" fillRule="evenodd">
        <path d="M375.28,187.14v42.03h-24.1v-28.11l-89.58,-51.72v-27.83zM375.28,324.86l-113.68,65.63v-27.83l89.58,-51.72l0,-28.11l24.1,0zM136.72,324.86v-42.03l24.1,0v28.11l89.58,51.72l0,27.83zM136.72,187.14l113.68,-65.63v27.83l-89.58,51.72v28.11l-24.1,0z" />
        <path d="M136.72,256l119.28,-68.86l119.28,68.86l-119.28,68.86zM256,297.03l71.07,-41.03l-71.07,-41.03l-71.07,41.03z" />
        <path d="M256,227.89l16.23,28.11l-16.23,28.11l-16.23,-28.11z" />
        <path d="M243.95,100.62v-37.88l-12.05,-20.87l12.05,-20.87l24.1,0l12.05,20.87l-12.05,20.87v37.88z" />
        <path d="M384.54,167.87l32.8,-18.94l12.05,-20.87h24.1l12.05,20.87l-12.05,20.87h-24.1l-32.8,18.94z" />
        <path d="M396.59,323.25l32.8,18.94h24.1l12.05,20.87l-12.05,20.87h-24.1l-12.05,-20.87l-32.8,-18.94z" />
        <path d="M268.05,411.38v37.88l12.05,20.87l-12.05,20.87h-24.1l-12.05,-20.87l12.05,-20.87v-37.88z" />
        <path d="M127.46,344.13l-32.8,18.94l-12.05,20.87h-24.1l-12.05,-20.87l12.05,-20.87h24.1l32.8,-18.94z" />
        <path d="M115.41,188.75l-32.8,-18.94h-24.1l-12.05,-20.87l12.05,-20.87h24.1l12.05,20.87l32.8,18.94z" />
      </svg>
      {/* SMALL */}
      <svg className="oracle-icon-small" viewBox="2.2 2.2 507.6 507.6" fill="currentColor" fillRule="evenodd">
        <path d="M464.4,135.68v73.43h-42.11v-49.12l-156.52,-90.36v-48.63zM464.4,376.32l-198.63,114.68v-48.63l156.52,-90.36v-49.12h42.11zM47.6,376.32v-73.43h42.11v49.12l156.52,90.36l0,48.63zM47.6,135.68l198.63,-114.68v48.63l-156.52,90.36v49.12l-42.11,0z" />
        <path d="M47.6,256l208.4,-120.32l208.4,120.32l-208.4,120.32zM256,327.69l124.18,-71.69l-124.18,-71.69l-124.18,71.69z" />
        <path d="M256,206.88l28.36,49.12l-28.36,49.12l-28.36,-49.12z" />
      </svg>
    </span>
  );
}
