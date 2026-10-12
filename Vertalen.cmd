@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ============================================================
rem  Vertalen.cmd
rem  Vertaalt de site met DeepL naar DE, EN, FR, IT en ES en zet het
rem  resultaat in het vertaalgeheugen (i18n\memory) van de root-map
rem  "PalletRotatorWebsite". Daarna commit en push naar git.
rem
rem  Gebruik:
rem    Vertalen.cmd                      alle talen (alleen wat nog niet vertaald is)
rem    Vertalen.cmd --lang de            alleen Duits
rem    Vertalen.cmd --import nalezen\de.csv --lang de
rem                                      gecorrigeerde nalezen-bestand terug in het geheugen
rem
rem  De DeepL-sleutel wordt gevraagd en NIET opgeslagen.
rem  Eerst publiceren (Publiceren.cmd), dan vertalen, dan in Portainer
rem  "Pull and redeploy".
rem ============================================================

set "ROOT=%~dp0..\PalletRotatorWebsite"
if not exist "%ROOT%\i18n\translate.mjs" (
    echo [FOUT] Root-map met de vertaalscripts niet gevonden: %ROOT%
    echo Voer eerst Publiceren.cmd uit van deze versie.
    pause
    exit /b 1
)
cd /d "%ROOT%"

where node >nul 2>&1
if errorlevel 1 (
    echo [FOUT] Node.js is niet gevonden. Installeer de LTS-versie:
    echo   https://nodejs.org/
    echo en start daarna dit bestand opnieuw.
    pause
    exit /b 1
)

if "%~1"=="--import" goto doimport

echo.
echo Stap 1 van 3: onderdelen installeren ^(eenmalig, kan even duren^)...
call npm install
if errorlevel 1 goto fout

echo.
echo Stap 2 van 3: Nederlandse site bouwen...
set "SITE_LANG=nl"
call npx astro build
if errorlevel 1 goto fout

echo.
echo Stap 3 van 3: vertalen met DeepL...
if "%DEEPL_API_KEY%"=="" (
    echo Plak je DeepL API-sleutel hieronder en druk op Enter.
    echo ^(Hij wordt niet opgeslagen en verdwijnt zodra dit venster sluit.^)
    set /p "DEEPL_API_KEY=Sleutel: "
)
node i18n\translate.mjs %*
if errorlevel 1 goto fout
goto opslaan

:doimport
node i18n\translate.mjs %*
if errorlevel 1 goto fout
goto opslaan

:opslaan
echo.
echo Vertaalgeheugen vastleggen in git...
git add i18n/memory i18n/nalezen i18n/glossary
git commit -m "Vertaalgeheugen bijgewerkt"
git push origin HEAD
if errorlevel 1 (
    echo [WAARSCHUWING] Pushen is niet gelukt. Controleer je git-inloggegevens.
)
echo.
echo ================================================
echo   Klaar. Nalezen-bestanden staan in:
echo   %ROOT%\i18n\nalezen
echo   Ga nu in Portainer naar de stack en kies "Pull and redeploy".
echo ================================================
start "" "%ROOT%\i18n\nalezen"
pause
exit /b 0

:fout
echo.
echo [FOUT] Er ging iets mis. Zie de melding hierboven.
pause
exit /b 1
