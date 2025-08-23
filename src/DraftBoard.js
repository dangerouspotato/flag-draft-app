// DraftBoard.js
import React from 'react';
import './DraftBoard.css';

// works with either shape: { id, row: {...} } OR flat {...}
const getName = (player) => {
  if (!player) return '';
  const p = player.row ? player.row : player; // support nested 'row' from upload-csv
  const name =
    (p.name && String(p.name).trim()) ||
    [p.firstName, p.lastName].filter(Boolean).join(' ') ||
    p['First & Last Name'] ||
    [p['First Name'], p['Last Name']].filter(Boolean).join(' ');
  return name || '';
};

const DraftBoard = ({ teams, rounds, picks }) => {
  return (
    <div className="draft-board">
      <table>
        <thead>
          <tr>
            <th>Round</th>
            {teams.map((team) => (
              <th key={team.id}>{team.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, index) => (
            <tr key={round}>
              <td>{round}</td>
              {teams.map((team) => {
                const roundMap = picks[index] || {};
                // support numeric or string team keys
                const pick = roundMap[team.id] ?? roundMap[String(team.id)] ?? null;
                console.log(getName(pick));
                return <td key={team.id}>{getName(pick)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DraftBoard;


