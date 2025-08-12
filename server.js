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
