#!/bin/sh
set -eu

MDAC_EXE="${1:-/src/paysys/MDAC_TYP.EXE}"
WINE_PREFIX="${WINEPREFIX:-/root/.win32}"
READY_MARKER="${WINE_PREFIX}/.paysys-mdac-ready"
EXTRACT_DIR="/tmp/mdac-extract"
SQL_OLEDB_DIR="/tmp/sqloldb"
SQL_NET_DIR="/tmp/sqlnet"
SQL_ODBC_DIR="/tmp/sqlodbc"
WDSETUP_DIR="/tmp/wdsetup"
MDAC_XPAK_DIR="/tmp/mdacxpak"

if [ ! -f "${MDAC_EXE}" ]; then
    echo "[ERROR] ${MDAC_EXE} not found; cannot prepare MDAC/SQLOLEDB."
    exit 1
fi

echo "[INFO] Preparing 32-bit Wine prefix directories at ${WINE_PREFIX}..."
mkdir -p "${WINE_PREFIX}"

echo "[INFO] Extracting MDAC_TYP.EXE CAB payloads..."
rm -rf "${EXTRACT_DIR}" "${SQL_OLEDB_DIR}" "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}" "${MDAC_XPAK_DIR}"
mkdir -p "${EXTRACT_DIR}" "${SQL_OLEDB_DIR}" "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}" "${MDAC_XPAK_DIR}"

cabextract -q -d "${EXTRACT_DIR}" "${MDAC_EXE}"
cabextract -q -d "${SQL_OLEDB_DIR}" "${EXTRACT_DIR}/sqloldb.cab"
cabextract -q -d "${SQL_NET_DIR}" "${EXTRACT_DIR}/sqlnet.cab"
cabextract -q -d "${SQL_ODBC_DIR}" "${EXTRACT_DIR}/sqlodbc.cab"
cabextract -q -d "${WDSETUP_DIR}" "${EXTRACT_DIR}/wdsetup.cab"
cabextract -q -d "${MDAC_XPAK_DIR}" "${EXTRACT_DIR}/mdacxpak.cab"

OLEDB_DIR="${WINE_PREFIX}/drive_c/Program Files/Common Files/System/OLE DB"
ADO_DIR="${WINE_PREFIX}/drive_c/Program Files/Common Files/System/ADO"
MSADC_DIR="${WINE_PREFIX}/drive_c/Program Files/Common Files/System/MSADC"
SYS32_DIR="${WINE_PREFIX}/drive_c/windows/system32"
mkdir -p "${OLEDB_DIR}" "${ADO_DIR}" "${MSADC_DIR}" "${SYS32_DIR}"

echo "[INFO] Copying MDAC, SQLOLEDB, SQL Network and ODBC files..."
for file in msado15.dll msador15.dll msadox.dll msadomd.dll msjro.dll; do
    if [ -f "${MDAC_XPAK_DIR}/${file}" ]; then
        cp -f "${MDAC_XPAK_DIR}/${file}" "${ADO_DIR}/${file}"
        cp -f "${MDAC_XPAK_DIR}/${file}" "${SYS32_DIR}/${file}"
    fi
done

for file in msadce.dll msadcer.dll msadcf.dll msadcfr.dll msadco.dll msadcor.dll msadcs.dll msadds.dll msaddsr.dll msdaprst.dll msdaprsr.dll msdarem.dll msdaremr.dll msdfmap.dll handler.reg handsafe.reg adcvbs.inc adcjavas.inc; do
    if [ -f "${MDAC_XPAK_DIR}/${file}" ]; then
        cp -f "${MDAC_XPAK_DIR}/${file}" "${MSADC_DIR}/${file}"
    fi
done

for file in sqloledb.dll sqloledb.rll sqlsoldb.chm; do
    if [ -f "${SQL_OLEDB_DIR}/${file}" ]; then
        cp -f "${SQL_OLEDB_DIR}/${file}" "${OLEDB_DIR}/${file}"
    fi
done

if [ -f "${SQL_OLEDB_DIR}/msdart.dll" ]; then
    cp -f "${SQL_OLEDB_DIR}/msdart.dll" "${SYS32_DIR}/msdart.dll"
fi

for dir in "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}"; do
    find "${dir}" -maxdepth 1 -type f | while IFS= read -r file; do
        cp -f "${file}" "${SYS32_DIR}/$(basename "${file}")"
    done
done

