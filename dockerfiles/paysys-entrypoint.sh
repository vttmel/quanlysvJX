#!/bin/sh
set -eu

WINE_PREFIX="${WINEPREFIX:-/home/appuser/.win32}"
READY_MARKER="${WINE_PREFIX}/.paysys-mdac-ready"

mkdir -p /src/paysys/payserver_log

# Xóa lock file của Xvfb cũ nếu có
DISPLAY_NUM=$(echo "${DISPLAY}" | sed 's/://g')
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" || true
if ! pgrep -f "Xvfb ${DISPLAY}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp >/tmp/xvfb-${DISPLAY_NUM}.log 2>&1 &
    sleep 1
fi

if [ -f "${READY_MARKER}" ]; then
    echo "[INFO] Using baked MDAC/SQLOLEDB Wine prefix: ${READY_MARKER}"
else
    echo "[WARN] Baked MDAC/SQLOLEDB marker not found: ${READY_MARKER}"
    echo "[WARN] Initializing setup..."
    if [ -f "/src/paysys/MDAC_TYP.EXE" ]; then
        /usr/local/bin/paysys-setup-mdac.sh /src/paysys/MDAC_TYP.EXE
    else
        echo "[ERROR] MDAC_TYP.EXE not found; cannot setup MDAC."
    fi
fi

# Vô hiệu hóa Mono/Gecko/Vulkan và ẩn các kênh Wine không fatal trong container.
export WINEDLLOVERRIDES="${WINEDLLOVERRIDES:-mscoree,mshtml,winevulkan=d}"
export WINEDEBUG="${WINEDEBUG:--vulkan,-ntoskrnl,-service,-ole,-ntdll,-sync}"

echo "[Paysys] Starting Sword3PaySys.exe..."
exec wine Sword3PaySys.exe
