import type { LyricLine } from "../../types/performance";
import { parseCaptions } from "../../lib/captions";

/**
 * Timed lyrics for NEFFEX – "Grateful". Seconds of the performance video's currentTime.
 *
 * Paste the output of DEV → Lyric sync → "Copy Timed Lyrics" over the block below.
 */
// ▼ paste Copy Timed Lyrics here (replace this whole block) ▼
const timedLyrics: LyricLine[] = [
  { start: 11.3, end: 14.51, text: "always do it on my own so I gotta get through it" },
  { start: 14.51, end: 17.78, text: "and the only thing I know is to love what I’m doing" },
  { start: 17.78, end: 21, text: "never give up never slow til I finally prove it" },
  { start: 21, end: 24.21, text: "never listen to the No’s i just wanna keep moving" },
  { start: 24.21, end: 27.45, text: "keep my head up when I act head up that’s a fact" },
  { start: 27.45, end: 30.71, text: "never looking back ima keep myself on track" },
  { start: 30.71, end: 33.7, text: "keep my head up staying strong always moving on" },
  { start: 33.7, end: 36.95, text: "feel I don’t belong tell my thoughts to move along" },
  { start: 36.95, end: 40.43, text: "push myself to be the best die with no regrets" },
  { start: 40.43, end: 43.51, text: "live with every breath see my message start to spread" },
  { start: 43.51, end: 46.61, text: "and I had so many dreams then you hit your teens" },
  { start: 46.61, end: 49.93, text: "life ain’t really what it seems try to find out what it means" },
  { start: 49.93, end: 52.9, text: "always do it on my own so I gotta get through it" },
  { start: 52.9, end: 56.03, text: "and the only thing I know is to love what I’m doing" },
  { start: 56.03, end: 59.23, text: "never give up never slow til I finally prove it" },
  { start: 59.23, end: 62.42, text: "never listen to the No’s i just wanna keep moving" },
  { start: 62.42, end: 65.65, text: "yea I put out all this art, its my only medicine" },
  { start: 65.65, end: 69.07, text: "yea everything I do, im just being genuine" },
  { start: 69.07, end: 72.34, text: "I’m sick of being screwed, feel my own adrenaline" },
  { start: 72.34, end: 75.38, text: "yea i do just what I do, and I hope you let me in" },
  { start: 75.38, end: 88.98, text: "let me in yea" },
  { start: 88.98, end: 92.03, text: "I’m grateful oh yea able oh yea" },
  { start: 92.03, end: 95.38, text: "I’m stable oh yea no label oh yea" },
  { start: 95.38, end: 98.6, text: "u know me I have only a path" },
  { start: 98.6, end: 101.86, text: "I’m lonely but damn I’m going to win" },
  { start: 101.86, end: 104.23, text: "I don’t want no fake love I want the real stuff" },
  { start: 104.23, end: 107.4, text: "everybody listen up cuz I’ll only say it once" },
  { start: 107.4, end: 110.62, text: "I’m gon show you all the path if you want it bad" },
  { start: 110.62, end: 113.8, text: "I’m gon show you where it’s at yea how you can get it back" },
  { start: 113.8, end: 117.04, text: "yea cuz I ain’t never done I’ll be number one" },
  { start: 117.04, end: 120.21, text: "working hella hard until I get just what I want" },
  { start: 120.21, end: 123.51, text: "yea rise just like the sun yea fatal like a gun" },
  { start: 123.51, end: 126.62, text: "shooters gonna shoot and Im gon shoot until I’ve won" },
  { start: 126.62, end: 129.76, text: "always do it on my own so I gotta get through it" },
  { start: 129.76, end: 132.95, text: "and the only thing I know is to love what I’m doing" },
  { start: 132.95, end: 136.02, text: "never give up never slow til I finally prove it" },
  { start: 136.02, end: 139.33, text: "never listen to the No’s i just wanna keep moving" },
  { start: 139.33, end: 142.55, text: "yea I put out all this art, its my only medicine" },
  { start: 142.55, end: 145.83, text: "yea everything I do, im just being genuine" },
  { start: 145.83, end: 148.93, text: "I’m sick of being screwed, feel my own adrenaline" },
  { start: 148.93, end: 152.11, text: "yea i do just what I do, and I hope you let me in" },
  { start: 152.11, end: 165.74, text: "let me in yea" },
  { start: 165.74, end: 168.76, text: "I’m grateful oh yea able oh yea" },
  { start: 168.76, end: 171.99, text: "I’m stable oh yea no label oh yea" },
  { start: 171.99, end: 175.27, text: "u know me I have only a path" },
  { start: 175.27, end: 180.27, text: "I’m lonely but damn I’m going to win" },
];
// ▲ end of pasted block ▲

/**
 * Alternative: a caption file next to this module (grateful.en.srt or grateful.en.vtt), bundled at
 * build time. Used only when the block above is empty.
 */
const files = import.meta.glob<string>("./grateful.en.{srt,vtt}", { query: "?raw", import: "default", eager: true });
const captionSource = Object.values(files)[0];

export const gratefulLyrics: LyricLine[] =
  timedLyrics.length > 0 ? timedLyrics : captionSource ? parseCaptions(captionSource) : [];
