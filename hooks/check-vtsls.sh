#!/bin/bash

# Check if vtsls is installed (TypeScript + JavaScript LSP)

if command -v vtsls &> /dev/null; then
    exit 0
fi

if command -v npm &> /dev/null; then
    echo "[vtsls] Installing TypeScript/JavaScript language server..."
    npm install -g @vtsls/language-server typescript
    command -v vtsls &> /dev/null && echo "[vtsls] Installed successfully"
else
    echo "[vtsls] npm not found. Install Node.js then run: npm install -g @vtsls/language-server typescript"
fi

exit 0
