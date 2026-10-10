import { useSyncExternalStore } from "react";
import { getWatchStatus, subscribeWatchStatus } from "../lib/watchBridge";

export const useWatchStatus = () => useSyncExternalStore(subscribeWatchStatus, getWatchStatus);
