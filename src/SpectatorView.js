// SpectatorView.js — spectators see 5 rows: Captains, Captains, 1, 2, 3
import React, { useEffect, useMemo, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import DraftBoard from './DraftBoard';

const socket = io();

// spectator-only labels
const ROUND_LABELS = ['Captains', 'Captains', '1', '2', '3'];

export default function SpectatorView() {
  const [draftConfig, setDraftConfig] = useState(null);
  const [activeTeam, setActiveTeam] = useState(null);
  const [teamRosters, setTeamRosters] = useState([]);   // shape: teamIndex -> [players...]
  const [currentDraft, setCurrentDraft] = useState([]); // flexible shapes; we handle below

  // ---- load initial state + live updates ----
  const hydrate = (data = {}) => {
    const dc = data.draftConfig || data;

    setDraftConfig(dc || null);

    const at =
      typeof data.activeTeam === 'number'
        ? data.activeTeam
        : typeof dc.activeTeam === 'number'
        ? dc.activeTeam
        : null;
    setActiveTeam(at);

    const rosters =
      Array.isArray(data.teamRosters) ? data.teamRosters :
      Array.isArray(dc.teamRosters)   ? dc.teamRosters   :
      [];
    setTeamRosters(rosters);

    const rounds =
      Array.isArray(data.currentDraft) ? data.currentDraft :
      Array.isArray(dc.currentDraft)   ? dc.currentDraft   :
      [];
    setCurrentDraft(rounds);
  };

  const fetchState = async () => {
    try {
      const { data = {} } = await axios.get('/api/draft-state'); // alias to /api/state if you use that
      hydrate(data);
    } catch (e) {
      console.error('[spectator] state fetch failed:', e);
    }
  };

  useEffect(() => {
    fetchState();
    socket.on('draftUpdate', (data) => hydrate(data || {}));
    return () => socket.off('draftUpdate');
  }, []);

  // ---- helpers ----
  const normalizeNames = (tn) => {
    if (!tn) return [];
    if (Array.isArray(tn)) return tn;
    if (typeof tn === 'string') return tn.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  };

  // ---- build the board model (robust to different server shapes) ----
  const { teamsForBoard, roundsForBoard, picksForBoard } = useMemo(() => {
    const namesFromConfig = normalizeNames(draftConfig?.teamNames);
    const teamCount =
      (teamRosters?.length || 0) ||
      (namesFromConfig.length || 0) ||
      (draftConfig?.numberOfTeams || 4);

    const teamsForBoard = Array.from({ length: teamCount }, (_, i) => ({
      id: i,
      name: namesFromConfig[i] || `Team ${i + 1}`,
    }));

    // spectator labels instead of numbers
    const roundsForBoard = ROUND_LABELS;

    // PREFERRED: build from teamRosters (team -> roundIndex)
    if (teamRosters && teamRosters.length) {
      const picks = roundsForBoard.map((_, rIdx) => {
        const roundMap = {};
        teamsForBoard.forEach((t) => {
          const player = teamRosters?.[t.id]?.[rIdx];
          if (player) roundMap[t.id] = player;
        });
        return roundMap;
      });
      return { teamsForBoard, roundsForBoard, picksForBoard: picks };
    }

    // FALLBACKS: reconstruct from currentDraft
    const empty = roundsForBoard.map(() => ({}));
    if (!Array.isArray(currentDraft) || currentDraft.length === 0) {
      return { teamsForBoard, roundsForBoard, picksForBoard: empty };
    }

    const r0 = currentDraft[0];

    // A) per-round MAP: currentDraft[rIdx] = { [teamId]: player }
    if (r0 && !Array.isArray(r0) && typeof r0 === 'object') {
      const picks = roundsForBoard.map((_, rIdx) => {
        const src = currentDraft[rIdx] || {};
        const out = {};
        teamsForBoard.forEach(t => {
          const p = src[t.id] ?? src[String(t.id)];
          if (p) out[t.id] = p;
        });
        return out;
      });
      return { teamsForBoard, roundsForBoard, picksForBoard: picks };
    }

    // B) per-round ARRAY: currentDraft[rIdx] = [{teamId, player}, ...]
    if (Array.isArray(r0)) {
      const picks = roundsForBoard.map((_, rIdx) => {
        const src = currentDraft[rIdx] || [];
        const out = {};
        src.forEach(entry => {
          const tid = entry?.teamId ?? entry?.team ?? entry?.teamIndex ?? entry?.team_id;
          const player = entry?.player ?? entry?.pick ?? entry?.draftPick ?? entry;
          if (tid != null && player) out[Number(tid)] = player;
        });
        return out;
      });
      return { teamsForBoard, roundsForBoard, picksForBoard: picks };
    }

    // C) FLAT list: currentDraft = [{teamId, player, round?}, ...]
    const perTeamCount = Array(teamCount).fill(0);
    const grid = roundsForBoard.map(() => ({}));
    currentDraft.forEach((entry) => {
      const tid = entry?.teamId ?? entry?.team ?? entry?.teamIndex ?? entry?.team_id;
      const player = entry?.player ?? entry?.pick ?? entry?.draftPick ?? entry;
      if (tid == null || !player) return;
      let rIdx;
      if (entry?.round != null) {
        rIdx = Number(entry.round) - 1; // 0-based
      } else {
        rIdx = perTeamCount[Number(tid)]++;
      }
      if (rIdx >= 0 && rIdx < roundsForBoard.length) {
        grid[rIdx][Number(tid)] = player;
      }
    });

    return { teamsForBoard, roundsForBoard, picksForBoard: grid };
  }, [draftConfig, teamRosters, currentDraft]);

  return (
    <div className="container spectator">
      <header className="header">
        <h1>Draft Live Feed</h1>
      </header>

      <p className="status">
        Active Team: {typeof activeTeam === 'number' ? `Team ${activeTeam + 1}` : 'Draft complete'}
      </p>

      <div className="section">
        <h3>
          Draft Board <span style={{ opacity:.7, fontWeight:400 }}>(showing Captains, Captains, 1–3)</span>
        </h3>
        <DraftBoard teams={teamsForBoard} rounds={roundsForBoard} picks={picksForBoard} />
      </div>
    </div>
  );
}
