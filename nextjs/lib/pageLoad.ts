// A PageLoad is a set of first-paint requests that stop together when their page goes away
export interface PageLoad {
  signal: AbortSignal;
  isStopped: () => boolean;
  finish: () => void;
  stop: () => void;
}

// Start a page load whose requests abort when it stops, and which counts as stopped once the page starts to unload
// NOTE: Firefox rejects a page's open requests as network errors as soon as a navigation away starts, before pagehide
// NOTE: A load stays stopped if a leave prompt is canceled, as no event marks the cancel
export function startPageLoad(target: Pick<Window, "addEventListener" | "removeEventListener"> = window): PageLoad {
  const controller = new AbortController();
  let isLeaving = false;
  const markLeaving = () => {
    isLeaving = true;
  };
  const finish = () => target.removeEventListener("beforeunload", markLeaving); // Stop watching for the page to unload
  target.addEventListener("beforeunload", markLeaving);
  return {
    signal: controller.signal,
    isStopped: () => isLeaving || controller.signal.aborted,
    finish,
    stop: () => {
      finish();
      controller.abort();
    },
  };
}
