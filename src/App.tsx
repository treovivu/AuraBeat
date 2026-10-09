import { useEffect, useRef, useState } from "react";
import type { Screen } from "./types/navigation";
import Home from "./pages/Home";
import LiveConcert from "./pages/LiveConcert";
import AtHomeConcert from "./pages/AtHomeConcert";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  // Move focus to the new screen so keyboard and screen-reader users land at the top.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus();
  }, [screen]);

  const goHome = () => setScreen("home");

  return (
    <main ref={mainRef} tabIndex={-1} className="min-h-dvh outline-none">
      {screen === "home" && <Home onSelect={setScreen} />}
      {screen === "live" && <LiveConcert onExit={goHome} />}
      {screen === "at-home" && <AtHomeConcert onExit={goHome} />}
    </main>
  );
}
