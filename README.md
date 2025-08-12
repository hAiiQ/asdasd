# Imposter Spiel

Ein multiplayer Online-Spiel ähnlich wie Spyfall, bei dem ein Spieler der "Imposter" ist und versucht, das geheime Wort zu erraten, während die anderen versuchen, den Imposter zu entlarven.

## Replit Deployment

### Schritte für Replit:

1. **Fork/Import das Projekt** in Replit
2. **Run-Button klicken** - Replit sollte automatisch die Dependencies installieren
3. **Warten bis "Server läuft auf 0.0.0.0:3000" erscheint**
4. **Den Webview öffnen** über den "🌐" Button

### Wichtige Dateien für Replit:
- `.replit` - Run-Konfiguration
- `replit.nix` - Environment Setup
- `Procfile` - Process Definition

### Fehlerbehebung Replit:
1. Konsole prüfen auf Fehlermeldungen
2. `npm install` in der Shell ausführen
3. Port 3000 in `.replit` bestätigen
4. Browser-Cache leeren und neu laden

## Lokaler Start
```bash
npm install
npm start
```

## Wie es funktioniert

1. **Match erstellen/beitreten**: Spieler können ein öffentliches oder privates Match erstellen oder einem bestehenden Match beitreten
2. **Mindestens 4 Spieler**: Es werden mindestens 4 Spieler benötigt um zu starten
3. **Wörter vergeben**: Alle Spieler außer einem bekommen das gleiche Wort, einer bekommt "Imposter"
4. **Runden spielen**: Alle Spieler schreiben nacheinander ein Wort, das zu ihrem Begriff passt
5. **Abstimmen**: Nach jeder Runde wird abgestimmt - weiterspielen oder Imposter erraten
6. **Gewinnen**: 
   - Imposter gewinnt wenn er das richtige Wort errät oder nicht entlarvt wird
   - Andere Spieler gewinnen wenn sie den Imposter richtig identifizieren

## Installation und Start

### Lokal ausführen:
```bash
npm install
npm start
```

### Für Replit:
1. Alle Dateien in dein Replit Projekt kopieren
2. Im Terminal ausführen: `npm install`
3. Dann: `npm start`
4. Die Anwendung läuft auf Port 3000

## Projektstruktur

```
imposter-game/
├── package.json          # Node.js Abhängigkeiten
├── server.js             # Express Server mit Socket.io
├── public/
│   └── index.html        # Frontend (HTML, CSS, JavaScript)
└── README.md            # Diese Datei
```

## Features

- ✅ Mehrere parallele Matches
- ✅ Öffentliche und private Matches (mit Passwort)
- ✅ Mindestens 4, maximal 8 Spieler pro Match
- ✅ Real-time Updates mit Socket.io
- ✅ Responsive Design
- ✅ Keine Account-Registrierung nötig
- ✅ Host kann Spiel starten
- ✅ Automatische Imposter-Erkennung bei richtigem Wort
- ✅ Abstimmungssystem
- ✅ Verschiedene Spielrunden

## Technologien

- **Backend**: Node.js, Express.js, Socket.io
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Real-time**: WebSockets über Socket.io

## Replit Deployment

1. Erstelle ein neues Node.js Replit Projekt
2. Kopiere alle Dateien in das Projekt
3. Führe `npm install` aus
4. Starte mit `npm start`
5. Die URL wird automatisch generiert und ist öffentlich zugänglich

Das Spiel ist komplett browserbasiert und funktioniert auf Desktop und Mobile!
