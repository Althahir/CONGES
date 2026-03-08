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