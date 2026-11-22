
/** Named bar gradients shared by all charts (lighter top → slightly faded bottom). Use as fill="url(#cg-<name>)". */
export const CG_COLORS = {
    green: "#34d399",
    blue: "#3b82f6",
    amber: "#e8bc70",
    violet: "#8b5cf6",
    teal: "#2dd4bf",
    red: "#f87171",
} as const;

export type CgName = keyof typeof CG_COLORS;
export const cg = (name: CgName) => `url(#cg-${name})`;

/** Put inside <defs> of a recharts chart. Identical ids across charts are harmless (same definition). */
export function ChartGradients({ names }: { names: CgName[] }) {
    return (
        <>
            {names.map((n) => (
                <linearGradient key={n} id={`cg-${n}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`color-mix(in srgb, ${CG_COLORS[n]} 70%, white)`} />
                    <stop offset="100%" stopColor={CG_COLORS[n]} stopOpacity={0.7} />
                </linearGradient>
            ))}
        </>
    );
}

export const LABEL_STYLE = { fill: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "ui-monospace, monospace" } as const;

/** One gradient for an arbitrary color; reference it as url(#<id>). */
export function BarGrad({ id, color }: { id: string; color: string }) {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`color-mix(in srgb, ${color} 70%, white)`} />
            <stop offset="100%" stopColor={color} stopOpacity={0.7} />
        </linearGradient>
    );
}
