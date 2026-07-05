#!/bin/bash
# Start Next.js frontend development server in WSL
# Make sure we are at frontend root

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

npm run dev -- --port 3000
