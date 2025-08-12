const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));

// Game state
const matches = new Map(); // matchId -> match object
const socketToMatch = new Map(); // socketId -> matchId
const socketToPlayer = new Map(); // socketId -> player object

// Word pool for the game with hints for imposter
const wordPool = [
    { word: 'Pizza', hint: 'Scheiben' },
    { word: 'Katze', hint: 'Kratzen' },
    { word: 'Auto', hint: 'Parkplatz' },
    { word: 'Baum', hint: 'Blätter' },
    { word: 'Strand', hint: 'Wellen' },
    { word: 'Buch', hint: 'Lesezeichen' },
    { word: 'Kaffee', hint: 'Wachheit' },
    { word: 'Musik', hint: 'Kopfhörer' },
    { word: 'Schule', hint: 'Ferien' },
    { word: 'Computer', hint: 'Monitor' },
    { word: 'Telefon', hint: 'Akku' },
    { word: 'Sonne', hint: 'Brennen' },
    { word: 'Regen', hint: 'Pfützen' },
    { word: 'Haus', hint: 'Schlüssel' },
    { word: 'Garten', hint: 'Unkraut' },
    { word: 'Film', hint: 'Untertitel' },
    { word: 'Sport', hint: 'Aufwärmen' },
    { word: 'Urlaub', hint: 'Postkarte' },
    { word: 'Familie', hint: 'Fotoalbum' },
    { word: 'Freunde', hint: 'Geheimnisse' },
    { word: 'Arbeit', hint: 'Feierabend' },
    { word: 'Spiel', hint: 'Würfel' },
    { word: 'Essen', hint: 'Sättigung' },
    { word: 'Trinken', hint: 'Prost' },
    { word: 'Schlaf', hint: 'Müdigkeit' },
    { word: 'Zeit', hint: 'Vergehen' },
    { word: 'Geld', hint: 'Sparen' },
    { word: 'Liebe', hint: 'Valentinstag' },
    { word: 'Glück', hint: 'Kleeblatt' },
    { word: 'Traum', hint: 'Vergessen' },
    { word: 'Farbe', hint: 'Spektrum' },
    { word: 'Licht', hint: 'Helligkeit' },
    { word: 'Dunkel', hint: 'Taschenlampe' },
    { word: 'Warm', hint: 'Decke' },
    { word: 'Kalt', hint: 'Gänsehaut' },
    { word: 'Groß', hint: 'Übersehen' },
    { word: 'Klein', hint: 'Lupe' },
    { word: 'Schnell', hint: 'Überholen' },
    { word: 'Langsam', hint: 'Geduld' },
    { word: 'Hoch', hint: 'Schwindel' },
    { word: 'Tief', hint: 'Fallen' },
    { word: 'Neu', hint: 'Auspacken' },
    { word: 'Alt', hint: 'Erinnerung' },
    { word: 'Gut', hint: 'Belohnung' },
    { word: 'Schlecht', hint: 'Bereuen' },
    { word: 'Fenster', hint: 'Durchblick' },
    { word: 'Tür', hint: 'Schwelle' },
    { word: 'Stuhl', hint: 'Lehne' },
    { word: 'Tisch', hint: 'Kratzer' },
    { word: 'Bett', hint: 'Aufstehen' },
    { word: 'Küche', hint: 'Rezept' },
    { word: 'Bad', hint: 'Dampf' },
    { word: 'Wasser', hint: 'Durchsichtig' },
    { word: 'Feuer', hint: 'Löschen' },
    { word: 'Luft', hint: 'Unsichtbar' },
    { word: 'Erde', hint: 'Schmutz' },
    { word: 'Himmel', hint: 'Unendlich' },
    { word: 'Stern', hint: 'Wunsch' },
    { word: 'Mond', hint: 'Gezeiten' },
    { word: 'Blume', hint: 'Welken' },
    { word: 'Gras', hint: 'Ticken' },
    { word: 'Vogel', hint: 'Zwitschern' },
    { word: 'Fisch', hint: 'Blubbern' },
    { word: 'Hund', hint: 'Gassi' },
    { word: 'Maus', hint: 'Falle' },
    { word: 'Pferd', hint: 'Galoppieren' },
    { word: 'Kuh', hint: 'Weide' },
    { word: 'Schwein', hint: 'Grunzen' },
    { word: 'Huhn', hint: 'Gackern' },
    { word: 'Apfel', hint: 'Baumstamm' },
    { word: 'Banane', hint: 'Krümmen' },
    { word: 'Orange', hint: 'Vitamin' },
    { word: 'Brot', hint: 'Toaster' },
    { word: 'Käse', hint: 'Mäuse' },
    { word: 'Milch', hint: 'Kühlschrank' },
    { word: 'Zucker', hint: 'Ameisen' },
    { word: 'Salz', hint: 'Meer' },
    { word: 'Pfeffer', hint: 'Gewürzmühle' },
    { word: 'Schokolade', hint: 'Kakao' },
    { word: 'Kuchen', hint: 'Backofen' },
    { word: 'Eis', hint: 'Schmelzen' },
    { word: 'Tee', hint: 'Aufguss' },
    { word: 'Wein', hint: 'Korkenzieher' },
    { word: 'Bier', hint: 'Hopfen' },
    { word: 'Brille', hint: 'Sehtest' },
    { word: 'Hut', hint: 'Kopfbedeckung' },
    { word: 'Schuhe', hint: 'Drücken' },
    { word: 'Hemd', hint: 'Kragen' },
    { word: 'Hose', hint: 'Gürtel' },
    { word: 'Jacke', hint: 'Zuknöpfen' },
    { word: 'Kleid', hint: 'Eleganz' },
    { word: 'Socken', hint: 'Paar' },
    { word: 'Uhr', hint: 'Pünktlichkeit' },
    { word: 'Ring', hint: 'Kreis' },
    { word: 'Kette', hint: 'Verschluss' },
    { word: 'Tasche', hint: 'Kramen' },
    { word: 'Koffer', hint: 'Packen' },
    { word: 'Regenschirm', hint: 'Aufspannen' },
    { word: 'Schlüssel', hint: 'Verlieren' },
    { word: 'Handy', hint: 'Vibration' },
    { word: 'Radio', hint: 'Rauschen' },
    { word: 'Fernseher', hint: 'Fernbedienung' },
    { word: 'Lampe', hint: 'Dimmen' },
    { word: 'Kerze', hint: 'Tropfen' },
    { word: 'Spiegel', hint: 'Zerbrechen' },
    { word: 'Kamera', hint: 'Blitzen' },
    { word: 'Fahrrad', hint: 'Klingel' },
    { word: 'Motorrad', hint: 'Dröhnen' },
    { word: 'Bus', hint: 'Warten' },
    { word: 'Zug', hint: 'Verspätung' },
    { word: 'Flugzeug', hint: 'Startbahn' },
    { word: 'Schiff', hint: 'Seekrank' },
    { word: 'Brücke', hint: 'Überqueren' },
    { word: 'Straße', hint: 'Schlagloch' },
    { word: 'Park', hint: 'Spazieren' },
    { word: 'See', hint: 'Angeln' },
    { word: 'Fluss', hint: 'Fließen' },
    { word: 'Berg', hint: 'Klettern' },
    { word: 'Tal', hint: 'Abstieg' },
    { word: 'Wald', hint: 'Verlaufen' },
    { word: 'Wiese', hint: 'Picknick' },
    { word: 'Schnee', hint: 'Schneeball' },
    { word: 'Gewitter', hint: 'Blitzableiter' },
    { word: 'Wind', hint: 'Drachen' },
    { word: 'Nebel', hint: 'Mystisch' },
    { word: 'Frost', hint: 'Kratzen' },
    { word: 'Hitze', hint: 'Ventilator' },
    { word: 'Kälte', hint: 'Heizung' },
    { word: 'Frühling', hint: 'Allergien' },
    { word: 'Sommer', hint: 'Sonnenbrand' },
    { word: 'Herbst', hint: 'Kastanien' },
    { word: 'Winter', hint: 'Schneemann' },
    { word: 'Morgen', hint: 'Wecker' },
    { word: 'Mittag', hint: 'Pause' },
    { word: 'Abend', hint: 'Entspannung' },
    { word: 'Nacht', hint: 'Schlaflos' },
    { word: 'Montag', hint: 'Motivation' },
    { word: 'Freitag', hint: 'Vorfreude' },
    { word: 'Samstag', hint: 'Einkaufen' },
    { word: 'Sonntag', hint: 'Gottesdienst' },
    { word: 'Januar', hint: 'Vorsätze' },
    { word: 'Dezember', hint: 'Geschenke' },
    { word: 'Geburtstag', hint: 'Überraschung' },
    { word: 'Hochzeit', hint: 'Blumenkind' },
    { word: 'Weihnachten', hint: 'Kaminfeuer' },
    { word: 'Ostern', hint: 'Verstecken' },
    { word: 'Urlaub', hint: 'Sonnencreme' },
    { word: 'Ferien', hint: 'Langeweile' },
    { word: 'Party', hint: 'Nachbarn' },
    { word: 'Konzert', hint: 'Ohrstöpsel' },
    { word: 'Theater', hint: 'Applaus' },
    { word: 'Museum', hint: 'Führung' },
    { word: 'Bibliothek', hint: 'Ausleihen' },
    { word: 'Krankenhaus', hint: 'Besucher' },
    { word: 'Apotheke', hint: 'Rezept' },
    { word: 'Supermarkt', hint: 'Warteschlange' },
    { word: 'Restaurant', hint: 'Trinkgeld' },
    { word: 'Café', hint: 'Zeitungen' },
    { word: 'Hotel', hint: 'Zimmerkarte' },
    { word: 'Bank', hint: 'Warteschlange' },
    { word: 'Post', hint: 'Einschreiben' },
    { word: 'Polizei', hint: 'Sirene' },
    { word: 'Feuerwehr', hint: 'Leiter' },
    { word: 'Zahnarzt', hint: 'Spülen' },
    { word: 'Friseur', hint: 'Spiegel' },
    { word: 'Bäcker', hint: 'Aufstehen' },
    { word: 'Metzger', hint: 'Schürze' },
    { word: 'Lehrer', hint: 'Kreide' },
    { word: 'Arzt', hint: 'Wartezimmer' },
    { word: 'Pilot', hint: 'Turbulenzen' },
    { word: 'Koch', hint: 'Probieren' },
    { word: 'Mechaniker', hint: 'Öl' },
    { word: 'Gärtner', hint: 'Sonnenhut' },
    { word: 'Maler', hint: 'Flecken' },
    { word: 'Musiker', hint: 'Üben' },
    { word: 'Schreiber', hint: 'Korrektur' },
    { word: 'Läufer', hint: 'Ziellinie' },
    { word: 'Schwimmer', hint: 'Startblock' },
    { word: 'Tänzer', hint: 'Bühne' },
    { word: 'Sänger', hint: 'Publikum' },
    { word: 'Schauspieler', hint: 'Text' },
    { word: 'Künstler', hint: 'Inspiration' },
    { word: 'Wissenschaftler', hint: 'Hypothese' },
    { word: 'Student', hint: 'Prüfung' },
    { word: 'Rentner', hint: 'Enkelin' },
    { word: 'Baby', hint: 'Weinen' },
    { word: 'Kind', hint: 'Neugier' },
    { word: 'Teenager', hint: 'Rebellion' },
    { word: 'Erwachsener', hint: 'Entscheidung' },
    { word: 'Mann', hint: 'Krawatte' },
    { word: 'Frau', hint: 'Lippenstift' },
    { word: 'Großvater', hint: 'Geschichten' },
    { word: 'Großmutter', hint: 'Kekse' },
    { word: 'Bruder', hint: 'Rivalität' },
    { word: 'Schwester', hint: 'Klatsch' },
    { word: 'Vater', hint: 'Autorität' },
    { word: 'Mutter', hint: 'Fürsorge' },
    { word: 'Ehemann', hint: 'Kompromiss' },
    { word: 'Ehefrau', hint: 'Geduld' },
    { word: 'Nachbar', hint: 'Lärm' },
    { word: 'Fremder', hint: 'Misstrauen' }
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
        isPrivate,
        password,
        gameState: 'waiting', // waiting, playing, voting_continue, voting_imposter, finished
        currentWord: null,
        imposterHint: null,
        imposterSocketId: null,
        currentRound: 0,
        currentPlayerIndex: 0,
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
    
    const player = {
        id: socketId,
        name: playerName,
        isHost: match.players.length === 0,
        word: null,
        isImposter: false
    };
    
    match.players.push(player);
    if (player.isHost) {
        match.host = socketId;
    }
    
    socketToMatch.set(socketId, matchId);
    socketToPlayer.set(socketId, player);
    
    return true;
}

