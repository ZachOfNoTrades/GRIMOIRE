// Suspense fallback for every /modules/** route. One boundary here covers all
// five modules, so any navigation into (or within) a module paints immediately
// instead of leaving the previous page on screen while the server renders.
//
// Placed above the per-module layouts on purpose: those are pass-throughs, and
// a single boundary means a new module never has to remember to add its own.
// Purely a rendering concern — auth still runs exactly where it did (middleware
// on the request, getAuthorizedUser inside each route).
import RouteLoading from "@/components/RouteLoading";

export default function ModulesLoading() {
  return <RouteLoading />;
}
