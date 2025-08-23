// SpectatorView.js — show ONLY rounds 1–5 to spectators
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import DraftBoard from './DraftBoard';

const socket = io();
const PUBLIC_ROUNDS = 5; // 👈 captains in first two, show top 5 total

export default function SpectatorView() {
  const [draftConfig, setDraftConfig] = useState(null);
  const [activeTeam, setActiveTeam] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [teamRosters, setTeamRosters] = useState([]);
  const [currentDraft, setCurrentDraft] = useState([]);
  const [draftStarted, setDraftStarted] = useState(false);

  const fetchDraftState = async () => {
    try {
      const { data = {} } = await axios.get('/api/state');
      setDraftConfig(data.draftConfig || null);
      setAvailablePlayers(Array.isArray(data.availablePlayers) ? data.availablePlayers : []);
      setTeamRosters(Array.isArray(data.teamRosters) ? data.teamRosters : []);
      setCurrentDraft(Array.isArray(data.currentDraft) ? data.currentDraft : []);
      setActiveTeam(typeof data.activeTeam === 'number' ? data.activeTeam : null);
      setDraftStarted(!!data.draftStarted);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDraftState();
    socket.on('draftUpdate', (data) => {
      if (data?.draftConfig) setDraftConfig(data.draftConfig);
      if (Array.isArray(data?.availablePlayers)) setAvailablePlayers(data.availablePlayers);
      if (Array.isArray(data?.teamRosters)) setTeamRosters(data.teamRosters);
      if (Array.isArray(data?.currentDraft)) setCurrentDraft(data.currentDraft);
      if (typeof data?.activeTeam === 'number') setActiveTeam(data.activeTeam);
      if (typeof data?.draftStarted === 'boolean') setDraftStarted(data.draftStarted);
    });
    return () => socket.off('draftUpdate');
  }, []);

  // team names
  const teamNamesFromConfig = draftConfig
    ? ((typeof draftConfig.teamNames === 'string'
        ? draftConfig.teamNames.split(',').map(s => s.trim())
        : draftConfig.teamNames) || [])
    : [];
  const names = teamNamesFromConfig.length ? teamNamesFromConfig : ['Team 1','Team 2','Team 3','Team 4'];

  // teams for board (based on rosters we have)
  const teamsForBoard = (teamRosters.length ? teamRosters : []).map((_, i) => ({
    id: i,
    name: names[i] || `Team ${i + 1}`,
  }));

  // ALWAYS render rounds 1..PUBLIC_ROUNDS
  const roundsForBoard = Array.from({ length: PUBLIC_ROUNDS }, (_, i) => i + 1);

  // picks only for those rounds (ok if empty)
  const picksForBoard = roundsForBoard.map((_, roundIdx) => {
    const roundPicks = {};
    teamsForBoard.forEach((t) => {
      const r = teamRosters[t.id] || [];
      if (r[roundIdx]) roundPicks[t.id] = r[roundIdx];
    });
    return roundPicks;
  });

  const showBoard = draftStarted || teamsForBoard.length > 0 || currentDraft.length > 0;

  return (
    <div className="container spectator">
      <header className="header">
        <h1>Draft Live Feed</h1>
      </header>

      <p className="status">
        Active Team: {typeof activeTeam === 'number' ? `Team ${activeTeam + 1}` : 'Draft complete'}
      </p>

      {showBoard && (
        <div className="section">
          <h3>
            Draft Board <span style={{opacity:.7, fontWeight:400}}>(showing rounds 1–5 only)</span>
          </h3>
          <DraftBoard teams={teamsForBoard} rounds={roundsForBoard} picks={picksForBoard} />
        </div>
      )}
    </div>
  );
}
