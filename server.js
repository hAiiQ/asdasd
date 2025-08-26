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
        vip: false, // VIP status
        avatar: {
            type: 'standard', // 'standard', 'männlich', 'weiblich'
            id: 0, // 0 for standard, 1-20 for gender-specific
            frame: 0 // 0 for no frame, 1-7 for frames, 'rainbow' for VIP rainbow
        },
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
    
    // Ensure user has avatar data (for existing users)
    if (!users[lowerUsername].avatar) {
        users[lowerUsername].avatar = { type: 'standard', id: 0, frame: 0 };
        saveUsers(); // Save the updated user data
    }
    
    // Ensure user has VIP status (for existing users)
    if (users[lowerUsername].vip === undefined) {
        users[lowerUsername].vip = false;
        saveUsers(); // Save the updated user data
    }
    
    res.json({ 
        success: true, 
        message: 'Login erfolgreich!',
        user: {
            username: users[lowerUsername].username,
            vip: users[lowerUsername].vip || false,
            avatar: users[lowerUsername].avatar || { type: 'standard', id: 0, frame: 0 },
            stats: users[lowerUsername].stats
        }
    });
});

// Avatar update endpoint
app.post('/api/update-avatar', (req, res) => {
    const { username, avatar } = req.body;
    const lowerUsername = username.toLowerCase();
    
    if (!users[lowerUsername]) {
        return res.json({ success: false, message: 'Benutzer nicht gefunden.' });
    }
    
    // Validate avatar data
    if (!avatar || typeof avatar !== 'object') {
        return res.json({ success: false, message: 'Ungültige Avatar-Daten.' });
    }
    
    const { type, id, frame } = avatar;
    
    // Validate avatar type
    if (!['standard', 'männlich', 'weiblich'].includes(type)) {
        return res.json({ success: false, message: 'Ungültiger Avatar-Typ.' });
    }
    
    // Validate avatar ID
    if (type === 'standard' && id !== 0) {
        return res.json({ success: false, message: 'Standard-Avatar muss ID 0 haben.' });
    }
    if ((type === 'männlich' || type === 'weiblich') && (id < 1 || id > 20)) {
        return res.json({ success: false, message: 'Avatar-ID muss zwischen 1 und 20 sein.' });
    }
    
    // Validate frame ID
    if (frame === 'rainbow') {
        // Rainbow frame is only for VIP users
        if (!users[lowerUsername].vip) {
            return res.json({ success: false, message: 'Rainbow-Rahmen ist nur für VIP-Benutzer verfügbar.' });
        }
    } else if (frame < 0 || frame > 7) {
        return res.json({ success: false, message: 'Rahmen-ID muss zwischen 0 und 7 sein oder "rainbow" für VIPs.' });
    }
    
    // Update avatar
    users[lowerUsername].avatar = { type, id, frame };
    
    try {
        saveUsers();
        res.json({ 
            success: true, 
            message: 'Avatar erfolgreich aktualisiert!',
            avatar: users[lowerUsername].avatar
        });
    } catch (error) {
        res.json({ success: false, message: 'Fehler beim Speichern des Avatars.' });
    }
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
    { 
        word: 'Pizza', 
        hintB: 'Stiefel',     // kreativer Tipp für das Wort (Italien)
        hintA: 'Form'         // Tipp für Tipp B
    },
    { 
        word: 'Hund', 
        hintB: 'Freund',
        hintA: 'Beziehung'
    },
    { 
        word: 'Auto', 
        hintB: 'Benzin',
        hintA: 'Kraftstoff'
    },
    { 
        word: 'Schule', 
        hintB: 'Alphabet',
        hintA: 'Buchstaben'
    },
    { 
        word: 'Meer', 
        hintB: 'Salz',
        hintA: 'Geschmack'
    },
    { 
        word: 'Buch', 
        hintB: 'Papier',
        hintA: 'Material'
    },
    { 
        word: 'Kaffee', 
        hintB: 'Wachmacher',
        hintA: 'Wirkung'
    },
    { 
        word: 'Baum', 
        hintB: 'Ringe',
        hintA: 'Kreise'
    },
    { 
        word: 'Handy', 
        hintB: 'Digital',
        hintA: 'Technologie'
    },
    { 
        word: 'Musik', 
        hintB: 'Töne',
        hintA: 'Klang'
    },
    { 
        word: 'Sonne', 
        hintB: 'Gelb',
        hintA: 'Farbe'
    },
    { 
        word: 'Haus', 
        hintB: 'Dach',
        hintA: 'Oben'
    },
    { 
        word: 'Wasser', 
        hintB: 'Durchsichtig',
        hintA: 'Sichtbar'
    },
    { 
        word: 'Brot', 
        hintB: 'Backofen',
        hintA: 'Hitze'
    },
    { 
        word: 'Zeit', 
        hintB: 'Uhr',
        hintA: 'Zeiger'
    },
    { 
        word: 'Fahrrad', 
        hintB: 'Kette',
        hintA: 'Verbindung'
    },
    { 
        word: 'Telefon', 
        hintB: 'Klingeln',
        hintA: 'Geräusch'
    },
    { 
        word: 'Computer', 
        hintB: 'Maus',
        hintA: 'Tier'
    },
    { 
        word: 'Küche', 
        hintB: 'Herd',
        hintA: 'Kochen'
    },
    { 
        word: 'Schuhe', 
        hintB: 'Schnürsenkel',
        hintA: 'Binden'
    },
    { 
        word: 'Berg', 
        hintB: 'Gipfel',
        hintA: 'Spitze'
    },
    { 
        word: 'Regen', 
        hintB: 'Tropfen',
        hintA: 'Fallen'
    },
    { 
        word: 'Feuer', 
        hintB: 'Rauch',
        hintA: 'Grau'
    },
    { 
        word: 'Katze', 
        hintB: 'Miau',
        hintA: 'Laut'
    },
    { 
        word: 'Vogel', 
        hintB: 'Fliegen',
        hintA: 'Luft'
    },
    { 
        word: 'Blume', 
        hintB: 'Duft',
        hintA: 'Riechen'
    },
    { 
        word: 'Strand', 
        hintB: 'Sand',
        hintA: 'Körner'
    },
    { 
        word: 'Fenster', 
        hintB: 'Glas',
        hintA: 'Durchsichtig'
    },
    { 
        word: 'Stuhl', 
        hintB: 'Sitzen',
        hintA: 'Position'
    },
    { 
        word: 'Tisch', 
        hintB: 'Beine',
        hintA: 'Stützen'
    },
    { 
        word: 'Lampe', 
        hintB: 'Schatten',
        hintA: 'Dunkel'
    },
    { 
        word: 'Brille', 
        hintB: 'Sehen',
        hintA: 'Augen'
    },
    { 
        word: 'Uhr', 
        hintB: 'Ticken',
        hintA: 'Rhythmus'
    },
    { 
        word: 'Schlüssel', 
        hintB: 'Öffnen',
        hintA: 'Zugang'
    },
    { 
        word: 'Tür', 
        hintB: 'Schwelle',
        hintA: 'Grenze'
    },
    { 
        word: 'Bett', 
        hintB: 'Träume',
        hintA: 'Nacht'
    },
    { 
        word: 'Kühlschrank', 
        hintB: 'Kalt',
        hintA: 'Temperatur'
    },
    { 
        word: 'Spiegel', 
        hintB: 'Reflexion',
        hintA: 'Zurück'
    },
    { 
        word: 'Gitarre', 
        hintB: 'Saiten',
        hintA: 'Schnüre'
    },
    { 
        word: 'Ball', 
        hintB: 'Rund',
        hintA: 'Form'
    },
    { 
        word: 'Zug', 
        hintB: 'Schienen',
        hintA: 'Metall'
    },
    { 
        word: 'Flugzeug', 
        hintB: 'Wolken',
        hintA: 'Himmel'
    },
    { 
        word: 'Schiff', 
        hintB: 'Anker',
        hintA: 'Schwer'
    },
    { 
        word: 'Brücke', 
        hintB: 'Verbinden',
        hintA: 'Zusammen'
    },
    { 
        word: 'Park', 
        hintB: 'Bank',
        hintA: 'Sitzen'
    },
    { 
        word: 'Kino', 
        hintB: 'Popcorn',
        hintA: 'Snack'
    },
    { 
        word: 'Restaurant', 
        hintB: 'Kellner',
        hintA: 'Service'
    },
    { 
        word: 'Hotel', 
        hintB: 'Übernachten',
        hintA: 'Schlafen'
    },
    { 
        word: 'Supermarkt', 
        hintB: 'Einkaufswagen',
        hintA: 'Räder'
    },
    { 
        word: 'Bank', 
        hintB: 'Geld',
        hintA: 'Wert'
    },
    { 
        word: 'Polizei', 
        hintB: 'Uniform',
        hintA: 'Kleidung'
    },
    { 
        word: 'Arzt', 
        hintB: 'Stethoskop',
        hintA: 'Hören'
    },
    { 
        word: 'Lehrer', 
        hintB: 'Tafel',
        hintA: 'Schreibfläche'
    },
    { 
        word: 'Bäcker', 
        hintB: 'Mehl',
        hintA: 'Pulver'
    },
    { 
        word: 'Friseur', 
        hintB: 'Schere',
        hintA: 'Schneiden'
    },
    { 
        word: 'Zahnarzt', 
        hintB: 'Bohren',
        hintA: 'Löcher'
    },
    { 
        word: 'Pilot', 
        hintB: 'Cockpit',
        hintA: 'Steuerung'
    },
    { 
        word: 'Koch', 
        hintB: 'Pfanne',
        hintA: 'Rund'
    },
    { 
        word: 'Mechaniker', 
        hintB: 'Schraubenschlüssel',
        hintA: 'Werkzeug'
    },
    { 
        word: 'Maler', 
        hintB: 'Pinsel',
        hintA: 'Haare'
    },
    { 
        word: 'Gärtner', 
        hintB: 'Erde',
        hintA: 'Boden'
    },
    { 
        word: 'Elektriker', 
        hintB: 'Strom',
        hintA: 'Energie'
    },
    { 
        word: 'Apfel', 
        hintB: 'Kerngehäuse',
        hintA: 'Mitte'
    },
    { 
        word: 'Banane', 
        hintB: 'Schale',
        hintA: 'Hülle'
    },
    { 
        word: 'Orange', 
        hintB: 'Vitamin',
        hintA: 'Gesundheit'
    },
    { 
        word: 'Erdbeere', 
        hintB: 'Samen',
        hintA: 'Außen'
    },
    { 
        word: 'Tomate', 
        hintB: 'Gemüse',
        hintA: 'Kategorie'
    },
    { 
        word: 'Karotte', 
        hintB: 'Wurzel',
        hintA: 'Unter'
    },
    { 
        word: 'Kartoffel', 
        hintB: 'Knolle',
        hintA: 'Rund'
    },
    { 
        word: 'Zwiebel', 
        hintB: 'Tränen',
        hintA: 'Weinen'
    },
    { 
        word: 'Knoblauch', 
        hintB: 'Geruch',
        hintA: 'Nase'
    },
    { 
        word: 'Salat', 
        hintB: 'Blätter',
        hintA: 'Grün'
    },
    { 
        word: 'Reis', 
        hintB: 'Körner',
        hintA: 'Klein'
    },
    { 
        word: 'Nudeln', 
        hintB: 'Italien',
        hintA: 'Land'
    },
    { 
        word: 'Fleisch', 
        hintB: 'Protein',
        hintA: 'Muskel'
    },
    { 
        word: 'Fisch', 
        hintB: 'Schuppen',
        hintA: 'Haut'
    },
    { 
        word: 'Ei', 
        hintB: 'Schale',
        hintA: 'Hart'
    },
    { 
        word: 'Milch', 
        hintB: 'Weiß',
        hintA: 'Farbe'
    },
    { 
        word: 'Käse', 
        hintB: 'Löcher',
        hintA: 'Öffnungen'
    },
    { 
        word: 'Butter', 
        hintB: 'Gelb',
        hintA: 'Farbe'
    },
    { 
        word: 'Honig', 
        hintB: 'Bienen',
        hintA: 'Insekten'
    },
    { 
        word: 'Zucker', 
        hintB: 'Süß',
        hintA: 'Geschmack'
    },
    { 
        word: 'Salz', 
        hintB: 'Kristalle',
        hintA: 'Struktur'
    },
    { 
        word: 'Pfeffer', 
        hintB: 'Scharf',
        hintA: 'Intensiv'
    },
    { 
        word: 'Tee', 
        hintB: 'Blätter',
        hintA: 'Pflanzen'
    },
    { 
        word: 'Schokolade', 
        hintB: 'Kakao',
        hintA: 'Bohne'
    },
    { 
        word: 'Eis', 
        hintB: 'Kugel',
        hintA: 'Rund'
    },
    { 
        word: 'Kuchen', 
        hintB: 'Kerzen',
        hintA: 'Licht'
    },
    { 
        word: 'Torte', 
        hintB: 'Schichten',
        hintA: 'Ebenen'
    },
    { 
        word: 'Keks', 
        hintB: 'Krümel',
        hintA: 'Stücke'
    },
    { 
        word: 'Bonbon', 
        hintB: 'Lutschen',
        hintA: 'Zunge'
    },
    { 
        word: 'Gummibärchen', 
        hintB: 'Weich',
        hintA: 'Textur'
    },
    { 
        word: 'Limonade', 
        hintB: 'Sprudel',
        hintA: 'Blasen'
    },
    { 
        word: 'Saft', 
        hintB: 'Frucht',
        hintA: 'Ursprung'
    },
    { 
        word: 'Wein', 
        hintB: 'Trauben',
        hintA: 'Cluster'
    },
    { 
        word: 'Bier', 
        hintB: 'Schaum',
        hintA: 'Oben'
    },
    { 
        word: 'Schwimmbad', 
        hintB: 'Chlor',
        hintA: 'Geruch'
    },
    { 
        word: 'Bibliothek', 
        hintB: 'Leise',
        hintA: 'Stille'
    },
    { 
        word: 'Krankenhaus', 
        hintB: 'Weiß',
        hintA: 'Farbe'
    },
    { 
        word: 'Flughafen', 
        hintB: 'Terminal',
        hintA: 'Ende'
    },
    { 
        word: 'Bahnhof', 
        hintB: 'Gleis',
        hintA: 'Spur'
    },
    { 
        word: 'Tankstelle', 
        hintB: 'Zapfsäule',
        hintA: 'Säule'
    },
    { 
        word: 'Friedhof', 
        hintB: 'Grabstein',
        hintA: 'Stein'
    },
    { 
        word: 'Spielplatz', 
        hintB: 'Schaukel',
        hintA: 'Bewegung'
    },
    { 
        word: 'Zoo', 
        hintB: 'Käfig',
        hintA: 'Gitter'
    },
    { 
        word: 'Museum', 
        hintB: 'Ausstellung',
        hintA: 'Zeigen'
    },
    { 
        word: 'Theater', 
        hintB: 'Bühne',
        hintA: 'Plattform'
    },
    { 
        word: 'Konzert', 
        hintB: 'Applaus',
        hintA: 'Klatschen'
    },
    { 
        word: 'Hochzeit', 
        hintB: 'Ringe',
        hintA: 'Kreise'
    },
    { 
        word: 'Geburtstag', 
        hintB: 'Kerzen',
        hintA: 'Licht'
    },
    { 
        word: 'Weihnachten', 
        hintB: 'Tannenbaum',
        hintA: 'Nadeln'
    },
    { 
        word: 'Ostern', 
        hintB: 'Ei',
        hintA: 'Oval'
    },
    { 
        word: 'Halloween', 
        hintB: 'Kürbis',
        hintA: 'Orange'
    },
    { 
        word: 'Silvester', 
        hintB: 'Feuerwerk',
        hintA: 'Explosionen'
    },
    { 
        word: 'Karneval', 
        hintB: 'Kostüm',
        hintA: 'Verkleidung'
    },
    { 
        word: 'Urlaub', 
        hintB: 'Koffer',
        hintA: 'Packen'
    },
    { 
        word: 'Strand', 
        hintB: 'Muscheln',
        hintA: 'Sammeln'
    },
    { 
        word: 'Berge', 
        hintB: 'Wandern',
        hintA: 'Gehen'
    },
    { 
        word: 'See', 
        hintB: 'Rudern',
        hintA: 'Boot'
    },
    { 
        word: 'Wald', 
        hintB: 'Pilze',
        hintA: 'Sammeln'
    },
    { 
        word: 'Wiese', 
        hintB: 'Gras',
        hintA: 'Grün'
    },
    { 
        word: 'Garten', 
        hintB: 'Blumenbeete',
        hintA: 'Ordnung'
    },
    { 
        word: 'Balkon', 
        hintB: 'Geländer',
        hintA: 'Schutz'
    },
    { 
        word: 'Keller', 
        hintB: 'Dunkel',
        hintA: 'Licht'
    },
    { 
        word: 'Dachboden', 
        hintB: 'Staub',
        hintA: 'Alt'
    },
    { 
        word: 'Garage', 
        hintB: 'Tor',
        hintA: 'Öffnung'
    },
    { 
        word: 'Badezimmer', 
        hintB: 'Dusche',
        hintA: 'Wasser'
    },
    { 
        word: 'Wohnzimmer', 
        hintB: 'Sofa',
        hintA: 'Sitzen'
    },
    { 
        word: 'Schlafzimmer', 
        hintB: 'Kissen',
        hintA: 'Weich'
    },
    { 
        word: 'Arbeitszimmer', 
        hintB: 'Schreibtisch',
        hintA: 'Arbeiten'
    },
    { 
        word: 'Kleiderschrank', 
        hintB: 'Bügel',
        hintA: 'Hängen'
    },
    { 
        word: 'Waschmaschine', 
        hintB: 'Schleudern',
        hintA: 'Drehen'
    },
    { 
        word: 'Geschirrspüler', 
        hintB: 'Tabs',
        hintA: 'Tabletten'
    },
    { 
        word: 'Mikrowelle', 
        hintB: 'Strahlen',
        hintA: 'Unsichtbar'
    },
    { 
        word: 'Ofen', 
        hintB: 'Backen',
        hintA: 'Hitze'
    },
    { 
        word: 'Toaster', 
        hintB: 'Krümel',
        hintA: 'Reste'
    },
    { 
        word: 'Kaffeemaschine', 
        hintB: 'Filter',
        hintA: 'Durchlassen'
    },
    { 
        word: 'Wasserkocher', 
        hintB: 'Dampf',
        hintA: 'Heiß'
    },
    { 
        word: 'Staubsauger', 
        hintB: 'Beutel',
        hintA: 'Sammeln'
    },
    { 
        word: 'Bügeleisen', 
        hintB: 'Falten',
        hintA: 'Glätten'
    },
    { 
        word: 'Fernseher', 
        hintB: 'Fernbedienung',
        hintA: 'Kontrolle'
    },
    { 
        word: 'Radio', 
        hintB: 'Wellen',
        hintA: 'Frequenz'
    },
    { 
        word: 'Kopfhörer', 
        hintB: 'Ohren',
        hintA: 'Hören'
    },
    { 
        word: 'Lautsprecher', 
        hintB: 'Bass',
        hintA: 'Tief'
    },
    { 
        word: 'Kamera', 
        hintB: 'Objektiv',
        hintA: 'Linse'
    },
    { 
        word: 'Handy', 
        hintB: 'Akku',
        hintA: 'Energie'
    },
    { 
        word: 'Laptop', 
        hintB: 'Tastatur',
        hintA: 'Tippen'
    },
    { 
        word: 'Tablet', 
        hintB: 'Touch',
        hintA: 'Berühren'
    },
    { 
        word: 'Drucker', 
        hintB: 'Tinte',
        hintA: 'Flüssigkeit'
    },
    { 
        word: 'Scanner', 
        hintB: 'Licht',
        hintA: 'Hell'
    },
    { 
        word: 'Router', 
        hintB: 'WLAN',
        hintA: 'Drahtlos'
    },
    { 
        word: 'Festplatte', 
        hintB: 'Speicher',
        hintA: 'Behalten'
    },
    { 
        word: 'USB', 
        hintB: 'Stick',
        hintA: 'Stecken'
    },
    { 
        word: 'Maus', 
        hintB: 'Klick',
        hintA: 'Geräusch'
    },
    { 
        word: 'Tastatur', 
        hintB: 'QWERTZ',
        hintA: 'Reihenfolge'
    },
    { 
        word: 'Monitor', 
        hintB: 'Pixel',
        hintA: 'Punkte'
    },
    { 
        word: 'Ventilator', 
        hintB: 'Rotation',
        hintA: 'Drehen'
    },
    { 
        word: 'Heizung', 
        hintB: 'Thermostat',
        hintA: 'Regler'
    },
    { 
        word: 'Klimaanlage', 
        hintB: 'Kühlen',
        hintA: 'Kalt'
    },
    { 
        word: 'Rolladen', 
        hintB: 'Lamellen',
        hintA: 'Streifen'
    },
    { 
        word: 'Vorhang', 
        hintB: 'Stoff',
        hintA: 'Material'
    },
    { 
        word: 'Teppich', 
        hintB: 'Fasern',
        hintA: 'Fäden'
    },
    { 
        word: 'Fliesen', 
        hintB: 'Fugenmasse',
        hintA: 'Zwischen'
    },
    { 
        word: 'Parkett', 
        hintB: 'Holz',
        hintA: 'Baum'
    },
    { 
        word: 'Tapete', 
        hintB: 'Muster',
        hintA: 'Wiederholung'
    },
    { 
        word: 'Farbe', 
        hintB: 'Pinsel',
        hintA: 'Werkzeug'
    },
    { 
        word: 'Hammer', 
        hintB: 'Nagel',
        hintA: 'Spitz'
    },
    { 
        word: 'Schraubenzieher', 
        hintB: 'Kreuz',
        hintA: 'Plus'
    },
    { 
        word: 'Säge', 
        hintB: 'Zähne',
        hintA: 'Beißen'
    },
    { 
        word: 'Bohrmaschine', 
        hintB: 'Loch',
        hintA: 'Öffnung'
    },
    { 
        word: 'Leiter', 
        hintB: 'Sprossen',
        hintA: 'Stufen'
    },
    { 
        word: 'Eimer', 
        hintB: 'Henkel',
        hintA: 'Griff'
    },
    { 
        word: 'Besen', 
        hintB: 'Kehren',
        hintA: 'Sauber'
    },
    { 
        word: 'Wischmop', 
        hintB: 'Feucht',
        hintA: 'Nass'
    },
    { 
        word: 'Schwamm', 
        hintB: 'Poren',
        hintA: 'Löcher'
    },
    { 
        word: 'Seife', 
        hintB: 'Schaum',
        hintA: 'Blasen'
    },
    { 
        word: 'Handtuch', 
        hintB: 'Trocknen',
        hintA: 'Entfernen'
    },
    { 
        word: 'Zahnbürste', 
        hintB: 'Borsten',
        hintA: 'Steif'
    },
    { 
        word: 'Zahnpasta', 
        hintB: 'Tube',
        hintA: 'Drücken'
    },
    { 
        word: 'Shampoo', 
        hintB: 'Haare',
        hintA: 'Kopf'
    },
    { 
        word: 'Duschgel', 
        hintB: 'Gel',
        hintA: 'Konsistenz'
    },
    { 
        word: 'Parfüm', 
        hintB: 'Sprühen',
        hintA: 'Nebel'
    },
    { 
        word: 'Makeup', 
        hintB: 'Schminken',
        hintA: 'Verändern'
    },
    { 
        word: 'Lippenstift', 
        hintB: 'Rot',
        hintA: 'Farbe'
    },
    { 
        word: 'Nagellack', 
        hintB: 'Glänzend',
        hintA: 'Spiegeln'
    },
    { 
        word: 'Kamm', 
        hintB: 'Zähne',
        hintA: 'Reihe'
    },
    { 
        word: 'Bürste', 
        hintB: 'Entwirren',
        hintA: 'Ordnen'
    },
    { 
        word: 'Fön', 
        hintB: 'Luft',
        hintA: 'Wind'
    },
    { 
        word: 'Handschuhe', 
        hintB: 'Finger',
        hintA: 'Fünf'
    },
    { 
        word: 'Socken', 
        hintB: 'Paar',
        hintA: 'Zwei'
    },
    { 
        word: 'Unterwäsche', 
        hintB: 'Drunter',
        hintA: 'Unter'
    },
    { 
        word: 'T-Shirt', 
        hintB: 'Kurzarm',
        hintA: 'Kurz'
    },
    { 
        word: 'Pullover', 
        hintB: 'Wolle',
        hintA: 'Schaf'
    },
    { 
        word: 'Jacke', 
        hintB: 'Reißverschluss',
        hintA: 'Ziehen'
    },
    { 
        word: 'Hose', 
        hintB: 'Beine',
        hintA: 'Zwei'
    },
    { 
        word: 'Rock', 
        hintB: 'Weiblich',
        hintA: 'Geschlecht'
    },
    { 
        word: 'Kleid', 
        hintB: 'Elegant',
        hintA: 'Schick'
    },
    { 
        word: 'Anzug', 
        hintB: 'Krawatte',
        hintA: 'Binden'
    },
    { 
        word: 'Krawatte', 
        hintB: 'Knoten',
        hintA: 'Verbinden'
    },
    { 
        word: 'Gürtel', 
        hintB: 'Schnalle',
        hintA: 'Metall'
    },
    { 
        word: 'Mütze', 
        hintB: 'Kopf',
        hintA: 'Oben'
    },
    { 
        word: 'Hut', 
        hintB: 'Krempe',
        hintA: 'Rand'
    },
    { 
        word: 'Sonnenbrille', 
        hintB: 'UV',
        hintA: 'Schutz'
    },
    { 
        word: 'Regenschirm', 
        hintB: 'Speichen',
        hintA: 'Stäbe'
    },
    { 
        word: 'Rucksack', 
        hintB: 'Schultern',
        hintA: 'Tragen'
    },
    { 
        word: 'Handtasche', 
        hintB: 'Griff',
        hintA: 'Halten'
    },
    { 
        word: 'Geldbörse', 
        hintB: 'Münzen',
        hintA: 'Rund'
    },
    { 
        word: 'Sportschuhe', 
        hintB: 'Laufen',
        hintA: 'Schnell'
    },
    { 
        word: 'Sandalen', 
        hintB: 'Sommer',
        hintA: 'Heiß'
    },
    { 
        word: 'Stiefel', 
        hintB: 'Hoch',
        hintA: 'Oben'
    },
    { 
        word: 'Diamant', 
        hintB: 'Härte',
        hintA: 'Widerstand'
    },
    { 
        word: 'Mond', 
        hintB: 'Phasen',
        hintA: 'Wandel'
    },
    { 
        word: 'Stern', 
        hintB: 'Funkel',
        hintA: 'Glitzern'
    },
    { 
        word: 'Wolke', 
        hintB: 'Schatten',
        hintA: 'Dunkel'
    },
    { 
        word: 'Blitz', 
        hintB: 'Donner',
        hintA: 'Krach'
    },
    { 
        word: 'Schnee', 
        hintB: 'Flocken',
        hintA: 'Einzeln'
    },
    { 
        word: 'Eis', 
        hintB: 'Glatt',
        hintA: 'Rutschig'
    },
    { 
        word: 'Feuer', 
        hintB: 'Wärme',
        hintA: 'Temperatur'
    },
    { 
        word: 'Wind', 
        hintB: 'Bewegung',
        hintA: 'Dynamik'
    },
    { 
        word: 'Schatten', 
        hintB: 'Silhouette',
        hintA: 'Umriss'
    },
    { 
        word: 'Licht', 
        hintB: 'Photonen',
        hintA: 'Teilchen'
    },
    { 
        word: 'Geist', 
        hintB: 'Unsichtbar',
        hintA: 'Verborgen'
    },
    { 
        word: 'Traum', 
        hintB: 'Unterbewusstsein',
        hintA: 'Versteckt'
    },
    { 
        word: 'Gedanke', 
        hintB: 'Idee',
        hintA: 'Konzept'
    },
    { 
        word: 'Gefühl', 
        hintB: 'Emotion',
        hintA: 'Reaktion'
    },
    { 
        word: 'Liebe', 
        hintB: 'Herz',
        hintA: 'Organ'
    },
    { 
        word: 'Freude', 
        hintB: 'Lachen',
        hintA: 'Humor'
    },
    { 
        word: 'Angst', 
        hintB: 'Flucht',
        hintA: 'Weglaufen'
    },
    { 
        word: 'Wut', 
        hintB: 'Rot',
        hintA: 'Farbe'
    },
    { 
        word: 'Trauer', 
        hintB: 'Tränen',
        hintA: 'Feuchtigkeit'
    },
    { 
        word: 'Hoffnung', 
        hintB: 'Zukunft',
        hintA: 'Morgen'
    },
    { 
        word: 'Glaube', 
        hintB: 'Vertrauen',
        hintA: 'Sicherheit'
    },
    { 
        word: 'Zweifel', 
        hintB: 'Unsicherheit',
        hintA: 'Wackelig'
    },
    { 
        word: 'Mut', 
        hintB: 'Tapferkeit',
        hintA: 'Held'
    },
    { 
        word: 'Kraft', 
        hintB: 'Stärke',
        hintA: 'Muskeln'
    },
    { 
        word: 'Schwäche', 
        hintB: 'Verletzlichkeit',
        hintA: 'Zerbrechlich'
    },
    { 
        word: 'Gesundheit', 
        hintB: 'Fitness',
        hintA: 'Sport'
    },
    { 
        word: 'Krankheit', 
        hintB: 'Symptome',
        hintA: 'Zeichen'
    },
    { 
        word: 'Medizin', 
        hintB: 'Heilung',
        hintA: 'Reparatur'
    },
    { 
        word: 'Vitamin', 
        hintB: 'Gesund',
        hintA: 'Gut'
    },
    { 
        word: 'Sport', 
        hintB: 'Schweiß',
        hintA: 'Feuchtigkeit'
    },
    { 
        word: 'Marathon', 
        hintB: 'Ausdauer',
        hintA: 'Durchhalten'
    },
    { 
        word: 'Fußball', 
        hintB: 'Tor',
        hintA: 'Öffnung'
    },
    { 
        word: 'Basketball', 
        hintB: 'Korb',
        hintA: 'Behälter'
    },
    { 
        word: 'Tennis', 
        hintB: 'Schläger',
        hintA: 'Werkzeug'
    },
    { 
        word: 'Golf', 
        hintB: 'Loch',
        hintA: 'Öffnung'
    },
    { 
        word: 'Schwimmen', 
        hintB: 'Bahnen',
        hintA: 'Linien'
    },
    { 
        word: 'Laufen', 
        hintB: 'Tempo',
        hintA: 'Geschwindigkeit'
    },
    { 
        word: 'Springen', 
        hintB: 'Höhe',
        hintA: 'Oben'
    },
    { 
        word: 'Klettern', 
        hintB: 'Griff',
        hintA: 'Halten'
    },
    { 
        word: 'Wandern', 
        hintB: 'Pfad',
        hintA: 'Weg'
    },
    { 
        word: 'Reisen', 
        hintB: 'Ferne',
        hintA: 'Entfernung'
    },
    { 
        word: 'Abenteuer', 
        hintB: 'Risiko',
        hintA: 'Gefahr'
    },
    { 
        word: 'Entdeckung', 
        hintB: 'Neu',
        hintA: 'Frisch'
    },
    { 
        word: 'Geheimnis', 
        hintB: 'Rätsel',
        hintA: 'Puzzle'
    },
    { 
        word: 'Wahrheit', 
        hintB: 'Ehrlichkeit',
        hintA: 'Aufrichtig'
    },
    { 
        word: 'Lüge', 
        hintB: 'Falsch',
        hintA: 'Verkehrt'
    },
    { 
        word: 'Versprechen', 
        hintB: 'Wort',
        hintA: 'Sprache'
    },
    { 
        word: 'Verrat', 
        hintB: 'Enttäuschung',
        hintA: 'Traurig'
    },
    { 
        word: 'Freundschaft', 
        hintB: 'Vertrauen',
        hintA: 'Sicher'
    },
    { 
        word: 'Familie', 
        hintB: 'Blut',
        hintA: 'Rot'
    },
    { 
        word: 'Eltern', 
        hintB: 'Ursprung',
        hintA: 'Anfang'
    },
    { 
        word: 'Kind', 
        hintB: 'Unschuld',
        hintA: 'Rein'
    },
    { 
        word: 'Baby', 
        hintB: 'Windel',
        hintA: 'Wickeln'
    },
    { 
        word: 'Jugend', 
        hintB: 'Rebellion',
        hintA: 'Widerstand'
    },
    { 
        word: 'Alter', 
        hintB: 'Weisheit',
        hintA: 'Klugheit'
    },
    { 
        word: 'Generation', 
        hintB: 'Zeitraum',
        hintA: 'Dauer'
    },
    { 
        word: 'Vergangenheit', 
        hintB: 'Geschichte',
        hintA: 'Erzählung'
    },
    { 
        word: 'Gegenwart', 
        hintB: 'Jetzt',
        hintA: 'Moment'
    },
    { 
        word: 'Zukunft', 
        hintB: 'Unbekannt',
        hintA: 'Fremd'
    },
    { 
        word: 'Ewigkeit', 
        hintB: 'Unendlich',
        hintA: 'Grenzenlos'
    },
    { 
        word: 'Moment', 
        hintB: 'Augenblick',
        hintA: 'Sehen'
    },
    { 
        word: 'Sekunde', 
        hintB: 'Tick',
        hintA: 'Geräusch'
    },
    { 
        word: 'Minute', 
        hintB: 'Sechzig',
        hintA: 'Zahl'
    },
    { 
        word: 'Stunde', 
        hintB: 'Zeiger',
        hintA: 'Pfeil'
    },
    { 
        word: 'Tag', 
        hintB: 'Sonnenschein',
        hintA: 'Hell'
    },
    { 
        word: 'Nacht', 
        hintB: 'Dunkelheit',
        hintA: 'Schwarz'
    },
    { 
        word: 'Woche', 
        hintB: 'Sieben',
        hintA: 'Glück'
    },
    { 
        word: 'Monat', 
        hintB: 'Kalender',
        hintA: 'Blätter'
    },
    { 
        word: 'Jahr', 
        hintB: 'Jahreszeiten',
        hintA: 'Vier'
    },
    { 
        word: 'Frühling', 
        hintB: 'Blüten',
        hintA: 'Öffnen'
    },
    { 
        word: 'Sommer', 
        hintB: 'Hitze',
        hintA: 'Warm'
    },
    { 
        word: 'Herbst', 
        hintB: 'Fallen',
        hintA: 'Runter'
    },
    { 
        word: 'Winter', 
        hintB: 'Kälte',
        hintA: 'Frieren'
    },
    { 
        word: 'Wetter', 
        hintB: 'Vorhersage',
        hintA: 'Zukunft'
    },
    { 
        word: 'Klima', 
        hintB: 'Wandel',
        hintA: 'Veränderung'
    },
    { 
        word: 'Umwelt', 
        hintB: 'Schutz',
        hintA: 'Sicherheit'
    },
    { 
        word: 'Natur', 
        hintB: 'Wild',
        hintA: 'Ungezähmt'
    },
    { 
        word: 'Tier', 
        hintB: 'Instinkt',
        hintA: 'Gefühl'
    },
    { 
        word: 'Pflanze', 
        hintB: 'Photosynthese',
        hintA: 'Umwandlung'
    },
    { 
        word: 'Blatt', 
        hintB: 'Grün',
        hintA: 'Farbe'
    },
    { 
        word: 'Wurzel', 
        hintB: 'Versteckt',
        hintA: 'Unsichtbar'
    },
    { 
        word: 'Stamm', 
        hintB: 'Rinde',
        hintA: 'Haut'
    },
    { 
        word: 'Ast', 
        hintB: 'Verzweigung',
        hintA: 'Teilung'
    },
    { 
        word: 'Frucht', 
        hintB: 'Samen',
        hintA: 'Kern'
    },
    { 
        word: 'Beere', 
        hintB: 'Klein',
        hintA: 'Winzig'
    },
    { 
        word: 'Nuss', 
        hintB: 'Schale',
        hintA: 'Schutz'
    },
    { 
        word: 'Getreide', 
        hintB: 'Feld',
        hintA: 'Fläche'
    },
    { 
        word: 'Weizen', 
        hintB: 'Golden',
        hintA: 'Gelb'
    },
    { 
        word: 'Mais', 
        hintB: 'Kolben',
        hintA: 'Zylinder'
    },
    { 
        word: 'Hafer', 
        hintB: 'Flocken',
        hintA: 'Dünn'
    },
    { 
        word: 'Gerste', 
        hintB: 'Bier',
        hintA: 'Getränk'
    },
    { 
        word: 'Roggen', 
        hintB: 'Dunkel',
        hintA: 'Schwarz'
    },
    { 
        word: 'Hirse', 
        hintB: 'Winzig',
        hintA: 'Mikroskopisch'
    },
    { 
        word: 'Quinoa', 
        hintB: 'Superfood',
        hintA: 'Besonders'
    },
    { 
        word: 'Chia', 
        hintB: 'Samen',
        hintA: 'Anfang'
    },
    { 
        word: 'Mandel', 
        hintB: 'Oval',
        hintA: 'Form'
    },
    { 
        word: 'Walnuss', 
        hintB: 'Gehirn',
        hintA: 'Denken'
    },
    { 
        word: 'Haselnuss', 
        hintB: 'Rund',
        hintA: 'Kreis'
    },
    { 
        word: 'Kokos', 
        hintB: 'Palme',
        hintA: 'Baum'
    },
    { 
        word: 'Ananas', 
        hintB: 'Stachelig',
        hintA: 'Spitz'
    },
    { 
        word: 'Mango', 
        hintB: 'Tropisch',
        hintA: 'Heiß'
    },
    { 
        word: 'Kiwi', 
        hintB: 'Pelzig',
        hintA: 'Haare'
    },
    { 
        word: 'Papaya', 
        hintB: 'Exotisch',
        hintA: 'Fremd'
    },
    { 
        word: 'Avocado', 
        hintB: 'Cremig',
        hintA: 'Weich'
    },
    { 
        word: 'Olive', 
        hintB: 'Öl',
        hintA: 'Flüssigkeit'
    },
    { 
        word: 'Gurke', 
        hintB: 'Erfrischend',
        hintA: 'Kühl'
    },
    { 
        word: 'Paprika', 
        hintB: 'Bunt',
        hintA: 'Farben'
    },
    { 
        word: 'Chili', 
        hintB: 'Schärfe',
        hintA: 'Brennen'
    },
    { 
        word: 'Ingwer', 
        hintB: 'Würzig',
        hintA: 'Geschmack'
    },
    { 
        word: 'Zimt', 
        hintB: 'Weihnachten',
        hintA: 'Fest'
    },
    { 
        word: 'Vanille', 
        hintB: 'Süß',
        hintA: 'Zucker'
    },
    { 
        word: 'Schokolade', 
        hintB: 'Verführung',
        hintA: 'Lockend'
    },
    { 
        word: 'Kaffee', 
        hintB: 'Bohne',
        hintA: 'Samen'
    },
    { 
        word: 'Espresso', 
        hintB: 'Konzentriert',
        hintA: 'Fokussiert'
    },
    { 
        word: 'Cappuccino', 
        hintB: 'Schaum',
        hintA: 'Luft'
    },
    { 
        word: 'Latte', 
        hintB: 'Milchig',
        hintA: 'Weiß'
    },
    { 
        word: 'Mokka', 
        hintB: 'Schokoladig',
        hintA: 'Süß'
    },
    { 
        word: 'Matcha', 
        hintB: 'Grünpulver',
        hintA: 'Staub'
    },
    { 
        word: 'Cocktail', 
        hintB: 'Gemischt',
        hintA: 'Zusammen'
    },
    { 
        word: 'Smoothie', 
        hintB: 'Glatt',
        hintA: 'Eben'
    },
    { 
        word: 'Milkshake', 
        hintB: 'Schütteln',
        hintA: 'Bewegen'
    },
    { 
        word: 'Eistee', 
        hintB: 'Kalt',
        hintA: 'Frieren'
    },
    { 
        word: 'Limonade', 
        hintB: 'Zitrone',
        hintA: 'Sauer'
    },
    { 
        word: 'Cola', 
        hintB: 'Braun',
        hintA: 'Farbe'
    },
    { 
        word: 'Sprite', 
        hintB: 'Klar',
        hintA: 'Durchsichtig'
    },
    { 
        word: 'Fanta', 
        hintB: 'Orange',
        hintA: 'Frucht'
    }
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
        imposterHintA: null,  // Tipp für Tipp B (indirekter Tipp)
        imposterHintB: null,  // Kreativer Tipp für das Wort
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
    
    // Get user avatar information
    const user = users[userKey];
    let userAvatar = { type: 'standard', id: 0, frame: 0 };
    
    if (user && user.avatar) {
        userAvatar = user.avatar;
    } else if (user) {
        // Ensure user has avatar data and save it
        user.avatar = userAvatar;
        console.log(`Adding default avatar to user ${playerName}`);
        saveUsers();
    }
    
    const player = {
        id: socketId,
        name: playerName,
        avatar: userAvatar,
        isHost: shouldBeHost,
        word: isRejoin ? originalData.word : null,
        isImposter: isRejoin ? originalData.isImposter : false,
        isSpectator: isRejoin ? (originalData.isSpectator || false) : false
    };
    
    // Insert player at correct position to maintain order
    if (isRejoin && match.initialPlayerOrder) {
        // Find the correct position based on initial player order
        const originalIndex = match.initialPlayerOrder.findIndex(p => p.name === playerName);
        if (originalIndex !== -1) {
            // Count how many players from the initial order are already in the current players array
            let insertPosition = 0;
            for (let i = 0; i < originalIndex; i++) {
                const earlierPlayerName = match.initialPlayerOrder[i].name;
                if (match.players.find(p => p.name === earlierPlayerName)) {
                    insertPosition++;
                }
            }
            match.players.splice(insertPosition, 0, player);
        } else {
            // Fallback: add to end if not found in initial order
            match.players.push(player);
        }
    } else {
        // For new joins or when no initial order exists, add to end
        match.players.push(player);
    }
    
    // Add to allParticipants if not already there
    if (!match.allParticipants.includes(playerName)) {
        match.allParticipants.push(playerName);
    }
    
    // Store original player data for potential rejoins
    if (!isRejoin) {
        match.originalPlayerData.set(playerName, {
            word: null,
            isImposter: false,
            isSpectator: false,
            originalJoinOrder: match.allParticipants.length - 1
        });
    } else {
        // Update socket ID for rejoining player
        if (originalData.isImposter) {
            match.imposterSocketId = socketId; // Update imposter socket ID
        }
        
        // Update current player index after potentially inserting player at different position
        if (match.gameState === 'playing' && match.currentPlayerName && match.initialPlayerOrder) {
            const currentPlayerOriginalIndex = match.initialPlayerOrder.findIndex(p => p.name === match.currentPlayerName);
            if (currentPlayerOriginalIndex !== -1) {
                // Find how many players from initial order before current player are now in players array
                let newCurrentIndex = 0;
                for (let i = 0; i < currentPlayerOriginalIndex; i++) {
                    const earlierPlayerName = match.initialPlayerOrder[i].name;
                    if (match.players.find(p => p.name === earlierPlayerName)) {
                        newCurrentIndex++;
                    }
                }
                match.currentPlayerIndex = newCurrentIndex;
            }
        }
        
        // Restore current player turn if this was the active player
        if (match.currentPlayerName === playerName && match.gameState === 'playing') {
            // Find the correct index in the current players array
            const playerIndex = match.players.findIndex(p => p.name === playerName);
            if (playerIndex !== -1) {
                match.currentPlayerIndex = playerIndex;
            }
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

function prepareGame(matchId) {
    const match = matches.get(matchId);
    if (!match || match.players.length < 4) return false;
    
    // Don't change game state yet, just prepare words
    match.currentRound = 1;
    match.currentPlayerIndex = Math.floor(Math.random() * match.players.length);
    match.currentPlayerName = match.players[match.currentPlayerIndex].name;
    match.wordsThisRound = [];
    match.allRounds = [];
    
    // Store the initial random player order
    match.initialPlayerOrder = [...match.players];
    match.initialPlayerIndex = match.currentPlayerIndex;
    
    // Choose random word and imposter
    const wordObj = wordPool[Math.floor(Math.random() * wordPool.length)];
    match.currentWord = wordObj.word;
    match.imposterHintA = wordObj.hintA;
    match.imposterHintB = wordObj.hintB;
    const imposterIndex = Math.floor(Math.random() * match.players.length);
    match.imposterSocketId = match.players[imposterIndex].id;
    match.imposterPlayerName = match.players[imposterIndex].name;

    // Assign words to players
    match.players.forEach((player, index) => {
        if (index === imposterIndex) {
            player.word = `Imposter (Tipp: ${match.imposterHintA})`;
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

function startGame(matchId) {
    const match = matches.get(matchId);
    if (!match || match.players.length < 4) return false;
    
    // Set game state to playing (prepareGame should have been called already)
    match.gameState = 'playing';
    
    return true;
}

function resetMatchToLobby(matchId) {
    const match = matches.get(matchId);
    if (!match) return false;
    
    // Reset game state to waiting
    match.gameState = 'waiting';
    match.currentWord = null;
    match.imposterHintA = null;
    match.imposterHintB = null;
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
    
    // Check if current player is a spectator
    if (currentPlayer.isSpectator) {
        return { error: 'Zuschauer können keine Wörter eingeben!' };
    }
    
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
    
    // Move to next player (based on initial player order, but skip spectators)
    if (match.initialPlayerOrder && match.initialPlayerOrder.length > 0) {
        // Find current player's position in initial order
        const currentPlayerName = match.players[match.currentPlayerIndex].name;
        const currentOriginalIndex = match.initialPlayerOrder.findIndex(p => p.name === currentPlayerName);
        
        if (currentOriginalIndex !== -1) {
            // Find next ACTIVE player in initial order who is currently connected
            let nextOriginalIndex = (currentOriginalIndex + 1) % match.initialPlayerOrder.length;
            let attempts = 0;
            let nextPlayer = null;
            
            while (attempts < match.initialPlayerOrder.length) {
                const nextPlayerName = match.initialPlayerOrder[nextOriginalIndex].name;
                nextPlayer = match.players.find(p => p.name === nextPlayerName && !p.isSpectator);
                
                if (nextPlayer) {
                    // Found next connected active player
                    break;
                }
                
                // Try next player in initial order
                nextOriginalIndex = (nextOriginalIndex + 1) % match.initialPlayerOrder.length;
                attempts++;
            }
            
            if (nextPlayer) {
                // Update current player index to point to next player in current array
                match.currentPlayerIndex = match.players.findIndex(p => p.name === nextPlayer.name);
                match.currentPlayerName = nextPlayer.name;
            } else {
                // Fallback: use first available active player
                const firstActivePlayer = match.players.find(p => !p.isSpectator);
                if (firstActivePlayer) {
                    match.currentPlayerIndex = match.players.findIndex(p => p.name === firstActivePlayer.name);
                    match.currentPlayerName = firstActivePlayer.name;
                }
            }
        } else {
            // Fallback to find next active player
            let nextIndex = (match.currentPlayerIndex + 1) % match.players.length;
            let attempts = 0;
            
            while (attempts < match.players.length) {
                if (!match.players[nextIndex].isSpectator) {
                    match.currentPlayerIndex = nextIndex;
                    match.currentPlayerName = match.players[nextIndex].name;
                    break;
                }
                nextIndex = (nextIndex + 1) % match.players.length;
                attempts++;
            }
        }
    } else {
        // Fallback to find next active player
        let nextIndex = (match.currentPlayerIndex + 1) % match.players.length;
        let attempts = 0;
        
        while (attempts < match.players.length) {
            if (!match.players[nextIndex].isSpectator) {
                match.currentPlayerIndex = nextIndex;
                match.currentPlayerName = match.players[nextIndex].name;
                break;
            }
            nextIndex = (nextIndex + 1) % match.players.length;
            attempts++;
        }
    }
    
    // Check if round is complete (only count active players)
    const activePlayers = match.players.filter(p => !p.isSpectator);
    if (match.wordsThisRound.length === activePlayers.length) {
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
    
    // Check if voter is a spectator
    const voter = match.players.find(p => p.id === socketId);
    if (voter && voter.isSpectator) {
        return { error: 'Zuschauer können nicht voten!' };
    }
    
    // Remove existing vote from this player
    match.votes = match.votes.filter(v => v.playerId !== socketId);
    
    match.votes.push({
        playerId: socketId,
        voteType: voteType,
        targetPlayerId: targetPlayerId
    });
    
    // Check if all ACTIVE players voted
    const activePlayers = match.players.filter(p => !p.isSpectator);
    if (match.votes.length === activePlayers.length) {
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
                
                // In der zweiten Runde: Imposter bekommt beide Tipps (A + B)
                if (match.currentRound === 2) {
                    match.players.forEach(player => {
                        if (player.isImposter) {
                            player.word = `Imposter (Tipp A: ${match.imposterHintA}, Tipp B: ${match.imposterHintB})`;
                            
                            // Update original player data for rejoining
                            const originalData = match.originalPlayerData.get(player.name);
                            if (originalData) {
                                originalData.word = player.word;
                            }
                        }
                    });
                }
                
                // Send updated game state to all players (for all rounds)
                match.players.forEach(player => {
                    io.to(player.id).emit('game_started', {
                        word: player.isSpectator ? 'Zuschauer-Modus' : player.word,
                        isImposter: player.isSpectator ? false : player.isImposter,
                        currentPlayer: match.currentPlayerName,
                        round: match.currentRound,
                        players: match.players.map(p => ({
                            ...p,
                            displayName: p.isSpectator ? `${p.name} (Zuschauer)` : p.name
                        })),
                        spectatorMode: player.isSpectator
                    });
                });
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
            
            if (!votedOutPlayerId) {
                // No one was voted out (tie or no votes), continue game
                match.gameState = 'playing';
                match.votes = [];
                match.wordsThisRound = [];
                return { success: true, message: 'Unentschieden - Spiel geht weiter' };
            }
            
            // Check if the voted out player is the imposter
            if (votedOutPlayerId === match.imposterSocketId) {
                // Imposter was found - civilians win
                match.gameState = 'finished';
                return { imposterFound: true, imposterWon: false, votedOutPlayer: votedOutPlayerId };
            } else {
                // Innocent player was voted out - make them a spectator and continue
                const votedOutPlayer = match.players.find(p => p.id === votedOutPlayerId);
                if (votedOutPlayer) {
                    votedOutPlayer.isSpectator = true;
                    votedOutPlayer.word = null; // Remove their word since they're spectating
                    
                    // Update original player data
                    const originalData = match.originalPlayerData.get(votedOutPlayer.name);
                    if (originalData) {
                        originalData.isSpectator = true;
                        originalData.word = null;
                    }
                }
                
                // Count only active (non-spectator) players
                const activePlayers = match.players.filter(p => !p.isSpectator);
                
                // Check if only 2 active players left (including imposter) - imposter wins
                if (activePlayers.length <= 2) {
                    match.gameState = 'finished';
                    return { imposterFound: false, imposterWon: true, votedOutPlayer: votedOutPlayerId, reason: 'Zu wenige Spieler übrig' };
                }
                
                // Continue game - reset to next round
                match.gameState = 'playing';
                match.votes = [];
                match.wordsThisRound = [];
                match.currentRound++;
                
                // Adjust current player index to skip spectators
                const activePlayerNames = activePlayers.map(p => p.name);
                if (match.initialPlayerOrder) {
                    // Filter initial order to only include active players
                    const activeInitialOrder = match.initialPlayerOrder.filter(p => activePlayerNames.includes(p.name));
                    
                    // Find next active player
                    if (activeInitialOrder.length > 0) {
                        match.currentPlayerIndex = match.players.findIndex(p => p.name === activeInitialOrder[0].name);
                        match.currentPlayerName = activeInitialOrder[0].name;
                    }
                } else {
                    // Fallback: find first active player
                    const firstActivePlayer = activePlayers[0];
                    if (firstActivePlayer) {
                        match.currentPlayerIndex = match.players.findIndex(p => p.name === firstActivePlayer.name);
                        match.currentPlayerName = firstActivePlayer.name;
                    }
                }
                
                return { 
                    playerEliminated: true, 
                    votedOutPlayer: votedOutPlayerId, 
                    votedOutPlayerName: votedOutPlayer.name,
                    activePlayers: activePlayers.length,
                    totalPlayers: match.players.length,
                    continueGame: true 
                };
            }
        }
    }
    
    return { success: true };
}

// Update player statistics after game ends
function updatePlayerStats(matchId, imposterWon, imposterSocketId) {
    const match = matches.get(matchId);
    if (!match) return;
    
    const updatedPlayers = []; // Track which players' stats were updated
    
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
        
        // Add to updated players list
        updatedPlayers.push({
            socketId: player.id,
            username: users[userKey].username,
            stats: playerStats
        });
    });
    
    saveUsers();
    
    // Send updated stats to all affected players
    updatedPlayers.forEach(playerData => {
        io.to(playerData.socketId).emit('stats_updated', {
            user: {
                username: playerData.username,
                stats: playerData.stats
            }
        });
    });
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
                
                console.log(`Sending currentMatch to ${lowerUsername}:`, {
                    id: currentMatch.id,
                    gameState: currentMatch.gameState,
                    allRoundsLength: currentMatch.allRounds ? currentMatch.allRounds.length : 0,
                    allRounds: currentMatch.allRounds
                });
                
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
    
    socket.on('start_countdown', () => {
        const matchId = socketToMatch.get(socket.id);
        const match = matches.get(matchId);
        
        if (!match || match.host !== socket.id) {
            socket.emit('error', { message: 'Nur der Host kann das Spiel starten' });
            return;
        }
        
        if (!match.players || match.players.length < 4) {
            socket.emit('error', { message: 'Mindestens 4 Spieler benötigt' });
            return;
        }
        
        // First prepare the game (assign words and imposters)
        if (!prepareGame(matchId)) {
            socket.emit('error', { message: 'Fehler beim Vorbereiten des Spiels' });
            return;
        }
        
        // Send countdown start with word data to all players in the match
        const updatedMatch = matches.get(matchId);
        updatedMatch.players.forEach(player => {
            io.to(player.id).emit('countdown_started', {
                word: player.word,
                isImposter: player.isImposter
            });
        });
        
        // Start the actual game after 8 seconds (5 countdown + 3 word display)
        setTimeout(() => {
            if (!startGame(matchId)) {
                // If startGame fails, notify host
                socket.emit('error', { message: 'Fehler beim Starten des Spiels' });
                return;
            }
            
            // Send game state to all players
            const finalMatch = matches.get(matchId);
            if (finalMatch) {
                finalMatch.players.forEach(player => {
                    io.to(player.id).emit('game_started', {
                        word: player.word,
                        isImposter: player.isImposter,
                        currentPlayer: finalMatch.players[finalMatch.currentPlayerIndex].name,
                        round: finalMatch.currentRound,
                        players: finalMatch.players
                    });
                });
                
                // Update lobby - remove match from lobby when game starts
                io.emit('lobby_updated', {
                    matches: Array.from(matches.values())
                        .filter(match => match.gameState === 'waiting')
                        .map(match => ({
                            id: match.id,
                            players: match.players.length,
                            hasPassword: match.password !== null
                        }))
                });
            }
        }, 8000); // 8 second delay (5 countdown + 3 word display)
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
            }, 15000); // 15 seconds delay to show results
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
        
        // Immediately hide voting buttons for the player who voted
        socket.emit('vote_submitted', {
            message: 'Deine Stimme wurde abgegeben!',
            hideVotingInterface: true
        });
        
        if (result.imposterFound !== undefined) {
            // Game ended - either imposter found or imposter won
            const match = matches.get(matchId);
            updatePlayerStats(matchId, result.imposterWon, match.imposterSocketId);
            
            let gameEndMessage = {
                imposterWon: result.imposterWon,
                imposter: match.players.find(p => p.id === match.imposterSocketId)?.name || 'Unknown',
                word: match.currentWord
            };
            
            if (result.reason) {
                gameEndMessage.reason = result.reason;
            }
            
            io.to(matchId).emit('game_finished', gameEndMessage);
            
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
            }, 15000); // 15 seconds delay to show results
        } else if (result.playerEliminated) {
            // Player was eliminated but becomes spectator and game continues
            const match = matches.get(matchId);
            
            // Clear voting interface for all players
            io.to(matchId).emit('voting_ended', {
                message: 'Abstimmung beendet!',
                hideVotingInterface: true
            });
            
            // Notify the eliminated player that they're now a spectator
            const eliminatedSocket = io.sockets.sockets.get(result.votedOutPlayer);
            if (eliminatedSocket) {
                eliminatedSocket.emit('player_eliminated', {
                    message: 'Du wurdest aus dem Spiel gewählt und bist nun Zuschauer!',
                    reason: 'Du warst nicht der Imposter',
                    spectatorMode: true
                });
            }
            
            // Notify remaining players with updated player list including spectators
            const playersWithSpectatorInfo = match.players.map(player => ({
                ...player,
                displayName: player.isSpectator ? `${player.name} (Zuschauer)` : player.name
            }));
            
            io.to(matchId).emit('player_eliminated_update', {
                eliminatedPlayer: result.votedOutPlayerName,
                activePlayers: result.activePlayers,
                totalPlayers: result.totalPlayers,
                message: `${result.votedOutPlayerName} wurde eliminiert und ist nun Zuschauer!`,
                gameState: match.gameState,
                currentPlayer: match.currentPlayerName,
                round: match.currentRound,
                players: playersWithSpectatorInfo
            });
            
            // Send updated game state to all players (including spectators)
            match.players.forEach(player => {
                io.to(player.id).emit('game_started', {
                    word: player.isSpectator ? 'Zuschauer-Modus' : player.word,
                    isImposter: player.isSpectator ? false : player.isImposter,
                    currentPlayer: match.currentPlayerName,
                    round: match.currentRound,
                    players: playersWithSpectatorInfo,
                    spectatorMode: player.isSpectator
                });
            });
        } else {
            const match = matches.get(matchId);
            
            // If voting is complete but game continues, send updated game state
            if (match.gameState === 'playing') {
                // Voting phase ended, game continues - clear voting interface for all players
                io.to(matchId).emit('voting_ended', {
                    message: 'Abstimmung beendet - Spiel geht weiter!',
                    hideVotingInterface: true
                });
                
                // Send game state to all players to ensure UI is updated
                match.players.forEach(player => {
                    io.to(player.id).emit('game_started', {
                        word: player.isSpectator ? 'Zuschauer-Modus' : player.word,
                        isImposter: player.isSpectator ? false : player.isImposter,
                        currentPlayer: match.currentPlayerName,
                        round: match.currentRound,
                        players: match.players.map(p => ({
                            ...p,
                            displayName: p.isSpectator ? `${p.name} (Zuschauer)` : p.name
                        })),
                        spectatorMode: player.isSpectator
                    });
                });
            } else {
                // Still in voting phase, update vote status
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
