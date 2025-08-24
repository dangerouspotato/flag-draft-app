// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {cors: {origin:true, credentials: true}});

const DATA_DIR = path.join(__dirname, 'data');
const SNAPSHOT = path.join(DATA_DIR, 'state.json');
const EVENTS   = path.join(DATA_DIR, 'events.jsonl');

//Functions needed for keeping state between server boots//
/*--------------------------------------------------------*/
function ensureStore() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch {}
}

function saveSnapshot(where = 'auto') {
  ensureStore();
  const payload = { players, draftConfig };
  fs.writeFileSync(SNAPSHOT, JSON.stringify(payload, null, 2), 'utf8');
  try {
    fs.appendFileSync(EVENTS, JSON.stringify({ ts: Date.now(), type: 'snapshot', where }) + '\n');
  } catch {}
}

function loadSnapshotIfAny() {
  try {
    if (!fs.existsSync(SNAPSHOT)) return false;
    const { players: p = [], draftConfig: dc = {} } =
      JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8') || '{}');
    players = Array.isArray(p) ? p : [];
    // keep any new fields from current code but overlay saved ones
    draftConfig = { ...draftConfig, ...dc };
    return true;
  } catch (e) {
    console.warn('[persist] failed to load snapshot:', e?.message);
    return false;
  }
}

// serpentine math replayer — gives you the turn-state after N picks
function serpAfter(picksCount, teamCount) {
  let activeTeam = 0;
  let orderDirection = 1; // 1 asc, -1 desc
  let currentRound = 1;
  let extraPickGiven = false;
  for (let i = 0; i < picksCount; i++) {
    if (orderDirection === 1) {
      if (activeTeam < teamCount - 1) {
        activeTeam++;
      } else {
        if (!extraPickGiven) {
          extraPickGiven = true;
        } else {
          orderDirection = -1;
          extraPickGiven = false;
          activeTeam--;
          currentRound++;
        }
      }
    } else {
      if (activeTeam > 0) {
        activeTeam--;
      } else {
        if (!extraPickGiven) {
          extraPickGiven = true;
        } else {
          orderDirection = 1;
          extraPickGiven = false;
          activeTeam++;
          currentRound++;
        }
      }
    }
  }
  return { activeTeam, orderDirection, currentRound, extraPickGiven };
}
/*----------------------------------------------------------------------*/

// Middleware for JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const session = require('express-session');
const isProd = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1); // needed when behind render/Railway/etc
app.use(session({
  secret: process.env.SESSION_SOCKET || 'dev-change-me', // change this to a secure key in production
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: 'none',
    secure: false,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd
  }
}));

const cors = require('cors');
// app.use(cors({
//   origin: 'http://localhost:3001',  // React dev server
//   credentials:true
// }));
// When the frontend is served by this same server, CORS isn't needed
app.use(cors({origin: true, credentials: true}))

// Set up multer for CSV uploads
const upload = multer({ dest: 'uploads/' });

// In-memory storage for demo purposes
//let players = [];
// let draftConfig = {
//   numberOfTeams: 4,
//   teamNames: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
//   picksPerTeam: 5,
//   draftType: 'traditional', // or 'serpentine'
//   currentDraft: []
// };
// replace your current draftConfig init with this:
const defaultDraftConfig = {
  numberOfTeams: 4,
  teamNames: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
  picksPerTeam: 5,
  draftType: 'traditional', // or 'serpentine'
  currentDraft: [],
  hasStarted: false,
  activeTeam: null,
  teamRosters: [],
  availablePlayers: []
};
let players = [];
let draftConfig = { ...defaultDraftConfig };

// try to restore from disk
loadSnapshotIfAny();