find "${MDAC_XPAK_DIR}" -maxdepth 1 -type f | while IFS= read -r file; do
    base="$(basename "${file}")"
    case "${base}" in
        *.dll|*.DLL|*.exe|*.EXE|*.cpl|*.CPL|*.tlb|*.TLB|*.rsp|*.RSP)
            cp -f "${file}" "${SYS32_DIR}/${base}"
            ;;
    esac
done

for dll in msdatl3.dll msdaps.dll msdadc.dll msdaenum.dll; do
    cp -f "${MDAC_XPAK_DIR}/${dll}" "${OLEDB_DIR}/${dll}" 2>/dev/null || true
    cp -f "${MDAC_XPAK_DIR}/${dll}" "${SYS32_DIR}/${dll}" 2>/dev/null || true
done

for file in oledb32.dll oledb32r.dll msdasql.dll msdasqlr.dll msdasc.dll msdaer.dll msdatt.dll msdaora.dll msdaorar.dll msdaosp.dll msdaurl.dll msxactps.dll; do
    if [ -f "${MDAC_XPAK_DIR}/${file}" ]; then
        cp -f "${MDAC_XPAK_DIR}/${file}" "${OLEDB_DIR}/${file}"
    fi
done

echo "[INFO] Writing MDAC/SQLOLEDB registry entries without running Wine installers..."
mkdir -p "${WINE_PREFIX}/dosdevices"
ln -sfn / "${WINE_PREFIX}/dosdevices/z:"
ln -sfn ../drive_c "${WINE_PREFIX}/dosdevices/c:"
touch "${WINE_PREFIX}/.update-timestamp"

cat >"${WINE_PREFIX}/system.reg" <<'EOF_REG'
WINE REGISTRY Version 2
;; All keys relative to REGISTRY\Machine

#arch=win32

[Software\Classes\ADODB.Connection] 1718512450
@="Connection"

[Software\Classes\ADODB.Connection\CLSID] 1718512450
@="{00000514-0000-0010-8000-00AA006D2EA4}"

[Software\Classes\ADODB.Connection\CurVer] 1718512450
@="ADODB.Connection.6.0"

[Software\Classes\ADODB.Connection.6.0] 1718512450
@="Connection"

[Software\Classes\ADODB.Connection.6.0\CLSID] 1718512450
@="{00000514-0000-0010-8000-00AA006D2EA4}"

[Software\Classes\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}] 1718512450
@="Connection"

[Software\Classes\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}\InprocServer32] 1718512450
@="C:\Program Files\Common Files\System\ADO\msado15.dll"
"ThreadingModel"="Apartment"

[Software\Classes\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}\ProgId] 1718512450
@="ADODB.Connection.6.0"

[Software\Classes\CLSID\{00000514-0000-0010-8000-00AA006D2EA4}\VersionIndependentProgId] 1718512450
@="ADODB.Connection"

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}] 1718512603
@="SQLOLEDB"
"OLEDB_SERVICES"=dword:ffffffff

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\ExtendedErrors] 1718512603

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\ExtendedErrors\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}] 1718512603
@="SQLOLEDB Error Lookup"

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\Implemented Categories\{D267E19A-0B97-11D2-BB1C-00C04FC9B532}] 1718512603

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\InprocServer32] 1718512603
@="C:\Program Files\Common Files\System\OLE DB\sqloledb.dll"
"ThreadingModel"="Both"

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\OLE DB Provider] 1718512603

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\ProgID] 1718512603
@="SQLOLEDB.1"

[Software\Classes\CLSID\{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}\VersionIndependentProgID] 1718512603
@="SQLOLEDB"

[Software\Classes\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}] 1718512600
@="FoxOLEDB 1.0 Object"

[Software\Classes\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}\InprocServer32] 1718512600
@="C:\Program Files\Common Files\System\MSADC\msadce.dll"
"ThreadingModel"="both"

[Software\Classes\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}\ProgID] 1718512600
@="FX.Rowset.1"

[Software\Classes\CLSID\{3FF292B6-B204-11CF-8D23-00AA005FFE58}\VersionIndependentProgID] 1718512600
@="FX.Rowset"

[Software\Classes\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}] 1718512600
@="FoxOLEDB 1.0 Object"

[Software\Classes\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}\InprocServer32] 1718512600
@="C:\Program Files\Common Files\System\MSADC\msadce.dll"
"ThreadingModel"="both"

[Software\Classes\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}\ProgID] 1718512600
@="FX.Rowset.1"

[Software\Classes\CLSID\{58ECEE30-E715-11CF-B0E3-00AA003F000F}\VersionIndependentProgID] 1718512600
@="FX.Rowset"

[Software\Classes\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}] 1718512603
@="SQLOLEDB Error Lookup"

