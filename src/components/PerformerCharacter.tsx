/**
 * Joint angles (degrees) for one pose. 0 = arm hanging straight down; positive rotates clockwise on screen,
 * which raises the free arm (screen left) outward and swings the mic arm (screen right) toward the body.
 */
export interface PerformerPose {
  /** Free arm (screen left): shoulder, elbow. */
  free: [number, number];
  /** Microphone arm (screen right): shoulder, elbow. */
  mic: [number, number];
  /** Whole-body tilt, degrees. */
  lean: number;
  /** Head tilt, degrees. */
  head: number;
  /** Extra stance width, px in the 400×600 drawing. */
  stance: number;
}

interface PerformerCharacterProps {
  pose: PerformerPose;
  /** Per-frame motion layered on top of the pose (from the app's beat); all zero when still. */
  motion: { sway: number; bounce: number; freeArm: number; micArm: number };
  /** Rim-light colour. */
  rim: "aura" | "anticipate";
  /** 0–1 rim-light strength. */
  glow: number;
  /** Smooth pose changes (off under Reduce Motion, where poses switch without movement). */
  animatePose: boolean;
}

const INK = "#0a0f17";
const TROUSERS = "#0d131d";
const JACKET = "#152033";
const JACKET_SHADE = "#0f1828";

const SHOULDER_L: [number, number] = [146, 190];
const SHOULDER_R: [number, number] = [254, 190];

/**
 * A stylised pop performer: strong silhouette, rim-lit, holding a microphone. No facial features —
 * readable at TV distance and easy to restyle. Pose angles come from the stage; this only draws them.
 */
export default function PerformerCharacter({ pose, motion, rim, glow, animatePose }: PerformerCharacterProps) {
  const rimColor = rim === "aura" ? "var(--color-aura)" : "var(--color-anticipate)";
  const rimOpacity = 0.35 + 0.65 * glow;
  const ease = animatePose ? "transform 550ms cubic-bezier(0.3, 0.7, 0.2, 1)" : undefined;
  const rot = (deg: number) => ({ transform: `rotate(${deg}deg)`, transition: ease });
  const stroke = { stroke: rimColor, strokeOpacity: rimOpacity, strokeWidth: 2.5, strokeLinejoin: "round" } as const;

  const arm = (side: "free" | "mic") => {
    const [shoulder, elbow] = pose[side];
    const [x, y] = side === "free" ? SHOULDER_L : SHOULDER_R;
    const beat = side === "free" ? motion.freeArm : motion.micArm;
    return (
      <g transform={`translate(${x} ${y})`}>
        <g style={rot(shoulder)}>
          <g transform={`rotate(${beat})`}>
            {/* Upper arm (jacket sleeve) */}
            <path d="M-16 -4 Q0 -14 16 -4 L13 92 Q0 100 -13 92 Z" fill={JACKET} {...stroke} />
            <g transform="translate(0 90)">
              <g style={rot(elbow)}>
                {/* Forearm with a cuff, then the hand */}
                <path d="M-13 -6 L13 -6 L11 80 L-11 80 Z" fill={JACKET} {...stroke} />
                <rect x={-12} y={72} width={24} height={9} rx={3} fill={rimColor} opacity={0.25 + 0.35 * glow} />
                {side === "mic" && (
                  <>
                    <rect x={-4.5} y={86} width={9} height={38} rx={3.5} fill="#1b2433" stroke={rimColor} strokeOpacity={rimOpacity} />
                    <circle cx={0} cy={130} r={11} fill="#2a3446" stroke={rimColor} strokeOpacity={rimOpacity} strokeWidth={2} />
                    <circle cx={0} cy={130} r={5.5} fill={rimColor} opacity={0.3 + 0.5 * glow} />
                  </>
                )}
                <ellipse cx={0} cy={90} rx={13} ry={14} fill={INK} {...stroke} />
              </g>
            </g>
          </g>
        </g>
      </g>
    );
  };

  return (
    <svg viewBox="0 0 400 600" className="h-full w-auto overflow-visible" aria-hidden="true">
      {/* Body sway and bounce pivot at the feet */}
      <g transform={`translate(200 590) rotate(${motion.sway}) translate(-200 -590) translate(0 ${-motion.bounce})`}>
        <g style={{ transformOrigin: "200px 590px", ...rot(pose.lean) }}>
          {/* Legs: tapered trousers and boots */}
          <g style={{ transform: `translateX(${-pose.stance / 2}px)`, transition: ease }}>
            <path d="M164 334 L201 334 L196 548 L170 548 Z" fill={TROUSERS} {...stroke} />
            <path d="M166 544 L198 544 Q202 566 200 588 L150 588 Q148 572 166 562 Z" fill={INK} {...stroke} />
          </g>
          <g style={{ transform: `translateX(${pose.stance / 2}px)`, transition: ease }}>
            <path d="M199 334 L236 334 L230 548 L204 548 Z" fill={TROUSERS} {...stroke} />
            <path d="M202 544 L234 544 Q252 562 250 588 L200 588 Q198 566 202 544 Z" fill={INK} {...stroke} />
          </g>

          {/* Torso: cropped stage jacket, padded shoulders, belt */}
          <path
            d="M132 196 Q136 176 160 172 Q200 162 240 172 Q264 176 268 196 L246 252 L244 344 Q200 352 156 344 L154 252 Z"
            fill={JACKET}
            {...stroke}
          />
          <path d="M182 174 L200 246 L218 174 Z" fill={rimColor} opacity={0.16 + 0.3 * glow} />
          <path d="M182 174 L200 246 L188 262 L164 186 Z" fill={JACKET_SHADE} />
          <path d="M218 174 L200 246 L212 262 L236 186 Z" fill={JACKET_SHADE} />
          <path d="M156 326 Q200 334 244 326 L244 338 Q200 346 156 338 Z" fill={INK} />
          <rect x={192} y={326} width={16} height={12} rx={2} fill={rimColor} opacity={0.35 + 0.5 * glow} />
          {/* Stage-outfit sparkle along the lapels */}
          {[
            [172, 200],
            [178, 222],
            [228, 200],
            [222, 222],
            [196, 286],
            [204, 304],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.4} fill={rimColor} opacity={0.25 + 0.75 * glow * (i % 2 ? 0.8 : 1)} />
          ))}

          {/* Head */}
          <g style={{ transformOrigin: "200px 168px", ...rot(pose.head) }}>
            <path d="M188 140 L212 140 L214 174 L186 174 Z" fill={INK} />
            <ellipse cx={200} cy={112} rx={31} ry={37} fill={INK} {...stroke} />
            {/* Hair: undercut with a swept top */}
            <path
              d="M166 116 Q160 66 206 66 Q244 68 236 110 Q228 86 204 88 Q184 88 176 104 Q172 114 166 116 Z"
              fill="#121b29"
              {...stroke}
            />
            <path d="M228 98 Q236 120 226 140" fill="none" stroke={rimColor} strokeOpacity={rimOpacity * 0.7} strokeWidth={2} />
          </g>

          {arm("free")}
          {arm("mic")}

          {/* Shoulder caps hide the arm joints in every pose */}
          {[SHOULDER_L, SHOULDER_R].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r={17} fill={JACKET} stroke={rimColor} strokeOpacity={rimOpacity * 0.8} strokeWidth={2} />
          ))}
        </g>
      </g>
    </svg>
  );
}
