export default function DamnationLayout({ children }: { children: React.ReactNode }) {
  /* Pass-through layout — each Damnation page renders its own header with the inline
     back link, following the project's inline-nav pattern. */
  return <>{children}</>;
}