// Endpoint to fetch the current draft state
app.get('/api/draft-state', (req, res) => {
  // If the draft has not been started, return a message.
  if (!draftConfig.hasStarted) {
    return res.json({
      draftStarted: false,
      message: "Draft has not started yet."
    });
  }
  // Return the draft state even if activeTeam is null (e.g., when draft is complete)
  res.json({
    draftStarted: true,
    draftConfig,
    availablePlayers: draftConfig.availablePlayers,
    teamRosters: draftConfig.teamRosters,
    currentDraft: draftConfig.currentDraft,
    activeTeam: draftConfig.activeTeam
  });
});




// Endpoint to login into manager draft
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'manager' && password === 'test123') {
    req.session.user = { username };
    return res.json({ message: 'Logged in' });
  }
  res.status(401).json({ message: 'Invalid credentials' });
});

// Endpoint to upload CSV
// server.js
app.post('/api/upload-csv', upload.single('file'), (req, res) => {
  const filePath = req.file.path;
  const rows = [];

  // === helpers ============================================================
  const headerClean = (h) =>
    String(h || '')
      .replace(/\s+/g, ' ')                // collapse whitespace/newlines
      .replace(/[\u2018\u2019\u201C\u201D]/g, "'")  // curly → straight quotes
      .replace(/^"|"$/g, '')
      .trim();

  const canon = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ') // strip emoji/punct
      .replace(/\s+/g, ' ')
      .trim();

  const EXACT = {
    NAME: "First & Last Name",
    PHONE: "Phone number",
    JERSEY: "Jersey size (sleeveless t-shirt)",
    HEIGHT: "Height (used for Team Draft)",
    RESEMBLANCE:
      "If you are new to the league, list the name of a pro or college player you are most similar to? Comparing your playing style more than skill level  (used for Team Draft)",
    SKILL: "Skill Level - Level of play that honestly defines your current ability (used for Team Draft)",
    POSITION: "Which field position would you like to play?",
    PACKAGE: "Package'd",
    CAPTAIN: "Captain",
    ROOKIE: "Rookie"
  };

  const TOKENS = {
    name: ['first', 'last', 'name'],
    phone: ['phone', 'number'],
    jersey: ['jersey', 'size'],
    height: ['height'],
    resemblance: ['pro', 'college', 'similar'],
    skill: ['skill', 'level'],
    position: ['field', 'position'],
    packaged: ['package'],
    captain: ['captain'],
    rookie: ['rookie']
  };

  const findHeader = (headers, exactText, tokens) => {
    const byExact = headers.find(h => headerClean(h) === exactText);
    if (byExact) return byExact;
    return (
      headers.find(h => {
        const ch = canon(headerClean(h));
        return tokens.every(t => ch.includes(canon(t)));
      }) || null
    );
  };

  // === parse ==============================================================
  const parser = csv({ mapHeaders: ({ header }) => headerClean(header) });

  // parser.on('headers', (headers) => {
  //   console.log('[CSV] Cleaned headers:', headers);
  // });

  fs.createReadStream(filePath)
    .pipe(parser)
    .on('data', (row) => rows.push(row))
    .on('end', () => {
      const now = Date.now();
      const headers = rows[0] ? Object.keys(rows[0]) : [];

      const key = {
        name:      findHeader(headers, EXACT.NAME, TOKENS.name),
        phone:     findHeader(headers, EXACT.PHONE, TOKENS.phone),
        jersey:    findHeader(headers, EXACT.JERSEY, TOKENS.jersey),
        height:    findHeader(headers, EXACT.HEIGHT, TOKENS.height),
        resemble:  findHeader(headers, EXACT.RESEMBLANCE, TOKENS.resemblance),
        skill:     findHeader(headers, EXACT.SKILL, TOKENS.skill),
        position:  findHeader(headers, EXACT.POSITION, TOKENS.position),
        packaged:  findHeader(headers, EXACT.PACKAGE, TOKENS.packaged),
        captain:   findHeader(headers, EXACT.CAPTAIN, TOKENS.captain),
        rookie: findHeader(headers, EXACT.ROOKIE, TOKENS.rookie)
      };

      // console.log('[CSV] Header mapping (cleaned→picked):', key);

      const summary = [];

      players = rows.map((r, i) => {
        const nameRaw = key.name ? String(r[key.name] || '').trim() : '';
        let firstName = '', lastName = '', name = nameRaw;
        if (nameRaw) {
          const parts = nameRaw.split(/\s+/);
          lastName = parts.pop() || '';
          firstName = parts.join(' ');
        }

        const phoneNumber = key.phone ? String(r[key.phone] || '').trim() : '';
        const jerseySize  = key.jersey ? String(r[key.jersey] || '').trim() : '';
        const height      = key.height ? String(r[key.height] || '').trim() : '';
        const resemblance = key.resemble ? String(r[key.resemble] || '').trim() : '';
        const skillLevel  = key.skill ? String(r[key.skill] || '').trim() : '';
        const fieldPosition = key.position ? String(r[key.position] || '').trim() : '';
        const packaged    = key.packaged ? String(r[key.packaged] || '').trim() : '';
        const captainInterest = key.captain ? String(r[key.captain] || '').trim() : '';
        const rookie = key.rookie ? String(r[key.rookie] || '').trim():'';

        // per-row debug: which header fed which value
        // console.log('[CSV] Row match', {
        //   row: i,
        //   headersUsed: {
        //     name: key.name,
        //     phone: key.phone,
        //     jersey: key.jersey,
        //     height: key.height,
        //     resemblance: key.resemble,
        //     skill: key.skill,
        //     position: key.position,
        //     packaged: key.packaged,
        //     captain: key.captain,
        //     rookie: key.rookie
        //   },
        //   valuesPulled: {
        //     nameRaw,
        //     phoneNumber,
        //     jerseySize,
        //     height,
        //     resemblance,
        //     skillLevel,
        //     fieldPosition,
        //     packaged,
        //     captainInterest,
        //     rookie,
        //   },
        // });

        summary.push({
          row: i,
          name: name || `${firstName} ${lastName}`.trim(),
          pos: fieldPosition,
          ht: height,
          shirt: jerseySize,
          comp: resemblance,
          skill: skillLevel,
          phone: phoneNumber,
          captain: captainInterest,
          rookie: rookie
        });

        return {
          id: `${now}-${i}`,
          name, firstName, lastName,
          phoneNumber,
          jerseySize,
          height,
          resemblance,
          skillLevel,
          fieldPosition,
          packaged,
          captainInterest,
          rookie,
          ...r, // keep original columns
        };
      });

      // // nice compact overview table (first 50 rows)
      // console.log('[CSV] Summary table (first 50 rows):');
      // try { console.table(summary.slice(0, 50)); } catch {}

      try { fs.unlinkSync(filePath); } catch {}
      saveSnapshot('upload-csv');
      return res.json({ message: 'CSV processed successfully', players });
    })
    .on('error', (err) => {
      try { fs.unlinkSync(filePath); } catch {}
      console.error('[CSV] parse error:', err);
      res.status(400).json({ error: 'CSV parse failed', details: String(err) });
    });
});


