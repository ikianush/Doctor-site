#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js نصب نیست. لطفاً از https://nodejs.org نصب کنید."; read -p "Enter..."; exit 1
fi
(sleep 1.5 && open "http://localhost:3000") &
node server/server.js
