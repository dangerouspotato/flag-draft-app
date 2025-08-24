// CaptainDashboard.js — read-only manager view for team captains
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import DraftBoard from './DraftBoard';

const socket = io();

// robust name helper (works with flat or nested {row:{...}})
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

// grab the first non-empty value from a list of possible keys
const pickField = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

// normalize one player into the fields captains need
const playerInfo = (p) => {
  const o = (p && (p.row || p)) || {};
  return {
    name: displayName(p),
    position: pickField(o, [
      'position',
      'fieldPosition',
      'Which field position would you like to play?',
      'Position'
    ]),
    skill: pickField(o, [
      'skill',
      'skillLevel',
      'Skill Level - Level of play that honestly defines your current ability (used for Team Draft)',
      'Skill'
    ]),
    height: pickField(o, [
      'height',
      'Height (used for Team Draft)',
      'Ht'
    ]),
    phone: pickField(o, [
      'phone',
      'phoneNumber',
      'Phone number',
      'Phone Number',
      'Phone'
    ]),
  };
};

export default function CaptainDashboard() {
  // keep a local config mirror so team names render right
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

  // --- state hydration (reload safe) ---
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

    const rosters = Array.isArray(data.teamRosters)
      ? data.teamRosters
      : Array.isArray(dc.teamRosters)
      ? dc.teamRosters
      : [];
    setTeamRosters(rosters);

    setCurrentDraft(Array.isArray(data.currentDraft) ? data.currentDraft : []);

    // sync local config so team names/columns match server
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
      const { data } = await axios.get('/api/draft-state').catch(() => axios.get('/api/state'));
      if (data) applyState(data);
    } catch (err) {
      console.warn('[captain] GET state failed (maybe not started yet):', err?.message);
    }
  };

  useEffect(() => {
    fetchState();
    socket.on('draftStarted', (data) => {
      applyState({
        ...data,
        teamRosters: data?.teamRosters || data?.draftConfig?.teamRosters || []
      });
    });
    socket.on('draftUpdate', (data) => applyState(data));
    return () => {
      socket.off('draftStarted');
      socket.off('draftUpdate');
    };
  }, []);

  // --- board model (matches manager) ---
  const teamNamesFromConfig = (config.teamNames || '')
    .split(',')
    .map(name => name.trim());

  const teamsForBoard = teamRosters.map((_, index) => ({
    id: index,
    name: teamNamesFromConfig[index] || `Team ${index + 1}`
  }));

  const maxRounds = teamRosters.length > 0
    ? Math.max(...teamRosters.map(roster => roster.length))
    : 0;

  // labels: first 2 rows = Captains, then 1,2,3...
  const roundLabels = Array.from({ length: maxRounds }, (_, i) =>
    i < 2 ? 'Captains' : String(i - 1)
  );

  const picksForBoard = Array.from({ length: maxRounds }, (_, roundIndex) => {
    const roundPicks = {};
    teamsForBoard.forEach((team) => {
      const roster = teamRosters[team.id];
      if (roster && roster[roundIndex]) {
        roundPicks[team.id] = roster[roundIndex];
      }
    });
    return roundPicks;
  });

    // ---------- TXT export helpers ----------
  const formatRosterText = (teamIdx) => {
    const teamName = teamNamesFromConfig[teamIdx] || `Team ${teamIdx + 1}`;
    const roster = teamRosters?.[teamIdx] || [];
    const header = [
      `${teamName} — Player Contact Sheet`,
      `Generated: ${new Date().toLocaleString()}`,
      ''
    ];
    const lines = roster.map((p, i) => {
      const info = playerInfo(p);
      return `${i + 1}. ${info.name}\n   Pos: ${info.position || '-'} | Skill: ${info.skill || '-'} | Ht: ${info.height || '-'} | Phone: ${info.phone || '-'}`;
    });
    return [...header, ...lines, ''].join('\n');
  };

  const downloadRosterTXT = (teamIdx) => {
    const txt = formatRosterText(teamIdx);
    const teamSafe = (teamNamesFromConfig[teamIdx] || `Team_${teamIdx + 1}`).replace(/[^\w\-]+/g, '_');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${teamSafe}_Roster.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  };
  // ---------------------------------------


  return (
    <div className="container">
      <header className="header">
        <h1>Captain Dashboard</h1>
      </header>

      <div className="section">
        <h3>Draft Status</h3>
        {activeTeam === null ? (
          <p>{availablePlayers.length === 0 ? "Draft complete" : "Draft not started or waiting..."}</p>
        ) : (
          <p>Active Team: Team {activeTeam + 1}</p>
        )}
      </div>

      <div className="section">
        <h3>Available Players</h3>
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
                  </tr>
                );
              })}
              {Array.from({ length: Math.max(0, 14 - availablePlayers.length) }).map((_, idx) => (
                <tr className="ghost-row" key={`ghost-${idx}`}>
                  <td colSpan={7}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h3>Draft Board</h3>
        <DraftBoard teams={teamsForBoard} rounds={roundLabels} picks={picksForBoard} />
      </div>

            <div className="section">
        <h3>Team Rosters</h3>
          {teamRosters.map((roster, teamIndex) => {
            const teamName = teamNamesFromConfig[teamIndex] || `Team ${teamIndex + 1}`;
            const canDownload = (roster?.length || 0) > 0;
            return (
              <div key={teamIndex}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                  <span>{teamName}</span>
                  <button
                    className="button button-xs"
                    disabled={!canDownload}
                    onClick={() => downloadRosterTXT(teamIndex, teamNamesFromConfig, teamRosters)}
                    title={canDownload ? 'Download this team as TXT' : 'No players yet'}
                  >
                    Download TXT
                  </button>
                </h4>
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
            );
          })}
      </div>

      {/* <div className="section">
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
      </div> */}
    </div>
  );
}
