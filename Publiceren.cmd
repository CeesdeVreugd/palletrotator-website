@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  Publiceren.cmd
rem  Commit + tag + push van de PalletRotator-website naar git.
rem  Simpelweg dubbelklikken om de laatste wijzigingen te publiceren.
rem  Vereist: Git for Windows (https://git-scm.com/download/win),
rem  en dat deze map al eenmalig als git-repo is ingesteld met een
rem  "origin" remote (zie README.md, stap 1).
rem ============================================================

if not exist VERSION (
    echo 1> VERSION
)

set /p VNUM=<VERSION
set VERSION=V%VNUM%

echo.
echo ================================================
echo   PalletRotator website publiceren - %VERSION%
echo ================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [FOUT] Git is niet gevonden. Installeer Git for Windows:
    echo   https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [FOUT] Deze map is nog geen git-repository.
    echo.
    echo Stel dit eenmalig in ^(zie README.md, stap 1^):
    echo   git init
    echo   git remote add origin ^<jullie-repo-url^>
    echo   git add -A
    echo   git commit -m "Initial commit"
    echo   git branch -M main
    echo   git push -u origin main
    echo.
    pause
    exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [FOUT] Er is nog geen "origin" remote ingesteld.
    echo   git remote add origin ^<jullie-repo-url^>
    echo.
    pause
    exit /b 1
)

rem Versienummer alvast ophogen en wegschrijven, zodat de volgende
rem keer publiceren automatisch de volgende V-versie gebruikt.
set /a NEXT=%VNUM%+1
echo %NEXT%> VERSION

echo Wijzigingen verzamelen en committen...
git add -A
git commit -m "Publiceer %VERSION% - %date% %time%"
if errorlevel 1 (
    echo   ^(geen nieuwe wijzigingen om te committen - er wordt alsnog getagd/gepusht^)
)

echo.
echo Tag %VERSION% aanmaken...
git tag -a %VERSION% -m "Release %VERSION%"
if errorlevel 1 (
    echo [WAARSCHUWING] Tag %VERSION% bestond mogelijk al en is overgeslagen.
)

echo.
echo Pushen naar de git-repository...
git push origin HEAD
if errorlevel 1 goto pushfout

git push origin %VERSION%
if errorlevel 1 goto pushfout

echo.
echo ================================================
echo   %VERSION% is gepubliceerd.
echo ================================================
echo.
echo LET OP: als de Portainer-stack GEEN automatische git-webhook
echo heeft ingesteld, ga dan naar Portainer en klik op de stack op
echo "Pull and redeploy" ^(met het vinkje "Re-pull image" aan^) om
echo %VERSION% ook echt live te zetten.
echo.
pause
exit /b 0

:pushfout
echo.
echo [FOUT] Pushen is mislukt. Controleer je internetverbinding en
echo je git-inloggegevens, en probeer het opnieuw.
echo.
pause
exit /b 1
