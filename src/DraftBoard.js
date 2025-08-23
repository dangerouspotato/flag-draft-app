import React from 'react';
import './DraftBoard.css';

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
              {teams.map((team) => (
                <td key={team.id}>
                  {picks[index] && picks[index][team.id]
                    ? `${picks[index][team.id]['name']}`
                    : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DraftBoard;