// Endpoint to update draft configuration
app.post('/api/draft-config', (req, res) => {
  // const { numberOfTeams, teamNames, picksPerTeam, draftType } = req.body;
  // draftConfig = { ...draftConfig, numberOfTeams, teamNames, picksPerTeam, draftType };
  let { numberOfTeams, teamNames, picksPerTeam, draftType } = req.body;
  numberOfTeams = parseInt(numberOfTeams, 10);
  picksPerTeam = parseInt(picksPerTeam, 10);
  // Accept either array or comma-separated string
  if (typeof teamNames === 'string') {
    teamNames = teamNames.split(',').map(s => s.trim()).filter(Boolean);
  }
  draftConfig = { ...draftConfig, numberOfTeams, teamNames, picksPerTeam, draftType };
  saveSnapshot('draft-config');
  res.json({ message: 'Draft configuration updated', draftConfig });
});

// Endpoint to start the draft
app.post('/api/start-draft', (req, res) => {
  // Reset previous picks and initialize new draft state
  draftConfig.currentDraft = [];
  draftConfig.activeTeam = 0;
  // Initialize an empty roster for each team
  draftConfig.teamRosters = Array(parseInt(draftConfig.numberOfTeams, 10))
    .fill(null)
    .map(() => []);
  // Set available players to a copy of all uploaded players
  draftConfig.availablePlayers = players.slice();

  // Mark that the draft has started
  draftConfig.hasStarted = true;
  draftConfig.undoStack = [];
  // Initialize serpentine draft-specific properties if needed
  if (draftConfig.draftType === 'serpentine') {
    draftConfig.orderDirection = 1; // 1 for ascending, -1 for descending
    draftConfig.currentRound = 1;
    draftConfig.extraPickGiven = false;
  }

  // Broadcast the draft start along with initial state
  io.emit('draftStarted', { draftConfig, availablePlayers: draftConfig.availablePlayers });
  saveSnapshot('start-draft');
  res.json({ message: 'Draft started', draftConfig });
});