function removePlayerFromMatch(socketId) {
    const matchId = socketToMatch.get(socketId);
    if (!matchId) return;
    
    const match = matches.get(matchId);
    if (!match) return;
    
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
    match.wordsThisRound = [];
    match.allRounds = []; // Reset all rounds history
    
    // Choose random word and imposter
    const wordObj = wordPool[Math.floor(Math.random() * wordPool.length)];
    match.currentWord = wordObj.word;
    match.imposterHint = wordObj.hint;
    const imposterIndex = Math.floor(Math.random() * match.players.length);
    match.imposterSocketId = match.players[imposterIndex].id;
    
    // Assign words to players
    match.players.forEach((player, index) => {
        if (index === imposterIndex) {
            player.word = `Imposter (Tipp: ${match.imposterHint})`;
            player.isImposter = true;
        } else {
            player.word = match.currentWord;
            player.isImposter = false;
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
    
    match.wordsThisRound.push({
        playerId: socketId,
        playerName: currentPlayer.name,
        word: word
    });
    
    // Move to next player
    match.currentPlayerIndex = (match.currentPlayerIndex + 1) % match.players.length;
    
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
                // Continue to next round
                match.currentRound++;
                match.gameState = 'playing';
                match.wordsThisRound = [];
                match.currentPlayerIndex = Math.floor(Math.random() * match.players.length);
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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
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
        const { playerName, isPrivate, password } = data;
        const match = createMatch(playerName, isPrivate, password);
        addPlayerToMatch(match.id, socket.id, playerName);
        
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
        const { matchId, playerName, password } = data;
        const match = matches.get(matchId);
        
        if (!match) {
            socket.emit('error', { message: 'Match nicht gefunden' });
            return;
        }
        
        if (match.isPrivate && match.password !== password) {
            socket.emit('error', { message: 'Falsches Passwort' });
            return;
        }
        
        if (match.gameState !== 'waiting') {
            socket.emit('error', { message: 'Spiel bereits gestartet' });
            return;
        }
        
        if (!addPlayerToMatch(matchId, socket.id, playerName)) {
            socket.emit('error', { message: 'Match ist voll oder Fehler beim Beitreten' });
            return;
        }
        
        socket.join(matchId);
        socket.emit('match_joined', { matchId });
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
                round: match.currentRound
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
        
        if (result.imposterWon) {
            const match = matches.get(matchId);
            io.to(matchId).emit('game_finished', {
                imposterWon: true,
                imposter: match.players.find(p => p.id === match.imposterSocketId).name,
                word: match.currentWord
            });
        } else if (result.success) {
            const match = matches.get(matchId);
            io.to(matchId).emit('word_submitted', {
                words: match.wordsThisRound,
                allRounds: match.allRounds,
                gameState: match.gameState,
                currentPlayer: match.gameState === 'playing' ? match.players[match.currentPlayerIndex].name : null,
                round: match.currentRound
            });
        }
    });
    
    socket.on('submit_vote', (data) => {
        const { voteType, targetPlayerId } = data;
        const matchId = socketToMatch.get(socket.id);
        const result = submitVote(matchId, socket.id, voteType, targetPlayerId);
        
        if (result.imposterFound !== undefined) {
            const match = matches.get(matchId);
            io.to(matchId).emit('game_finished', {
                imposterWon: result.imposterWon,
                imposter: match.players.find(p => p.id === match.imposterSocketId).name,
                word: match.currentWord
            });
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
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const matchId = socketToMatch.get(socket.id);
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
