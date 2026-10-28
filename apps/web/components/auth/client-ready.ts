import { useSyncExternalStore } from "react";

function subscribe() {
  return () => undefined;
}

/** False during SSR, true after the client store snapshot. */
export function useClientReady() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
