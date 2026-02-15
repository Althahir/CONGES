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