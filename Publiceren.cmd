@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

for %%I in (.) do set "FOLDERNAME=%%~nxI"
set "ROOT=%~dp0..\palletrotator-website"

echo.
echo ================================================
echo   Publiceren vanuit: %FOLDERNAME%
echo   Naar root-map: %ROOT%
echo ================================================
echo.

if not exist "%ROOT%" (
    echo [FOUT] Root-map niet gevonden: %ROOT%
    echo Deze versie-map moet naast "palletrotator-website" staan.
    pause
    exit /b 1
)

echo Bestanden kopieren naar de root-map...
robocopy "%~dp0." "%ROOT%" /MIR /XD .git node_modules dist /XF Publiceren.cmd VERSION
if %ERRORLEVEL% GEQ 8 (
    echo [FOUT] Kopieren mislukt ^(robocopy code %ERRORLEVEL%^).
    pause
    exit /b 1
)

cd /d "%ROOT%"
git add -A
git commit -m "Publiceer %FOLDERNAME%"
git tag -a "%FOLDERNAME%" -m "Release %FOLDERNAME%" 2>nul

echo.
echo Pushen naar GitHub...
git push origin HEAD
if errorlevel 1 goto pushfout
git push origin "%FOLDERNAME%"

echo.
echo ================================================
echo   %FOLDERNAME% is gepubliceerd.
echo ================================================
echo LET OP: klik in Portainer nog op "Pull and redeploy".
pause
exit /b 0

:pushfout
echo [FOUT] Pushen mislukt. Controleer verbinding/inloggegevens.
pause
exit /b 1