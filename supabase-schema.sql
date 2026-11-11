-- =====================================================================
--  BookSwap — schéma Supabase (PostgreSQL)
--  À exécuter dans : Supabase → SQL Editor → New query → Run
--
--  Ce script est RÉ-EXÉCUTABLE : sur un site déjà publié, relancez-le
--  en entier pour mettre la base à niveau. Aucune donnée n'est effacée.
--
--  Version 2 :
--    • images des livres (1 principale + 3 autres) — Supabase Storage
--    • modification des annonces après publication (date « modifiée le »)
--    • un seul administrateur principal, qui peut nommer un co-administrateur
--    • protections côté serveur (un membre ne peut plus changer son rôle)
--
--  Version 3 (alignée sur le rapport : cas d'utilisation + besoins fonctionnels) :
--    • favoris (profil ↔ annonce)
--    • statut « réservé » en plus de « vendu »
--    • notation des vendeurs par l'acheteur (1 à 5) → réputation
--    • photo de profil
--    • notifications en temps réel des nouveaux messages
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILS  (extension de auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  nom        text not null default '',
  prenom     text not null default '',
  email      text not null,
  telephone  text not null default '',
  adresse    text not null default '',
  role       text not null default 'membre'  check (role   in ('membre','administrateur')),
  statut     text not null default 'actif'   check (statut in ('actif','banni')),
  credits      integer not null default 0,
  reputation   integer not null default 0,   -- Membre.reputation (diagramme de classes)
  niveau_acces integer not null default 1,   -- 2 = administrateur principal, 1 = autres
  created_at timestamptz not null default now()
);

-- Mise à niveau d'une base déjà créée
alter table public.profiles add column if not exists reputation   integer not null default 0;
alter table public.profiles add column if not exists niveau_acces integer not null default 1;
alter table public.profiles add column if not exists photo        text    not null default '';  -- v3 : photo de profil

-- ---------------------------------------------------------------------
-- 1 bis. UN SEUL ADMINISTRATEUR PRINCIPAL
--   niveau_acces = 2 → administrateur principal (unique)
--   niveau_acces = 1 → co-administrateur (si role = 'administrateur') ou membre
--   Sur une base existante, le plus ancien administrateur devient principal.
-- ---------------------------------------------------------------------
update public.profiles set niveau_acces = 1
 where role <> 'administrateur' and niveau_acces <> 1;
update public.profiles set niveau_acces = 2
 where role = 'administrateur' and niveau_acces > 2;
update public.profiles set niveau_acces = 1
 where role = 'administrateur' and niveau_acces = 2
   and id <> (select id from public.profiles
               where role = 'administrateur' and niveau_acces = 2
               order by created_at, id limit 1);
update public.profiles set niveau_acces = 2
 where id = (select id from public.profiles
              where role = 'administrateur' order by created_at, id limit 1)
   and not exists (select 1 from public.profiles
                    where role = 'administrateur' and niveau_acces = 2);

create unique index if not exists un_seul_admin_principal
  on public.profiles ((true)) where role = 'administrateur' and niveau_acces = 2;

-- ---------------------------------------------------------------------
-- 2. CATEGORIES
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id  bigserial primary key,
  nom text unique not null
);

insert into public.categories (nom) values
  ('Roman'), ('Sciences'), ('Histoire'), ('Informatique'),
  ('Jeunesse'), ('Art'), ('Langues'), ('Scolaire')
on conflict (nom) do nothing;

-- ---------------------------------------------------------------------
-- 3. ANNONCES  (le nom du vendeur est dénormalisé pour que les
--    visiteurs non connectés voient le catalogue sans accéder aux profils)
-- ---------------------------------------------------------------------
create table if not exists public.annonces (
  id            bigserial primary key,
  vendeur_id    uuid not null references public.profiles(id) on delete cascade,
  vendeur_nom   text not null default '',
  vendeur_ville text not null default '',
  titre         text not null,
  auteur        text not null,
  isbn          text not null default '',
  categorie     text not null default 'Roman',
  type          text not null default 'Vente' check (type in ('Vente','Échange','Don')),
  prix          numeric(10,2) not null default 0,
  annee         integer,
  etat          text not null default 'Bon état',
  description   text not null default '',
  statut        text not null default 'publiee',
  vues          integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Images (chemins dans le bucket Storage « livres ») et date de modification
alter table public.annonces add column if not exists image_principale text   not null default '';
alter table public.annonces add column if not exists images           text[] not null default '{}';
alter table public.annonces add column if not exists updated_at       timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'annonces_max_3_images') then
    alter table public.annonces
      add constraint annonces_max_3_images check (coalesce(cardinality(images), 0) <= 3);
  end if;
