@echo off
chcp 65001 > nul
title ScanJudicial - Servidor + Túnel HTTPS (Celular)
cls
echo ========================================================
echo   INICIANDO SCANJUDICIAL + TÚNEL HTTPS PARA CELULAR
echo ========================================================
echo.
echo [1/2] Iniciando servidor local na porta 8000...
start "ScanJudicial Backend" /min cmd /c "py -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload || python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 2 /nobreak > nul

echo [2/2] Gerando link HTTPS seguro (copie o link https://...lhr.life abaixo ou escaneie o QR Code):
echo.
:loop
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:127.0.0.1:8000 nokey@localhost.run
echo.
echo [Aviso] Reconectando tunel HTTPS automaticamente em 2 segundos...
timeout /t 2 /nobreak > nul
goto loop

