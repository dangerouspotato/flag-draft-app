import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import DraftBoard from './DraftBoard';

// Connect to same-origin; allow fallback if WS blocked
const socket = io();

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

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
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

  const startDraft = async () => {
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
      alert(err.response.data.message || 'Error making draft pick');
    }
  };

  useEffect(() => {
    socket.on('draftStarted', (data) => {
      console.log('Socket draftStarted:', data);
      setActiveTeam(data.draftConfig.activeTeam);
      setAvailablePlayers(data.availablePlayers);
      setTeamRosters(data.draftConfig.teamRosters);
      setCurrentDraft([]);
    });

    socket.on('draftUpdate', (data) => {
      console.log('Socket draftUpdate:', data);
      setActiveTeam(data.activeTeam);
      setAvailablePlayers(data.availablePlayers);
      setTeamRosters(data.teamRosters);
      setCurrentDraft(data.currentDraft);
    });

    return () => {
      socket.off('draftStarted');
      socket.off('draftUpdate');
    };
  }, []);

  // Compute team names from config and create the board columns accordingly
  const teamNamesFromConfig = config.teamNames.split(',').map(name => name.trim());
  const teamsForBoard = teamRosters.map((_, index) => ({
    id: index,
    name: teamNamesFromConfig[index] || `Team ${index + 1}`
  }));

  // Compute the number of rounds and draft board picks based on team rosters
  const maxRounds = teamRosters.length > 0 ? Math.max(...teamRosters.map(roster => roster.length)) : 0;
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
        <button className="button" onClick={handleUpload}>Upload CSV</button>
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
                  {/* fixed column widths so nothing jiggles when content changes */}
                  <colgroup>
                    <col style={{ width: 48 }} />     {/* # */}
                    <col style={{ width: '28%' }} />  {/* Name */}
                    <col style={{ width: '10%' }} />  {/* Pos */}
                    <col style={{ width: '14%' }} />  {/* Skill */}
                    <col style={{ width: '8%' }} />   {/* Ht */}
                    <col style={{ width: '10%' }} />  {/* Shirt */}
                    <col style={{ width: '20%' }} />  {/* Comparison */}
                    <col style={{ width: 80 }} />     {/* Action */}
                  </colgroup>

                  <thead>
                    <tr>
                      <th>#</th>
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
                      const name =
                        (p.name && p.name.trim()) ||
                        [p.firstName, p.lastName].filter(Boolean).join(' ') ||
                        p['First & Last Name'] ||
                        [p['First Name'], p['Last Name']].filter(Boolean).join(' ');

                      const pos   = p.position || p.fieldPosition || '';
                      const skill = p.skill || p.skillLevel || '';
                      const ht    = p.height || '';
                      const shirt = p.jersey || p.jerseySize || '';
                      const comp  = p.resemblance || '';

                      return (
                        <tr key={p.id || i}>
                          <td>{i + 1}</td>
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

                    {/* --- ghost rows to keep height rock solid (optional but nice) --- */}
                    {Array.from({
                      length: Math.max(0, 14 - availablePlayers.length) // target 14 rows visible
                    }).map((_, idx) => (
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
                  <li key={index}>
                    {player["name"]}
                  </li>
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
          {currentDraft.map((pick, index) => (
            <li key={index}>
              {teamNamesFromConfig[pick.team] || `Team ${pick.team + 1}`} picked {pick.player['name']} 
            </li>
          ))}
        </ul>
      </div>
{/* 
      <div className="section">
        <h3>Draft Board</h3>
        <DraftBoard teams={teamsForBoard} rounds={roundsForBoard} picks={picksForBoard} />
      </div> */}
    </div>
  );
}

export default ManagerDashboard;