end $$;

-- Statuts (v3 : « reservee » ajouté — Gestion des transactions du rapport)
alter table public.annonces drop constraint if exists annonces_statut_check;
alter table public.annonces add constraint annonces_statut_check
  check (statut in ('publiee','signalee','reservee','archivee','vendue'));

create index if not exists annonces_statut_idx  on public.annonces (statut);
create index if not exists annonces_vendeur_idx on public.annonces (vendeur_id);

-- ---------------------------------------------------------------------
-- 4. MESSAGES
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id         bigserial primary key,
  de_id      uuid not null references public.profiles(id) on delete cascade,
  vers_id    uuid not null references public.profiles(id) on delete cascade,
  de_nom     text not null default '',
  vers_nom   text not null default '',
  annonce_id bigint references public.annonces(id) on delete set null,
  titre_annonce text not null default '',
  contenu    text not null,
  lu         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_vers_idx on public.messages (vers_id);

-- ---------------------------------------------------------------------
-- 5. SIGNALEMENTS
-- ---------------------------------------------------------------------
create table if not exists public.signalements (
  id            bigserial primary key,
  annonce_id    bigint references public.annonces(id) on delete cascade,
  titre_annonce text not null default '',
  motif         text not null default 'Autre',
  description   text not null default '',
  auteur        text not null default 'Visiteur anonyme',
  statut        text not null default 'en_attente' check (statut in ('en_attente','traite')),
  action        text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. TRANSACTIONS
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id         bigserial primary key,
  annonce_id bigint,
  titre      text not null default '',
  vendeur_id uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'Vente',
  montant    numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
-- v3 : l'acheteur est enregistré pour pouvoir noter le vendeur
alter table public.transactions add column if not exists acheteur_id  uuid references public.profiles(id) on delete set null;
alter table public.transactions add column if not exists acheteur_nom text not null default '';
create index if not exists transactions_acheteur_idx on public.transactions (acheteur_id);

-- ---------------------------------------------------------------------
-- 7. FAVORIS (v3) — « Ajouter des livres à une liste de favoris »
-- ---------------------------------------------------------------------
create table if not exists public.favoris (
  profil_id  uuid   not null references public.profiles(id) on delete cascade,
  annonce_id bigint not null references public.annonces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profil_id, annonce_id)
);

-- ---------------------------------------------------------------------
-- 8. ÉVALUATIONS (v3) — « Système de notation pour garantir la qualité
--    des échanges ». Une note (1-5) par transaction, donnée par l'acheteur.
--    Membre.reputation = moyenne arrondie des notes reçues.
-- ---------------------------------------------------------------------
create table if not exists public.evaluations (
  id             bigserial primary key,
  transaction_id bigint not null unique references public.transactions(id) on delete cascade,
  vendeur_id     uuid   not null references public.profiles(id) on delete cascade,
  acheteur_id    uuid   references public.profiles(id) on delete set null,
  acheteur_nom   text   not null default '',
  note           integer not null check (note between 1 and 5),
  commentaire    text   not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists evaluations_vendeur_idx on public.evaluations (vendeur_id);

-- =====================================================================
--  FONCTIONS
-- =====================================================================

-- L'utilisateur courant est-il administrateur ?
create or replace function public.est_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrateur'
  );
$$;