// Endpoint for making a draft pick
app.post('/api/draft-pick', (req, res) => {
  const { playerId } = req.body;

  // Check if there are any available players left
  if (draftConfig.availablePlayers.length === 0) {
    return res.status(400).json({ message: 'No available players to draft' });
  }

  // Find the player in the available players list
  // const playerIndex = draftConfig.availablePlayers.findIndex((p) => p.id === playerId);
  const playerIndex = draftConfig.availablePlayers.findIndex((p) => String(p.id) === String(playerId));
  if (playerIndex === -1) {
    return res.status(404).json({ message: 'Player not found or already taken' });
  }

  // -- snapshot pre-pick for undo --
  if (!draftConfig.undoStack) draftConfig.undoStack = [];
  draftConfig.undoStack.push({
    activeTeam: draftConfig.activeTeam,
    orderDirection: draftConfig.orderDirection ?? 1,
    extraPickGiven: !!draftConfig.extraPickGiven,
    currentRound: draftConfig.currentRound ?? 1
  });

  // Remove the player from the available list
  const player = draftConfig.availablePlayers.splice(playerIndex, 1)[0];

  // Record the pick for the current active team
  const currentTeam = draftConfig.activeTeam;
  draftConfig.currentDraft.push({ team: currentTeam, player });
  draftConfig.teamRosters[currentTeam].push(player);

  // Update active team based on draft type
  if (draftConfig.availablePlayers.length > 0) {
    if (draftConfig.draftType === 'serpentine') {
      // Ensure extraPickGiven flag is initialized
      if (typeof draftConfig.extraPickGiven === 'undefined') {
        draftConfig.extraPickGiven = false;
      }
      if (draftConfig.orderDirection === 1) { // ascending order
        if (draftConfig.activeTeam < draftConfig.numberOfTeams - 1) {
          // Normal ascending move
          draftConfig.activeTeam++;
        } else { // at the last team (e.g., team 4)
          if (!draftConfig.extraPickGiven) {
            // Give extra pick: stay on last team and mark flag true
            draftConfig.extraPickGiven = true;
          } else {
            // After extra pick, reverse direction and update team
            draftConfig.orderDirection = -1;
            draftConfig.extraPickGiven = false;
            draftConfig.activeTeam--;
            draftConfig.currentRound = (draftConfig.currentRound || 1) + 1;
          }
        }
      } else { // descending order
        if (draftConfig.activeTeam > 0) {
          // Normal descending move
          draftConfig.activeTeam--;
        } else { // at the first team (e.g., team 1)
          if (!draftConfig.extraPickGiven) {
            // Give extra pick: stay on first team and mark flag true
            draftConfig.extraPickGiven = true;
          } else {
            // After extra pick, reverse direction and update team
            draftConfig.orderDirection = 1;
            draftConfig.extraPickGiven = false;
            draftConfig.activeTeam++;
            draftConfig.currentRound = (draftConfig.currentRound || 1) + 1;
          }
        }
      }
    } else {
      // Traditional round-robin order
      //draftConfig.activeTeam = (draftConfig.activeTeam + 1) % draftConfig.numberOfTeams;
      draftConfig.activeTeam = (draftConfig.activeTeam + 1) % parseInt(draftConfig.numberOfTeams, 10);
    }
  } else {
    draftConfig.activeTeam = null; // Draft complete
  }

  // Broadcast the updated draft state
  io.emit('draftUpdate', {
    activeTeam: draftConfig.activeTeam,
    availablePlayers: draftConfig.availablePlayers,
    teamRosters: draftConfig.teamRosters,
    currentDraft: draftConfig.currentDraft,
    orderDirection: draftConfig.orderDirection,
    currentRound: draftConfig.currentRound,
  });
  saveSnapshot('draft-pick');
  res.json({ message: 'Draft pick recorded', team: currentTeam, player });
});


