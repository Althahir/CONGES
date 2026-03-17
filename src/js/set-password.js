// Récupérer les infos utilisateur depuis sessionStorage
const user = JSON.parse(sessionStorage.getItem('user'));

// Si pas d'utilisateur en session, retour au login
if (!user) {
    window.location.href = 'login.html';
}

// Afficher le nom de l'utilisateur
document.getElementById('userName').textContent = `${user.prenom} ${user.nom}`;

// Gestion du formulaire
document.getElementById('setPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    // Masquer les messages précédents
    errorMessage.classList.remove('show');
    successMessage.classList.remove('show');
    errorMessage.textContent = '';
    successMessage.textContent = '';
    
    // Vérifications
    if (newPassword.length < 6) {
        errorMessage.textContent = 'Le mot de passe doit contenir au moins 6 caractères';
        errorMessage.classList.add('show');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        errorMessage.textContent = 'Les mots de passe ne correspondent pas';
        errorMessage.classList.add('show');
        return;
    }
    
    try {
        const result = await window.api.setPassword(user.id, newPassword);
        
        if (result.success) {
            successMessage.textContent = 'Mot de passe créé avec succès ! Redirection...';
            successMessage.classList.add('show');
            
// Redirection après 2 secondes
            setTimeout(async () => {
                if (user.role === 'admin') {
                    await window.api.navigateTo('dashboard-admin.html');
                } else {
                    await window.api.navigateTo('dashboard-user.html');
                }
            }, 2000);
        } else {
            errorMessage.textContent = 'Erreur lors de la création du mot de passe';
            errorMessage.classList.add('show');
        }
    } catch (error) {
        console.error('Erreur:', error);
        errorMessage.textContent = 'Une erreur est survenue. Veuillez réessayer.';
        errorMessage.classList.add('show');
    }
});

// ========== AFFICHER/MASQUER MOT DE PASSE ==========
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const icon = btn.querySelector('i');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        icon.classList.toggle('fa-eye', !isHidden);
        icon.classList.toggle('fa-eye-slash', isHidden);
    });
});