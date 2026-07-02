#!/bin/bash

# Check if intelephense is installed (PHP + WordPress LSP)

if command -v intelephense &> /dev/null; then
    exit 0
fi

if command -v npm &> /dev/null; then
    echo "[intelephense] Installing PHP language server..."
    npm install -g intelephense
    command -v intelephense &> /dev/null && echo "[intelephense] Installed successfully"
else
    echo "[intelephense] npm not found. Install Node.js then run: npm install -g intelephense"
fi

exit 0
