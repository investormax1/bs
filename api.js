/* =========================================================================
   BookSwap — couche d'accès aux données (Supabase)
   Expose l'objet global BS : authentification, profils, annonces,
   messages, signalements, transactions, catégories + utilitaires d'interface.
   Toutes les méthodes de données sont asynchrones (await).
   ========================================================================= */
"use strict";

const BS = (function () {

  /* ---------------------------------------------------------------
     1. CLIENT SUPABASE
     --------------------------------------------------------------- */
  const C = window.CONFIG || {};
  const configure = !/VOTRE/.test(C.SUPABASE_URL || "VOTRE") && !/VOTRE/.test(C.SUPABASE_ANON_KEY || "VOTRE");
  let SB = null;
  if (configure && window.supabase) {
    /* La session est conservée dans sessionStorage : elle vit le temps de
       l'onglet et disparaît à la fermeture du navigateur. Aucune reconnexion
       silencieuse lors d'une visite ultérieure. */
    let stockage;
    try { stockage = window.sessionStorage; } catch (e) { stockage = undefined; }
    SB = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true, storage: stockage,
        autoRefreshToken: true, detectSessionInUrl: true
      }
    });
  }
  function verifierConfig() {
    if (SB) return true;
    /* Rien n'est affiché au visiteur : le diagnostic reste dans la console. */
    console.error("[BookSwap] config.js : SUPABASE_URL et SUPABASE_ANON_KEY ne sont pas renseignés.");
    return false;
  }

  /* ---------------------------------------------------------------
     2. UTILITAIRES D'INTERFACE
     --------------------------------------------------------------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const emailValide = e => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(e).trim());
  const dateFR = d => { const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleDateString("fr-FR"); };
  const dateHeureFR = d => { const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleString("fr-FR"); };
  const moisFR = d => { const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); };
  const nomComplet = p => p ? (((p.prenom || "") + " " + (p.nom || "")).trim() || p.email || "—") : "—";
  function initiales(p) {
    const a = (p.prenom || "").trim(), b = (p.nom || "").trim();
    return ((a[0] || "") + (b[0] || "") || (p.email || "?")[0]).toUpperCase();
  }
  const prix = v => (Number(v) > 0 ? Number(v) + " " + (C.DEVISE || "DT") : "Gratuit");
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
  const COULEURS = ["#2563eb", "#f59e0b", "#0ea5e9", "#b45309", "#334155",
                    "#059669", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f"];
  const couleur = n => COULEURS[hash(String(n)) % COULEURS.length];

  function toast(txt) {
    let el = document.getElementById("bs-toast");
    if (!el) { el = document.createElement("div"); el.id = "bs-toast"; el.className = "toast"; document.body.appendChild(el); }
    el.textContent = txt; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function alerte(id, type, txt) { const e = document.getElementById(id); if (e) { e.className = "msg " + type; e.textContent = txt; } }
  function nettoyerAlerte(id) { const e = document.getElementById(id); if (e) { e.className = "msg"; e.textContent = ""; } }
  function ouvrir(id) { const m = document.getElementById(id); if (m) m.classList.add("open"); }
  function fermer(id) { const m = document.getElementById(id); if (m) m.classList.remove("open"); }
  function brancherModales() {
    document.querySelectorAll(".overlay").forEach(o =>
      o.addEventListener("click", e => { if (e.target === o) o.classList.remove("open"); }));
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") document.querySelectorAll(".overlay.open").forEach(o => o.classList.remove("open"));
    });
    activerOeilsMotDePasse();
  }

  /* Bouton « afficher / masquer » ajouté à chaque champ de mot de passe. */
  function activerOeilsMotDePasse(racine) {
    const zone = racine || document;
    if (!zone.querySelectorAll) return;
    zone.querySelectorAll('input[type="password"]').forEach(inp => {
      if (inp.dataset && inp.dataset.oeil === "1") return;
      if (inp.dataset) inp.dataset.oeil = "1";
      const parent = inp.parentNode; if (!parent) return;
      const dansIcone = parent.classList && parent.classList.contains("input-icon");
      if (dansIcone && parent.querySelector("button.eye")) return;

      let hote = parent;
      if (!dansIcone) {
        hote = document.createElement("span");
        hote.className = "champ-mdp";
        parent.insertBefore(hote, inp);
        hote.appendChild(inp);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = dansIcone ? "eye" : "oeil";
      b.textContent = "👁";
      b.title = "Afficher le mot de passe";
      b.setAttribute("aria-label", "Afficher le mot de passe");
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        const versTexte = inp.type === "password";
        inp.type = versTexte ? "text" : "password";
        b.textContent = versTexte ? "🙈" : "👁";
        b.title = versTexte ? "Masquer le mot de passe" : "Afficher le mot de passe";
        b.setAttribute("aria-label", b.title);
        b.setAttribute("aria-pressed", String(versTexte));
        if (inp.focus) inp.focus();
      });
      hote.appendChild(b);
    });
  }
  function chargement(actif) {
    let el = document.getElementById("bs-load");
    if (!el) {
      el = document.createElement("div"); el.id = "bs-load"; el.className = "chargement";
      el.innerHTML = "<span class='spin'></span> Chargement…";
      document.body.appendChild(el);
    }
    el.classList.toggle("on", !!actif);
  }
  const err = e => (e && (e.message || e.error_description)) || "Erreur inattendue.";

  /* ---------------------------------------------------------------
     3. AUTHENTIFICATION
     --------------------------------------------------------------- */
  let profilCache = null;

  async function inscrire(d) {
    const email = String(d.email || "").trim().toLowerCase();
    if (!String(d.nom || "").trim() || !String(d.prenom || "").trim() || !email || !d.motDePasse)
      return { ok: false, message: "Nom, prénom, e-mail et mot de passe sont obligatoires." };
    if (!emailValide(email)) return { ok: false, message: "Adresse e-mail invalide." };
    if (String(d.motDePasse).length < 6) return { ok: false, message: "Le mot de passe doit contenir au moins 6 caractères." };
    if (d.motDePasse !== d.confirmation) return { ok: false, message: "Les deux mots de passe ne correspondent pas." };

    const { data, error } = await SB.auth.signUp({
      email, password: d.motDePasse,
      options: {
        emailRedirectTo: location.origin + "/connexion.html",
        data: {
          nom: String(d.nom).trim(), prenom: String(d.prenom).trim(),
          telephone: String(d.telephone || "").trim(), adresse: String(d.adresse || "").trim()
        }
      }
    });
    if (error) {
      const m = /already registered|already exists/i.test(error.message)
        ? "Cette adresse e-mail est déjà utilisée." : err(error);
      return { ok: false, message: m };
    }
    /* Supabase peut ouvrir une session immédiatement : on la ferme pour
       imposer une authentification explicite. */
    await SB.auth.signOut();
    profilCache = null;
    const confirmation = !data.session;
    return {
      ok: true, confirmationRequise: confirmation,
      message: confirmation
        ? "Compte créé. Vérifiez votre boîte e-mail pour confirmer l'adresse, puis connectez-vous."
        : "Compte créé. Vous pouvez maintenant vous connecter."
    };
  }

  async function connecter(email, motDePasse) {
    email = String(email || "").trim().toLowerCase();
    if (!email || !motDePasse) return { ok: false, message: "Veuillez saisir votre e-mail et votre mot de passe." };
    if (!emailValide(email)) return { ok: false, message: "Format d'adresse e-mail invalide." };

    const { error } = await SB.auth.signInWithPassword({ email, password: motDePasse });
    if (error) {
      const m = /Email not confirmed/i.test(error.message)
        ? "Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail."
        : /Invalid login/i.test(error.message)
          ? "Identifiants invalides. Vérifiez votre e-mail et votre mot de passe."
          : err(error);
      return { ok: false, message: m };
    }
    profilCache = null;
    const p = await profil();
    if (!p) { await SB.auth.signOut(); return { ok: false, message: "Profil introuvable. Contactez l'administrateur." }; }
    if (p.statut === "banni") { await SB.auth.signOut(); profilCache = null; return { ok: false, message: "Ce compte a été banni par l'administrateur." }; }
    return { ok: true, profil: p, redirection: destination(p) };
  }

  async function deconnecter() { await SB.auth.signOut(); profilCache = null; }
  const destination = p => (p && p.role === "administrateur" ? "administrateur.html" : "membre.html");

  async function profil(forcer) {
    if (profilCache && !forcer) return profilCache;
    if (!SB) return null;
    const { data: s } = await SB.auth.getSession();
    if (!s || !s.session) return null;
    const { data, error } = await SB.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle();
    if (error || !data) return null;
    profilCache = data;
    return data;
  }

  /* Garde d'accès : à appeler en tête de chaque page privée */
  async function exigerRole(role) {
    if (!verifierConfig()) return null;
    const p = await profil(true);
    if (!p) { location.replace("connexion.html?auth=1"); return null; }
    if (p.statut === "banni") { await deconnecter(); location.replace("connexion.html?banni=1"); return null; }
    if (role && p.role !== role) { location.replace(destination(p)); return null; }
    return p;
  }

  /* Mot de passe oublié : envoi du lien de réinitialisation */
  async function envoyerLienReinitialisation(email) {
    email = String(email || "").trim().toLowerCase();
    if (!emailValide(email)) return { ok: false, message: "Adresse e-mail invalide." };
    const { error } = await SB.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/reinitialisation.html" });
    if (error) return { ok: false, message: err(error) };
    return { ok: true, message: "Un lien de réinitialisation vient d'être envoyé à " + email + "." };
  }
  async function definirNouveauMotDePasse(mdp, confirmation) {
    if (String(mdp || "").length < 6) return { ok: false, message: "Le mot de passe doit contenir au moins 6 caractères." };
    if (mdp !== confirmation) return { ok: false, message: "Les deux mots de passe ne correspondent pas." };
    const { error } = await SB.auth.updateUser({ password: mdp });
    if (error) return { ok: false, message: err(error) };
    return { ok: true, message: "Mot de passe modifié. Vous pouvez vous connecter." };
  }

  /* Existe-t-il déjà un administrateur sur la plateforme ? */
  async function existeAdministrateur() {
    const { data, error } = await SB.rpc("existe_administrateur");
    return error ? true : !!data;   // en cas de doute, on n'affiche pas la revendication
  }

  /* Premier administrateur : revendication depuis l'interface.
     La fonction SQL refuse si un administrateur existe déjà. */
  async function revendiquerAdministrateur() {
    const p = await profil();
    if (!p) return { ok: false, message: "Connectez-vous d'abord." };
    const { error } = await SB.rpc("revendiquer_administrateur");
    if (error) {
      const m = /existe/i.test(error.message)
        ? "Un administrateur existe déjà : demandez-lui de vous attribuer le rôle."
        : err(error);
      return { ok: false, message: m };
    }
    await profil(true);
    return { ok: true };
  }

  /* ---------------------------------------------------------------
     4. PROFILS
     --------------------------------------------------------------- */
  async function majProfil(d) {
    const p = await profil(); if (!p) return { ok: false, message: "Session expirée." };
    if (!String(d.nom || "").trim()) return { ok: false, message: "Le nom est obligatoire." };
    const { error } = await SB.from("profiles").update({
      nom: String(d.nom).trim(), prenom: String(d.prenom || "").trim(),
      telephone: String(d.telephone || "").trim(), adresse: String(d.adresse || "").trim()
    }).eq("id", p.id);
    if (error) return { ok: false, message: err(error) };
    if (d.motDePasse) {
      if (String(d.motDePasse).length < 6) return { ok: false, message: "Le nouveau mot de passe doit contenir au moins 6 caractères." };
      if (d.motDePasse !== d.confirmation) return { ok: false, message: "Les deux mots de passe ne correspondent pas." };
      const { error: e2 } = await SB.auth.updateUser({ password: d.motDePasse });
      if (e2) return { ok: false, message: err(e2) };
    }
    await profil(true);
    return { ok: true };
  }
  async function listerProfils() {
    const { data, error } = await SB.from("profiles").select("*").order("created_at", { ascending: true });
    return error ? [] : data;
  }
  /* Le rôle n'est PAS modifiable ici : il passe par l'équipe d'administration
     (administrateur principal). Le changement de statut passe par
     basculer_bannissement, qui applique les règles côté serveur. */
  async function majProfilAdmin(idP, d) {
    const moi = await profil();
    if (moi && moi.id === idP && d.statut === "banni")
      return { ok: false, message: "Vous ne pouvez pas bannir votre propre compte." };
    const { data: actuel } = await SB.from("profiles").select("statut").eq("id", idP).maybeSingle();
    const { error } = await SB.from("profiles").update({
      nom: String(d.nom || "").trim(), prenom: String(d.prenom || "").trim(),
      telephone: String(d.telephone || "").trim(), adresse: String(d.adresse || "").trim(),
      credits: Number(d.credits) || 0, reputation: Number(d.reputation) || 0
    }).eq("id", idP);
    if (error) return { ok: false, message: err(error) };
    if (actuel && d.statut && d.statut !== actuel.statut) return basculerBannissement(idP);
    return { ok: true };
  }
  async function basculerBannissement(idP) {
    const { data, error } = await SB.rpc("basculer_bannissement", { p_profil: idP });
    return error ? { ok: false, message: err(error) } : { ok: true, statut: data };
  }
  async function supprimerProfil(idP) {
    const moi = await profil();
    if (moi && moi.id === idP) return { ok: false, message: "Vous ne pouvez pas supprimer votre propre compte." };
    /* Les images des annonces du compte sont effacées du stockage après coup */
    const { data: ann } = await SB.from("annonces").select("image_principale, images").eq("vendeur_id", idP);
    const { error } = await SB.from("profiles").delete().eq("id", idP);
    if (error) return { ok: false, message: err(error) };
    await effacerFichiers((ann || []).flatMap(cheminsAnnonce));
    return { ok: true };
  }

  /* ---------------------------------------------------------------
     4 bis. ÉQUIPE D'ADMINISTRATION
     Un seul administrateur principal (niveau_acces = 2) ; il peut nommer
     un co-administrateur. Toutes les règles sont vérifiées par PostgreSQL.
     --------------------------------------------------------------- */
  const estAdminPrincipal = p => !!p && p.role === "administrateur" && Number(p.niveau_acces) === 2;
  const estCoAdmin = p => !!p && p.role === "administrateur" && Number(p.niveau_acces) !== 2;
  /* Vocabulaire du rapport (cas d'utilisation « Promouvoir en modérateur ») :
     le co-administrateur est appelé « Modérateur ». */
  const libelleRole = p => !p || p.role !== "administrateur" ? "Membre"
    : estAdminPrincipal(p) ? "Administrateur principal" : "Modérateur";

  async function maxCoAdministrateurs() {
    const { data, error } = await SB.rpc("max_coadministrateurs");
    return error ? 1 : Number(data) || 1;
  }
  async function appelEquipe(fn, idP) {
    const { error } = await SB.rpc(fn, { p_profil: idP });
    if (error) return { ok: false, message: err(error) };
    await profil(true);
    return { ok: true };
  }
  const nommerCoAdministrateur = idP => appelEquipe("nommer_coadministrateur", idP);
  const retirerCoAdministrateur = idP => appelEquipe("retirer_coadministrateur", idP);
  const transfererAdminPrincipal = idP => appelEquipe("transferer_admin_principal", idP);

  /* ---------------------------------------------------------------
     5. CATEGORIES
     --------------------------------------------------------------- */
  async function categories() {
    const { data, error } = await SB.from("categories").select("*").order("nom");
    return error ? [] : data;
  }
  async function ajouterCategorie(nom) {
    nom = String(nom || "").trim();
    if (!nom) return { ok: false, message: "Nom de catégorie vide." };
    const { error } = await SB.from("categories").insert({ nom });
    if (error) return { ok: false, message: /duplicate/i.test(error.message) ? "Cette catégorie existe déjà." : err(error) };
    return { ok: true };
  }
  async function renommerCategorie(idC, nom, ancien) {
    nom = String(nom || "").trim();
    if (!nom) return { ok: false, message: "Nom de catégorie vide." };
    const { error } = await SB.from("categories").update({ nom }).eq("id", idC);
    if (error) return { ok: false, message: err(error) };
    if (ancien) await SB.from("annonces").update({ categorie: nom }).eq("categorie", ancien);
    return { ok: true };
  }
  async function supprimerCategorie(idC) {
    const { error } = await SB.from("categories").delete().eq("id", idC);
    return error ? { ok: false, message: err(error) } : { ok: true };
  }

  /* ---------------------------------------------------------------
     6. ANNONCES
     --------------------------------------------------------------- */
  function valider(d) {
    if (!String(d.titre || "").trim()) return "Le titre du livre est obligatoire.";
    if (!String(d.auteur || "").trim()) return "L'auteur du livre est obligatoire.";
    if (d.type !== "Don" && (isNaN(Number(d.prix)) || Number(d.prix) <= 0))
      return "Indiquez un prix supérieur à 0 (ou choisissez le type « Don »).";
    if (d.annee && (Number(d.annee) < 1400 || Number(d.annee) > new Date().getFullYear() + 1))
      return "Année de publication invalide.";
    return null;
  }
  function corps(d) {
    return {
      titre: String(d.titre).trim(), auteur: String(d.auteur).trim(),
      isbn: String(d.isbn || "").trim(), categorie: d.categorie || "Roman",
      type: d.type || "Vente", prix: d.type === "Don" ? 0 : Number(d.prix) || 0,
      annee: d.annee ? Number(d.annee) : null, etat: d.etat || "Bon état",
      description: String(d.description || "").trim()
    };
  }
  /* Filtrage avancé (rapport) : genre, type, état du livre, zone géographique */
  async function catalogue(q, cat, type, etat, ville) {
    let r = SB.from("annonces").select("*").in("statut", ["publiee", "signalee", "reservee"]).order("created_at", { ascending: false });
    if (cat) r = r.eq("categorie", cat);
    if (type) r = r.eq("type", type);
    if (etat) r = r.eq("etat", etat);
    if (ville) r = r.eq("vendeur_ville", ville);
    q = String(q || "").trim();
    if (q) r = r.or(`titre.ilike.%${q}%,auteur.ilike.%${q}%,isbn.ilike.%${q}%`);
    const { data, error } = await r;
    return error ? [] : data;
  }
  async function mesAnnonces() {
    const p = await profil(); if (!p) return [];
    const { data, error } = await SB.from("annonces").select("*").eq("vendeur_id", p.id).order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async function toutesAnnonces() {
    const { data, error } = await SB.from("annonces").select("*").order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async function annonce(idA) {
    const { data } = await SB.from("annonces").select("*").eq("id", idA).maybeSingle();
    return data || null;
  }
  /* Renvoie { ok, id } : l'identifiant sert ensuite à ranger les images. */
  async function creerAnnonce(d, vendeur) {
    const e = valider(d); if (e) return { ok: false, message: e };
    const p = vendeur || await profil(); if (!p) return { ok: false, message: "Session expirée." };
    const { data, error } = await SB.from("annonces").insert(Object.assign(corps(d), {
      vendeur_id: p.id, vendeur_nom: nomComplet(p), vendeur_ville: p.adresse || "",
      statut: d.statut || "publiee"
    })).select("id").single();
    return error ? { ok: false, message: err(error) } : { ok: true, id: data.id };
  }
  async function majAnnonce(idA, d) {
    const e = valider(d); if (e) return { ok: false, message: e };
    const maj = corps(d);
    if (d.statut) maj.statut = d.statut;
    if (d.vendeur) { maj.vendeur_id = d.vendeur.id; maj.vendeur_nom = nomComplet(d.vendeur); maj.vendeur_ville = d.vendeur.adresse || ""; }
    const { error } = await SB.from("annonces").update(maj).eq("id", idA);
    return error ? { ok: false, message: err(error) } : { ok: true };
  }
  async function changerStatutAnnonce(idA, statut) {
    const { error } = await SB.from("annonces").update({ statut }).eq("id", idA);
    return error ? { ok: false, message: err(error) } : { ok: true };
  }
  async function supprimerAnnonce(idA) {
    const { data: a } = await SB.from("annonces").select("image_principale, images").eq("id", idA).maybeSingle();
    const { error } = await SB.from("annonces").delete().eq("id", idA);
    if (error) return { ok: false, message: err(error) };
    if (a) await effacerFichiers(cheminsAnnonce(a));
    return { ok: true };
  }
  /* acheteur (facultatif) : il pourra ensuite noter le vendeur */
  async function conclureAnnonce(idA, acheteur) {
    const { error } = await SB.rpc("conclure_annonce", { p_annonce: idA, p_acheteur: acheteur || null });
    return error ? { ok: false, message: err(error) } : { ok: true };
  }
  /* « Marquer comme réservé » / « Remettre en vente » */
  async function reserverAnnonce(idA, reserver) {
    const { data, error } = await SB.rpc("reserver_annonce", { p_annonce: idA, p_reserver: !!reserver });
    return error ? { ok: false, message: err(error) } : { ok: true, statut: data };
  }
  /* Villes présentes dans le catalogue, pour le filtre « zone géographique » */
  async function villesCatalogue() {
    const { data } = await SB.from("annonces").select("vendeur_ville").in("statut", ["publiee", "signalee", "reservee"]);
    const v = new Set((data || []).map(x => String(x.vendeur_ville || "").trim()).filter(Boolean));
    return Array.from(v).sort((a, b) => a.localeCompare(b, "fr"));
  }

  /* ---------------------------------------------------------------
     6 ter. FAVORIS (v3)
     --------------------------------------------------------------- */
  async function mesFavorisIds() {
    const p = await profil(); if (!p) return new Set();
    const { data } = await SB.from("favoris").select("annonce_id").eq("profil_id", p.id);
    return new Set((data || []).map(f => f.annonce_id));
  }
  async function mesFavoris() {
    const ids = Array.from(await mesFavorisIds());
    if (!ids.length) return [];
    const { data } = await SB.from("annonces").select("*").in("id", ids).order("created_at", { ascending: false });
    return data || [];
  }
  /* Ajoute ou retire ; renvoie { ok, favori: true|false } */
  async function basculerFavori(idA, estFavori) {
    const p = await profil(); if (!p) return { ok: false, message: "Connectez-vous pour gérer vos favoris." };
    const q = estFavori
      ? SB.from("favoris").delete().eq("profil_id", p.id).eq("annonce_id", idA)
      : SB.from("favoris").insert({ profil_id: p.id, annonce_id: idA });
    const { error } = await q;
    if (error && !/duplicate|23505/i.test(error.message || error.code || "")) return { ok: false, message: err(error) };
    return { ok: true, favori: !estFavori };
  }

  /* ---------------------------------------------------------------
     6 quater. NOTATION DES VENDEURS (v3)
     --------------------------------------------------------------- */
  const etoiles = n => { n = Math.round(Number(n) || 0); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); };
  async function avisVendeur(idVendeur) {
    const { data } = await SB.rpc("avis_vendeur", { p_vendeur: idVendeur });
    const r = Array.isArray(data) ? data[0] : data;
    return { moyenne: r && r.moyenne != null ? Number(r.moyenne) : null, nombre: r ? Number(r.nombre) || 0 : 0 };
  }
  async function evaluationsVendeur(idVendeur, limite) {
    const { data } = await SB.from("evaluations").select("*").eq("vendeur_id", idVendeur)
      .order("created_at", { ascending: false });
    return (data || []).slice(0, limite || 5);
  }
  async function mesAchats() {
    const p = await profil(); if (!p) return [];
    const { data } = await SB.from("transactions").select("*").eq("acheteur_id", p.id).order("created_at", { ascending: false });
    return data || [];
  }
  async function mesNotesDonnees() {
    const p = await profil(); if (!p) return [];
    const { data } = await SB.from("evaluations").select("*").eq("acheteur_id", p.id);
    return data || [];
  }
  async function noterTransaction(idT, note, commentaire) {
    note = Number(note);
    if (!(note >= 1 && note <= 5)) return { ok: false, message: "Choisissez une note de 1 à 5 étoiles." };
    const { error } = await SB.rpc("noter_transaction", {
      p_transaction: idT, p_note: note, p_commentaire: String(commentaire || "").trim()
    });
    return error ? { ok: false, message: err(error) } : { ok: true };
  }

  /* ---------------------------------------------------------------
     6 quinquies. PHOTO DE PROFIL (v3) — bucket « livres », dossier <compte>/profil/
     --------------------------------------------------------------- */
  function avatar(p, classe) {
    const src = p && p.photo ? urlImage(p.photo) : "";
    return `<div class="${classe || "avatar"}">${esc(initiales(p || {}))}` +
      (src ? `<img src="${esc(src)}" alt="" onerror="this.remove()">` : "") + `</div>`;
  }
  async function majPhotoProfil(fichier) {
    const p = await profil(); if (!p) return { ok: false, message: "Session expirée." };
    let blob;
    try { blob = await compresserImage(fichier, 512, 0.88); } catch (e) { return { ok: false, message: err(e) }; }
    const chemin = p.id + "/profil/" + Date.now().toString(36) + ".jpg";
    const up = await SB.storage.from(BUCKET).upload(chemin, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (up.error) return { ok: false, message: "Envoi impossible : " + err(up.error) };
    const { error } = await SB.from("profiles").update({ photo: chemin }).eq("id", p.id);
    if (error) { await effacerFichiers([chemin]); return { ok: false, message: err(error) }; }
    await effacerFichiers([p.photo]);
    await profil(true);
    return { ok: true, chemin };
  }
  async function supprimerPhotoProfil() {
    const p = await profil(); if (!p || !p.photo) return { ok: true };
    const { error } = await SB.from("profiles").update({ photo: "" }).eq("id", p.id);
    if (error) return { ok: false, message: err(error) };
    await effacerFichiers([p.photo]); await profil(true);
    return { ok: true };
  }

  /* ---------------------------------------------------------------
     6 sexies. NOTIFICATIONS (v3) — nouveau message reçu, en temps réel
     --------------------------------------------------------------- */
  function ecouterMessages(idMoi, rappel) {
    if (!SB || !SB.channel || !idMoi) return null;
    try {
      return SB.channel("messages-" + idMoi)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "vers_id=eq." + idMoi },
            charge => rappel(charge.new))
        .subscribe();
    } catch (e) { return null; }
  }
  async function incrementerVues(idA) { await SB.rpc("incrementer_vues", { p_annonce: idA }); }

  /* ---------------------------------------------------------------
     6 bis. IMAGES DES LIVRES — 1 principale + 3 autres
     Stockage : bucket public « livres », dossier <compte>/<annonce>/.
     Colonnes : annonces.image_principale (texte) et annonces.images (≤ 3).
     --------------------------------------------------------------- */
  const BUCKET = "livres";
  const MAX_IMAGES = 4;                      // 1 principale + 3 autres

  function urlImage(chemin) {
    if (!chemin) return "";
    if (/^https?:\/\//i.test(chemin)) return chemin;
    return SB ? SB.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl : "";
  }
  /* Liste ordonnée : la première est l'image principale. */
  const cheminsAnnonce = a => a ? [a.image_principale].concat(a.images || []).filter(Boolean) : [];
  const imagesAnnonce = a => cheminsAnnonce(a).map(urlImage);

  async function effacerFichiers(chemins) {
    const l = (chemins || []).filter(c => c && !/^https?:\/\//i.test(c));
    if (!l.length || !SB) return;
    try { await SB.storage.from(BUCKET).remove(l); } catch (e) { /* fichier orphelin : sans conséquence */ }
  }

  /* Couverture d'un livre : image principale, sinon la lettre colorée.
     Si l'image ne se charge pas, la lettre reste visible dessous. */
  function couverture(a, classe) {
    const lettre = esc((String(a.titre || "").trim()[0] || "?").toUpperCase());
    const src = urlImage(a.image_principale);
    return `<div class="${classe || "cover"}" style="background:${couleur(a.titre || "")}">` +
      `<span class="lettre">${lettre}</span>` +
      (src ? `<img src="${esc(src)}" alt="${esc(a.titre)}" loading="lazy" onerror="this.remove()">` : "") +
      `</div>`;
  }

  /* Redimensionne (1600 px max) et convertit en JPEG dans le navigateur :
     les photos de téléphone (5-10 Mo) passent à quelques centaines de Ko. */
  function lireImage(fichier) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(fichier), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("Format d'image non reconnu : « " + fichier.name + " »")); };
      img.src = url;
    });
  }
  async function compresserImage(fichier, max, qualite) {
    max = max || 1600; qualite = qualite || 0.85;
    if (!fichier || !/^image\//.test(fichier.type || ""))
      throw new Error("« " + (fichier && fichier.name || "fichier") + " » n'est pas une image.");
    if (fichier.size > 20 * 1024 * 1024) throw new Error("« " + fichier.name + " » dépasse 20 Mo.");
    let src;
    try { src = await createImageBitmap(fichier, { imageOrientation: "from-image" }); }
    catch (e) { src = await lireImage(fichier); }
    const w = src.width, h = src.height, r = Math.min(1, max / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * r)); cv.height = Math.max(1, Math.round(h * r));
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);   // fond blanc pour les PNG transparents
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    if (src.close) src.close();
    return new Promise((ok, ko) => cv.toBlob(b => b ? ok(b) : ko(new Error("Conversion de l'image impossible.")), "image/jpeg", qualite));
  }

  /* Éditeur d'images réutilisable (formulaires membre et administrateur).
     zone : élément conteneur. Renvoie { charger(annonce), etat(), marquer(chemins) }. */
  function editeurImages(zone) {
    if (typeof zone === "string") zone = document.getElementById(zone);
    zone.classList.add("images-editeur");
    let liste = [], initiaux = [];
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/jpeg,image/png,image/webp,image/*";
    input.multiple = true; input.hidden = true;
    zone.parentNode.insertBefore(input, zone.nextSibling);

    const liberer = () => liste.forEach(x => x.apercu && URL.revokeObjectURL(x.apercu));
    function rendre() {
      zone.innerHTML = liste.map((x, i) => `
        <div class="img-slot rempli${i === 0 ? " principale" : ""}">
          <img src="${esc(x.apercu || urlImage(x.chemin))}" alt="Image ${i + 1}">
          ${i === 0 ? '<span class="img-badge">★ Principale</span>'
                    : `<button type="button" class="img-btn etoile" data-img-principale="${i}" title="Définir comme image principale" aria-label="Définir comme image principale">★</button>`}
          <button type="button" class="img-btn suppr" data-img-suppr="${i}" title="Retirer cette image" aria-label="Retirer cette image">✕</button>
        </div>`).join("") +
        (liste.length < MAX_IMAGES ? `
        <button type="button" class="img-slot vide" data-img-ajout>
          <span class="plus">＋</span>
          <span>${liste.length === 0 ? "Image principale" : "Autre image"}</span>
          <small>${liste.length} / ${MAX_IMAGES}</small>
        </button>` : "");
    }
    async function ajouter(fichiers) {
      const place = MAX_IMAGES - liste.length;
      if (place <= 0) return toast("4 images maximum : 1 principale + 3 autres.");
      if (fichiers.length > place) toast(place + " image(s) ajoutée(s) seulement : 4 au maximum.");
      zone.classList.add("occupe");
      for (const f of fichiers.slice(0, place)) {
        try { const blob = await compresserImage(f); liste.push({ blob, apercu: URL.createObjectURL(blob) }); }
        catch (e) { toast(err(e)); }
      }
      zone.classList.remove("occupe");
      rendre();
    }
    input.addEventListener("change", () => { const f = Array.from(input.files || []); input.value = ""; ajouter(f); });
    zone.addEventListener("click", e => {
      if (e.target.closest("[data-img-ajout]")) return input.click();
      const s = e.target.closest("[data-img-suppr]");
      if (s) { const [x] = liste.splice(+s.dataset.imgSuppr, 1); if (x && x.apercu) URL.revokeObjectURL(x.apercu); return rendre(); }
      const p = e.target.closest("[data-img-principale]");
      if (p) { const [x] = liste.splice(+p.dataset.imgPrincipale, 1); liste.unshift(x); rendre(); }
    });
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("survol"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("survol"));
    zone.addEventListener("drop", e => {
      e.preventDefault(); zone.classList.remove("survol");
      ajouter(Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /^image\//.test(f.type)));
    });

    const api = {
      charger(a) { liberer(); liste = cheminsAnnonce(a).map(c => ({ chemin: c })); initiaux = liste.map(x => x.chemin); rendre(); },
      etat() { return { liste: liste.slice(), initiaux: initiaux.slice() }; },
      marquer(chemins) { liberer(); liste = chemins.map(c => ({ chemin: c })); initiaux = chemins.slice(); rendre(); }
    };
    api.charger(null);
    return api;
  }

  /* Envoie les nouvelles images, met à jour l'annonce, efface les images retirées. */
  async function enregistrerImages(idA, editeur) {
    const p = await profil(); if (!p) return { ok: false, message: "Session expirée." };
    const { liste, initiaux } = editeur.etat();
    const nouvelles = liste.filter(x => !x.chemin).length;
    const chemins = [], envoyes = [];
    if (!nouvelles && liste.map(x => x.chemin).join("|") === initiaux.join("|")) return { ok: true };

    for (const x of liste) {
      if (x.chemin) { chemins.push(x.chemin); continue; }
      const chemin = p.id + "/" + idA + "/" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
      const { error } = await SB.storage.from(BUCKET).upload(chemin, x.blob, {
        contentType: "image/jpeg", cacheControl: "31536000", upsert: false
      });
      if (error) { await effacerFichiers(envoyes); return { ok: false, message: "Envoi d'une image impossible : " + err(error) }; }
      envoyes.push(chemin); chemins.push(chemin);
    }
    const { error } = await SB.from("annonces")
      .update({ image_principale: chemins[0] || "", images: chemins.slice(1, MAX_IMAGES) }).eq("id", idA);
    if (error) { await effacerFichiers(envoyes); return { ok: false, message: err(error) }; }

    await effacerFichiers(initiaux.filter(c => chemins.indexOf(c) < 0));
    editeur.marquer(chemins);
    return { ok: true };
  }

  /* ---------------------------------------------------------------
     7. MESSAGES
     --------------------------------------------------------------- */
  async function envoyerMessage(vers, annonceObj, contenu) {
    contenu = String(contenu || "").trim();
    if (!contenu) return { ok: false, message: "Le message ne peut pas être vide." };
    const p = await profil(); if (!p) return { ok: false, message: "Connectez-vous pour envoyer un message." };
    const versId = typeof vers === "string" ? vers : vers.id;
    if (versId === p.id) return { ok: false, message: "Vous ne pouvez pas vous écrire à vous-même." };
    const { error } = await SB.from("messages").insert({
      de_id: p.id, vers_id: versId, de_nom: nomComplet(p),
      vers_nom: typeof vers === "string" ? (annonceObj ? annonceObj.vendeur_nom : "") : nomComplet(vers),
      annonce_id: annonceObj ? annonceObj.id : null,
      titre_annonce: annonceObj ? annonceObj.titre : "", contenu
    });
    return error ? { ok: false, message: err(error) } : { ok: true };
  }
  async function messagesRecus() {
    const p = await profil(); if (!p) return [];
    const { data, error } = await SB.from("messages").select("*").eq("vers_id", p.id).order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async function messagesEnvoyes() {
    const p = await profil(); if (!p) return [];
    const { data, error } = await SB.from("messages").select("*").eq("de_id", p.id).order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async function tousMessages() {
    const { data, error } = await SB.from("messages").select("*").order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async function marquerLu(idM) { await SB.from("messages").update({ lu: true }).eq("id", idM); }
  async function supprimerMessage(idM) {
    const { error } = await SB.from("messages").delete().eq("id", idM);
    return error ? { ok: false, message: err(error) } : { ok: true };
  }

  /* ---------------------------------------------------------------
     8. SIGNALEMENTS
     --------------------------------------------------------------- */
  async function signaler(a, motif, description, auteur) {
    if (!String(description || "").trim()) return { ok: false, message: "Veuillez décrire le problème rencontré." };
    /* Fonction SQL security definer : un visiteur anonyme n'a pas le droit
       d'écrire sur les annonces, la fonction s'en charge côté serveur. */
    const { error } = await SB.rpc("signaler_annonce", {
      p_annonce: a.id, p_motif: motif || "Autre",
      p_description: String(description).trim(),
      p_auteur: String(auteur || "").trim()
    });
    return error ? { ok: false, message: err(error) } : { ok: true };
  }
  async function signalements() {
    const { data, error } = await SB.from("signalements").select("*").order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async function traiterSignalement(s, action) {
    if (action === "supprimer" && s.annonce_id) await supprimerAnnonce(s.annonce_id);
    else if (action === "archiver" && s.annonce_id) await changerStatutAnnonce(s.annonce_id, "archivee");
    else if (action === "rejeter" && s.annonce_id) {
      const a = await annonce(s.annonce_id);
      if (a && a.statut === "signalee") await changerStatutAnnonce(a.id, "publiee");
    }
    const { error } = await SB.from("signalements").update({ statut: "traite", action }).eq("id", s.id);
    return error ? { ok: false, message: err(error) } : { ok: true };
  }
  async function supprimerSignalement(idS) {
    const { error } = await SB.from("signalements").delete().eq("id", idS);
    return error ? { ok: false, message: err(error) } : { ok: true };
  }

  /* ---------------------------------------------------------------
     9. TRANSACTIONS
     --------------------------------------------------------------- */
  /* Ventes du membre (il est le vendeur) */
  async function mesTransactions() {
    const p = await profil(); if (!p) return [];
    const { data, error } = await SB.from("transactions").select("*").eq("vendeur_id", p.id).order("created_at", { ascending: false });
    return error ? [] : data;
  }
  async function toutesTransactions() {
    const { data, error } = await SB.from("transactions").select("*").order("created_at", { ascending: false });
    return error ? [] : data;
  }

  /* ---------------------------------------------------------------
     10. API PUBLIQUE
     --------------------------------------------------------------- */
  return {
    SB, configure, verifierConfig, CONFIG: C,
    esc, emailValide, dateFR, dateHeureFR, moisFR, nomComplet, initiales, prix, couleur,
    toast, alerte, nettoyerAlerte, ouvrir, fermer, brancherModales, chargement, activerOeilsMotDePasse,
    inscrire, connecter, deconnecter, profil, exigerRole, destination,
    envoyerLienReinitialisation, definirNouveauMotDePasse, majProfil,
    existeAdministrateur, revendiquerAdministrateur,
    listerProfils, majProfilAdmin, basculerBannissement, supprimerProfil,
    estAdminPrincipal, estCoAdmin, libelleRole, maxCoAdministrateurs,
    nommerCoAdministrateur, retirerCoAdministrateur, transfererAdminPrincipal,
    categories, ajouterCategorie, renommerCategorie, supprimerCategorie,
    catalogue, mesAnnonces, toutesAnnonces, annonce, creerAnnonce, majAnnonce,
    changerStatutAnnonce, supprimerAnnonce, conclureAnnonce, reserverAnnonce, incrementerVues, villesCatalogue,
    mesFavorisIds, mesFavoris, basculerFavori,
    etoiles, avisVendeur, evaluationsVendeur, mesAchats, mesNotesDonnees, noterTransaction,
    avatar, majPhotoProfil, supprimerPhotoProfil, ecouterMessages,
    MAX_IMAGES, urlImage, imagesAnnonce, couverture, compresserImage, editeurImages, enregistrerImages,
    envoyerMessage, messagesRecus, messagesEnvoyes, tousMessages, marquerLu, supprimerMessage,
    signaler, signalements, traiterSignalement, supprimerSignalement,
    mesTransactions, toutesTransactions
  };
})();

/* Boutons afficher / masquer activés automatiquement sur toutes les pages */
if (typeof document !== "undefined" && document.addEventListener) {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => BS.activerOeilsMotDePasse());
  else BS.activerOeilsMotDePasse();
}
