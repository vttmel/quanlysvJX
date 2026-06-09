#!/bin/sh
set -eu

WINE_PREFIX="${WINEPREFIX:-/root/.win32}"
READY_MARKER="${WINE_PREFIX}/.paysys-mdac-ready"

mkdir -p /src/paysys/payserver_log

rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp &
    sleep 1
fi

if [ -f "${READY_MARKER}" ]; then
    echo "[INFO] Using baked MDAC/SQLOLEDB Wine prefix: ${READY_MARKER}"
else
    echo "[WARN] Baked MDAC/SQLOLEDB marker not found: ${READY_MARKER}"
    echo "[WARN] Rebuild the paysys image to prepare MDAC at build time."
fi

echo "[Paysys] Starting Sword3PaySys.exe..."
exec wine Sword3PaySys.exe
