"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { PT, type Mode, type PType } from "@/lib/listing";

interface Props {
  mode: Mode;
  type: PType | null;
  onMode: (m: Mode) => void;
  onType: (t: PType | null) => void;
  /** change this number to close the sub-type list (for example when the map is tapped) */
  closeSignal: number;
}

/** Buy / Rent on the left. Tapping one opens the sub-type list beside it. */
export default function ModeControl({ mode, type, onMode, onType, closeSignal }: Props) {
  const [openFor, setOpenFor] = useState<Mode | null>(null);
  const [top, setTop] = useState(0);
  const [seenSignal, setSeenSignal] = useState(closeSignal);
  if (seenSignal !== closeSignal) { setSeenSignal(closeSignal); setOpenFor(null); }   // closes when the map is tapped

  const tap = (m: Mode, el: HTMLElement) => {
    if (openFor === m) { setOpenFor(null); return; }
    if (m !== mode) onMode(m);
    setTop(el.offsetTop + 4);
    setOpenFor(m);
  };

  return (
    <div className="modebar">
      <div className="mode glass">
        {(["buy", "rent"] as Mode[]).map(m => (
          <button key={m} className={mode === m ? "on" : ""} onClick={e => tap(m, e.currentTarget)}>
            <Icon name={m === "buy" ? "key" : "tag"} />
            <span>{m === "buy" ? "Buy" : "Rent"}<small>{mode === m && type ? type : ""}</small></span>
          </button>
        ))}
      </div>
      <div className={`types glass${openFor ? " open" : ""}`} style={{ top }}>
        <button className={`all${type ? "" : " on"}`} onClick={() => { onType(null); setOpenFor(null); }}><Icon name="grid" />All types</button>
        {PT.filter(t => openFor && t.m.includes(openFor)).map(t => (
          <button key={t.k} className={type === t.k ? "on" : ""} onClick={() => { onType(t.k); setOpenFor(null); }}>
            <Icon name={t.i} />{t.k}
          </button>
        ))}
      </div>
    </div>
  );
}
