import { useSyncExternalStore } from "react";
import { getLiveConnection, subscribeLiveConnection } from "./liveBridge";

export const useLiveConnection = () => useSyncExternalStore(subscribeLiveConnection, getLiveConnection);
