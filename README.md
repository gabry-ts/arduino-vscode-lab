# Arduino VSCode Lab

VSCode extension for Arduino UNO Q development.

## Features

- **Board Management**: Detect, select, and connect to Arduino UNO Q boards
- **App Management**: Create, start, stop, delete apps; view logs and events
- **Serial Monitor**: Built-in serial monitor with baud rate selection
- **Sketch Operations**: Compile and upload Arduino sketches
- **Brick Management**: Add, remove, and configure bricks
- **Remote File Browser**: Browse and edit files on the board
- **WiFi Management**: Connect to WiFi networks
- **Library Management**: Search and add Arduino libraries
- **System Management**: View version, check updates, configure board

## Requirements

- VSCode 1.85+
- Arduino CLI installed and in PATH
- Arduino UNO Q board

## Installation

1. Install from `.vsix` file: Extensions > ... > Install from VSIX
2. Or build from source: `npm install && npm run package`

## Commands

All commands are prefixed with "Arduino Q:" in the command palette.

| Command | Keybinding | Description |
|---------|------------|-------------|
| Detect Boards | `Ctrl+Alt+A D` | Scan for connected boards |
| Compile | `Ctrl+Alt+A C` | Compile current sketch |
| Upload | `Ctrl+Alt+A U` | Upload to board |
| Serial Monitor | `Ctrl+Alt+A M` | Open serial monitor |
| Show Status | `Ctrl+Alt+A S` | Show connection status |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `arduinoQ.arduinoCliPath` | `arduino-cli` | Path to Arduino CLI |
| `arduinoQ.defaultBaudRate` | `9600` | Default serial baud rate |
| `arduinoQ.autoConnect` | `true` | Auto-connect on startup |
| `arduinoQ.serialMonitor.scrollback` | `1000` | Serial monitor lines |
| `arduinoQ.logLevel` | `info` | Log level (debug/info/warn/error) |

## Sidebar Views

The extension adds an "Arduino Q" sidebar with:
- **Apps**: List of apps on the board
- **Bricks**: Available bricks and app bricks
- **Files**: Remote file browser

## Usage

1. Connect your Arduino UNO Q via USB
2. Run "Arduino Q: Connect" from command palette
3. Use the sidebar views to manage apps, bricks, and files
4. Use keyboard shortcuts to compile and upload sketches

## License

See LICENSE file in repository root.