[Software\Classes\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}\InprocServer32] 1718512603
@="C:\Program Files\Common Files\System\OLE DB\sqloledb.dll"
"ThreadingModel"="Both"

[Software\Classes\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}\ProgID] 1718512603
@="SQLOLEDB ErrorLookup.1"

[Software\Classes\CLSID\{C0932C62-38E5-11d0-97AB-00C04FC2AD98}\VersionIndependentProgID] 1718512603
@="SQLOLEDB ErrorLookup"

[Software\Classes\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}] 1718512603
@="SQLOLEDB Enumerator"

[Software\Classes\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\InprocServer32] 1718512603
@="C:\Program Files\Common Files\System\OLE DB\sqloledb.dll"
"ThreadingModel"="Both"

[Software\Classes\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\OLE DB Enumerator] 1718512603

[Software\Classes\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\ProgID] 1718512603
@="SQLOLEDB Enumerator.1"

[Software\Classes\CLSID\{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}\VersionIndependentProgID] 1718512603
@="SQLOLEDB Enumerator"

[Software\Classes\FX.Rowset] 1718512600
@="FoxOLEDB 1.0 Object"

[Software\Classes\FX.Rowset\CLSID] 1718512600
@="{58ECEE30-E715-11CF-B0E3-00AA003F000F}"

[Software\Classes\FX.Rowset.1] 1718512600
@="FoxOLEDB 1.0 Object"

[Software\Classes\FX.Rowset.1\CLSID] 1718512600
@="{58ECEE30-E715-11CF-B0E3-00AA003F000F}"

[Software\Classes\SQLOLEDB] 1718512603
@="Microsoft OLE DB Provider for SQL Server"

[Software\Classes\SQLOLEDB\Clsid] 1718512603
@="{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}"

[Software\Classes\SQLOLEDB Enumerator] 1718512603
@="Microsoft OLE DB Enumerator for SQL Server"

[Software\Classes\SQLOLEDB Enumerator\Clsid] 1718512603
@="{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}"

[Software\Classes\SQLOLEDB Enumerator.1] 1718512603
@="Microsoft OLE DB Enumerator for SQL Server"

[Software\Classes\SQLOLEDB Enumerator.1\Clsid] 1718512603
@="{DFA22B8E-E68D-11d0-97E4-00C04FC2AD98}"

[Software\Classes\SQLOLEDB ErrorLookup] 1718512603
@="Microsoft OLE DB Error Lookup for SQL Server"

[Software\Classes\SQLOLEDB ErrorLookup\Clsid] 1718512603
@="{C0932C62-38E5-11d0-97AB-00C04FC2AD98}"

[Software\Classes\SQLOLEDB ErrorLookup.1] 1718512603
@="Microsoft OLE DB Error Lookup for SQL Server"

[Software\Classes\SQLOLEDB ErrorLookup.1\Clsid] 1718512603
@="{C0932C62-38E5-11d0-97AB-00C04FC2AD98}"

[Software\Classes\SQLOLEDB.1] 1718512603
@="Microsoft OLE DB Provider for SQL Server"

[Software\Classes\SQLOLEDB.1\Clsid] 1718512603
@="{0C7FF16C-38E3-11d0-97AB-00C04FC2AD98}"

[Software\Classes\Typelib\{2A75196C-D9EB-4129-B803-931327F72D5C}\2.8\0\win32] 1718512450
@="C:\Program Files\Common Files\System\ADO\msado15.dll"
EOF_REG

cat >"${WINE_PREFIX}/user.reg" <<'EOF_REG'
WINE REGISTRY Version 2
;; All keys relative to REGISTRY\User\S-1-5-21-0-0-0-1000

#arch=win32

[Software\Wine\DllOverrides] 1718512560
"*msado15"="native,builtin"
"*msdatl3"="native,builtin"
"*odbc32"="native,builtin"
"*odbccp32"="native,builtin"
"*oledb32"="native,builtin"
"*sqloledb"="native"
EOF_REG

cat >"${WINE_PREFIX}/userdef.reg" <<'EOF_REG'
WINE REGISTRY Version 2
;; All keys relative to REGISTRY\User\Default

#arch=win32
EOF_REG

printf '%s\n' "$(date -Is)" >"${READY_MARKER}"
echo "[INFO] MDAC/SQLOLEDB Wine prefix is ready: ${READY_MARKER}"

rm -rf "${EXTRACT_DIR}" "${SQL_OLEDB_DIR}" "${SQL_NET_DIR}" "${SQL_ODBC_DIR}" "${WDSETUP_DIR}" "${MDAC_XPAK_DIR}"
