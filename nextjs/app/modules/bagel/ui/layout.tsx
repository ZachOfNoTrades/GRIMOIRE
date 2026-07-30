export default function BagelLayout({ children }: { children: React.ReactNode }) {
  /* Pass-through layout — the Bagel home page renders its own header with the
     inline back-to-dashboard link, following the project's inline-nav pattern. */
  return <>{children}</>;
}
