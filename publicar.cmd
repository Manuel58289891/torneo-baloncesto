@echo off
rem Genera el sitio estatico y lo sube a GitHub (GitHub Pages lo publica en 1-2 minutos).
cd /d "%~dp0"
node build-static.js || goto :fin
git add docs
git commit -m "Actualizar resultados del torneo"
git push
:fin
pause
