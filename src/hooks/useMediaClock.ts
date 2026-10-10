import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Playback clock backed by a real <video>/<audio> element: its currentTime is the source of truth.
 * Inactive (and inert) when `enabled` is false.
 */
export function useMediaClock(ref: RefObject<HTMLMediaElement | null>, enabled: boolean, fallbackDuration: number) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(fallbackDuration);

  useEffect(() => {
    const media = ref.current;
    if (!enabled || !media) return;
    const sync = () => {
      setTime(media.currentTime);
      setPlaying(!media.paused && !media.ended);
      if (Number.isFinite(media.duration)) setDuration(media.duration);
    };
    const events = ["play", "pause", "ended", "seeked", "timeupdate", "loadedmetadata", "durationchange"];
    events.forEach((e) => media.addEventListener(e, sync));
    sync();
    return () => events.forEach((e) => media.removeEventListener(e, sync));
  }, [ref, enabled]);

  // timeupdate fires only ~4×/s; follow the element every frame while it plays.
  useEffect(() => {
    const media = ref.current;
    if (!enabled || !playing || !media) return;
    let frame = 0;
    const tick = () => {
      setTime(media.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref, enabled, playing]);

  const getTime = useCallback(() => ref.current?.currentTime ?? 0, [ref]);
  const play = useCallback(() => {
    // Autoplay rejections surface as the element staying paused.
    ref.current?.play().catch(() => {});
  }, [ref]);
  const pause = useCallback(() => ref.current?.pause(), [ref]);
  const seek = useCallback(
    (to: number) => {
      const media = ref.current;
      if (!media) return;
      media.currentTime = to;
      setTime(to);
    },
    [ref],
  );

  return { time, playing, duration, play, pause, seek, getTime };
}
