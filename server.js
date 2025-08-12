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
    { word: 'Katze', hint: 'Neun Leben' },
    { word: 'Auto', hint: 'Benzinpreis' },
    { word: 'Baum', hint: 'Ringe zählen' },
    { word: 'Strand', hint: 'Muscheln sammeln' },
    { word: 'Buch', hint: 'Eselsohren' },
    { word: 'Kaffee', hint: 'Bohnenland' },
    { word: 'Musik', hint: 'Sieben Noten' },
    { word: 'Schule', hint: 'Pausenhof' },
    { word: 'Computer', hint: 'Binärcode' },
    { word: 'Telefon', hint: 'Klingelton' },
    { word: 'Sonne', hint: 'Vitamin D' },
    { word: 'Regen', hint: 'Tropfenform' },
    { word: 'Haus', hint: 'Dachziegel' },
    { word: 'Garten', hint: 'Gnome' },
    { word: 'Film', hint: '24 Frames' },
    { word: 'Sport', hint: 'Fairplay' },
    { word: 'Urlaub', hint: 'Souvenirs' },
    { word: 'Familie', hint: 'Stammbaum' },
    { word: 'Freunde', hint: 'Vertrauen' },
    { word: 'Arbeit', hint: 'Montag Blues' },
    { word: 'Spiel', hint: 'Regelheft' },
    { word: 'Essen', hint: 'Tischmanieren' },
    { word: 'Trinken', hint: 'Durstlöscher' },
    { word: 'Schlaf', hint: 'Traumfänger' },
    { word: 'Zeit', hint: 'Ticktack' },
    { word: 'Geld', hint: 'Papierscheine' },
    { word: 'Liebe', hint: 'Pfeil und Bogen' },
    { word: 'Glück', hint: 'Zahl Dreizehn' },
    { word: 'Traum', hint: 'Sandmann' },
    { word: 'Farbe', hint: 'Regenbogen' },
    { word: 'Licht', hint: 'Geschwindigkeit' },
    { word: 'Dunkel', hint: 'Mondschein' },
    { word: 'Warm', hint: 'Kuschelzeit' },
    { word: 'Kalt', hint: 'Atem sichtbar' },
    { word: 'Groß', hint: 'Perspektive' },
    { word: 'Klein', hint: 'Ameisenwelt' },
    { word: 'Schnell', hint: 'Zeitreise' },
    { word: 'Langsam', hint: 'Zeitlupe' },
    { word: 'Hoch', hint: 'Bergspitze' },
    { word: 'Tief', hint: 'Meeresgrund' },
    { word: 'Neu', hint: 'Erstausgabe' },
    { word: 'Alt', hint: 'Antiquität' },
    { word: 'Gut', hint: 'Daumen hoch' },
    { word: 'Schlecht', hint: 'Daumen runter' },
    { word: 'Fenster', hint: 'Glasscheibe' },
    { word: 'Tür', hint: 'Klinkenputzer' },
    { word: 'Stuhl', hint: 'Vier Beine' },
    { word: 'Tisch', hint: 'Tischdecke' },
    { word: 'Bett', hint: 'Kopfkissen' },
    { word: 'Küche', hint: 'Küchengeruch' },
    { word: 'Bad', hint: 'Spiegel beschlagen' },
    { word: 'Wasser', hint: 'H2O' },
    { word: 'Feuer', hint: 'Prometheus' },
    { word: 'Luft', hint: 'Sauerstoff' },
    { word: 'Erde', hint: 'Blauer Planet' },
    { word: 'Himmel', hint: 'Wolkenkratzer' },
    { word: 'Stern', hint: 'Lichtjahre' },
    { word: 'Mond', hint: 'Neil Armstrong' },
    { word: 'Blume', hint: 'Bienenstich' },
    { word: 'Gras', hint: 'Rasensprenger' },
    { word: 'Vogel', hint: 'Federleicht' },
    { word: 'Fisch', hint: 'Wasser atmen' },
    { word: 'Hund', hint: 'Bester Freund' },
    { word: 'Maus', hint: 'Computertier' },
    { word: 'Pferd', hint: 'Trojanisch' },
    { word: 'Kuh', hint: 'Milchstraße' },
    { word: 'Schwein', hint: 'Sparschwein' },
    { word: 'Huhn', hint: 'Oder Ei zuerst' },
    { word: 'Apfel', hint: 'Newton' },
    { word: 'Banane', hint: 'Kalium' },
    { word: 'Orange', hint: 'Farbname' },
    { word: 'Brot', hint: 'Täglich geben' },
    { word: 'Käse', hint: 'Löcher haben' },
    { word: 'Milch', hint: 'Weiße Flüssigkeit' },
    { word: 'Zucker', hint: 'Süße Würfel' },
    { word: 'Salz', hint: 'Weißes Gold' },
    { word: 'Pfeffer', hint: 'Niesreiz' },
    { word: 'Schokolade', hint: 'Azteken' },
    { word: 'Kuchen', hint: 'Geburtstag' },
    { word: 'Eis', hint: 'Titanic Problem' },
    { word: 'Tee', hint: 'Boston Party' },
    { word: 'Wein', hint: 'Trauben Destiny' },
    { word: 'Bier', hint: 'Oktoberfest' },
    { word: 'Brille', hint: 'Klare Sicht' },
    { word: 'Hut', hint: 'Kopfschmuck' },
    { word: 'Schuhe', hint: 'Zwei Stück' },
    { word: 'Hemd', hint: 'Business Look' },
    { word: 'Hose', hint: 'Zwei Beine' },
    { word: 'Jacke', hint: 'Außenhülle' },
    { word: 'Kleid', hint: 'Prinzessin' },
    { word: 'Socken', hint: 'Paar verlieren' },
    { word: 'Uhr', hint: 'Zeit anzeigen' },
    { word: 'Ring', hint: 'Ewigkeit Symbol' },
    { word: 'Kette', hint: 'Verbindung' },
    { word: 'Tasche', hint: 'Tragbare Box' },
    { word: 'Koffer', hint: 'Reise Begleiter' },
    { word: 'Regenschirm', hint: 'Wetter Schutz' },
    { word: 'Schlüssel', hint: 'Zugang gewähren' },
    { word: 'Handy', hint: 'Pocket Computer' },
    { word: 'Radio', hint: 'Frequenz wählen' },
    { word: 'Fernseher', hint: 'Couch Partner' },
    { word: 'Lampe', hint: 'Edison Erfindung' },
    { word: 'Kerze', hint: 'Wind Problem' },
    { word: 'Spiegel', hint: 'Schneewittchen' },
    { word: 'Kamera', hint: '1000 Worte' },
    { word: 'Fahrrad', hint: 'Zwei Räder' },
    { word: 'Motorrad', hint: 'Harley Davidson' },
    { word: 'Bus', hint: 'Öffentlich fahren' },
    { word: 'Zug', hint: 'Schiene folgen' },
    { word: 'Flugzeug', hint: 'Wright Brothers' },
    { word: 'Schiff', hint: 'Titanic Typ' },
    { word: 'Brücke', hint: 'Verbindung schaffen' },
    { word: 'Straße', hint: 'Asphalt Weg' },
    { word: 'Park', hint: 'Grüne Oase' },
    { word: 'See', hint: 'Stehend Wasser' },
    { word: 'Fluss', hint: 'Fließend Wasser' },
    { word: 'Berg', hint: 'Höchster Punkt' },
    { word: 'Tal', hint: 'Tiefster Punkt' },
    { word: 'Wald', hint: 'Baum Sammlung' },
    { word: 'Wiese', hint: 'Gras Teppich' },
    { word: 'Schnee', hint: 'Weiße Flocken' },
    { word: 'Gewitter', hint: 'Zeus Zorn' },
    { word: 'Wind', hint: 'Unsichtbare Kraft' },
    { word: 'Nebel', hint: 'Grauer Schleier' },
    { word: 'Frost', hint: 'Morgen Kristalle' },
    { word: 'Hitze', hint: 'Wüsten Gefühl' },
    { word: 'Kälte', hint: 'Arktis Gefühl' },
    { word: 'Frühling', hint: 'Erste Jahreszeit' },
    { word: 'Sommer', hint: 'Heiße Jahreszeit' },
    { word: 'Herbst', hint: 'Bunte Jahreszeit' },
    { word: 'Winter', hint: 'Kalte Jahreszeit' },
    { word: 'Morgen', hint: 'Tag Beginn' },
    { word: 'Mittag', hint: 'Tag Mitte' },
    { word: 'Abend', hint: 'Tag Ende' },
    { word: 'Nacht', hint: 'Dunkel Zeit' },
    { word: 'Montag', hint: 'Woche Start' },
    { word: 'Freitag', hint: 'TGIF Tag' },
    { word: 'Samstag', hint: 'Weekend Start' },
    { word: 'Sonntag', hint: 'Ruhe Tag' },
    { word: 'Januar', hint: 'Neuer Anfang' },
    { word: 'Dezember', hint: 'Jahr Ende' },
    { word: 'Geburtstag', hint: 'Einmal jährlich' },
    { word: 'Hochzeit', hint: 'Weißes Kleid' },
    { word: 'Weihnachten', hint: 'Dezember Fest' },
    { word: 'Ostern', hint: 'Buntes Ei' },
    { word: 'Urlaub', hint: 'Auszeit nehmen' },
    { word: 'Ferien', hint: 'Schule frei' },
    { word: 'Party', hint: 'Laute Feier' },
    { word: 'Konzert', hint: 'Live Musik' },
    { word: 'Theater', hint: 'Bühne Show' },
    { word: 'Museum', hint: 'Alte Sachen' },
    { word: 'Bibliothek', hint: 'Leise Zone' },
    { word: 'Krankenhaus', hint: 'Weiße Kittel' },
    { word: 'Apotheke', hint: 'Medizin kaufen' },
    { word: 'Supermarkt', hint: 'Einkaufs Center' },
    { word: 'Restaurant', hint: 'Essen gehen' },
    { word: 'Café', hint: 'Kaffee trinken' },
    { word: 'Hotel', hint: 'Übernachten' },
    { word: 'Bank', hint: 'Geld aufbewahren' },
    { word: 'Post', hint: 'Brief senden' },
    { word: 'Polizei', hint: 'Gesetz hüten' },
    { word: 'Feuerwehr', hint: 'Rot Fahrzeug' },
    { word: 'Zahnarzt', hint: 'Zahn Doktor' },
    { word: 'Friseur', hint: 'Haar schneiden' },
    { word: 'Bäcker', hint: 'Früh aufstehen' },
    { word: 'Metzger', hint: 'Fleisch verkaufen' },
    { word: 'Lehrer', hint: 'Wissen vermitteln' },
    { word: 'Arzt', hint: 'Gesund machen' },
    { word: 'Pilot', hint: 'Himmel fahren' },
    { word: 'Koch', hint: 'Essen zubereiten' },
    { word: 'Mechaniker', hint: 'Motor reparieren' },
    { word: 'Gärtner', hint: 'Pflanzen pflegen' },
    { word: 'Maler', hint: 'Wand streichen' },
    { word: 'Musiker', hint: 'Töne erzeugen' },
    { word: 'Schreiber', hint: 'Worte schreiben' },
    { word: 'Läufer', hint: 'Schnell gehen' },
    { word: 'Schwimmer', hint: 'Wasser Sport' },
    { word: 'Tänzer', hint: 'Rhythmus folgen' },
    { word: 'Sänger', hint: 'Melodie machen' },
    { word: 'Schauspieler', hint: 'Rolle spielen' },
    { word: 'Künstler', hint: 'Kreativ sein' },
    { word: 'Wissenschaftler', hint: 'Forschen immer' },
    { word: 'Student', hint: 'Lernen müssen' },
    { word: 'Rentner', hint: 'Nicht arbeiten' },
    { word: 'Baby', hint: 'Ganz klein' },
    { word: 'Kind', hint: 'Noch wachsen' },
    { word: 'Teenager', hint: 'Pubertät haben' },
    { word: 'Erwachsener', hint: 'Vollständig entwickelt' },
    { word: 'Mann', hint: 'XY Chromosom' },
    { word: 'Frau', hint: 'XX Chromosom' },
    { word: 'Großvater', hint: 'Väter Vater' },
    { word: 'Großmutter', hint: 'Mütter Mutter' },
    { word: 'Bruder', hint: 'Gleiche Eltern' },
    { word: 'Schwester', hint: 'Gleiche Eltern' },
    { word: 'Vater', hint: 'Papa sein' },
    { word: 'Mutter', hint: 'Mama sein' },
    { word: 'Ehemann', hint: 'Ring tragen' },
    { word: 'Ehefrau', hint: 'Ring tragen' },
    { word: 'Nachbar', hint: 'Nebenan wohnen' },
    { word: 'Fremder', hint: 'Unbekannt bleiben' }
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
