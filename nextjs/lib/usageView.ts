import { UsageView } from "@/types/usageView";

// Pick the Usage page's view: the report once one is held, an error after a failed first load, else the loading state
export function usageView(hasReport: boolean, isFirstLoadFailed: boolean): UsageView {
  if (hasReport) return UsageView.Ready;
  return isFirstLoadFailed ? UsageView.Failed : UsageView.Loading;
}
