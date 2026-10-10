import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A wall-clock transport for a timed performance: play, pause, seek.
 * `time` updates every animation frame while playing; `getTime()` reads the exact
 * position on demand (used for tap timing, which shouldn't wait for a render).
 */
export function usePlayback(duration: number) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);
  const anchor = useRef({ perf: 0, time: 0 });
  const playingRef = useRef(false);

  const getTime = useCallback(() => {
    if (!playingRef.current) return timeRef.current;
    return Math.min(duration, anchor.current.time + (performance.now() - anchor.current.perf) / 1000);
  }, [duration]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const t = getTime();
      timeRef.current = t;
      setTime(t);
      if (t >= duration) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, getTime]);

  const play = useCallback(() => {
    if (timeRef.current >= duration) timeRef.current = 0;
    anchor.current = { perf: performance.now(), time: timeRef.current };
    playingRef.current = true;
    setTime(timeRef.current);
    setPlaying(true);
  }, [duration]);

  const pause = useCallback(() => {
    timeRef.current = getTime();
    playingRef.current = false;
    setTime(timeRef.current);
    setPlaying(false);
  }, [getTime]);

  const seek = useCallback(
    (to: number) => {
      const t = Math.min(duration, Math.max(0, to));
      timeRef.current = t;
      anchor.current = { perf: performance.now(), time: t };
      setTime(t);
    },
    [duration],
  );

  return { time, playing, play, pause, seek, getTime };
}
