@echo off
chcp 65001 > nul
title ScanJudicial Mobile - Streamlit
cls
echo ========================================================
echo        INICIANDO SCANJUDICIAL VIA STREAMLIT
echo ========================================================
echo.
py -m streamlit run streamlit_app.py
if errorlevel 1 (
    streamlit run streamlit_app.py
)
pause