// Undo last N picks (default 1). Each press = undo 1.
app.post('/api/undo-pick', (req, res) => {
  const count = Math.max(1, parseInt(req.body?.count || 1, 10));
  let undone = 0;

  for (let i = 0; i < count; i++) {
    if (!draftConfig.currentDraft?.length) break;
    if (!draftConfig.undoStack?.length) break;

    const lastPick = draftConfig.currentDraft.pop();       // { team, player }
    const snap = draftConfig.undoStack.pop() || {};

    // remove the pick from that team’s roster (last entry)
    const teamIdx = Number(lastPick.team);
    const r = draftConfig.teamRosters?.[teamIdx];
    if (Array.isArray(r) && r.length) r.pop();

    // put player back to available (front so it’s easy to find)
    if (lastPick.player) {
      draftConfig.availablePlayers = [lastPick.player, ...(draftConfig.availablePlayers || [])];
    }

    // restore pre-pick serp/trad position
    draftConfig.activeTeam = snap.activeTeam ?? draftConfig.activeTeam ?? 0;
    draftConfig.orderDirection = snap.orderDirection ?? draftConfig.orderDirection ?? 1;
    draftConfig.extraPickGiven = !!(snap.extraPickGiven ?? draftConfig.extraPickGiven);
    draftConfig.currentRound = snap.currentRound ?? draftConfig.currentRound ?? 1;

    undone++;
  }

  const payload = {
    activeTeam: draftConfig.activeTeam,
    availablePlayers: draftConfig.availablePlayers,
    teamRosters: draftConfig.teamRosters,
    currentDraft: draftConfig.currentDraft,
    orderDirection: draftConfig.orderDirection,
    currentRound: draftConfig.currentRound,
    draftConfig
  };

  io.emit('draftUpdate', payload);
  return res.json({ message: `Undid ${undone} pick(s)`, ...payload });
});

// Reset the entire draft to pre-start (config + players stay loaded)
app.post('/api/reset-draft', (_req, res) => {
  draftConfig.currentDraft = [];
  draftConfig.teamRosters = [];
  draftConfig.availablePlayers = (players || []).slice(); // all players back
  draftConfig.activeTeam = null;   // nothing active until start
  draftConfig.hasStarted = false;  // draft not started
  draftConfig.orderDirection = 1;
  draftConfig.currentRound = 1;
  draftConfig.extraPickGiven = false;
  draftConfig.undoStack = [];

  const payload = {
    activeTeam: draftConfig.activeTeam,
    availablePlayers: draftConfig.availablePlayers,
    teamRosters: draftConfig.teamRosters,
    currentDraft: draftConfig.currentDraft,
    orderDirection: draftConfig.orderDirection,
    currentRound: draftConfig.currentRound,
    draftConfig
  };

  // broadcast so captain/spectators snap back instantly
  io.emit('draftUpdate', payload);
  return res.json({ message: 'Draft reset to pre-start.', ...payload });
});


// Serve static files (if you build your React app into a "public" folder)
//app.use(express.static(path.join(__dirname, 'public')));

// Serve the React build (single-domain deploy FTW)
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
