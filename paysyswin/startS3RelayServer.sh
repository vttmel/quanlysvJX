export GNUTLS_SYSTEM_PRIORITY_FILE=/root/serversetup/paysyswin/PaySys/priorityGNU
export WINEARCH=win32
export WINEPREFIX=~/.win32  
cd /root/serversetup/paysyswin
rm -rf relayserver_log/*
nohup wine S3RelayServer.exe > /dev/null 2>&1 &
