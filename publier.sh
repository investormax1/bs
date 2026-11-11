#!/usr/bin/env bash
# ---------------------------------------------------------------
# BookSwap — envoi du code sur GitHub (Linux / macOS)
# Utilisation :  bash publier.sh https://github.com/COMPTE/bookswap.git
# ---------------------------------------------------------------
set -e
DEPOT="$1"

if [ -z "$DEPOT" ]; then
  echo "Usage : bash publier.sh https://github.com/VOTRE-COMPTE/bookswap.git"
  exit 1
fi

if grep -q "VOTRE-PROJET" config.js; then
  echo "⚠  config.js n'est pas encore renseigné (SUPABASE_URL / SUPABASE_ANON_KEY)."
  read -r -p "Continuer quand même ? [o/N] " reponse
  [ "$reponse" = "o" ] || exit 1
fi

git init -q
git add .
git commit -q -m "BookSwap : publication" || echo "Rien à valider."
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$DEPOT"
git push -u origin main

echo
echo "✔ Code envoyé sur GitHub."
echo "→ Importez maintenant le dépôt sur https://vercel.com (Add New… → Project)."
