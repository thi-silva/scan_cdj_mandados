@echo off
chcp 65001 > nul
title ScanJudicial - Escaneamento Inteligente de Mandados
cls
echo ========================================================
echo        INICIANDO SCANJUDICIAL COM IA E CÂMERA
echo ========================================================
echo.
py run.py
if errorlevel 1 (
    echo.
    echo [Erro] Falha ao iniciar. Tentando com python direto...
    python run.py
)
pause
