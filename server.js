const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.static('public'));
app.use('/images', express.static('images'));
app.use(express.json());

// User system
const usersFile = 'users.json';
let users = {};

// Load users from file
try {
    if (fs.existsSync(usersFile)) {
        users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    }
} catch (error) {
    console.log('Creating new users file...');
    users = {};
}

// Save users to file
function saveUsers() {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Failed to save users to file:', error);
        throw error; // Re-throw so calling code can handle it
    }
}

// Validate username
function isValidUsername(username) {
    if (!username || username.length < 3) return false;
    if (!/^[a-zA-Z0-9]+$/.test(username)) return false;
    
    const badWords = ['admin', 'fuck', 'shit', 'idiot', 'stupid', 'dumb', 'noob', 'nazi', 'hitler'];
    const lowerName = username.toLowerCase();
    return !badWords.some(word => lowerName.includes(word));
}

// Game state
const matches = new Map(); // matchId -> match object
const socketToMatch = new Map(); // socketId -> matchId
const socketToPlayer = new Map(); // socketId -> player object
const loggedInUsers = new Map(); // socketId -> username
const usersInGame = new Map(); // username -> matchId (prevents multiple sessions)
const activeSessions = new Map(); // username -> socketId (prevents multiple logins)

// API Routes
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!isValidUsername(username)) {
        return res.json({ success: false, message: 'Ungültiger Benutzername. Mindestens 3 Zeichen, nur Buchstaben und Zahlen, keine Beleidigungen.' });
    }
    
    if (!password || password.length < 3) {
        return res.json({ success: false, message: 'Passwort muss mindestens 3 Zeichen lang sein.' });
    }
    
    const lowerUsername = username.toLowerCase();
    if (users[lowerUsername]) {
        return res.json({ success: false, message: 'Benutzername bereits vergeben.' });
    }
    
    users[lowerUsername] = {
        username: username, // Original case
        password: password,
        stats: {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            imposterWins: 0,
            wordsGuessedAsImposter: 0,
            totalVotesReceived: 0,
            correctVotes: 0,
            createdAt: new Date().toISOString()
        }
    };
    
    try {
        saveUsers();
        res.json({ success: true, message: 'Registrierung erfolgreich!' });
    } catch (error) {
        console.error('Error saving users:', error);
        // Remove the user from memory if saving failed
        delete users[lowerUsername];
        res.json({ success: false, message: 'Fehler beim Speichern. Versuche es erneut.' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const lowerUsername = username.toLowerCase();
    
    if (!users[lowerUsername]) {
        return res.json({ success: false, message: 'Benutzer nicht gefunden.' });
    }
    
    if (users[lowerUsername].password !== password) {
        return res.json({ success: false, message: 'Falsches Passwort.' });
    }
    
    res.json({ 
        success: true, 
        message: 'Login erfolgreich!',
        user: {
            username: users[lowerUsername].username,
            stats: users[lowerUsername].stats
        }
    });
});

app.get('/api/stats/:username', (req, res) => {
    const lowerUsername = req.params.username.toLowerCase();
    
    if (!users[lowerUsername]) {
        return res.json({ success: false, message: 'Benutzer nicht gefunden.' });
    }
    
    res.json({ 
        success: true, 
        stats: users[lowerUsername].stats,
        username: users[lowerUsername].username
    });
});

// Client-side routing support - MUST be before Socket.IO events
app.get('/match/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Word pool for the game with hints for imposter
const wordPool = [
    { word: 'Pizza', hint: 'Triangel' },
    { word: 'Katze', hint: 'Schnurren' },
    { word: 'Auto', hint: 'Benzin' },
    { word: 'Baum', hint: 'Ringe' },
    { word: 'Strand', hint: 'Muscheln' },
    { word: 'Buch', hint: 'Eselsohren' },
    { word: 'Kaffee', hint: 'Bohnen' },
    { word: 'Musik', hint: 'Noten' },
    { word: 'Schule', hint: 'Pausenhof' },
    { word: 'Computer', hint: 'Binär' },
    { word: 'Telefon', hint: 'Klingelton' },
    { word: 'Sonne', hint: 'Vitamin' },
    { word: 'Regen', hint: 'Tropfen' },
    { word: 'Haus', hint: 'Dachziegel' },
    { word: 'Garten', hint: 'Gnome' },
    { word: 'Film', hint: 'Frames' },
    { word: 'Sport', hint: 'Fairplay' },
    { word: 'Urlaub', hint: 'Souvenirs' },
    { word: 'Familie', hint: 'Stammbaum' },
    { word: 'Freunde', hint: 'Vertrauen' },
    { word: 'Arbeit', hint: 'Feierabend' },
    { word: 'Spiel', hint: 'Regeln' },
    { word: 'Essen', hint: 'Tischmanieren' },
    { word: 'Trinken', hint: 'Durst' },
    { word: 'Schlaf', hint: 'Traumfänger' },
    { word: 'Zeit', hint: 'Ticktack' },
    { word: 'Geld', hint: 'Papier' },
    { word: 'Liebe', hint: 'Pfeil' },
    { word: 'Glück', hint: 'Kleeblatt' },
    { word: 'Traum', hint: 'Sandmann' },
    { word: 'Farbe', hint: 'Regenbogen' },
    { word: 'Licht', hint: 'Geschwindigkeit' },
    { word: 'Dunkel', hint: 'Mondschein' },
    { word: 'Warm', hint: 'Kuschelzeit' },
    { word: 'Kalt', hint: 'Atem' },
    { word: 'Groß', hint: 'Perspektive' },
    { word: 'Klein', hint: 'Ameisen' },
    { word: 'Schnell', hint: 'Zeitreise' },
    { word: 'Langsam', hint: 'Zeitlupe' },
    { word: 'Hoch', hint: 'Bergspitze' },
    { word: 'Tief', hint: 'Meeresgrund' },
    { word: 'Neu', hint: 'Erstausgabe' },
    { word: 'Alt', hint: 'Antiquität' },
    { word: 'Gut', hint: 'Daumen' },
    { word: 'Schlecht', hint: 'Buhrufe' },
    { word: 'Fenster', hint: 'Glas' },
    { word: 'Tür', hint: 'Klinke' },
    { word: 'Stuhl', hint: 'Beine' },
    { word: 'Tisch', hint: 'Tischdecke' },
    { word: 'Bett', hint: 'Kopfkissen' },
    { word: 'Küche', hint: 'Geruch' },
    { word: 'Bad', hint: 'Dampf' },
    { word: 'Wasser', hint: 'H2O' },
    { word: 'Feuer', hint: 'Prometheus' },
    { word: 'Luft', hint: 'Sauerstoff' },
    { word: 'Erde', hint: 'Blau' },
    { word: 'Himmel', hint: 'Wolkenkratzer' },
    { word: 'Stern', hint: 'Lichtjahre' },
    { word: 'Mond', hint: 'Armstrong' },
    { word: 'Blume', hint: 'Bienen' },
    { word: 'Gras', hint: 'Sprenger' },
    { word: 'Vogel', hint: 'Federleicht' },
    { word: 'Fisch', hint: 'Blubbern' },
    { word: 'Hund', hint: 'Freund' },
    { word: 'Maus', hint: 'Computer' },
    { word: 'Pferd', hint: 'Troja' },
    { word: 'Kuh', hint: 'Milchstraße' },
    { word: 'Schwein', hint: 'Spardose' },
    { word: 'Huhn', hint: 'Ei' },
    { word: 'Apfel', hint: 'Newton' },
    { word: 'Banane', hint: 'Kalium' },
    { word: 'Orange', hint: 'Farbe' },
    { word: 'Brot', hint: 'Täglich' },
    { word: 'Käse', hint: 'Löcher' },
    { word: 'Milch', hint: 'Weiß' },
    { word: 'Zucker', hint: 'Würfel' },
    { word: 'Salz', hint: 'Gold' },
    { word: 'Pfeffer', hint: 'Niesen' },
    { word: 'Schokolade', hint: 'Azteken' },
    { word: 'Kuchen', hint: 'Geburtstag' },
    { word: 'Eis', hint: 'Titanic' },
    { word: 'Tee', hint: 'Boston' },
    { word: 'Wein', hint: 'Trauben' },
    { word: 'Bier', hint: 'Oktoberfest' },
    { word: 'Brille', hint: 'Sehtest' },
    { word: 'Hut', hint: 'Kopfschmuck' },
    { word: 'Schuhe', hint: 'Paar' },
    { word: 'Hemd', hint: 'Business' },
    { word: 'Hose', hint: 'Beine' },
    { word: 'Jacke', hint: 'Außenhülle' },
    { word: 'Kleid', hint: 'Prinzessin' },
    { word: 'Socken', hint: 'Verlieren' },
    { word: 'Uhr', hint: 'Pünktlichkeit' },
    { word: 'Ring', hint: 'Ewigkeit' },
    { word: 'Kette', hint: 'Verbindung' },
    { word: 'Tasche', hint: 'Tragbar' },
    { word: 'Koffer', hint: 'Reise' },
    { word: 'Regenschirm', hint: 'Wetterschutz' },
    { word: 'Schlüssel', hint: 'Zugang' },
    { word: 'Handy', hint: 'Smartphone' },
    { word: 'Radio', hint: 'Frequenz' },
    { word: 'Fernseher', hint: 'Couch' },
    { word: 'Lampe', hint: 'Edison' },
    { word: 'Kerze', hint: 'Wind' },
    { word: 'Spiegel', hint: 'Schneewittchen' },
    { word: 'Kamera', hint: 'Tausend' },
    { word: 'Fahrrad', hint: 'Räder' },
    { word: 'Motorrad', hint: 'Harley' },
    { word: 'Bus', hint: 'Öffentlich' },
    { word: 'Zug', hint: 'Schiene' },
    { word: 'Flugzeug', hint: 'Wright' },
    { word: 'Schiff', hint: 'Titanic' },
    { word: 'Brücke', hint: 'Verbindung' },
    { word: 'Straße', hint: 'Asphalt' },
    { word: 'Park', hint: 'Grün' },
    { word: 'See', hint: 'Still' },
    { word: 'Fluss', hint: 'Fließend' },
    { word: 'Berg', hint: 'Gipfel' },
    { word: 'Tal', hint: 'Tiefe' },
    { word: 'Wald', hint: 'Bäume' },
    { word: 'Wiese', hint: 'Teppich' },
    { word: 'Schnee', hint: 'Flocken' },
    { word: 'Gewitter', hint: 'Zeus' },
    { word: 'Wind', hint: 'Unsichtbar' },
    { word: 'Nebel', hint: 'Schleier' },
    { word: 'Frost', hint: 'Kristalle' },
    { word: 'Hitze', hint: 'Wüste' },
    { word: 'Kälte', hint: 'Arktis' },
    { word: 'Frühling', hint: 'Erwachen' },
    { word: 'Sommer', hint: 'Heiß' },
    { word: 'Herbst', hint: 'Bunt' },
    { word: 'Winter', hint: 'Kalt' },
    { word: 'Morgen', hint: 'Beginn' },
    { word: 'Mittag', hint: 'Mitte' },
    { word: 'Abend', hint: 'Ende' },
    { word: 'Nacht', hint: 'Dunkel' },
    { word: 'Montag', hint: 'Start' },
    { word: 'Freitag', hint: 'TGIF' },
    { word: 'Samstag', hint: 'Weekend' },
    { word: 'Sonntag', hint: 'Ruhe' },
    { word: 'Januar', hint: 'Vorsätze' },
    { word: 'Dezember', hint: 'Geschenke' },
    { word: 'Geburtstag', hint: 'Kerzen' },
    { word: 'Hochzeit', hint: 'Weiß' },
    { word: 'Weihnachten', hint: 'Kamin' },
    { word: 'Ostern', hint: 'Verstecken' },
    { word: 'Urlaub', hint: 'Auszeit' },
    { word: 'Ferien', hint: 'Schulfrei' },
    { word: 'Party', hint: 'Laut' },
    { word: 'Konzert', hint: 'Live' },
    { word: 'Theater', hint: 'Bühne' },
    { word: 'Museum', hint: 'Alt' },
    { word: 'Bibliothek', hint: 'Leise' },
    { word: 'Krankenhaus', hint: 'Kittel' },
    { word: 'Apotheke', hint: 'Medizin' },
    { word: 'Supermarkt', hint: 'Einkaufen' },
    { word: 'Restaurant', hint: 'Bedienung' },
    { word: 'Café', hint: 'Espresso' },
    { word: 'Hotel', hint: 'Übernachten' },
    { word: 'Bank', hint: 'Tresor' },
    { word: 'Post', hint: 'Brief' },
    { word: 'Polizei', hint: 'Sirene' },
    { word: 'Feuerwehr', hint: 'Rot' },
    { word: 'Zahnarzt', hint: 'Bohren' },
    { word: 'Friseur', hint: 'Schere' },
    { word: 'Bäcker', hint: 'Früh' },
    { word: 'Metzger', hint: 'Fleisch' },
    { word: 'Lehrer', hint: 'Kreide' },
    { word: 'Arzt', hint: 'Stethoskop' },
    { word: 'Pilot', hint: 'Himmel' },
    { word: 'Koch', hint: 'Herd' },
    { word: 'Mechaniker', hint: 'Öl' },
    { word: 'Gärtner', hint: 'Pflanzen' },
    { word: 'Maler', hint: 'Pinsel' },
    { word: 'Musiker', hint: 'Instrument' },
    { word: 'Schreiber', hint: 'Feder' },
    { word: 'Läufer', hint: 'Marathon' },
    { word: 'Schwimmer', hint: 'Chlor' },
    { word: 'Tänzer', hint: 'Rhythmus' },
    { word: 'Sänger', hint: 'Mikrofon' },
    { word: 'Schauspieler', hint: 'Rolle' },
    { word: 'Künstler', hint: 'Kreativität' },
    { word: 'Wissenschaftler', hint: 'Forschung' },
    { word: 'Student', hint: 'Prüfung' },
    { word: 'Rentner', hint: 'Rente' },
    { word: 'Baby', hint: 'Windel' },
    { word: 'Kind', hint: 'Spielplatz' },
    { word: 'Teenager', hint: 'Pubertät' },
    { word: 'Erwachsener', hint: 'Verantwortung' },
    { word: 'Mann', hint: 'XY' },
    { word: 'Frau', hint: 'XX' },
    { word: 'Großvater', hint: 'Opa' },
    { word: 'Großmutter', hint: 'Oma' },
    { word: 'Bruder', hint: 'Geschwister' },
    { word: 'Schwester', hint: 'Geschwister' },
    { word: 'Vater', hint: 'Papa' },
    { word: 'Mutter', hint: 'Mama' },
    { word: 'Ehemann', hint: 'Trauring' },
    { word: 'Ehefrau', hint: 'Trauring' },
    { word: 'Nachbar', hint: 'Nebenan' },
    { word: 'Fremder', hint: 'Unbekannt' }
];

function generateMatchId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function createMatch(hostName, isPrivate, password = null) {
    const matchId = generateMatchId();
    const match = {
        id: matchId,
        host: null,
        players: [],
        allParticipants: [], // Track all players who have ever joined this match
        originalPlayerData: new Map(), // Store original player data by name for rejoining
        isPrivate,
        password,
        gameState: 'waiting', // waiting, playing, voting_continue, voting_imposter, finished
        currentWord: null,
        imposterHint: null,
        imposterSocketId: null,
        imposterPlayerName: null, // Store imposter by name, not socket ID
        currentRound: 0,
        currentPlayerIndex: 0,
        currentPlayerName: null, // Store current player by name
        wordsThisRound: [], // {playerId, word}
        allRounds: [], // Store all previous rounds
        votes: [], // for voting phases
        maxRounds: 5
    };
    matches.set(matchId, match);
    return match;
}

function addPlayerToMatch(matchId, socketId, playerName) {
    const match = matches.get(matchId);
    if (!match) return false;
    
    if (match.players.length >= 8) return false; // Max 8 players
    
    // Check if user is already in a game
    const userKey = loggedInUsers.get(socketId);
    if (userKey && usersInGame.has(userKey)) {
        return { error: 'Du bist bereits in einem anderen Spiel. Verlasse es zuerst.' };
    }
    
    // Check if this is a rejoin - restore original player data
    const originalData = match.originalPlayerData.get(playerName);
    const isRejoin = originalData !== undefined;
    
    // Determine host status - only if no current host exists and it's the first player
    let shouldBeHost = false;
    if (!isRejoin && match.players.length === 0) {
        shouldBeHost = true;
    } else if (isRejoin) {
        // When rejoining, never restore host status - current host should remain
        shouldBeHost = false;
    }
    
    const player = {
        id: socketId,
        name: playerName,
        isHost: shouldBeHost,
        word: isRejoin ? originalData.word : null,
        isImposter: isRejoin ? originalData.isImposter : false
    };
    
    match.players.push(player);
    
    // Add to allParticipants if not already there
    if (!match.allParticipants.includes(playerName)) {
        match.allParticipants.push(playerName);
    }
    
    // Store original player data for potential rejoins
    if (!isRejoin) {
        match.originalPlayerData.set(playerName, {
            word: null,
            isImposter: false,
            originalJoinOrder: match.allParticipants.length - 1
        });
    } else {
        // Update socket ID for rejoining player
        if (originalData.isImposter) {
            match.imposterSocketId = socketId; // Update imposter socket ID
        }
        
        // Restore current player turn if this was the active player
        if (match.currentPlayerName === playerName && match.gameState === 'playing') {
            match.currentPlayerIndex = match.players.length - 1; // Set to current position in array
        }
    }
    
    if (player.isHost) {
        match.host = socketId;
    }
    
    socketToMatch.set(socketId, matchId);
    socketToPlayer.set(socketId, player);
    
    // Mark user as in game
    if (userKey) {
        usersInGame.set(userKey, matchId);
    }
    socketToPlayer.set(socketId, player);
    
    return true;
}

function removePlayerFromMatch(socketId) {
    const matchId = socketToMatch.get(socketId);
    if (!matchId) return;
    
    const match = matches.get(matchId);
    if (!match) return;
    
    // Remove user from usersInGame map
    const userKey = loggedInUsers.get(socketId);
    if (userKey && usersInGame.has(userKey)) {
        usersInGame.delete(userKey);
    }
    
    match.players = match.players.filter(p => p.id !== socketId);
    
    // If host left, assign new host
    if (match.host === socketId && match.players.length > 0) {
        match.host = match.players[0].id;
        match.players[0].isHost = true;
    }
    
    // If no players left, delete match
    if (match.players.length === 0) {
        matches.delete(matchId);
    }
    
    socketToMatch.delete(socketId);
    socketToPlayer.delete(socketId);
}

function startGame(matchId) {
    const match = matches.get(matchId);
    if (!match || match.players.length < 4) return false;
    
    // Reset game state
    match.gameState = 'playing';
    match.currentRound = 1;
    match.currentPlayerIndex = Math.floor(Math.random() * match.players.length);
    match.currentPlayerName = match.players[match.currentPlayerIndex].name; // Store current player name
    match.wordsThisRound = [];
    match.allRounds = []; // Reset all rounds history
    
    // Store the initial random player order for consistent round progression
    match.initialPlayerOrder = [...match.players]; // Copy the current player array
    match.initialPlayerIndex = match.currentPlayerIndex; // Store the starting index
    
    // Choose random word and imposter
    const wordObj = wordPool[Math.floor(Math.random() * wordPool.length)];
    match.currentWord = wordObj.word;
    match.imposterHint = wordObj.hint;
    const imposterIndex = Math.floor(Math.random() * match.players.length);
    match.imposterSocketId = match.players[imposterIndex].id;
    match.imposterPlayerName = match.players[imposterIndex].name; // Store imposter name
    
    // Assign words to players and update original data
    match.players.forEach((player, index) => {
        if (index === imposterIndex) {
            player.word = `Imposter (Tipp: ${match.imposterHint})`;
            player.isImposter = true;
        } else {
            player.word = match.currentWord;
            player.isImposter = false;
        }
        
        // Update original player data for rejoining
        const originalData = match.originalPlayerData.get(player.name);
        if (originalData) {
            originalData.word = player.word;
            originalData.isImposter = player.isImposter;
        }
    });
    
    return true;
}

function resetMatchToLobby(matchId) {
    const match = matches.get(matchId);
    if (!match) return false;
    
    // Reset game state to waiting
    match.gameState = 'waiting';
    match.currentWord = null;
    match.imposterHint = null;
    match.imposterSocketId = null;
    match.imposterPlayerName = null;
    match.currentRound = 0;
    match.currentPlayerIndex = 0;
    match.currentPlayerName = null;
    match.wordsThisRound = [];
    match.allRounds = [];
    match.votes = [];
    
    // Reset player data but keep them in the match
    match.players.forEach(player => {
        player.word = null;
        player.isImposter = false;
        
        // Reset original player data
        const originalData = match.originalPlayerData.get(player.name);
        if (originalData) {
            originalData.word = null;
            originalData.isImposter = false;
        }
    });
    
    return true;
}

function submitWord(matchId, socketId, word) {
    const match = matches.get(matchId);
    if (!match || match.gameState !== 'playing') return false;
    
    const currentPlayer = match.players[match.currentPlayerIndex];
    if (currentPlayer.id !== socketId) return false;
    
    // Check if imposter guessed the correct word
    if (match.imposterSocketId === socketId && word.toLowerCase() === match.currentWord.toLowerCase()) {
        match.gameState = 'finished';
        return { imposterWon: true };
    }
    
    // Prevent normal players from saying the target word
    if (match.imposterSocketId !== socketId && word.toLowerCase() === match.currentWord.toLowerCase()) {
        return { error: 'Du kannst das gesuchte Wort nicht verwenden!' };
    }
    
    match.wordsThisRound.push({
        playerId: socketId,
        playerName: currentPlayer.name,
        word: word
    });
    
    // Move to next player
    match.currentPlayerIndex = (match.currentPlayerIndex + 1) % match.players.length;
    match.currentPlayerName = match.players[match.currentPlayerIndex].name; // Update current player name
    
    // Check if round is complete
    if (match.wordsThisRound.length === match.players.length) {
        // Save current round to history
        match.allRounds.push({
            round: match.currentRound,
            words: [...match.wordsThisRound]
        });
        
        match.gameState = 'voting_continue';
        match.votes = [];
    }
    
    return { success: true };
}

function submitVote(matchId, socketId, voteType, targetPlayerId = null) {
    const match = matches.get(matchId);
    if (!match) return false;
    
    // Remove existing vote from this player
    match.votes = match.votes.filter(v => v.playerId !== socketId);
    
    match.votes.push({
        playerId: socketId,
        voteType: voteType,
        targetPlayerId: targetPlayerId
    });
    
    // Check if all players voted
    if (match.votes.length === match.players.length) {
        if (match.gameState === 'voting_continue') {
            const continueVotes = match.votes.filter(v => v.voteType === 'continue').length;
            const guessVotes = match.votes.filter(v => v.voteType === 'guess').length;
            
            if (guessVotes > continueVotes) {
                match.gameState = 'voting_imposter';
                match.votes = [];
            } else {
                // Continue to next round - use the same player order as first round
                match.currentRound++;
                match.gameState = 'playing';
                match.wordsThisRound = [];
                
                // Reset to the initial starting player and order from round 1
                match.currentPlayerIndex = match.initialPlayerIndex;
                match.currentPlayerName = match.initialPlayerOrder[match.initialPlayerIndex].name;
            }
        } else if (match.gameState === 'voting_imposter') {
            // Count votes for each player
            const voteCounts = {};
            match.votes.forEach(vote => {
                if (!voteCounts[vote.targetPlayerId]) {
                    voteCounts[vote.targetPlayerId] = 0;
                }
                voteCounts[vote.targetPlayerId]++;
            });
            
            // Find player with most votes
            let maxVotes = 0;
            let votedOutPlayerId = null;
            for (const [playerId, count] of Object.entries(voteCounts)) {
                if (count > maxVotes) {
                    maxVotes = count;
                    votedOutPlayerId = playerId;
                }
            }
            
            match.gameState = 'finished';
            if (votedOutPlayerId === match.imposterSocketId) {
                return { imposterFound: true, imposterWon: false };
            } else {
                return { imposterFound: false, imposterWon: true };
            }
        }
    }
    
    return { success: true };
}

// Update player statistics after game ends
function updatePlayerStats(matchId, imposterWon, imposterSocketId) {
    const match = matches.get(matchId);
    if (!match) return;
    
    match.players.forEach(player => {
        const userKey = loggedInUsers.get(player.id);
        if (!userKey || !users[userKey]) return;
        
        const playerStats = users[userKey].stats;
        playerStats.gamesPlayed++;
        
        const isImposter = player.id === imposterSocketId;
        
        if (isImposter) {
            if (imposterWon) {
                playerStats.wins++;
                playerStats.imposterWins++;
            } else {
                playerStats.losses++;
            }
            
            // Count words guessed as imposter (if they participated in guessing)
            if (match.wordsThisRound && match.wordsThisRound.some(w => w.playerId === player.id)) {
                playerStats.wordsGuessedAsImposter++;
            }
        } else {
            if (imposterWon) {
                playerStats.losses++;
            } else {
                playerStats.wins++;
            }
        }
        
        // Count votes received
        if (match.votes) {
            const votesReceived = Object.values(match.votes).filter(vote => vote.targetPlayerId === player.id).length;
            playerStats.totalVotesReceived += votesReceived;
            
            // Count correct votes (voting for imposter when civilians win)
            if (!imposterWon && match.votes[player.id] && match.votes[player.id].targetPlayerId === imposterSocketId) {
                playerStats.correctVotes++;
            }
        }
    });
    
    saveUsers();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // User login via socket
    socket.on('user_login', (data) => {
        const { username, password } = data;
        const lowerUsername = username.toLowerCase();
        
        if (!users[lowerUsername]) {
            socket.emit('login_result', { success: false, message: 'Benutzer nicht gefunden.' });
            return;
        }
        
        if (users[lowerUsername].password !== password) {
            socket.emit('login_result', { success: false, message: 'Falsches Passwort.' });
            return;
        }
        
        // Check if user is already logged in from another session
        if (activeSessions.has(lowerUsername)) {
            const existingSocketId = activeSessions.get(lowerUsername);
            // Kick the existing session
            const existingSocket = io.sockets.sockets.get(existingSocketId);
            if (existingSocket) {
                existingSocket.emit('force_logout', { message: 'Dein Account wurde von einem anderen Gerät angemeldet.' });
                existingSocket.disconnect();
            }
            // Clean up the old session
            loggedInUsers.delete(existingSocketId);
            activeSessions.delete(lowerUsername);
            usersInGame.delete(lowerUsername);
        }
        
        // Set up new session
        loggedInUsers.set(socket.id, lowerUsername);
        activeSessions.set(lowerUsername, socket.id);
        
        // Check if user was in a match and try to reconnect
        let currentMatch = null;
        for (const [matchId, match] of matches.entries()) {
            const playerIndex = match.players.findIndex(p => p.name.toLowerCase() === lowerUsername);
            if (playerIndex !== -1) {
                console.log(`User ${lowerUsername} found in match ${matchId}, reconnecting...`);
                // Update the socket ID for this player
                match.players[playerIndex].id = socket.id; // Update socket ID
                socketToMatch.set(socket.id, matchId);
                usersInGame.set(lowerUsername, matchId); // Re-add to usersInGame
                currentMatch = {
                    id: matchId,
                    ...match
                };
                
                // Join the socket to the match room
                socket.join(matchId);
                
                // Notify other players that this player reconnected
                socket.to(matchId).emit('player_reconnected', {
                    username: users[lowerUsername].username
                });
                
                break;
            }
        }
        
        console.log(`User ${lowerUsername} login - currentMatch:`, currentMatch ? currentMatch.id : 'none');
        
        socket.emit('login_result', { 
            success: true, 
            message: 'Login erfolgreich!',
            user: {
                username: users[lowerUsername].username,
                stats: users[lowerUsername].stats
            },
            currentMatch: currentMatch
        });
    });
    
    // Send current matches to new user (including private ones)
    socket.emit('lobby_updated', {
        matches: Array.from(matches.values())
            .filter(match => match.gameState === 'waiting')
            .map(match => ({
                id: match.id,
                playerCount: match.players.length,
                hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                isPrivate: match.isPrivate,
                hasPassword: match.isPrivate && !!match.password
            }))
    });
    
    socket.on('create_match', (data) => {
        const { isPrivate, password } = data;
        
        // Check if user is logged in
        const userKey = loggedInUsers.get(socket.id);
        if (!userKey) {
            socket.emit('error', { message: 'Du musst eingeloggt sein um ein Spiel zu erstellen' });
            return;
        }
        
        console.log('create_match attempt - userKey:', userKey, 'usersInGame:', usersInGame.has(userKey), 'socketToMatch:', socketToMatch.has(socket.id));
        
        // Ensure user is not marked as being in a game before creating new match
        if (userKey && usersInGame.has(userKey)) {
            console.log('User was still marked as in game, cleaning up before creating new match');
            usersInGame.delete(userKey);
        }
        
        // Also clean up socket mappings
        if (socketToMatch.has(socket.id)) {
            console.log('Socket was still in socketToMatch, cleaning up');
            socketToMatch.delete(socket.id);
        }
        
        const user = users[userKey];
        const playerName = user.username;
        
        const match = createMatch(playerName, isPrivate, password);
        const result = addPlayerToMatch(match.id, socket.id, playerName);
        
        if (result && result.error) {
            socket.emit('error', { message: result.error });
            // Delete the match if player couldn't join
            matches.delete(match.id);
            return;
        }
        
        socket.join(match.id);
        socket.emit('match_created', { matchId: match.id });
        io.to(match.id).emit('match_updated', {
            players: match.players,
            gameState: match.gameState
        });
        
        // Update lobby for all users (including private matches)
        io.emit('lobby_updated', {
            matches: Array.from(matches.values())
                .filter(match => match.gameState === 'waiting')
                .map(match => ({
                    id: match.id,
                    playerCount: match.players.length,
                    hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                    isPrivate: match.isPrivate,
                    hasPassword: match.isPrivate && !!match.password
                }))
        });
    });
    
    socket.on('join_match', (data) => {
        const { matchId, password } = data;
        
        // Check if user is logged in
        const userKey = loggedInUsers.get(socket.id);
        if (!userKey) {
            socket.emit('error', { message: 'Du musst eingeloggt sein um einem Spiel beizutreten' });
            return;
        }
        
        // Ensure user is not marked as being in a game before joining new match
        if (userKey && usersInGame.has(userKey)) {
            console.log('User was still marked as in game, cleaning up before joining new match');
            usersInGame.delete(userKey);
        }
        
        const user = users[userKey];
        const playerName = user.username;
        
        const match = matches.get(matchId);
        
        if (!match) {
            socket.emit('error', { message: 'Match nicht gefunden' });
            return;
        }
        
        if (match.isPrivate && match.password !== password) {
            socket.emit('error', { message: 'Falsches Passwort' });
            return;
        }
        
        // Check if this is a rejoin attempt (player was previously in this match)
        const wasPlayerInMatch = match.allParticipants && match.allParticipants.includes(playerName);
        
        if (match.gameState !== 'waiting' && !wasPlayerInMatch) {
            socket.emit('error', { message: 'Spiel bereits gestartet - nur teilnehmende Spieler können wieder beitreten' });
            return;
        }
        
        const result = addPlayerToMatch(matchId, socket.id, playerName);
        if (!result || result.error) {
            const errorMessage = result && result.error ? result.error : 'Match ist voll oder Fehler beim Beitreten';
            socket.emit('error', { message: errorMessage });
            return;
        }
        
        socket.join(matchId);
        
        // If rejoining an active game, send appropriate screen data
        if (match.gameState === 'waiting') {
            socket.emit('match_joined', { matchId });
        } else {
            // Rejoining an active game
            socket.emit('match_joined', { matchId });
            
            // Send current game state with complete information
            const playerData = match.players.find(p => p.id === socket.id);
            if (playerData) {
                socket.emit('game_started', {
                    word: playerData.word,
                    isImposter: playerData.isImposter,
                    currentPlayer: match.currentPlayerName || (match.players[match.currentPlayerIndex] ? match.players[match.currentPlayerIndex].name : null),
                    round: match.currentRound,
                    players: match.players
                });
                
                // Send additional game state data if needed
                if (match.gameState === 'voting_continue' || match.gameState === 'voting_imposter') {
                    socket.emit('vote_updated', {
                        gameState: match.gameState,
                        votes: match.votes,
                        players: match.players,
                        currentPlayer: match.currentPlayerName,
                        round: match.currentRound,
                        words: match.wordsThisRound,
                        allRounds: match.allRounds
                    });
                }
            }
        }
        io.to(matchId).emit('match_updated', {
            players: match.players,
            gameState: match.gameState
        });
        
        // Update lobby for all users
        io.emit('lobby_updated', {
            matches: Array.from(matches.values())
                .filter(match => match.gameState === 'waiting')
                .map(match => ({
                    id: match.id,
                    playerCount: match.players.length,
                    hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                    isPrivate: match.isPrivate,
                    hasPassword: match.isPrivate && !!match.password
                }))
        });
    });
    
    socket.on('start_game', () => {
        const matchId = socketToMatch.get(socket.id);
        const match = matches.get(matchId);
        
        if (!match || match.host !== socket.id) {
            socket.emit('error', { message: 'Nur der Host kann das Spiel starten' });
            return;
        }
        
        if (!startGame(matchId)) {
            socket.emit('error', { message: 'Mindestens 4 Spieler benötigt' });
            return;
        }
        
        // Send game state to all players
        match.players.forEach(player => {
            io.to(player.id).emit('game_started', {
                word: player.word,
                isImposter: player.isImposter,
                currentPlayer: match.players[match.currentPlayerIndex].name,
                round: match.currentRound,
                players: match.players
            });
        });
        
        // Update lobby - remove match from lobby when game starts
        io.emit('lobby_updated', {
            matches: Array.from(matches.values())
                .filter(match => match.gameState === 'waiting')
                .map(match => ({
                    id: match.id,
                    playerCount: match.players.length,
                    hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                    isPrivate: match.isPrivate,
                    hasPassword: match.isPrivate && !!match.password
                }))
        });
    });
    
    socket.on('submit_word', (data) => {
        const { word } = data;
        const matchId = socketToMatch.get(socket.id);
        const result = submitWord(matchId, socket.id, word);
        
        if (result && result.error) {
            socket.emit('error', { message: result.error });
            return;
        }
        
        if (result.imposterWon) {
            const match = matches.get(matchId);
            updatePlayerStats(matchId, true, match.imposterSocketId);
            io.to(matchId).emit('game_finished', {
                imposterWon: true,
                imposter: match.players.find(p => p.id === match.imposterSocketId).name,
                word: match.currentWord
            });
            
            // Reset match to lobby after a delay
            setTimeout(() => {
                resetMatchToLobby(matchId);
                const resetMatch = matches.get(matchId);
                if (resetMatch) {
                    io.to(matchId).emit('return_to_lobby', {
                        matchId: matchId,
                        players: resetMatch.players,
                        gameState: resetMatch.gameState
                    });
                    
                    // Update lobby list
                    io.emit('lobby_updated', {
                        matches: Array.from(matches.values())
                            .filter(match => match.gameState === 'waiting')
                            .map(match => ({
                                id: match.id,
                                playerCount: match.players.length,
                                hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                                isPrivate: match.isPrivate,
                                hasPassword: match.isPrivate && !!match.password
                            }))
                    });
                }
            }, 5000); // 5 seconds delay to show results
        } else if (result.success) {
            const match = matches.get(matchId);
            io.to(matchId).emit('word_submitted', {
                words: match.wordsThisRound,
                allRounds: match.allRounds,
                gameState: match.gameState,
                currentPlayer: match.gameState === 'playing' ? match.players[match.currentPlayerIndex].name : null,
                round: match.currentRound,
                players: match.players
            });
        }
    });
    
    socket.on('submit_vote', (data) => {
        const { voteType, targetPlayerId } = data;
        const matchId = socketToMatch.get(socket.id);
        const result = submitVote(matchId, socket.id, voteType, targetPlayerId);
        
        if (result.imposterFound !== undefined) {
            const match = matches.get(matchId);
            updatePlayerStats(matchId, result.imposterWon, match.imposterSocketId);
            io.to(matchId).emit('game_finished', {
                imposterWon: result.imposterWon,
                imposter: match.players.find(p => p.id === match.imposterSocketId).name,
                word: match.currentWord
            });
            
            // Reset match to lobby after a delay
            setTimeout(() => {
                resetMatchToLobby(matchId);
                const resetMatch = matches.get(matchId);
                if (resetMatch) {
                    io.to(matchId).emit('return_to_lobby', {
                        matchId: matchId,
                        players: resetMatch.players,
                        gameState: resetMatch.gameState
                    });
                    
                    // Update lobby list
                    io.emit('lobby_updated', {
                        matches: Array.from(matches.values())
                            .filter(match => match.gameState === 'waiting')
                            .map(match => ({
                                id: match.id,
                                playerCount: match.players.length,
                                hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                                isPrivate: match.isPrivate,
                                hasPassword: match.isPrivate && !!match.password
                            }))
                    });
                }
            }, 5000); // 5 seconds delay to show results
        } else {
            const match = matches.get(matchId);
            io.to(matchId).emit('vote_updated', {
                gameState: match.gameState,
                votes: match.votes,
                players: match.players,
                currentPlayer: match.gameState === 'playing' ? match.players[match.currentPlayerIndex].name : null,
                round: match.currentRound,
                words: match.wordsThisRound,
                allRounds: match.allRounds
            });
        }
    });
    
    socket.on('leave_match', () => {
        console.log('User explicitly left match:', socket.id);
        const matchId = socketToMatch.get(socket.id);
        const userKey = loggedInUsers.get(socket.id);
        
        console.log('Before leave - matchId:', matchId, 'userKey:', userKey);
        console.log('Before leave - socketToMatch:', socketToMatch.has(socket.id), 'usersInGame:', userKey ? usersInGame.has(userKey) : 'no userKey');
        
        // Always clean up all mappings, regardless of match existence
        if (userKey && usersInGame.has(userKey)) {
            usersInGame.delete(userKey);
            console.log('Removed user from usersInGame');
        }
        
        if (socketToMatch.has(socket.id)) {
            socketToMatch.delete(socket.id);
            console.log('Removed socket from socketToMatch');
        }
        
        if (socketToPlayer.has(socket.id)) {
            socketToPlayer.delete(socket.id);
            console.log('Removed socket from socketToPlayer');
        }
        
        if (matchId) {
            const match = matches.get(matchId);
            if (match) {
                // Find player by socket ID and get their name
                const leavingPlayer = match.players.find(p => p.id === socket.id);
                const playerName = leavingPlayer ? leavingPlayer.name : null;
                
                // Remove player from match by socket ID
                match.players = match.players.filter(p => p.id !== socket.id);
                
                console.log(`Removed player ${playerName} (${socket.id}) from match. Remaining: ${match.players.length}`);
                
                // If host left, assign new host
                if (match.host === socket.id && match.players.length > 0) {
                    match.host = match.players[0].id;
                    match.players[0].isHost = true;
                    console.log('Transferred host to:', match.players[0].name);
                }
                
                // If no players left, delete match
                if (match.players.length === 0) {
                    matches.delete(matchId);
                    console.log('Deleted empty match:', matchId);
                } else {
                    // Notify remaining players about updated player list
                    io.to(matchId).emit('match_updated', {
                        players: match.players,
                        gameState: match.gameState
                    });
                    console.log(`Player left match ${matchId}. Remaining players: ${match.players.length}`);
                }
                
                // Update lobby for all users after player left
                io.emit('lobby_updated', {
                    matches: Array.from(matches.values())
                        .filter(match => match.gameState === 'waiting')
                        .map(match => ({
                            id: match.id,
                            playerCount: match.players.length,
                            hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                            isPrivate: match.isPrivate,
                            hasPassword: match.isPrivate && !!match.password
                        }))
                });
                console.log('Sent lobby update after player left');
            }
        }
        
        console.log('After leave - socketToMatch:', socketToMatch.has(socket.id), 'usersInGame:', userKey ? usersInGame.has(userKey) : 'no userKey');
        
        // Send confirmation to the leaving player
        socket.emit('match_left');
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const matchId = socketToMatch.get(socket.id);
        const userKey = loggedInUsers.get(socket.id);
        
        // Remove from logged in users
        loggedInUsers.delete(socket.id);
        
        // Remove from active sessions
        if (userKey && activeSessions.has(userKey)) {
            activeSessions.delete(userKey);
        }
        
        // Remove from users in game
        if (userKey && usersInGame.has(userKey)) {
            usersInGame.delete(userKey);
        }
        
        removePlayerFromMatch(socket.id);
        
        // Notify remaining players
        if (matchId) {
            const match = matches.get(matchId);
            if (match) {
                io.to(matchId).emit('match_updated', {
                    players: match.players,
                    gameState: match.gameState
                });
            }
        }
        
        // Update lobby for all users
        io.emit('lobby_updated', {
            matches: Array.from(matches.values())
                .filter(match => match.gameState === 'waiting')
                .map(match => ({
                    id: match.id,
                    playerCount: match.players.length,
                    hostName: match.players.find(p => p.isHost)?.name || 'Unknown',
                    isPrivate: match.isPrivate,
                    hasPassword: match.isPrivate && !!match.password
                }))
        });
    });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`Server läuft auf ${HOST}:${PORT}`);
    console.log(`Öffentlich erreichbar unter der Replit-URL`);
});