-- Création automatique du profil à l'inscription
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nom, prenom, email, telephone, adresse)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'telephone', ''),
    coalesce(new.raw_user_meta_data ->> 'adresse', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil();

-- Synchronisation du nom du vendeur dans les annonces
create or replace function public.sync_vendeur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.annonces
     set vendeur_nom   = trim(coalesce(new.prenom,'') || ' ' || coalesce(new.nom,'')),
         vendeur_ville = coalesce(new.adresse,'')
   where vendeur_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_profil_maj on public.profiles;
create trigger on_profil_maj
  after update of nom, prenom, adresse on public.profiles
  for each row execute function public.sync_vendeur();

-- Compteur de vues (le visiteur n'a pas le droit d'écrire sur les annonces)
create or replace function public.incrementer_vues(p_annonce bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.annonces set vues = vues + 1 where id = p_annonce;
$$;

-- Signaler une annonce : enregistre le signalement ET marque l'annonce.
-- Passe par une fonction car un visiteur n'a pas le droit d'écrire sur les annonces.
create or replace function public.signaler_annonce(
  p_annonce bigint, p_motif text, p_description text, p_auteur text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t text;
begin
  select titre into t from public.annonces where id = p_annonce;
  if t is null then raise exception 'Annonce introuvable'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Description obligatoire'; end if;

  insert into public.signalements (annonce_id, titre_annonce, motif, description, auteur)
  values (p_annonce, t, coalesce(nullif(trim(p_motif), ''), 'Autre'), trim(p_description),
          coalesce(nullif(trim(p_auteur), ''), 'Visiteur anonyme'));

  update public.annonces set statut = 'signalee'
   where id = p_annonce and statut = 'publiee';
end;
$$;

-- Conclure une vente : statut + transaction + crédits, en une seule opération.
-- v3 : l'acheteur (facultatif) est enregistré ; il pourra ensuite noter le vendeur.
drop function if exists public.conclure_annonce(bigint);
create or replace function public.conclure_annonce(p_annonce bigint, p_acheteur uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a public.annonces; ach public.profiles;
begin
  select * into a from public.annonces where id = p_annonce;
  if a.id is null then raise exception 'Annonce introuvable'; end if;
  if a.vendeur_id <> auth.uid() and not public.est_admin() then
    raise exception 'Action non autorisée';
  end if;
  if a.statut = 'vendue' then raise exception 'Cette annonce est déjà conclue'; end if;
  if p_acheteur is not null then
    select * into ach from public.profiles where id = p_acheteur;
    if ach.id is null then raise exception 'Acheteur introuvable'; end if;
    if ach.id = a.vendeur_id then raise exception 'Le vendeur ne peut pas être l''acheteur'; end if;
  end if;

  update public.annonces set statut = 'vendue' where id = a.id;
  insert into public.transactions (annonce_id, titre, vendeur_id, type, montant, acheteur_id, acheteur_nom)
  values (a.id, a.titre, a.vendeur_id, a.type, a.prix, ach.id,
          coalesce(nullif(trim(coalesce(ach.prenom,'') || ' ' || coalesce(ach.nom,'')), ''), ach.email, ''));
  update public.profiles set credits = credits + 5 where id = a.vendeur_id;
end;
$$;

-- Réserver / remettre en vente (v3) : « marquer un livre comme réservé »
create or replace function public.reserver_annonce(p_annonce bigint, p_reserver boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare a public.annonces; nouveau text;
begin
  select * into a from public.annonces where id = p_annonce;
  if a.id is null then raise exception 'Annonce introuvable'; end if;
  if a.vendeur_id <> auth.uid() and not public.est_admin() then
    raise exception 'Action non autorisée';
  end if;
  if p_reserver and a.statut <> 'publiee' then
    raise exception 'Seule une annonce en ligne peut être réservée';
  end if;
  if not p_reserver and a.statut <> 'reservee' then
    raise exception 'Cette annonce n''est pas réservée';
  end if;
  nouveau := case when p_reserver then 'reservee' else 'publiee' end;
  update public.annonces set statut = nouveau where id = a.id;
  return nouveau;
end;
$$;

-- Noter le vendeur après un achat (v3) : réservé à l'acheteur, une fois par transaction
create or replace function public.noter_transaction(p_transaction bigint, p_note integer, p_commentaire text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t public.transactions; v_nom text;
begin
  select * into t from public.transactions where id = p_transaction;
  if t.id is null then raise exception 'Transaction introuvable'; end if;
  if t.acheteur_id is distinct from auth.uid() then
    raise exception 'Seul l''acheteur peut noter cette transaction';
  end if;
  if p_note is null or p_note < 1 or p_note > 5 then raise exception 'La note doit être comprise entre 1 et 5'; end if;
  if exists (select 1 from public.evaluations where transaction_id = t.id) then
    raise exception 'Vous avez déjà noté cette transaction';
  end if;
  select coalesce(nullif(trim(coalesce(p.prenom,'') || ' ' || coalesce(p.nom,'')), ''), p.email)
    into v_nom from public.profiles p where p.id = auth.uid();
  insert into public.evaluations (transaction_id, vendeur_id, acheteur_id, acheteur_nom, note, commentaire)
  values (t.id, t.vendeur_id, auth.uid(), coalesce(v_nom, ''), p_note, left(coalesce(trim(p_commentaire), ''), 500));
end;
$$;

-- Réputation = moyenne arrondie des notes (recalculée à chaque ajout / suppression d'avis)
create or replace function public.maj_reputation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v uuid := coalesce(new.vendeur_id, old.vendeur_id);
begin
  update public.profiles
     set reputation = coalesce((select round(avg(note))::int from public.evaluations where vendeur_id = v), 0)
   where id = v;
  return null;
end;
$$;
drop trigger if exists maj_reputation_trg on public.evaluations;
create trigger maj_reputation_trg
  after insert or delete on public.evaluations
  for each row execute function public.maj_reputation();

-- Note moyenne publique d'un vendeur (affichée dans le catalogue, même aux visiteurs)
create or replace function public.avis_vendeur(p_vendeur uuid)
returns table (moyenne numeric, nombre integer)
language sql
security definer
stable
set search_path = public
as $$
  select round(avg(note), 1), count(*)::int from public.evaluations where vendeur_id = p_vendeur;
$$;

-- L'utilisateur courant est-il l'administrateur PRINCIPAL ?
create or replace function public.est_admin_principal()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrateur' and niveau_acces = 2
  );
$$;

-- Nombre maximum de co-administrateurs autorisés à côté du principal.
-- Pour en autoriser davantage, remplacez 1 par le nombre voulu et relancez le script.
create or replace function public.max_coadministrateurs()
returns integer
language sql
immutable
as $$ select 1 $$;

-- Bannir / réactiver un membre (réservé aux administrateurs)
create or replace function public.basculer_bannissement(p_profil uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare nouveau text; cible public.profiles;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_profil = auth.uid() then raise exception 'Vous ne pouvez pas bannir votre propre compte'; end if;

  select * into cible from public.profiles where id = p_profil;
  if cible.id is null then raise exception 'Utilisateur introuvable'; end if;
  if cible.role = 'administrateur' and cible.niveau_acces = 2 then
    raise exception 'L''administrateur principal ne peut pas être banni';
  end if;
  if cible.role = 'administrateur' and not public.est_admin_principal() then
    raise exception 'Seul l''administrateur principal peut bannir un administrateur';
  end if;

  nouveau := case when cible.statut = 'banni' then 'actif' else 'banni' end;

  update public.profiles set statut = nouveau where id = p_profil;
  -- Un co-administrateur banni perd immédiatement son rôle
  if nouveau = 'banni' and cible.role = 'administrateur' then
    update public.profiles set role = 'membre', niveau_acces = 1 where id = p_profil;
  end if;
  if nouveau = 'banni' then
    update public.annonces set statut = 'archivee'
     where vendeur_id = p_profil and statut <> 'vendue';
  end if;
  return nouveau;
end;
$$;

-- Existe-t-il déjà un administrateur ? (utilisé par l'écran de revendication)
create or replace function public.existe_administrateur()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'administrateur');
$$;

-- Premier administrateur : revendication depuis l'interface du site.
-- Refuse dès qu'un administrateur existe : impossible de s'auto-promouvoir ensuite.
create or replace function public.revendiquer_administrateur()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if exists (select 1 from public.profiles where role = 'administrateur') then
    raise exception 'Un administrateur existe déjà';
  end if;
  -- Le premier administrateur est l'administrateur PRINCIPAL.
  -- L'index unique « un_seul_admin_principal » bloque toute revendication simultanée.
  update public.profiles
     set role = 'administrateur', niveau_acces = 2
   where id = auth.uid() and statut = 'actif';
  if not found then raise exception 'Compte introuvable ou banni'; end if;
  return 'administrateur';
end;
$$;

-- ---------------------------------------------------------------------
--  ÉQUIPE D'ADMINISTRATION
--  Seul l'administrateur principal nomme, retire ou passe la main.
-- ---------------------------------------------------------------------

-- Nommer un co-administrateur (dans la limite de max_coadministrateurs())
create or replace function public.nommer_coadministrateur(p_profil uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cible public.profiles; n integer;
begin
  if not public.est_admin_principal() then
    raise exception 'Réservé à l''administrateur principal';
  end if;
  select * into cible from public.profiles where id = p_profil;
  if cible.id is null then raise exception 'Utilisateur introuvable'; end if;
  if cible.role = 'administrateur' then raise exception 'Cet utilisateur est déjà administrateur'; end if;
  if cible.statut <> 'actif' then raise exception 'Impossible de nommer un compte banni'; end if;

  -- Verrou : deux nominations simultanées ne peuvent pas dépasser la limite
  perform pg_advisory_xact_lock(hashtext('bookswap_coadmins'));
  select count(*) into n from public.profiles
   where role = 'administrateur' and niveau_acces <> 2;
  if n >= public.max_coadministrateurs() then
    raise exception 'Limite atteinte : % co-administrateur(s) au maximum. Retirez d''abord le co-administrateur actuel.',
      public.max_coadministrateurs();
  end if;

  update public.profiles set role = 'administrateur', niveau_acces = 1 where id = p_profil;
end;
$$;

-- Retirer le rôle d'un co-administrateur (il redevient membre)
create or replace function public.retirer_coadministrateur(p_profil uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cible public.profiles;
begin
  if not public.est_admin_principal() then
    raise exception 'Réservé à l''administrateur principal';
  end if;
  select * into cible from public.profiles where id = p_profil;
  if cible.id is null or cible.role <> 'administrateur' then
    raise exception 'Cet utilisateur n''est pas administrateur';
  end if;
  if cible.niveau_acces = 2 then
    raise exception 'L''administrateur principal ne peut pas se retirer : transférez d''abord le rôle';
  end if;
  update public.profiles set role = 'membre', niveau_acces = 1 where id = p_profil;
end;
$$;

-- Transférer le rôle principal à un co-administrateur.
-- L'ancien principal devient co-administrateur : il garde l'accès au panneau.
create or replace function public.transferer_admin_principal(p_profil uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cible public.profiles;
begin
  if not public.est_admin_principal() then
    raise exception 'Réservé à l''administrateur principal';
  end if;
  select * into cible from public.profiles where id = p_profil;
  if cible.id is null or cible.role <> 'administrateur' or cible.niveau_acces = 2 then
    raise exception 'Le rôle principal ne peut être transféré qu''à un co-administrateur';
  end if;
  if cible.statut <> 'actif' then raise exception 'Ce compte est banni'; end if;

  update public.profiles set niveau_acces = 1 where id = auth.uid();
  update public.profiles set niveau_acces = 2 where id = p_profil;
end;
$$;

-- =====================================================================
--  PROTECTIONS CÔTÉ SERVEUR (triggers)
--  Les écritures envoyées directement par le navigateur (rôles
--  « authenticated » / « anon ») sont contrôlées ici. Les fonctions
--  ci-dessus (security definer) et le SQL Editor ne sont pas concernés :
--  ils font leurs propres vérifications.
-- =====================================================================

-- PROFILS : un membre ne peut changer ni son rôle, ni ses crédits, ni son statut.
-- Un co-administrateur ne peut pas modifier le compte d'un autre administrateur.
create or replace function public.proteger_profil()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'administrateur' then
      raise exception 'Retirez d''abord le rôle d''administrateur de ce compte';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'Ce champ ne peut pas être modifié';
  end if;
  if new.role is distinct from old.role or new.niveau_acces is distinct from old.niveau_acces then
    raise exception 'Les rôles se gèrent depuis « Administrateurs », par l''administrateur principal';
  end if;

  if not public.est_admin() then
    if new.statut is distinct from old.statut or new.credits is distinct from old.credits
       or new.reputation is distinct from old.reputation then
      raise exception 'Action réservée aux administrateurs';
    end if;
  elsif old.role = 'administrateur' and old.id <> auth.uid() and not public.est_admin_principal() then
    raise exception 'Seul l''administrateur principal peut modifier le compte d''un autre administrateur';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_profil_trg on public.profiles;
create trigger proteger_profil_trg
  before update or delete on public.profiles
  for each row execute function public.proteger_profil();

-- ANNONCES : date de modification automatique ; un membre ne modifie que
-- le contenu de sa propre annonce (pas le vendeur, les vues ni le statut).
create or replace function public.proteger_annonce()
returns trigger
language plpgsql
set search_path = public
as $$
declare client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    new.updated_at := null;
    if client and not public.est_admin() then
      new.vues := 0;
      new.statut := 'publiee';
      new.created_at := now();
      select coalesce(nullif(trim(coalesce(p.prenom,'') || ' ' || coalesce(p.nom,'')), ''), p.email),
             coalesce(p.adresse, '')
        into new.vendeur_nom, new.vendeur_ville
        from public.profiles p where p.id = new.vendeur_id;
    end if;
    return new;
  end if;

  -- « Modifiée le » : uniquement quand le contenu de l'annonce change
  if (new.titre, new.auteur, new.isbn, new.categorie, new.type, new.prix, new.annee,
      new.etat, new.description, new.image_principale, new.images)
     is distinct from
     (old.titre, old.auteur, old.isbn, old.categorie, old.type, old.prix, old.annee,
      old.etat, old.description, old.image_principale, old.images) then
    new.updated_at := now();
  end if;

  if not client or public.est_admin() then
    return new;
  end if;

  new.vendeur_id    := old.vendeur_id;
  new.vendeur_nom   := old.vendeur_nom;
  new.vendeur_ville := old.vendeur_ville;
  new.vues          := old.vues;
  new.created_at    := old.created_at;
  if new.statut is distinct from old.statut then
    raise exception 'Le statut d''une annonce ne se modifie pas directement';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_annonce_trg on public.annonces;
create trigger proteger_annonce_trg
  before insert or update on public.annonces
  for each row execute function public.proteger_annonce();

-- Droits d'exécution des fonctions
grant execute on function public.est_admin()                                to anon, authenticated;
grant execute on function public.incrementer_vues(bigint)                   to anon, authenticated;
grant execute on function public.signaler_annonce(bigint, text, text, text) to anon, authenticated;
grant execute on function public.basculer_bannissement(uuid)                to authenticated;
grant execute on function public.existe_administrateur()                    to anon, authenticated;
grant execute on function public.revendiquer_administrateur()               to authenticated;
grant execute on function public.conclure_annonce(bigint, uuid)              to authenticated;
grant execute on function public.reserver_annonce(bigint, boolean)           to authenticated;
grant execute on function public.noter_transaction(bigint, integer, text)    to authenticated;
grant execute on function public.avis_vendeur(uuid)                          to anon, authenticated;
grant execute on function public.est_admin_principal()                      to anon, authenticated;
grant execute on function public.max_coadministrateurs()                    to anon, authenticated;
grant execute on function public.nommer_coadministrateur(uuid)              to authenticated;
grant execute on function public.retirer_coadministrateur(uuid)             to authenticated;
grant execute on function public.transferer_admin_principal(uuid)           to authenticated;

-- =====================================================================
--  SECURITE AU NIVEAU DES LIGNES (RLS)
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.categories   enable row level security;
alter table public.annonces     enable row level security;
alter table public.messages     enable row level security;
alter table public.signalements enable row level security;
alter table public.transactions enable row level security;

-- ---------- PROFILS ----------
drop policy if exists profils_lecture on public.profiles;
create policy profils_lecture on public.profiles for select
  using (auth.uid() = id or public.est_admin());

drop policy if exists profils_maj_soi on public.profiles;
create policy profils_maj_soi on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profils_admin_maj on public.profiles;
create policy profils_admin_maj on public.profiles for update
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists profils_admin_suppr on public.profiles;
create policy profils_admin_suppr on public.profiles for delete
  using (public.est_admin() and auth.uid() <> id);

-- ---------- CATEGORIES ----------
drop policy if exists cat_lecture on public.categories;
create policy cat_lecture on public.categories for select using (true);

drop policy if exists cat_admin on public.categories;
create policy cat_admin on public.categories for all
  using (public.est_admin()) with check (public.est_admin());

-- ---------- ANNONCES ----------
drop policy if exists ann_lecture_publique on public.annonces;
create policy ann_lecture_publique on public.annonces for select
  using (statut in ('publiee','signalee','reservee') or vendeur_id = auth.uid() or public.est_admin());

drop policy if exists ann_insert on public.annonces;
create policy ann_insert on public.annonces for insert
  with check (
    (vendeur_id = auth.uid()
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.statut = 'actif'))
    or public.est_admin()
  );

drop policy if exists ann_maj on public.annonces;
create policy ann_maj on public.annonces for update
  using (vendeur_id = auth.uid() or public.est_admin())
  with check (vendeur_id = auth.uid() or public.est_admin());

drop policy if exists ann_suppr on public.annonces;
create policy ann_suppr on public.annonces for delete
  using (vendeur_id = auth.uid() or public.est_admin());

-- ---------- MESSAGES ----------
drop policy if exists msg_lecture on public.messages;
create policy msg_lecture on public.messages for select
  using (de_id = auth.uid() or vers_id = auth.uid() or public.est_admin());

drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert
  with check (de_id = auth.uid());

drop policy if exists msg_maj on public.messages;
create policy msg_maj on public.messages for update
  using (vers_id = auth.uid() or public.est_admin())
  with check (vers_id = auth.uid() or public.est_admin());

drop policy if exists msg_suppr on public.messages;
create policy msg_suppr on public.messages for delete
  using (public.est_admin() or de_id = auth.uid());

-- ---------- SIGNALEMENTS (un visiteur anonyme peut signaler) ----------
drop policy if exists sig_insert on public.signalements;
create policy sig_insert on public.signalements for insert with check (true);

drop policy if exists sig_lecture on public.signalements;
create policy sig_lecture on public.signalements for select using (public.est_admin());

drop policy if exists sig_admin on public.signalements;
create policy sig_admin on public.signalements for update
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists sig_suppr on public.signalements;
create policy sig_suppr on public.signalements for delete using (public.est_admin());

-- ---------- TRANSACTIONS ----------
drop policy if exists tr_lecture on public.transactions;
create policy tr_lecture on public.transactions for select
  using (vendeur_id = auth.uid() or acheteur_id = auth.uid() or public.est_admin());

drop policy if exists tr_insert on public.transactions;
create policy tr_insert on public.transactions for insert
  with check (vendeur_id = auth.uid() or public.est_admin());

-- ---------- FAVORIS (v3) : chacun ne voit et ne modifie que les siens ----------
alter table public.favoris     enable row level security;
alter table public.evaluations enable row level security;

drop policy if exists fav_lecture on public.favoris;
create policy fav_lecture on public.favoris for select using (profil_id = auth.uid());
drop policy if exists fav_ajout on public.favoris;
create policy fav_ajout on public.favoris for insert with check (profil_id = auth.uid());
drop policy if exists fav_suppr on public.favoris;
create policy fav_suppr on public.favoris for delete using (profil_id = auth.uid());

-- ---------- ÉVALUATIONS (v3) : lecture publique, ajout via noter_transaction ----------
drop policy if exists eval_lecture on public.evaluations;
create policy eval_lecture on public.evaluations for select using (true);
drop policy if exists eval_admin_suppr on public.evaluations;
create policy eval_admin_suppr on public.evaluations for delete using (public.est_admin());

-- ---------- TEMPS RÉEL (v3) : notifications de messages + catalogue ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'annonces'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- =====================================================================
--  IMAGES DES LIVRES — Supabase Storage, bucket public « livres »
--  Chaque fichier est rangé sous  <id du compte>/<id de l'annonce>/…
--  Un membre n'écrit que dans son propre dossier ; l'administrateur partout.
--  Les images sont compressées dans le navigateur avant l'envoi.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('livres', 'livres', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists livres_lecture on storage.objects;
create policy livres_lecture on storage.objects for select to authenticated
  using (bucket_id = 'livres'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));

drop policy if exists livres_ajout on storage.objects;
create policy livres_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'livres' and (
    ((storage.foldername(name))[1] = auth.uid()::text
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.statut = 'actif'))
    or public.est_admin()));

drop policy if exists livres_maj on storage.objects;
create policy livres_maj on storage.objects for update to authenticated
  using (bucket_id = 'livres'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));

drop policy if exists livres_suppr on storage.objects;
create policy livres_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'livres'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));

-- =====================================================================
--  PREMIER ADMINISTRATEUR (= administrateur principal)
--  Rien à faire ici : créez votre compte sur le site, puis ouvrez
--  « Paramètres du profil » dans votre espace membre et cliquez sur
--  « Prendre le rôle d'administrateur ». Le bouton n'apparaît que tant
--  qu'aucun administrateur n'existe.
--
--  Ensuite : panneau d'administration → « Administrateurs » →
--  « Nommer un co-administrateur ».
--
--  Solution de secours, si besoin (SQL Editor) :
--    update public.profiles set role = 'administrateur', niveau_acces = 2
--    where email = 'votre.adresse@exemple.com';
--  (échoue si un autre administrateur principal existe déjà)
-- =====================================================================
