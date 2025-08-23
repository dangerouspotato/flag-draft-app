import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import DraftBoard from './DraftBoard';

// same-origin WS
const socket = io();

// lil helper so names always show (flat obj or nested {row:{...}})
const displayName = (p) => {
  if (!p) return '';
  const obj = p.row || p;
  return (
    (obj.name && String(obj.name).trim()) ||
    [obj.firstName, obj.lastName].filter(Boolean).join(' ') ||
    obj['First & Last Name'] ||
    [obj['First Name'], obj['Last Name']].filter(Boolean).join(' ') ||
    ''
  );
};

function ManagerDashboard() {
  const [file, setFile] = useState(null);
  const [config, setConfig] = useState({
    numberOfTeams: 8,
    teamNames: 'Team 1,Team 2,Team 3,Team 4, Team 5, Team 6, Team 7, Team 8',
    picksPerTeam: 9,
    draftType: 'traditional'
  });

  const [activeTeam, setActiveTeam] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [teamRosters, setTeamRosters] = useState([]);
  const [currentDraft, setCurrentDraft] = useState([]);

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post('/api/upload-csv', formData);
      console.log('CSV uploaded:', res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfigChange = (e) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const updateConfig = async () => {
    try {
      const res = await axios.post('/api/draft-config', config);
      console.log('Config updated:', res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // 🚫 guard: don’t accidentally reset an already-running draft
  const startDraft = async () => {
    try {
      const probe = await axios.get('/api/draft-state').catch(() => axios.get('/api/state'));
      if (probe?.data?.draftStarted) {
        console.log('Draft already started; not restarting.');
        return;
      }
    } catch { /* ignore and try start */ }
    try {
      const res = await axios.post('/api/start-draft');
      console.log('Draft started:', res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDraftPick = async (playerId) => {
    try {
      const res = await axios.post('/api/draft-pick', { playerId });
      console.log('Draft pick recorded:', res.data);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || 'Error making draft pick');
    }
  };

  // 💾 hydrate UI from server on reload (fixes the “refresh wipes UI”)
  const applyState = (data = {}) => {
    const dc = data.draftConfig || {};
    setActiveTeam(
      typeof data.activeTeam === 'number'
        ? data.activeTeam
        : typeof dc.activeTeam === 'number'
        ? dc.activeTeam
        : null
    );
    setAvailablePlayers(Array.isArray(data.availablePlayers) ? data.availablePlayers : []);
    // prefer top-level teamRosters; fall back to draftConfig.teamRosters if server packs it there
    const rosters = Array.isArray(data.teamRosters)
      ? data.teamRosters
      : Array.isArray(dc.teamRosters)
      ? dc.teamRosters
      : [];
    setTeamRosters(rosters);
    setCurrentDraft(Array.isArray(data.currentDraft) ? data.currentDraft : []);

    // sync config UI to server’s config so team names line up
    if (dc && (dc.numberOfTeams || dc.teamNames || dc.picksPerTeam || dc.draftType)) {
      const teamNamesCSV = Array.isArray(dc.teamNames)
        ? dc.teamNames.join(',')
        : (dc.teamNames || config.teamNames);
      setConfig((prev) => ({
        ...prev,
        numberOfTeams: dc.numberOfTeams ?? prev.numberOfTeams,
        teamNames: teamNamesCSV,
        picksPerTeam: dc.picksPerTeam ?? prev.picksPerTeam,
        draftType: dc.draftType ?? prev.draftType
      }));
    }
  };

  const fetchState = async () => {
    try {
      // hit /api/draft-state; if your server only has /api/state, we fall back
      const { data } = await axios.get('/api/draft-state').catch(() => axios.get('/api/state'));
      if (data) applyState(data);
    } catch (err) {
      console.warn('GET state failed (maybe not started yet):', err?.message);
    }
  };

  useEffect(() => {
    // 1) snapshot on mount (critical for reload)
    fetchState();

    // 2) live sockets
    socket.on('draftStarted', (data) => {
      console.log('Socket draftStarted:', data);
      applyState({
        ...data,
        // some servers embed teamRosters inside draftConfig on start
        teamRosters: data?.teamRosters || data?.draftConfig?.teamRosters || []
      });
    });

    socket.on('draftUpdate', (data) => {
      console.log('Socket draftUpdate:', data);
      applyState(data);
    });

    return () => {
      socket.off('draftStarted');
      socket.off('draftUpdate');
    };
  }, []);

  // Board columns from config (string of names)
  const teamNamesFromConfig = (config.teamNames || '')
    .split(',')
    .map(name => name.trim());

  const teamsForBoard = teamRosters.map((_, index) => ({
    id: index,
    name: teamNamesFromConfig[index] || `Team ${index + 1}`
  }));

  // rounds & picks from rosters
  const maxRounds = teamRosters.length > 0
    ? Math.max(...teamRosters.map(roster => roster.length))
    : 0;

  const roundsForBoard = Array.from({ length: maxRounds }, (_, i) => i + 1);

  const picksForBoard = roundsForBoard.map((_, roundIndex) => {
    const roundPicks = {};
    teamsForBoard.forEach((team) => {
      const roster = teamRosters[team.id];
      if (roster && roster[roundIndex]) {
        roundPicks[team.id] = roster[roundIndex];
      }
    });
    return roundPicks;
  });

  return (
    <div className="container">
      <header className="header">
        <h1>Manager Dashboard</h1>
      </header>

      <div className="section">
        <h3>Upload Player CSV</h3>
        <input type="file" accept=".csv" onChange={handleFileChange} />
        <button className="button" onClick={handleUpload} disabled={!file}>Upload CSV</button>
      </div>

      <div className="section">
        <h3>Draft Configuration</h3>
        <label>
          Number of Teams:
          <input type="number" name="numberOfTeams" value={config.numberOfTeams} onChange={handleConfigChange} />
        </label>
        <br />
        <label>
          Team Names (comma separated):
          <input type="text" name="teamNames" value={config.teamNames} onChange={handleConfigChange} />
        </label>
        <br />
        <label>
          Picks per Team:
          <input type="number" name="picksPerTeam" value={config.picksPerTeam} onChange={handleConfigChange} />
        </label>
        <br />
        <label>
          Draft Type:
          <select name="draftType" value={config.draftType} onChange={handleConfigChange}>
            <option value="traditional">Traditional</option>
            <option value="serpentine">Serpentine</option>
          </select>
        </label>
        <br />
        <button className="button" onClick={updateConfig}>Update Configuration</button>
      </div>

      <div className="section">
        <button className="button" onClick={startDraft}>Start Draft</button>
      </div>

      <div className="section">
        <h3>Draft Pick Process</h3>
        {activeTeam === null ? (
          <p>{availablePlayers.length === 0 ? "Draft complete" : "Draft not started or waiting..."}</p>
        ) : (
          <>
            <p>Active Team: Team {activeTeam + 1}</p>
            <h4>Available Players</h4>
            <div className="players-table-wrap">
              <table className="players-table">
                <colgroup>
                  <col style={{ width: 48 }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: 80 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Rookie</th>
                    <th>Package'd</th>
                    <th>Name</th>
                    <th>Pos</th>
                    <th>Skill</th>
                    <th>Ht</th>
                    <th>Shirt</th>
                    <th>Comparison</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {availablePlayers.map((p, i) => {
                    const obj = p.row || p;
                    const rookie = p.rookie || '';
                    const packaged = p.packaged || '';
                    const name  = displayName(p);
                    const pos   = obj.position || obj.fieldPosition || '';
                    const skill = obj.skill || obj.skillLevel || '';
                    const ht    = obj.height || '';
                    const shirt = obj.jersey || obj.jerseySize || '';
                    const comp  = obj.resemblance || '';
                    return (
                      <tr key={p.id || i}>
                        <td>{i + 1}</td>
                        <td>{rookie}</td>
                        <td>{packaged}</td>
                        <td><strong>{name}</strong></td>
                        <td>{pos}</td>
                        <td>{skill}</td>
                        <td>{ht}</td>
                        <td>{shirt}</td>
                        <td className="ellipsis" title={comp}>{comp}</td>
                        <td>
                          <button className="button button-xs" onClick={() => handleDraftPick(p.id)}>
                            Draft
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {Array.from({ length: Math.max(0, 14 - availablePlayers.length) }).map((_, idx) => (
                    <tr className="ghost-row" key={`ghost-${idx}`}>
                      <td colSpan={8}>&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h3>Draft Board</h3>
        <DraftBoard teams={teamsForBoard} rounds={roundsForBoard} picks={picksForBoard} />
      </div>

      <div className="section">
        <h3>Team Rosters</h3>
        {teamRosters.map((roster, teamIndex) => (
          <div key={teamIndex}>
            <h4>{teamNamesFromConfig[teamIndex] || `Team ${teamIndex + 1}`}</h4>
            {roster.length > 0 ? (
              <ul>
                {roster.map((player, index) => (
                  <li key={index}>{displayName(player)}</li>
                ))}
              </ul>
            ) : (
              <p>No players drafted yet.</p>
            )}
          </div>
        ))}
      </div>

      <div className="section">
        <h3>Draft Picks History</h3>
        <ul>
          {currentDraft.map((pick, index) => {
            const teamIdx = pick.team ?? pick.teamId ?? pick.teamIndex ?? null;
            const playerObj = pick.player ?? pick.pick ?? pick.draftPick ?? pick;
            const teamName = teamIdx != null
              ? (teamNamesFromConfig[teamIdx] || `Team ${teamIdx + 1}`)
              : 'Team ?';
            return (
              <li key={index}>
                {teamName} picked {displayName(playerObj)}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default ManagerDashboard;
