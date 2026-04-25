"""
Génère DOCS/Guide_Installation_Conges_LCE.docx en reprenant le style visuel
du Guide Utilisateur (mêmes polices, couleurs --bleu / --mauve, logo).

À relancer après chaque modification du contenu (le docx est versionné).
Insertion des screenshots : remplacer les placeholders par les images
quand elles seront fournies.
"""

import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DOCX = os.path.join(ROOT, "DOCS", "Guide_Utilisateur_Conges_LCE.docx")
OUTPUT_DOCX = os.path.join(ROOT, "DOCS", "Guide_Installation_Conges_LCE.docx")
LOGO_PATH = os.path.join(ROOT, "src", "assets", "logo.png")

BLEU = RGBColor(0x00, 0x6C, 0x89)
MAUVE = RGBColor(0x74, 0x2B, 0x87)
ORANGE = RGBColor(0xED, 0x71, 0x11)
ROUGE = RGBColor(0xB5, 0x16, 0x3F)
GRIS = RGBColor(0x66, 0x66, 0x66)
GRIS_CLAIR = RGBColor(0xE0, 0xE0, 0xE0)
NOIR = RGBColor(0x33, 0x33, 0x33)

doc = Document()

# Mise en page identique au guide existant (Letter, marges 2cm)
section = doc.sections[0]
section.page_width = Emu(7772400)
section.page_height = Emu(10058400)
section.left_margin = Emu(899795)
section.right_margin = Emu(899795)
section.top_margin = Emu(720090)
section.bottom_margin = Emu(720090)

# Police par défaut
style_normal = doc.styles["Normal"]
style_normal.font.name = "Calibri"
style_normal.font.size = Pt(11)
style_normal.font.color.rgb = NOIR


def add_run(p, text, *, size=None, bold=False, color=None, italic=False):
    r = p.add_run(text)
    if size:
        r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    if color:
        r.font.color.rgb = color
    return r


def add_centered(text, *, size=None, bold=False, color=None, space_after=4):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(space_after)
    add_run(p, text, size=size, bold=bold, color=color)
    return p


def add_h1(text):
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(8)
    add_run(p, text, size=18, bold=True, color=BLEU)
    return p


def add_h2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    add_run(p, text, size=13, bold=True, color=BLEU)
    return p


