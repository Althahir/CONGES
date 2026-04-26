// ========== AUTOCOMPLÉTION EMAILS (localStorage) ==========
(function () {
    const saved = JSON.parse(localStorage.getItem('knownEmails') || '[]');
    const datalist = document.getElementById('emailList');
    saved.forEach(email => {
        const option = document.createElement('option');
        option.value = email;
        datalist.appendChild(option);
    });
    // Pré-remplir avec le dernier email utilisé
    if (saved.length > 0) {
        document.getElementById('email').value = saved[0];
    }
})();

// ========== PRÉREMPLISSAGE MOT DE PASSE MÉMORISÉ ==========
async function rafraichirEtatRappel() {
    const email = document.getElementById('email').value.trim();
    const passwordInput = document.getElementById('password');
    const rememberCb = document.getElementById('rememberMe');
    const btnOublier = document.getElementById('btnOublierMdp');

    if (!email) {
        rememberCb.checked = false;
        btnOublier.style.display = 'none';
        return;
    }

    try {
        const stored = await window.api.getCredential(email);
        if (stored) {
            passwordInput.value = stored;
            rememberCb.checked = true;
            btnOublier.style.display = 'inline-block';
        } else {
            // L'email n'a pas de mot de passe mémorisé : on ne touche pas le champ password
            // (l'utilisateur peut être en train de changer de compte)
            rememberCb.checked = false;
            btnOublier.style.display = 'none';
        }
    } catch (e) {
        console.error('Erreur lecture credential:', e);
    }
}

// Au chargement initial (après pré-remplissage de l'email)
rafraichirEtatRappel();

// Quand l'utilisateur change l'email manuellement → re-check
document.getElementById('email').addEventListener('change', rafraichirEtatRappel);
document.getElementById('email').addEventListener('blur', rafraichirEtatRappel);

// Bouton "Oublier ce mot de passe"
document.getElementById('btnOublierMdp').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    if (!email) return;
    if (!confirm('Oublier le mot de passe mémorisé pour cet email ?')) return;
    await window.api.deleteCredential(email);
    document.getElementById('password').value = '';
    document.getElementById('rememberMe').checked = false;
    document.getElementById('btnOublierMdp').style.display = 'none';
});

function saveEmailToLocal(email) {
    let emails = JSON.parse(localStorage.getItem('knownEmails') || '[]');
    // Retirer si déjà présent, puis mettre en premier (le plus récent en tête)
    emails = emails.filter(e => e.toLowerCase() !== email.toLowerCase());
    emails.unshift(email);
    // Garder max 10 emails
    localStorage.setItem('knownEmails', JSON.stringify(emails.slice(0, 10)));
}

// ========== FORMULAIRE DE CONNEXION ==========
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    
    // Masquer les erreurs précédentes
    errorMessage.classList.remove('show');
    errorMessage.textContent = '';
    
    // Validation basique
    if (!email) {
        errorMessage.textContent = 'Veuillez saisir votre email';
        errorMessage.classList.add('show');
        return;
    }
    
    try {
        const result = await window.api.login(email, password);

        if (result.success) {
            // Mémoriser l'email sur ce poste
            saveEmailToLocal(email);

            // Mémoriser le mot de passe (chiffré via safeStorage) si la case est cochée
            const remember = document.getElementById('rememberMe').checked;
            try {
                if (remember) {
                    await window.api.saveCredential(email, password);
                } else {
                    // Si l'utilisateur a décoché alors qu'un mdp était mémorisé, le supprimer
                    await window.api.deleteCredential(email);
                }
            } catch (credErr) {
                console.error('Erreur sauvegarde credential:', credErr);
            }

            // Stocker les infos utilisateur en session
            sessionStorage.setItem('user', JSON.stringify(result.user));
            
// Si première connexion
            if (result.firstLogin) {
                await window.api.navigateTo('set-password.html');
            } else {
                // Rediriger selon le rôle
                if (result.user.role === 'admin') {
                    await window.api.navigateTo('dashboard-admin.html');
                } else {
                    await window.api.navigateTo('dashboard-user.html');
                }
            }
        } else {
            errorMessage.textContent = result.message || 'Email ou mot de passe incorrect';
            errorMessage.classList.add('show');
        }
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        errorMessage.textContent = 'Une erreur est survenue. Veuillez réessayer.';
        errorMessage.classList.add('show');
    }
});

// ========== AFFICHER/MASQUER MOT DE PASSE ==========

const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const eyeIcon = document.getElementById('eyeIcon');

if (togglePassword) {
    togglePassword.addEventListener('click', () => {
        // Basculer le type de l'input
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Changer l'icône
        if (type === 'text') {
            eyeIcon.classList.remove('fa-eye');
            eyeIcon.classList.add('fa-eye-slash');
        } else {
            eyeIcon.classList.remove('fa-eye-slash');
            eyeIcon.classList.add('fa-eye');
        }
    });
}