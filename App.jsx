import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Trophy, Plus, Shuffle, X, Check, ChevronLeft, Edit2, Trash2,
  RotateCcw, Users, ArrowLeft, PlayCircle, AlertTriangle, Home as HomeIcon,
  Clock, Award, Sparkles
} from "lucide-react";

/* ============================================================================
   DESIGN TOKENS
   Subject: a floodlit night pitch / stadium scoreboard.
   Base is a deep pitch-green-black (not pure black), accented with a warm
   floodlight gold rather than the generic acid-green or terracotta defaults.
============================================================================ */
const C = {
  bg: "#0A160F",
  bgHeader: "#0D1D13",
  surface: "#122318",
  surfaceRaised: "#16311F",
  border: "#204030",
  borderSoft: "#1A3324",
  line: "rgba(243,246,241,0.05)",
  text: "#F1F5EF",
  textDim: "#9FB6A6",
  textFaint: "#5E7568",
  gold: "#F0B33D",
  goldDim: "#8C6A26",
  goldGlow: "rgba(240,179,61,0.35)",
  red: "#E2604A",
  redDim: "#5A2E24",
  win: "#3FA66B",
};

const FONT_DISPLAY = "'Oswald', sans-serif";
const FONT_BODY = "'Inter', sans-serif";

const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { height: 8px; width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
    input:focus, textarea:focus, button:focus-visible {
      outline: 2px solid ${C.gold};
      outline-offset: 1px;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes popIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes glowPulse {
      0%, 100% { box-shadow: 0 0 18px 2px ${C.goldGlow}; }
      50% { box-shadow: 0 0 34px 8px ${C.goldGlow}; }
    }
    @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
    .fade-up { animation: fadeUp 0.35s ease both; }
    .pop-in { animation: popIn 0.18s ease both; }
    .overlay-in { animation: overlayIn 0.15s ease both; }
    .champion-glow { animation: glowPulse 2.2s ease-in-out infinite; }
    .tm-scroll { scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
    .no-tap-highlight { -webkit-tap-highlight-color: transparent; }
  `}</style>
);

/* ============================================================================
   HELPERS
============================================================================ */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextPowerOfTwo(n) {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

function roundLabel(teamsInRound) {
  switch (teamsInRound) {
    case 2: return "Final";
    case 4: return "Semi-final";
    case 8: return "Quarter-final";
    case 16: return "Round of 16";
    case 32: return "Round of 32";
    case 64: return "Round of 64";
    default: return `Round of ${teamsInRound}`;
  }
}

const CREST_COLORS = ["#2F6B4A", "#B8862F", "#3E6B8A", "#8A3E3E", "#5C4E8A", "#3E8A6E", "#8A5C2F", "#4A5C8A"];
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return CREST_COLORS[h % CREST_COLORS.length];
}
function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function isEmoji(str) {
  if (!str) return false;
  return /\p{Extended_Pictographic}/u.test(str);
}

/* ---- Bracket engine ---- */
function makeMatch(roundIndex, matchIndex, home, away, isRound0) {
  const hasHome = !!home, hasAway = !!away;
  const status = isRound0 ? (hasHome && hasAway ? "pending" : "bye") : "waiting";
  return {
    id: uid(), roundIndex, matchIndex,
    home: hasHome ? { teamId: home.id } : null,
    away: hasAway ? { teamId: away.id } : null,
    homeScore: null, awayScore: null, et: null, pens: null,
    status, winnerTeamId: null, isBye: false, completedAt: null,
    scorers: { home: [], away: [] }, notes: "",
  };
}

function hasAdjacentByes(slots) {
  for (let i = 0; i < slots.length; i += 2) {
    if (!slots[i] && !slots[i + 1]) return true;
  }
  return false;
}

function shuffleIntoSlots(teams) {
  const size = nextPowerOfTwo(teams.length);
  let slots, attempts = 0;
  do {
    const shuffled = shuffle(teams);
    slots = new Array(size).fill(null);
    const positions = shuffle([...Array(size).keys()]).slice(0, teams.length);
    positions.forEach((pos, idx) => { slots[pos] = shuffled[idx]; });
    attempts++;
  } while (hasAdjacentByes(slots) && attempts < 60);
  return slots;
}

function placeWinner(rounds, roundIndex, matchIndex, winnerTeamId) {
  if (roundIndex + 1 >= rounds.length) return;
  const nr = roundIndex + 1, nm = Math.floor(matchIndex / 2);
  const slot = matchIndex % 2 === 0 ? "home" : "away";
  const nextMatch = rounds[nr][nm];
  nextMatch[slot] = { teamId: winnerTeamId };
  nextMatch.status = nextMatch.home && nextMatch.away ? "pending" : "waiting";
}

function autoResolveByes(rounds) {
  rounds[0].forEach((m, mi) => {
    if (m.status === "bye") {
      const winner = m.home ? m.home.teamId : m.away.teamId;
      m.winnerTeamId = winner; m.status = "completed"; m.isBye = true; m.completedAt = null;
      placeWinner(rounds, 0, mi, winner);
    }
  });
}

function buildRoundsFromSlots(slots) {
  const size = slots.length;
  const round0 = [];
  for (let i = 0; i < size / 2; i++) round0.push(makeMatch(0, i, slots[2 * i], slots[2 * i + 1], true));
  const rounds = [round0];
  let count = size / 2, r = 1;
  while (count > 1) {
    count = count / 2;
    rounds.push(Array.from({ length: count }, (_, i) => makeMatch(r, i, null, null, false)));
    r++;
  }
  autoResolveByes(rounds);
  return rounds;
}

function clearDownstream(rounds, roundIndex, matchIndex) {
  const nr = roundIndex + 1;
  if (nr >= rounds.length) return;
  const nm = Math.floor(matchIndex / 2);
  const slot = matchIndex % 2 === 0 ? "home" : "away";
  const nextMatch = rounds[nr][nm];
  if (!nextMatch) return;
  nextMatch[slot] = null;
  nextMatch.homeScore = null; nextMatch.awayScore = null; nextMatch.et = null; nextMatch.pens = null;
  nextMatch.winnerTeamId = null; nextMatch.completedAt = null;
  nextMatch.status = nextMatch.home && nextMatch.away ? "pending" : "waiting";
  nextMatch.scorers = { home: [], away: [] }; nextMatch.notes = "";
  clearDownstream(rounds, nr, nm);
}

function computeStats(rounds, totalTeams) {
  let completedReal = 0;
  rounds.forEach((round) => round.forEach((m) => { if (m.status === "completed" && !m.isBye) completedReal++; }));
  const totalReal = totalTeams - 1;
  const teamsRemaining = totalTeams - completedReal;
  let currentRoundIndex = rounds.findIndex((round) => round.some((m) => m.status === "pending"));
  if (currentRoundIndex === -1) {
    currentRoundIndex = teamsRemaining <= 1 ? rounds.length - 1 : rounds.findIndex((round) => round.some((m) => m.status === "waiting"));
    if (currentRoundIndex === -1) currentRoundIndex = rounds.length - 1;
  }
  return { completedReal, totalReal, remaining: totalReal - completedReal, teamsRemaining, currentRoundIndex };
}

/* ============================================================================
   SMALL SHARED UI PIECES
============================================================================ */
function Crest({ team, size = 28 }) {
  if (!team) return null;
  const emoji = isEmoji(team.crest);
  const bg = hashColor(team.name || "?");
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 6, flexShrink: 0,
        background: emoji ? "transparent" : bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: emoji ? size * 0.72 : size * 0.4,
        fontFamily: FONT_DISPLAY, color: "#fff", fontWeight: 600,
        border: emoji ? "none" : `1px solid rgba(255,255,255,0.12)`,
      }}
    >
      {emoji ? team.crest : initials(team.name || "?")}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", size = "md", icon: Icon, disabled, style, type }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontFamily: FONT_BODY, fontWeight: 600, borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent", transition: "filter 0.15s, transform 0.1s", whiteSpace: "nowrap",
    opacity: disabled ? 0.45 : 1,
  };
  const sizes = { sm: { padding: "8px 12px", fontSize: 13 }, md: { padding: "11px 18px", fontSize: 14.5 }, lg: { padding: "14px 22px", fontSize: 16 } };
  const variants = {
    primary: { background: C.gold, color: "#1A1400" },
    secondary: { background: C.surfaceRaised, color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: "transparent", color: C.textDim },
    danger: { background: "transparent", color: C.red, border: `1px solid ${C.redDim}` },
  };
  return (
    <button
      type={type || "button"}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="no-tap-highlight"
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 17} />}
      {children}
    </button>
  );
}

function Pill({ children, tone = "default" }) {
  const tones = {
    default: { bg: C.surfaceRaised, fg: C.textDim, bd: C.border },
    gold: { bg: "rgba(240,179,61,0.12)", fg: C.gold, bd: C.goldDim },
    green: { bg: "rgba(63,166,107,0.12)", fg: C.win, bd: "#245C3C" },
    red: { bg: "rgba(226,96,74,0.12)", fg: C.red, bd: C.redDim },
  };
  const t = tones[tone];
  return (
    <span style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, fontFamily: FONT_BODY }}>
      {children}
    </span>
  );
}

function TextField({ label, value, onChange, placeholder, autoFocus, maxLength, onKeyDown }) {
  return (
    <label style={{ display: "block" }}>
      {label && <div style={{ fontSize: 13, color: C.textDim, marginBottom: 6, fontFamily: FONT_BODY }}>{label}</div>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onKeyDown={onKeyDown}
        style={{
          width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "11px 12px", color: C.text, fontSize: 15, fontFamily: FONT_BODY,
        }}
      />
    </label>
  );
}

function Overlay({ onClose, children, maxWidth = 480 }) {
  return (
    <div
      className="overlay-in"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(4,10,7,0.72)", backdropFilter: "blur(2px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pop-in"
        style={{
          width: "100%", maxWidth, maxHeight: "88vh", overflowY: "auto",
          background: C.surface, border: `1px solid ${C.border}`, borderBottom: "none",
          borderRadius: "16px 16px 0 0", padding: 20,
          margin: "0 auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }) {
  return (
    <Overlay onClose={onCancel} maxWidth={400}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: danger ? "rgba(226,96,74,0.15)" : "rgba(240,179,61,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertTriangle size={18} color={danger ? C.red : C.gold} />
        </div>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, color: C.text, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 14, color: C.textDim, lineHeight: 1.5 }}>{message}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} style={danger ? { background: C.red, color: "#fff", border: "none" } : {}}>{confirmLabel}</Button>
      </div>
    </Overlay>
  );
}

/* ============================================================================
   HOME SCREEN
============================================================================ */
function TournamentCard({ t, onOpen, onRename, onRestart, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const stats = t.rounds ? computeStats(t.rounds, t.teams.length) : null;
  const progress = stats ? stats.completedReal / Math.max(stats.totalReal, 1) : 0;
  const champion = t.champion ? t.teams.find((x) => x.id === t.champion) : null;

  return (
    <div className="fade-up" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        {editing ? (
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { setEditing(false); if (name.trim()) onRename(name.trim()); else setName(t.name); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ background: C.bg, border: `1px solid ${C.gold}`, borderRadius: 6, padding: "5px 8px", color: C.text, fontFamily: FONT_DISPLAY, fontSize: 18, width: "70%" }}
          />
        ) : (
          <div onClick={() => setEditing(true)} style={{ fontFamily: FONT_DISPLAY, fontSize: 19, color: C.text, cursor: "text", display: "flex", alignItems: "center", gap: 8 }}>
            {t.name} <Edit2 size={13} color={C.textFaint} />
          </div>
        )}
        {champion ? <Pill tone="gold">Champion crowned</Pill> : <Pill tone="green">In progress</Pill>}
      </div>

      {champion ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(240,179,61,0.08)", border: `1px solid ${C.goldDim}`, borderRadius: 8, padding: "10px 12px" }}>
          <Trophy size={18} color={C.gold} />
          <Crest team={champion} size={24} />
          <span style={{ color: C.gold, fontFamily: FONT_DISPLAY, fontSize: 15 }}>{champion.name}</span>
        </div>
      ) : (
        <div>
          <div style={{ height: 6, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: C.gold, transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 6 }}>
            {stats ? `${stats.completedReal} of ${stats.totalReal} matches played` : "Draw not confirmed"}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.textFaint }}>
        <Users size={13} /> {t.teams.length} teams
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Button size="sm" onClick={onOpen} style={{ flex: 1 }} icon={PlayCircle}>Open</Button>
        <Button size="sm" variant="secondary" onClick={onRestart} icon={RotateCcw}>Restart</Button>
        <Button size="sm" variant="danger" onClick={onDelete} icon={Trash2} />
      </div>
    </div>
  );
}

function HomeScreen({ tournaments, onOpen, onCreate, onRename, onRestart, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmRestart, setConfirmRestart] = useState(null);

  return (
    <div style={{ padding: "28px 20px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26, flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: C.surfaceRaised, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={22} color={C.gold} />
          </div>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, color: C.text, letterSpacing: 0.3 }}>Tournament Maker</div>
            <div style={{ fontSize: 13, color: C.textFaint }}>Run your own knockout, kick-off to final</div>
          </div>
        </div>
        <Button icon={Plus} onClick={onCreate}>New tournament</Button>
      </div>

      {tournaments.length === 0 ? (
        <div className="fade-up" style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: "70px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>⚽</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: C.text, marginBottom: 8 }}>No tournaments yet</div>
          <div style={{ fontSize: 14, color: C.textDim, marginBottom: 22, maxWidth: 360, marginInline: "auto", lineHeight: 1.5 }}>
            Add your teams, draw the bracket, and start recording results. Everything is saved on this device.
          </div>
          <Button icon={Plus} onClick={onCreate}>Create your first tournament</Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {tournaments.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((t) => (
            <TournamentCard
              key={t.id}
              t={t}
              onOpen={() => onOpen(t.id)}
              onRename={(name) => onRename(t.id, name)}
              onRestart={() => setConfirmRestart(t.id)}
              onDelete={() => setConfirmDelete(t.id)}
            />
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this tournament?"
          message="This removes the tournament, its bracket, and its match history for good."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { onDelete(confirmDelete); setConfirmDelete(null); }}
        />
      )}
      {confirmRestart && (
        <ConfirmDialog
          title="Restart this tournament?"
          message="Teams are kept, but the draw and every result will be cleared so you can draw again."
          confirmLabel="Restart"
          onCancel={() => setConfirmRestart(null)}
          onConfirm={() => { onRestart(confirmRestart); setConfirmRestart(null); }}
        />
      )}
    </div>
  );
}

/* ============================================================================
   CREATE SCREEN
============================================================================ */
function CreateScreen({ onCancel, onContinue }) {
  const [name, setName] = useState("");
  const [sizeChoice, setSizeChoice] = useState(8);
  const [customSize, setCustomSize] = useState(6);
  const [teams, setTeams] = useState(() => Array.from({ length: 8 }, () => ({ id: uid(), name: "", crest: "" })));
  const [error, setError] = useState("");

  const applySize = (n) => {
    setSizeChoice(n);
    const count = n === "custom" ? customSize : n;
    setTeams((prev) => {
      const next = [...prev];
      while (next.length < count) next.push({ id: uid(), name: "", crest: "" });
      while (next.length > count) next.pop();
      return next;
    });
  };

  const updateCustom = (n) => {
    const clamped = Math.max(2, Math.min(64, n || 2));
    setCustomSize(clamped);
    setTeams((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push({ id: uid(), name: "", crest: "" });
      while (next.length > clamped) next.pop();
      return next;
    });
  };

  const updateTeam = (id, field, value) => setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  const removeTeam = (id) => { if (teams.length > 2) setTeams((prev) => prev.filter((t) => t.id !== id)); };
  const addTeam = () => { if (teams.length < 64) setTeams((prev) => [...prev, { id: uid(), name: "", crest: "" }]); };
  const shuffleOrder = () => setTeams((prev) => shuffle(prev));

  const handleContinue = () => {
    if (!name.trim()) return setError("Give your tournament a name.");
    if (teams.length < 2) return setError("Add at least 2 teams.");
    const trimmed = teams.map((t) => ({ ...t, name: t.name.trim() }));
    if (trimmed.some((t) => !t.name)) return setError("Every team needs a name.");
    const lower = trimmed.map((t) => t.name.toLowerCase());
    if (new Set(lower).size !== lower.length) return setError("Team names must be unique.");
    setError("");
    onContinue(name.trim(), trimmed);
  };

  return (
    <div style={{ padding: "22px 20px 100px", maxWidth: 680, margin: "0 auto" }}>
      <button onClick={onCancel} className="no-tap-highlight" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.textDim, fontFamily: FONT_BODY, fontSize: 14, marginBottom: 18, cursor: "pointer", padding: 0 }}>
        <ArrowLeft size={16} /> Back
      </button>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: C.text, marginBottom: 22 }}>New tournament</div>

      <div style={{ marginBottom: 22 }}>
        <TextField label="Tournament name" value={name} onChange={setName} placeholder="e.g. Sunday League Cup" autoFocus />
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 8 }}>Number of teams</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[4, 8, 16, 32].map((n) => (
            <button key={n} onClick={() => applySize(n)} className="no-tap-highlight" style={{
              padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontFamily: FONT_DISPLAY, fontSize: 15,
              background: sizeChoice === n ? C.gold : C.surfaceRaised, color: sizeChoice === n ? "#1A1400" : C.text,
              border: `1px solid ${sizeChoice === n ? C.gold : C.border}`,
            }}>{n}</button>
          ))}
          <button onClick={() => applySize("custom")} className="no-tap-highlight" style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontFamily: FONT_DISPLAY, fontSize: 15,
            background: sizeChoice === "custom" ? C.gold : C.surfaceRaised, color: sizeChoice === "custom" ? "#1A1400" : C.text,
            border: `1px solid ${sizeChoice === "custom" ? C.gold : C.border}`,
          }}>Custom</button>
          {sizeChoice === "custom" && (
            <input type="number" min={2} max={64} value={customSize} onChange={(e) => updateCustom(parseInt(e.target.value, 10))}
              style={{ width: 74, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontFamily: FONT_BODY }} />
          )}
        </div>
        {teams.length > 0 && (teams.length & (teams.length - 1)) !== 0 && (
          <div style={{ fontSize: 12.5, color: C.textFaint, marginTop: 8 }}>
            {teams.length} isn't a power of two — some teams will get a first-round bye, chosen at random during the draw.
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: C.textDim }}>Teams ({teams.length})</div>
          <button onClick={shuffleOrder} className="no-tap-highlight" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.gold, fontSize: 13, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600 }}>
            <Shuffle size={13} /> Randomize teams
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {teams.map((t, i) => (
            <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 22, textAlign: "center", fontSize: 12, color: C.textFaint, fontFamily: FONT_DISPLAY }}>{i + 1}</div>
              <input
                value={t.crest}
                onChange={(e) => updateTeam(t.id, "crest", e.target.value.slice(0, 2))}
                placeholder="⚽"
                style={{ width: 42, textAlign: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 4px", color: C.text, fontSize: 16 }}
              />
              <input
                value={t.name}
                onChange={(e) => updateTeam(t.id, "name", e.target.value)}
                placeholder={`Team ${i + 1}`}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14.5, fontFamily: FONT_BODY }}
              />
              <button onClick={() => removeTeam(t.id)} className="no-tap-highlight" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: 6 }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addTeam} className="no-tap-highlight" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px dashed ${C.border}`, color: C.textDim, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 13.5, fontFamily: FONT_BODY }}>
          <Plus size={14} /> Add team
        </button>
      </div>

      {error && <div style={{ color: C.red, fontSize: 13.5, marginBottom: 14 }}>{error}</div>}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.bg, borderTop: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 640, display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancel</Button>
          <Button onClick={handleContinue} style={{ flex: 2 }} icon={Shuffle}>Continue to draw</Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   DRAW SCREEN
============================================================================ */
function DrawScreen({ teams, onBack, onConfirm }) {
  const [slots, setSlots] = useState(null);
  const [shuffling, setShuffling] = useState(false);
  const tickRef = useRef(0);

  const runShuffle = useCallback(() => {
    setShuffling(true);
    tickRef.current = 0;
    const iv = setInterval(() => {
      tickRef.current += 1;
      setSlots(shuffleIntoSlots(teams));
      if (tickRef.current > 9) {
        clearInterval(iv);
        setShuffling(false);
      }
    }, 90);
  }, [teams]);

  const size = nextPowerOfTwo(teams.length);
  const pairs = slots ? Array.from({ length: size / 2 }, (_, i) => [slots[2 * i], slots[2 * i + 1]]) : [];

  return (
    <div style={{ padding: "22px 20px 110px", maxWidth: 720, margin: "0 auto" }}>
      <button onClick={onBack} className="no-tap-highlight" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.textDim, fontFamily: FONT_BODY, fontSize: 14, marginBottom: 18, cursor: "pointer", padding: 0 }}>
        <ArrowLeft size={16} /> Back to teams
      </button>

      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: C.text, marginBottom: 4 }}>The draw</div>
      <div style={{ fontSize: 14, color: C.textDim, marginBottom: 24 }}>{teams.length} teams entered · {roundLabel(size)} kicks off round one</div>

      {!slots ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: "60px 20px", textAlign: "center" }}>
          <Sparkles size={30} color={C.gold} style={{ marginBottom: 14 }} />
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, color: C.text, marginBottom: 18 }}>Ready to draw the bracket</div>
          <Button icon={Shuffle} onClick={runShuffle} size="lg">Randomize draw</Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: shuffling ? 0.55 : 1, filter: shuffling ? "blur(0.3px)" : "none" }}>
          {pairs.map(([a, b], i) => (
            <div key={i} className={shuffling ? "" : "fade-up"} style={{ animationDelay: `${i * 40}ms`, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                {a ? <Crest team={a} size={26} /> : <div style={{ width: 26, height: 26, borderRadius: 6, border: `1px dashed ${C.textFaint}` }} />}
                <span style={{ color: a ? C.text : C.textFaint, fontSize: 14.5, fontFamily: FONT_BODY, fontWeight: a ? 500 : 400, fontStyle: a ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a ? a.name : "Bye"}</span>
              </div>
              <div style={{ color: C.textFaint, fontFamily: FONT_DISPLAY, fontSize: 13, padding: "0 10px" }}>vs</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, justifyContent: "flex-end", textAlign: "right" }}>
                {b ? (
                  <>
                    <span style={{ color: C.text, fontSize: 14.5, fontFamily: FONT_BODY, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                    <Crest team={b} size={26} />
                  </>
                ) : (
                  <span style={{ color: C.textFaint, fontSize: 13, fontStyle: "italic" }}>Bye</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {slots && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.bg, borderTop: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 640, display: "flex", gap: 10 }}>
            <Button variant="secondary" onClick={runShuffle} disabled={shuffling} icon={RotateCcw} style={{ flex: 1 }}>Redraw</Button>
            <Button onClick={() => onConfirm(slots)} disabled={shuffling} icon={Check} style={{ flex: 2 }}>Confirm & start tournament</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   MATCH CARD + BRACKET
============================================================================ */
const CARD_W = 208, CARD_H = 74, GUTTER = 46, ROW_UNIT = 92;

function MatchRowTeam({ team, score, isWinner, isLoser, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", opacity: isLoser ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {team ? <Crest team={team} size={20} /> : <div style={{ width: 20, height: 20, borderRadius: 6, border: `1px dashed ${C.textFaint}` }} />}
        <span style={{
          fontSize: 13.5, fontFamily: FONT_BODY, color: isWinner ? C.gold : C.text, fontWeight: isWinner ? 700 : 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {team ? team.name : (placeholder || "TBD")}
        </span>
      </div>
      {score !== null && score !== undefined && (
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: isWinner ? C.gold : C.textDim, marginLeft: 8 }}>{score}</span>
      )}
    </div>
  );
}

function MatchCard({ match, homeTeam, awayTeam, onClick }) {
  const clickable = match.home && match.away && !match.isBye;
  const isDone = match.status === "completed";
  const tag = match.pens ? `pens ${match.pens.home}-${match.pens.away}` : match.et ? "aet" : null;

  let border = C.border, bg = C.surface;
  if (match.status === "pending") { border = C.goldDim; }
  if (match.status === "waiting" || match.isBye) { bg = "transparent"; border = C.borderSoft; }

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className="no-tap-highlight"
      style={{
        width: CARD_W, height: CARD_H, background: bg, border: `1px solid ${border}`, borderStyle: (match.status === "waiting") ? "dashed" : "solid",
        borderRadius: 9, cursor: clickable ? "pointer" : "default", position: "relative", overflow: "hidden",
        transition: "border-color 0.15s, transform 0.1s",
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.borderColor = C.gold; }}
      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.borderColor = border; }}
    >
      <MatchRowTeam team={homeTeam} score={isDone ? match.homeScore : null} isWinner={isDone && match.winnerTeamId === homeTeam?.id} isLoser={isDone && match.winnerTeamId !== homeTeam?.id} placeholder={match.isBye ? "Bye" : "TBD"} />
      <div style={{ height: 1, background: C.line, marginLeft: 10, marginRight: 10 }} />
      <MatchRowTeam team={awayTeam} score={isDone ? match.awayScore : null} isWinner={isDone && match.winnerTeamId === awayTeam?.id} isLoser={isDone && match.winnerTeamId !== awayTeam?.id} placeholder={match.isBye ? "Bye" : "TBD"} />
      {tag && <div style={{ position: "absolute", top: 3, right: 6, fontSize: 9, color: C.textFaint, fontFamily: FONT_BODY, letterSpacing: 0.4 }}>{tag}</div>}
    </div>
  );
}

function BracketBoard({ rounds, teamsById, onSelectMatch, currentRoundIndex }) {
  const totalHeight = rounds[0].length * ROW_UNIT;
  const champion = rounds[rounds.length - 1][0];
  const championTeam = champion.status === "completed" ? teamsById[champion.winnerTeamId] : null;

  return (
    <div className="tm-scroll" style={{ overflowX: "auto", paddingBottom: 12 }}>
      <div style={{ display: "flex", minWidth: rounds.length * (CARD_W + GUTTER) + 160 }}>
        {rounds.map((round, rIdx) => (
          <div key={rIdx} style={{ width: CARD_W + GUTTER }}>
            <div style={{
              fontFamily: FONT_DISPLAY, fontSize: 13, color: rIdx === currentRoundIndex ? C.gold : C.textFaint,
              marginLeft: GUTTER, marginBottom: 10, letterSpacing: 0.3,
              paddingBottom: 8, borderBottom: `2px solid ${rIdx === currentRoundIndex ? C.gold : "transparent"}`,
            }}>
              {roundLabel(round.length * 2)}
            </div>
            <div style={{ position: "relative", height: totalHeight }}>
              {rIdx > 0 && round.map((m, mi) => {
                const prevCount = rounds[rIdx - 1].length;
                const cTop = (2 * mi + 0.5) / prevCount * totalHeight;
                const cBot = (2 * mi + 1.5) / prevCount * totalHeight;
                const cThis = (mi + 0.5) / round.length * totalHeight;
                const stroke = m.status === "completed" || m.status === "pending" ? C.goldDim : C.border;
                return (
                  <React.Fragment key={"c" + mi}>
                    <div style={{ position: "absolute", left: 0, top: cTop, width: GUTTER / 2, height: 1, background: stroke }} />
                    <div style={{ position: "absolute", left: 0, top: cBot, width: GUTTER / 2, height: 1, background: stroke }} />
                    <div style={{ position: "absolute", left: GUTTER / 2, top: Math.min(cTop, cBot), width: 1, height: Math.abs(cBot - cTop), background: stroke }} />
                    <div style={{ position: "absolute", left: GUTTER / 2, top: cThis, width: GUTTER / 2, height: 1, background: stroke }} />
                  </React.Fragment>
                );
              })}
              {round.map((m, mi) => {
                const center = (mi + 0.5) / round.length * totalHeight;
                return (
                  <div key={m.id} style={{ position: "absolute", left: GUTTER, top: center - CARD_H / 2 }}>
                    <MatchCard match={m} homeTeam={m.home ? teamsById[m.home.teamId] : null} awayTeam={m.away ? teamsById[m.away.teamId] : null} onClick={() => onSelectMatch(rIdx, mi)} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ width: 150 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: championTeam ? C.gold : C.textFaint, marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${championTeam ? C.gold : "transparent"}` }}>Champion</div>
          <div style={{ position: "relative", height: totalHeight }}>
            <div style={{ position: "absolute", top: totalHeight / 2 - 46, left: 0, width: 130, textAlign: "center" }}>
              {championTeam ? (
                <div className="champion-glow" style={{ background: C.surfaceRaised, border: `1px solid ${C.gold}`, borderRadius: 12, padding: "16px 10px" }}>
                  <Trophy size={22} color={C.gold} style={{ marginBottom: 8 }} />
                  <Crest team={championTeam} size={30} />
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.text, marginTop: 8 }}>{championTeam.name}</div>
                </div>
              ) : (
                <div style={{ border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: "22px 10px" }}>
                  <Trophy size={20} color={C.textFaint} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   MATCH MODAL
============================================================================ */
function ScorePad({ value, onChange, big }) {
  return (
    <input
      type="number" min={0} inputMode="numeric" value={value}
      onChange={(e) => { const v = e.target.value; onChange(v === "" ? "" : Math.max(0, parseInt(v, 10) || 0)); }}
      style={{
        width: big ? 72 : 56, textAlign: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: big ? "10px 0" : "7px 0", color: C.text, fontFamily: FONT_DISPLAY, fontSize: big ? 26 : 18,
      }}
    />
  );
}

function MatchModal({ match, homeTeam, awayTeam, label, onClose, onSave, onReset }) {
  const [homeScore, setHomeScore] = useState(match.homeScore ?? "");
  const [awayScore, setAwayScore] = useState(match.awayScore ?? "");
  const [showET, setShowET] = useState(!!match.et);
  const [etHome, setEtHome] = useState(match.et?.home ?? "");
  const [etAway, setEtAway] = useState(match.et?.away ?? "");
  const [showPens, setShowPens] = useState(!!match.pens);
  const [pensHome, setPensHome] = useState(match.pens?.home ?? "");
  const [pensAway, setPensAway] = useState(match.pens?.away ?? "");
  const [scorersHome, setScorersHome] = useState((match.scorers?.home || []).join(", "));
  const [scorersAway, setScorersAway] = useState((match.scorers?.away || []).join(", "));
  const [notes, setNotes] = useState(match.notes || "");
  const [err, setErr] = useState("");

  const hasScores = homeScore !== "" && awayScore !== "";
  const tied = hasScores && Number(homeScore) === Number(awayScore);
  const etTied = showET && etHome !== "" && etAway !== "" && Number(etHome) === Number(etAway);
  const pensReady = showPens && pensHome !== "" && pensAway !== "" && Number(pensHome) !== Number(pensAway);

  const canSave = hasScores && (!tied || (showET && !etTied) || (showET && etTied && pensReady));

  const handleSave = () => {
    if (!hasScores) return setErr("Enter a score for both teams.");
    if (tied && !showET) return setErr("Scores are level — add extra time or edit the score.");
    if (tied && showET && (etHome === "" || etAway === "")) return setErr("Enter the extra-time score.");
    if (tied && showET && etTied && !showPens) return setErr("Still level after extra time — go to penalties.");
    if (tied && showET && etTied && showPens && !pensReady) return setErr("Penalty scores can't be level.");
    setErr("");
    onSave({
      homeScore: Number(homeScore), awayScore: Number(awayScore),
      et: showET && etHome !== "" && etAway !== "" ? { home: Number(etHome), away: Number(etAway) } : null,
      pens: showPens && pensReady ? { home: Number(pensHome), away: Number(pensAway) } : null,
      scorersHome: scorersHome.split(",").map((s) => s.trim()).filter(Boolean),
      scorersAway: scorersAway.split(",").map((s) => s.trim()).filter(Boolean),
      notes,
    });
  };

  return (
    <Overlay onClose={onClose} maxWidth={480}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 12.5, color: C.textFaint, fontFamily: FONT_BODY, fontWeight: 600 }}>{label}</div>
        <button onClick={onClose} className="no-tap-highlight" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><X size={20} /></button>
      </div>
      <div style={{ marginBottom: 4 }}>
        <Pill tone={match.status === "completed" ? "green" : "default"}>{match.status === "completed" ? "Completed" : "Not started"}</Pill>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 4px" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <Crest team={homeTeam} size={40} />
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: C.text, marginTop: 8 }}>{homeTeam.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ScorePad value={homeScore} onChange={setHomeScore} big />
          <span style={{ color: C.textFaint, fontFamily: FONT_DISPLAY, fontSize: 20 }}>–</span>
          <ScorePad value={awayScore} onChange={setAwayScore} big />
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <Crest team={awayTeam} size={40} />
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: C.text, marginTop: 8 }}>{awayTeam.name}</div>
        </div>
      </div>

      {tied && (
        <div style={{ background: "rgba(226,96,74,0.08)", border: `1px solid ${C.redDim}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: C.text, marginBottom: showET ? 12 : 0 }}>Scores are level. This is a knockout — the tie needs a winner.</div>
          {!showET && <Button size="sm" variant="secondary" onClick={() => setShowET(true)}>Add extra time</Button>}
          {showET && (
            <div>
              <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 8 }}>Extra time score (added to normal time)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: etTied ? 12 : 0 }}>
                <ScorePad value={etHome} onChange={setEtHome} />
                <span style={{ color: C.textFaint }}>–</span>
                <ScorePad value={etAway} onChange={setEtAway} />
              </div>
              {etTied && !showPens && <Button size="sm" variant="secondary" onClick={() => setShowPens(true)}>Still level — go to penalties</Button>}
              {etTied && showPens && (
                <div>
                  <div style={{ fontSize: 12.5, color: C.textDim, margin: "10px 0 8px" }}>Penalty shootout score</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                    <ScorePad value={pensHome} onChange={setPensHome} />
                    <span style={{ color: C.textFaint }}>–</span>
                    <ScorePad value={pensAway} onChange={setPensAway} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <TextField label={`${homeTeam.name} scorers (optional)`} value={scorersHome} onChange={setScorersHome} placeholder="e.g. Smith 12', Lee 60'" />
        <TextField label={`${awayTeam.name} scorers (optional)`} value={scorersAway} onChange={setScorersAway} placeholder="e.g. Diaz 34'" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 6 }}>Match notes (optional)</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering about this match"
          style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text, fontSize: 14, fontFamily: FONT_BODY, resize: "vertical" }} />
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        {match.status === "completed" && <Button variant="danger" onClick={onReset} icon={RotateCcw}>Reset</Button>}
        <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
        <Button onClick={handleSave} style={{ flex: 1 }} icon={Check}>Save result</Button>
      </div>
    </Overlay>
  );
}

/* ============================================================================
   TOURNAMENT SCREEN (bracket / dashboard / history tabs)
============================================================================ */
function DashboardTab({ tournament, rounds, teamsById, stats, onSelectMatch }) {
  const champion = tournament.champion ? teamsById[tournament.champion] : null;
  const upNext = [];
  rounds.forEach((round, ri) => round.forEach((m, mi) => { if (m.status === "pending") upNext.push({ ri, mi, m }); }));

  const statCards = [
    { label: "Current round", value: champion ? "Final" : roundLabel(rounds[stats.currentRoundIndex].length * 2) },
    { label: "Teams remaining", value: stats.teamsRemaining },
    { label: "Matches played", value: stats.completedReal },
    { label: "Matches remaining", value: stats.remaining },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {champion && (
        <div className="champion-glow" style={{ background: C.surfaceRaised, border: `1px solid ${C.gold}`, borderRadius: 14, padding: 22, display: "flex", alignItems: "center", gap: 16 }}>
          <Trophy size={34} color={C.gold} />
          <div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 2 }}>Tournament champion</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Crest team={champion} size={30} />
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: C.text }}>{champion.name}</div>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, color: C.gold }}>{s.value}</div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: C.text, marginBottom: 12 }}>Up next</div>
        {upNext.length === 0 ? (
          <div style={{ color: C.textFaint, fontSize: 14, border: `1px dashed ${C.border}`, borderRadius: 10, padding: 20, textAlign: "center" }}>
            {champion ? "Every match has been played." : "Waiting on earlier results."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upNext.map(({ ri, mi, m }) => (
              <div key={m.id} onClick={() => onSelectMatch(ri, mi)} className="no-tap-highlight" style={{ cursor: "pointer", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Crest team={teamsById[m.home.teamId]} size={22} />
                  <span style={{ color: C.text, fontSize: 14 }}>{teamsById[m.home.teamId].name}</span>
                  <span style={{ color: C.textFaint, fontSize: 12.5 }}>vs</span>
                  <span style={{ color: C.text, fontSize: 14 }}>{teamsById[m.away.teamId].name}</span>
                  <Crest team={teamsById[m.away.teamId]} size={22} />
                </div>
                <Pill>{roundLabel(rounds[ri].length * 2)}</Pill>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryTab({ rounds, teamsById }) {
  const matches = [];
  rounds.forEach((round, ri) => round.forEach((m) => {
    if (m.status === "completed" && !m.isBye) matches.push({ ...m, roundSize: round.length * 2 });
  }));
  matches.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  if (matches.length === 0) {
    return <div style={{ color: C.textFaint, fontSize: 14, border: `1px dashed ${C.border}`, borderRadius: 10, padding: 30, textAlign: "center" }}>No matches played yet. Results will appear here once you save a score.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {matches.map((m) => {
        const home = teamsById[m.home.teamId], away = teamsById[m.away.teamId];
        const winner = teamsById[m.winnerTeamId];
        const extra = m.pens ? ` (pens ${m.pens.home}-${m.pens.away})` : m.et ? " (aet)" : "";
        return (
          <div key={m.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Pill>{roundLabel(m.roundSize)}</Pill>
              <span style={{ fontSize: 12, color: C.textFaint }}>{m.completedAt ? new Date(m.completedAt).toLocaleString() : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, flexWrap: "wrap" }}>
              <span style={{ color: m.winnerTeamId === home.id ? C.gold : C.text, fontWeight: m.winnerTeamId === home.id ? 700 : 500 }}>{home.name}</span>
              <span style={{ fontFamily: FONT_DISPLAY, color: C.text }}>{m.homeScore} – {m.awayScore}</span>
              <span style={{ color: m.winnerTeamId === away.id ? C.gold : C.text, fontWeight: m.winnerTeamId === away.id ? 700 : 500 }}>{away.name}</span>
              <span style={{ color: C.textFaint, fontSize: 12.5 }}>{extra}</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 4 }}>Winner: {winner.name}</div>
          </div>
        );
      })}
    </div>
  );
}

function TournamentScreen({ tournament, onBack, onUpdate, onDelete, onRestart }) {
  const [tab, setTab] = useState("bracket");
  const [selected, setSelected] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const teamsById = useMemo(() => Object.fromEntries(tournament.teams.map((t) => [t.id, t])), [tournament.teams]);
  const rounds = tournament.rounds;
  const stats = useMemo(() => computeStats(rounds, tournament.teams.length), [rounds, tournament.teams.length]);

  const selectedMatch = selected ? rounds[selected.ri][selected.mi] : null;

  const mutate = (fn) => {
    const cloned = JSON.parse(JSON.stringify(tournament));
    fn(cloned);
    cloned.updatedAt = Date.now();
    const finalMatch = cloned.rounds[cloned.rounds.length - 1][0];
    cloned.champion = finalMatch.status === "completed" ? finalMatch.winnerTeamId : null;
    onUpdate(cloned);
  };

  const handleSaveMatch = (payload) => {
    mutate((cloned) => {
      const { ri, mi } = selected;
      const match = cloned.rounds[ri][mi];
      const oldWinner = match.winnerTeamId;
      let winner = null;
      if (payload.homeScore !== payload.awayScore) winner = payload.homeScore > payload.awayScore ? match.home.teamId : match.away.teamId;
      else if (payload.et && payload.et.home !== payload.et.away) winner = payload.et.home > payload.et.away ? match.home.teamId : match.away.teamId;
      else if (payload.pens && payload.pens.home !== payload.pens.away) winner = payload.pens.home > payload.pens.away ? match.home.teamId : match.away.teamId;
      if (!winner) return;
      match.homeScore = payload.homeScore; match.awayScore = payload.awayScore;
      match.et = payload.et; match.pens = payload.pens;
      match.scorers = { home: payload.scorersHome, away: payload.scorersAway };
      match.notes = payload.notes;
      match.winnerTeamId = winner; match.status = "completed"; match.completedAt = Date.now();
      if (oldWinner && oldWinner !== winner) clearDownstream(cloned.rounds, ri, mi);
      placeWinner(cloned.rounds, ri, mi, winner);
    });
    setSelected(null);
  };

  const handleResetMatch = () => {
    mutate((cloned) => {
      const { ri, mi } = selected;
      const match = cloned.rounds[ri][mi];
      match.homeScore = null; match.awayScore = null; match.et = null; match.pens = null;
      match.winnerTeamId = null; match.status = "pending"; match.completedAt = null;
      match.scorers = { home: [], away: [] }; match.notes = "";
      clearDownstream(cloned.rounds, ri, mi);
    });
    setSelected(null);
  };

  return (
    <div style={{ padding: "20px 20px 60px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <button onClick={onBack} className="no-tap-highlight" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.textDim, fontFamily: FONT_BODY, fontSize: 13.5, marginBottom: 10, cursor: "pointer", padding: 0 }}>
            <HomeIcon size={14} /> All tournaments
          </button>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: C.text }}>{tournament.name}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setConfirmRestart(true)}>Restart</Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 22, borderBottom: `1px solid ${C.border}` }}>
        {[["bracket", "Bracket"], ["dashboard", "Dashboard"], ["history", "History"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="no-tap-highlight" style={{
            background: "none", border: "none", cursor: "pointer", padding: "10px 6px", marginRight: 18,
            color: tab === key ? C.gold : C.textDim, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 14.5,
            borderBottom: `2px solid ${tab === key ? C.gold : "transparent"}`, marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === "bracket" && <BracketBoard rounds={rounds} teamsById={teamsById} currentRoundIndex={stats.currentRoundIndex} onSelectMatch={(ri, mi) => setSelected({ ri, mi })} />}
      {tab === "dashboard" && <DashboardTab tournament={tournament} rounds={rounds} teamsById={teamsById} stats={stats} onSelectMatch={(ri, mi) => setSelected({ ri, mi })} />}
      {tab === "history" && <HistoryTab rounds={rounds} teamsById={teamsById} />}

      {selectedMatch && (
        <MatchModal
          match={selectedMatch}
          homeTeam={teamsById[selectedMatch.home.teamId]}
          awayTeam={teamsById[selectedMatch.away.teamId]}
          label={roundLabel(rounds[selected.ri].length * 2)}
          onClose={() => setSelected(null)}
          onSave={handleSaveMatch}
          onReset={() => setConfirmReset(true)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset this match?"
          message="The score will be cleared. If the winner already advanced, any later results built on it will be cleared too."
          confirmLabel="Reset match"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => { setConfirmReset(false); handleResetMatch(); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this tournament?"
          message="This removes the tournament, its bracket, and its match history for good."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { onDelete(tournament.id); }}
        />
      )}
      {confirmRestart && (
        <ConfirmDialog
          title="Restart this tournament?"
          message="Teams are kept, but the draw and every result will be cleared so you can draw again."
          confirmLabel="Restart"
          onCancel={() => setConfirmRestart(false)}
          onConfirm={() => { onRestart(tournament.id); }}
        />
      )}
    </div>
  );
}

/* ============================================================================
   APP ROOT
============================================================================ */
const STORAGE_KEY = "tournaments-v1";

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [screen, setScreen] = useState("home");
  const [draftTeams, setDraftTeams] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [restartingId, setRestartingId] = useState(null);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) setTournaments(JSON.parse(res.value));
      } catch (e) { /* nothing saved yet */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set(STORAGE_KEY, JSON.stringify(tournaments), false).catch(() => {});
  }, [tournaments, loaded]);

  const activeTournament = tournaments.find((t) => t.id === activeId) || null;

  const goCreate = () => { setDraftTeams(null); setDraftName(""); setRestartingId(null); setScreen("create"); };

  const handleContinueToDraw = (name, teams) => { setDraftName(name); setDraftTeams(teams); setScreen("draw"); };

  const handleConfirmDraw = (slots) => {
    const rounds = buildRoundsFromSlots(slots);
    if (restartingId) {
      setTournaments((prev) => prev.map((t) => (t.id === restartingId ? { ...t, rounds, champion: null, updatedAt: Date.now() } : t)));
      setActiveId(restartingId);
    } else {
      const newT = { id: uid(), name: draftName, teams: draftTeams, rounds, champion: null, createdAt: Date.now(), updatedAt: Date.now() };
      setTournaments((prev) => [...prev, newT]);
      setActiveId(newT.id);
    }
    setScreen("tournament");
  };

  const openTournament = (id) => { setActiveId(id); setScreen("tournament"); };
  const renameTournament = (id, name) => setTournaments((prev) => prev.map((t) => (t.id === id ? { ...t, name, updatedAt: Date.now() } : t)));
  const deleteTournament = (id) => { setTournaments((prev) => prev.filter((t) => t.id !== id)); setScreen("home"); setActiveId(null); };
  const restartTournament = (id) => {
    const t = tournaments.find((x) => x.id === id);
    if (!t) return;
    setDraftTeams(t.teams); setDraftName(t.name); setRestartingId(id); setScreen("draw");
  };
  const updateTournament = (updated) => setTournaments((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT_BODY, color: C.text, position: "relative" }}>
      <FontLoader />
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.5,
        backgroundImage: `repeating-linear-gradient(0deg, ${C.line} 0px, ${C.line} 1px, transparent 1px, transparent 64px)`,
      }} />
      <div style={{ position: "relative" }}>
        {!loaded ? null : screen === "home" ? (
          <HomeScreen tournaments={tournaments} onOpen={openTournament} onCreate={goCreate} onRename={renameTournament} onRestart={restartTournament} onDelete={deleteTournament} />
        ) : screen === "create" ? (
          <CreateScreen onCancel={() => setScreen("home")} onContinue={handleContinueToDraw} />
        ) : screen === "draw" ? (
          <DrawScreen teams={draftTeams} onBack={() => (restartingId ? setScreen("home") : setScreen("create"))} onConfirm={handleConfirmDraw} />
        ) : screen === "tournament" && activeTournament ? (
          <TournamentScreen
            tournament={activeTournament}
            onBack={() => { setScreen("home"); setActiveId(null); }}
            onUpdate={updateTournament}
            onDelete={deleteTournament}
            onRestart={restartTournament}
          />
        ) : (
          <HomeScreen tournaments={tournaments} onOpen={openTournament} onCreate={goCreate} onRename={renameTournament} onRestart={restartTournament} onDelete={deleteTournament} />
        )}
      </div>
    </div>
  );
}
