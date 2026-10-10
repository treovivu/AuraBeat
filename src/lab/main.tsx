import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import WaveLab from "./WaveLab";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WaveLab />
  </StrictMode>,
);
