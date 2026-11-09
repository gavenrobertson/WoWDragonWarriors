const base = { width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const IconSync = () => <svg {...base}><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.5h-3.5" /></svg>;
export const IconRotL = () => <svg {...base} width={20} height={20}><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5V7h3.5" /></svg>;
export const IconRotR = () => <svg {...base} width={20} height={20}><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5V7h-3.5" /></svg>;
export const IconPlus = () => <svg {...base} width={20} height={20}><path d="M10 4v12M4 10h12" /></svg>;
export const IconUp = () => <svg {...base}><path d="M5 12l5-5 5 5" /></svg>;
export const IconDown = () => <svg {...base}><path d="M5 8l5 5 5-5" /></svg>;
export const IconX = () => <svg {...base}><path d="M5 5l10 10M15 5L5 15" /></svg>;
export const IconCheck = () => <svg {...base} strokeWidth={2.4}><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>;
export const IconKey = () => <svg {...base} width={20} height={20}><circle cx="7" cy="10" r="3.5" /><path d="M10.5 10H18M15 10v3M17.5 10v2" /></svg>;
export const IconDiscord = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14.1 14.1 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.7-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
  </svg>
);
