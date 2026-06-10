export GNUTLS_SYSTEM_PRIORITY_FILE=/root/serversetup/paysyswin/PaySys/priorityGNU
export WINEARCH=win32
export WINEPREFIX=~/.win32  
cd /root/serversetup/paysyswin
rm -rf payserver_log/*
nohup wine Sword3PaySys.exe > /dev/null 2>&1 &
