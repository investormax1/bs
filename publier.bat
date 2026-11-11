@echo off
REM ---------------------------------------------------------------
REM BookSwap - envoi du code sur GitHub (Windows)
REM Utilisation :  publier.bat https://github.com/COMPTE/bookswap.git
REM ---------------------------------------------------------------
if "%~1"=="" (
  echo Usage : publier.bat https://github.com/VOTRE-COMPTE/bookswap.git
  exit /b 1
)

findstr /C:"VOTRE-PROJET" config.js >nul
if %errorlevel%==0 (
  echo.
  echo ATTENTION : config.js n'est pas encore renseigne ^(SUPABASE_URL / SUPABASE_ANON_KEY^).
  pause
)

git init
git add .
git commit -m "BookSwap : publication"
git branch -M main
git remote remove origin 2>nul
git remote add origin %1
git push -u origin main

echo.
echo Code envoye sur GitHub.
echo Importez maintenant le depot sur https://vercel.com (Add New... -^> Project).
pause
