// ROUTE LOADING FALLBACK — what a module route paints while its server
// component is still resolving on the server.
//
// Why this exists: the dashboard's module cards navigate with router.push, and
// without a Suspense boundary in the target segment Next.js holds the *old*
// page on screen until the whole RSC payload arrives. Forage's home is a server
// component that preloads a day of entries, targets, nutrients and dashboard
// cards before it emits a byte, so a tap read as "nothing happened" for up to a
// second (longer on a cold dev compile). A `loading.tsx` re-exporting this
// commits the navigation immediately and shows this instead.
//
// It deliberately reuses the dashboard's own spinner markup so the wait looks
// like the rest of the app rather than a second loading idiom. The fade-in is
// delayed in CSS (see .route-loading in globals.css) so a navigation that
// resolves quickly never flashes a spinner at all.
export default function RouteLoading() {
  return (
    /* PAGE SHELL */
    <div className="page">
      <div className="page-container">

        {/* SPINNER */}
        <div className="loading-container route-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    </div>
  );
}
