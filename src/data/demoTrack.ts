import type { Track } from "../types/performance";

// Development fallback: an original mock performance so the At-home experience works without any media.
export const demoTrack: Track = {
  isMock: true,
  title: "Neon Tide",
  artist: "AuraBeat Demo Ensemble",
  bpm: 112,
  firstBeat: 0.5,
  duration: 90,
  sections: [
    { start: 0, label: "Intro", intensity: 0.35, mood: "restrained" },
    { start: 12, label: "Verse", intensity: 0.55, mood: "cool" },
    { start: 29, label: "Build", intensity: 0.75, mood: "rising" },
    { start: 38, label: "Chorus", intensity: 1, mood: "peak" },
    { start: 55, label: "Verse", intensity: 0.6, mood: "cool" },
    { start: 67, label: "Chorus", intensity: 1, mood: "peak" },
    { start: 82, label: "Outro", intensity: 0.4, mood: "restrained" },
  ],
  lyrics: [
    { start: 12.5, end: 16.5, text: "City lights are humming low" },
    { start: 16.8, end: 20.8, text: "Every street begins to glow" },
    { start: 21.1, end: 25, text: "I can feel it in the floor" },
    { start: 25.2, end: 28.8, text: "Coming closer, coming more" },
    { start: 29.2, end: 33.5, text: "Hold on, hold on" },
    { start: 33.7, end: 37.8, text: "Here it comes, the neon tide" },
    { start: 38.2, end: 42.5, text: "Rise up, let the colors in" },
    { start: 42.7, end: 46.8, text: "Every heartbeat on my skin" },
    { start: 47, end: 51, text: "We don't need to hear the sound" },
    { start: 51.2, end: 55, text: "When the rhythm shakes the ground" },
    { start: 55.5, end: 59.5, text: "Quiet rooms and open hands" },
    { start: 59.7, end: 63.5, text: "Moving like the music plans" },
    { start: 63.7, end: 66.8, text: "Feel it rolling in again" },
    { start: 67.2, end: 71.5, text: "Rise up, let the colors in" },
    { start: 71.7, end: 75.8, text: "Every heartbeat on my skin" },
    { start: 76, end: 81.8, text: "Ride the neon tide" },
    { start: 83, end: 88, text: "…ride the neon tide" },
  ],
  interactions: [
    { id: "chorus-1", label: "First chorus", readyAt: 34, start: 38, end: 51 },
    { id: "chorus-2", label: "Second chorus", readyAt: 63, start: 67, end: 80 },
  ],
};