def add_para(text, *, bold=False, color=None, size=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    add_run(p, text, size=size, bold=bold, color=color)
    return p


def add_toc_line(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    add_run(p, text, bold=True, color=BLEU)


def add_bullet(text):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(2)
    add_run(p, text)


def add_step(num, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.5)
    p.paragraph_format.space_after = Pt(4)
    add_run(p, f"  {num}.  ", bold=True, color=BLEU)
    add_run(p, text)


def add_astuce(text):
    """Encadré 'Astuce' (mauve, italique) — même style que dans le guide existant."""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    add_run(p, "  💡 Astuce — ", size=10, bold=True, color=MAUVE)
    add_run(p, text, size=10, color=MAUVE, italic=True)


def add_warning(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    add_run(p, "  ⚠️ Attention — ", size=10, bold=True, color=ORANGE)
    add_run(p, text, size=10, color=ORANGE)


def add_screenshot_placeholder(legende):
    """Bloc visuel marqué 'Capture d'écran à insérer' à remplacer plus tard."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    add_run(p, f"[ Capture d'écran à insérer : {legende} ]", size=10, italic=True, color=GRIS)
    # Bordure simulée par une ligne de tirets
    sep = doc.add_paragraph()
    sep.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sep.paragraph_format.space_after = Pt(8)
    add_run(sep, "─" * 60, size=8, color=GRIS_CLAIR)


def add_code(text):
    """Bloc de chemin/code en monospace gris clair."""
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.5)
    p.paragraph_format.space_after = Pt(4)
    r = add_run(p, text, size=10)
    r.font.name = "Consolas"


# ========== PAGE DE COUVERTURE ==========

# Logo centré (si présent)
if os.path.exists(LOGO_PATH):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(60)
    r = p.add_run()
    r.add_picture(LOGO_PATH, width=Cm(6))

doc.add_paragraph()
doc.add_paragraph()
add_centered("GESTION DES CONGÉS", size=36, bold=True, color=BLEU, space_after=4)
add_centered("Guide d'installation", size=20, color=MAUVE, space_after=24)
add_centered("La Ciotat Entreprendre", size=14, color=GRIS, space_after=2)
add_centered("Application développée par Excellium", size=11, color=GRIS, space_after=24)
add_centered("Version 1.0 — Avril 2026", size=10, color=GRIS)
add_centered("À destination du responsable d'installation", size=10, color=GRIS)

doc.add_page_break()

# ========== TABLE DES MATIÈRES ==========

p = doc.add_paragraph()
add_run(p, "Table des matières", size=20, bold=True, color=BLEU)

toc = [
    "1. Prérequis",
    "2. Contenu de la clé USB",
    "3. Installation de l'application",
    "   3.1 Lancer l'installeur",
    "   3.2 Avertissement Windows SmartScreen",
    "   3.3 Fin de l'installation",
    "4. Mise en place de la configuration",
    "   4.1 Ouvrir le dossier %APPDATA%",
    "   4.2 Copier le dossier conges-lce",
    "5. Premier lancement",
    "   5.1 Page de connexion",
    "   5.2 Création du mot de passe",
    "6. Vérifications après installation",
    "7. Dépannage",
    "   7.1 SmartScreen bloque l'installation",
    "   7.2 L'application ne démarre pas",
    "   7.3 « Configuration Turso introuvable »",
    "   7.4 Mot de passe oublié",
    "8. Contact / Support",
]
for line in toc:
    add_toc_line(line)

doc.add_page_break()

# ========== 1. PRÉREQUIS ==========

add_h1("1. Prérequis")
add_para("Avant d'installer l'application sur un poste utilisateur, vérifier les points suivants :")
add_bullet("Système d'exploitation : Windows 10 ou Windows 11.")
add_bullet("Droits administrateur local sur le poste (pour l'installation).")
add_bullet("Connexion Internet active (l'application se connecte à la base de données dans le cloud).")
add_bullet("Environ 200 Mo d'espace disque libre.")
add_astuce(
    "L'application n'a pas besoin d'être ouverte sur un compte utilisateur particulier de Windows : "
    "les données sont partagées entre tous les postes via le cloud."
)

# ========== 2. CONTENU DE LA CLÉ USB ==========

add_h1("2. Contenu de la clé USB")
add_para("La clé USB remise par l'administrateur de l'application contient :")
add_bullet("L'installateur de l'application : Gestion des Congés-1.0.0 Setup.exe")
add_bullet("Le dossier de configuration prêt à l'emploi : conges-lce (à copier dans %APPDATA%)")
add_bullet("Le présent guide d'installation (PDF ou Word)")
add_bullet("Le guide d'utilisation à remettre à chaque salarié après installation")
add_screenshot_placeholder("aperçu du contenu de la clé USB")

# ========== 3. INSTALLATION DE L'APPLICATION ==========

add_h1("3. Installation de l'application")

add_h2("3.1 Lancer l'installeur")
add_step(1, "Insérer la clé USB dans le poste utilisateur.")
add_step(2, "Ouvrir la clé USB depuis l'Explorateur de fichiers Windows.")
add_step(3, "Double-cliquer sur le fichier Gestion des Congés-1.0.0 Setup.exe.")
add_screenshot_placeholder("double-clic sur l'installeur")
add_para(
    "L'installation démarre automatiquement et ne demande aucun choix particulier. "
    "Une icône Gestion des Congés est créée sur le bureau et dans le menu Démarrer."
)

add_h2("3.2 Avertissement Windows SmartScreen")
add_para(
    "Windows peut afficher un avertissement bleu indiquant que l'éditeur n'est pas reconnu. "
    "Ce comportement est normal pour une application interne non signée commercialement."
)
add_step(1, "Cliquer sur Informations complémentaires.")
add_step(2, "Cliquer sur Exécuter quand même.")
add_screenshot_placeholder("écran SmartScreen avec le bouton 'Informations complémentaires'")
add_screenshot_placeholder("écran SmartScreen avec le bouton 'Exécuter quand même'")
add_warning(
    "Si vous ne voyez pas le bouton « Exécuter quand même », c'est que la stratégie de sécurité "
    "du poste l'a désactivé. Contactez l'administrateur réseau de l'entreprise."
)

add_h2("3.3 Fin de l'installation")
add_para(
    "L'installation se termine en quelques secondes. L'application se lance automatiquement "
    "à la fin de l'installation, mais il faut d'abord placer le fichier de configuration "
    "(étape suivante) avant qu'elle ne fonctionne."
)
add_step(1, "Si l'application est lancée automatiquement, fermer la fenêtre.")
add_step(2, "Vérifier qu'une icône Gestion des Congés est bien présente sur le bureau.")
add_screenshot_placeholder("icône de l'application sur le bureau")

# ========== 4. CONFIGURATION ==========

add_h1("4. Mise en place de la configuration")
add_para(
    "L'application a besoin d'un fichier de configuration (config.json) qui contient les "
    "identifiants pour se connecter à la base de données dans le cloud. Ce fichier est "
    "fourni dans le dossier conges-lce de la clé USB. Il suffit de le copier au bon endroit."
)

add_h2("4.1 Ouvrir le dossier %APPDATA%")
add_step(1, "Appuyer simultanément sur les touches Windows + R.")
add_step(2, "Dans la fenêtre Exécuter, taper :")
add_code("%APPDATA%")
add_step(3, "Cliquer sur OK ou appuyer sur Entrée.")
add_screenshot_placeholder("fenêtre 'Exécuter' avec %APPDATA% saisi")
add_para(
    "L'Explorateur Windows s'ouvre dans un dossier qui ressemble à : "
    "C:\\Users\\<nom-utilisateur>\\AppData\\Roaming"
)
add_screenshot_placeholder("Explorateur ouvert sur le dossier AppData/Roaming")

add_h2("4.2 Copier le dossier conges-lce")
add_step(1, "Depuis la clé USB, sélectionner le dossier conges-lce.")
add_step(2, "Faire un clic droit → Copier (ou Ctrl+C).")
add_step(3, "Revenir dans la fenêtre %APPDATA% ouverte à l'étape précédente.")
add_step(4, "Faire un clic droit dans une zone vide → Coller (ou Ctrl+V).")
add_screenshot_placeholder("le dossier conges-lce collé dans %APPDATA%")
add_warning(
    "Le dossier doit s'appeler exactement conges-lce (tout en minuscules, avec un tiret). "
    "Vérifier qu'il contient bien le fichier config.json à l'intérieur."
)
add_para(
    "Pour vérifier, double-cliquer sur le dossier conges-lce dans %APPDATA%. "
    "On doit voir au moins le fichier config.json."
)
add_screenshot_placeholder("contenu du dossier conges-lce avec config.json")

# ========== 5. PREMIER LANCEMENT ==========

add_h1("5. Premier lancement")

add_h2("5.1 Page de connexion")
add_step(1, "Double-cliquer sur l'icône Gestion des Congés sur le bureau.")
add_step(2, "L'application s'ouvre sur une page de connexion en plein écran.")
add_screenshot_placeholder("page de connexion de l'application")
add_para(
    "Saisir l'adresse e-mail du salarié (créée préalablement par l'administrateur) "
    "et le mot de passe temporaire qui lui a été communiqué."
)
add_astuce(
    "L'application mémorise les e-mails déjà saisis sur ce poste. Au prochain lancement, "
    "le champ e-mail propose une auto-complétion."
)

add_h2("5.2 Création du mot de passe")
add_para(
    "Lors de la première connexion d'un utilisateur, l'application demande de définir un mot "
    "de passe personnel à la place du mot de passe temporaire."
)
add_step(1, "Saisir un nouveau mot de passe.")
add_step(2, "Confirmer le mot de passe dans le second champ.")
add_step(3, "Cliquer sur Enregistrer.")
add_screenshot_placeholder("page de création du mot de passe")
add_para(
    "Une fois le mot de passe créé, l'utilisateur arrive sur son tableau de bord (« Mes Congés »). "
    "L'installation est terminée."
)

# ========== 6. VÉRIFICATIONS ==========

add_h1("6. Vérifications après installation")
add_para("Avant de remettre le poste à l'utilisateur, vérifier que tout fonctionne :")
add_bullet("L'icône Gestion des Congés est bien présente sur le bureau.")
add_bullet("Au lancement, la page de connexion s'affiche sans erreur.")
add_bullet("Après connexion, les soldes (CP N-1, CP N, RTT, Récup) s'affichent.")
add_bullet("Le calendrier annuel est visible dans la zone de droite.")
add_bullet("Le sélecteur d'année (en haut à droite) permet de changer d'année.")
add_para(
    "Si tout est conforme, déconnecter le compte test et remettre le poste à l'utilisateur "
    "avec son mot de passe temporaire personnel et le guide d'utilisation."
)

# ========== 7. DÉPANNAGE ==========

add_h1("7. Dépannage")

add_h2("7.1 SmartScreen bloque l'installation")
add_para(
    "Symptôme : un avertissement bleu Windows a protégé votre PC apparaît, sans bouton "
    "Exécuter quand même."
)
add_para(
    "Cause : la stratégie de sécurité du poste (souvent gérée par l'IT de l'entreprise) "
    "interdit l'exécution d'applications non signées."
)
add_para(
    "Solution : faire valider l'application par l'IT de l'entreprise, ou demander une "
    "autorisation temporaire pour ce poste."
)

add_h2("7.2 L'application ne démarre pas")
add_para(
    "Symptôme : l'icône lance brièvement une fenêtre qui se ferme aussitôt, ou rien ne se "
    "passe au double-clic."
)
add_para(
    "Solutions à tester dans l'ordre :"
)
add_step(1, "Vérifier que le dossier conges-lce existe dans %APPDATA% (étape 4).")
add_step(2, "Vérifier la connexion Internet du poste.")
add_step(3, "Désinstaller l'application via Paramètres → Applications, puis réinstaller.")

add_h2("7.3 « Configuration Turso introuvable »")
add_para(
    "Symptôme : au lancement, un message d'erreur indique que la base de données n'est pas "
    "configurée et donne le chemin attendu pour le fichier config.json."
)
add_para(
    "Cause : le dossier conges-lce n'a pas été copié dans %APPDATA%, ou il a été renommé."
)
add_para(
    "Solution : refaire l'étape 4 du présent guide. Le dossier doit s'appeler exactement "
    "conges-lce et contenir le fichier config.json."
)

add_h2("7.4 Mot de passe oublié")
add_para(
    "L'utilisateur ne peut pas récupérer son mot de passe lui-même. L'administrateur de "
    "l'application doit le réinitialiser depuis l'interface admin (section Salariés → "
    "bouton Réinitialiser le mot de passe sur la fiche du salarié concerné)."
)
add_para(
    "Un mot de passe temporaire est alors généré, et l'utilisateur sera invité à en définir "
    "un nouveau à sa prochaine connexion."
)

# ========== 8. CONTACT ==========

add_h1("8. Contact / Support")
add_para(
    "Pour toute question technique liée à l'installation ou au fonctionnement de l'application :"
)
add_bullet("Administrateur de l'application : [Nom — adresse e-mail]")
add_bullet("Éditeur (Excellium) : [adresse e-mail de support]")
add_para("")
add_para("Document version 1.0 — Avril 2026", color=GRIS, size=9)


# Sauvegarde
os.makedirs(os.path.dirname(OUTPUT_DOCX), exist_ok=True)
doc.save(OUTPUT_DOCX)
print(f"Généré : {OUTPUT_DOCX}")
print(f"Taille : {os.path.getsize(OUTPUT_DOCX)} octets")
