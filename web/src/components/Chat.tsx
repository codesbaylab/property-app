"use client";
/* eslint-disable @next/next/no-img-element -- listing thumbnails come from storage links */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { fmt } from "@/lib/listing";
import type { Account } from "@/lib/auth";
import { loadConversations, loadMessages, markRead, onNewMessage, sendMessage, type Conversation, type Message } from "@/lib/chat";

interface Props {
  account: Account;
  /** the open chat, if any (set when someone taps Message on a listing) */
  openId: string | null;
  onOpen: (id: string | null) => void;
  onToast: (m: string) => void;
  onOpenListing: (id: string) => void;
  /** called when messages were read, so the unread badge can update */
  onRead: () => void;
}

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 864e5);
  return days < 7 ? d.toLocaleDateString([], { weekday: "short" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
};

export default function Chat({ account, openId, onOpen, onToast, onOpenListing, onRead }: Props) {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try { setList(await loadConversations()); setError(""); } catch (e) { setError((e as Error).message); setList(l => l ?? []); }
  }, []);
  useEffect(() => { const t = setTimeout(refresh, 0); return () => clearTimeout(t); }, [refresh, openId]);
  useEffect(() => onNewMessage(null, () => refresh()), [refresh]);

  const open = openId ? list?.find(c => c.id === openId) : undefined;
  if (openId) {
    return <Thread key={openId} account={account} id={openId} info={open} onBack={() => { onOpen(null); onRead(); }} onToast={onToast} onOpenListing={onOpenListing} onRead={() => { onRead(); refresh(); }} />;
  }

  return (
    <div className="vw">
      <h1>Inbox</h1>
      <div className="sub">Conversations with agents and owners</div>
      {error && <div className="err" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      {list === null ? <div className="meta">Loading…</div> : list.length === 0 ? (
        <div className="empty"><div className="ei"><Icon name="chat" /></div><h3>No messages yet</h3>Tap Message on any home to start a conversation. Replies show up here.</div>
      ) : (
        <div className="list">
          {list.map(c => (
            <button key={c.id} className="li conv" onClick={() => onOpen(c.id)}>
              {c.cover ? <img src={c.cover} alt="" /> : <div className="ic"><Icon name="home" /></div>}
              <div className="tx">
                <b>{c.otherName}{c.otherVerified && <span className="tag ok" style={{ marginLeft: 8, padding: "2px 8px" }}><Icon name="verified" />Verified</span>}</b>
                <small>{c.last ? `${c.last.mine ? "You: " : ""}${c.last.body}` : "No messages yet. Say hello."}</small>
                <small>{c.address}</small>
              </div>
              <div className="cmeta">{when(c.lastMessageAt)}{c.unread > 0 && <i className="bdg inline">{c.unread}</i>}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Thread({ account, id, info, onBack, onToast, onOpenListing, onRead }: { account: Account; id: string; info?: Conversation; onBack: () => void; onToast: (m: string) => void; onOpenListing: (id: string) => void; onRead: () => void }) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // load the chat, then keep it live; opening it marks everything read
  useEffect(() => {
    let alive = true;
    loadMessages(id).then(m => { if (alive) { setMsgs(m); markRead(id).then(onRead); } }).catch(e => { if (alive) { onToast((e as Error).message); setMsgs([]); } });
    const off = onNewMessage(id, m => {
      setMsgs(cur => (cur && !cur.some(x => x.id === m.id) ? [...cur, m] : cur));
      if (m.senderId !== account.id) markRead(id).then(onRead);
    });
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await sendMessage(id, account.id, body);
    setSending(false);
    if ("error" in r) { onToast(r.error); return; }
    setText("");
    setMsgs(cur => (cur && !cur.some(x => x.id === r.message.id) ? [...cur, r.message] : cur));
  };

  return (
    <div className="vw thread">
      <button type="button" className="backbtn" onClick={onBack}><Icon name="back" />Inbox</button>
      {info && (
        <button type="button" className="tl" onClick={() => info.listingLive ? onOpenListing(info.listingId) : onToast("This listing is no longer live")}>
          {info.cover ? <img src={info.cover} alt="" /> : <div className="ic"><Icon name="home" /></div>}
          <div className="tx"><b>{info.otherName}</b><small>{fmt(info.price, info.mode)}{info.mode === "rent" ? "/mo" : ""} · {info.address}</small></div>
          <Icon name="chevron" />
        </button>
      )}
      <div className="msgs" aria-live="polite">
        {msgs === null ? <div className="meta">Loading…</div> : msgs.length === 0 ? (
          <div className="meta" style={{ textAlign: "center", padding: "30px 0" }}>No messages yet. Say hello, and ask about viewing the home.</div>
        ) : msgs.map(m => (
          <div key={m.id} className={`msg${m.senderId === account.id ? " me" : ""}`}><p>{m.body}</p><small>{when(m.createdAt)}</small></div>
        ))}
        <div ref={end} />
      </div>
      <form className="compose" onSubmit={send}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Write a message" aria-label="Message" maxLength={2000} autoComplete="off" />
        <button className="btn primary" disabled={sending || !text.trim()}>Send</button>
      </form>
      <div className="meta" style={{ fontSize: 12, marginTop: 8 }}>Phone numbers are never shared. Keep the conversation here.</div>
    </div>
  );
}
