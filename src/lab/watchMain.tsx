import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import WatchSim from "./WatchSim";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WatchSim />
  </StrictMode>,
);
