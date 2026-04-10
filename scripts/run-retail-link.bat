@echo off
REM ─────────────────────────────────────────────────────────────
REM  run-retail-link.bat
REM  Ejecuta el bot de Retail Link.
REM  Configurar en Windows Task Scheduler para correr a las 5:00 AM.
REM ─────────────────────────────────────────────────────────────

cd /d "C:\Users\IAN\Documents\bl-dashboard"

REM Variables de entorno (alternativa a .env.local)
REM Si ya están en .env.local NO necesitas descomentarlas aquí.
REM SET RL_USER=tu.usuario@empresa.com
REM SET RL_PASS=TuClave123
REM SET RL_PAIS=GT
REM SET RL_HEADLESS=true

REM Correr el bot
node scripts\retail-link-bot.mjs

REM Guardar código de salida
SET EXIT_CODE=%ERRORLEVEL%

IF %EXIT_CODE% NEQ 0 (
    echo [ERROR] Bot terminó con código %EXIT_CODE%
    echo Revisa el log en: data\retail-link\bot.log
)

exit /b %EXIT_CODE%
