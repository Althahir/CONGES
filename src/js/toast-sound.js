// Sons zen générés à la volée via Web Audio API.
// jouerSonToast : 2 notes (Ré 6 + La 6) — toasts classiques.
// jouerSonMaj   : 3 notes ascendantes (Ré → Fa# → La) — toast de mise à jour.
// Aucun fichier asset nécessaire.

window.jouerSonToast = function () {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const duree = 1.0;

        // Filtre passe-bas pour effet feutré (« derrière un oreiller ») : coupe les aigus.
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 800;
        lowpass.Q.value = 0.7;
        lowpass.connect(ctx.destination);

        // Note 1 — fondamentale (Ré 6 = 1175 Hz), aiguë mais douce
        const gain1 = ctx.createGain();
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.035, now + 0.06);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + duree);
        gain1.connect(lowpass);

        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 1175;
        osc1.connect(gain1);
        osc1.start(now);
        osc1.stop(now + duree);

        // Note 2 — quinte (La 6 = 1760 Hz), entre 200ms après pour l'effet mélodique
        const gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(0, now + 0.2);
        gain2.gain.linearRampToValueAtTime(0.025, now + 0.28);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + duree);
        gain2.connect(lowpass);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 1760;
        osc2.connect(gain2);
        osc2.start(now + 0.2);
        osc2.stop(now + duree);

        setTimeout(() => { try { ctx.close(); } catch (_) {} }, (duree + 0.4) * 1000);
    } catch (_) {
        // Audio bloqué (politique autoplay ou API indisponible) — ignoré.
    }
};

// Variante pour le toast « Mise à jour disponible ».
// Motif ascendant Ré → Fa# → La (accord parfait majeur) — sonne « positif, nouveauté ».
window.jouerSonMaj = function () {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const duree = 1.6;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 800;
        lowpass.Q.value = 0.7;
        lowpass.connect(ctx.destination);

        // Trois notes ascendantes : Ré 6, Fa# 6, La 6 (accord parfait majeur)
        const notes = [
            { freq: 1175, debut: 0,    volume: 0.04  },
            { freq: 1480, debut: 0.18, volume: 0.035 },
            { freq: 1760, debut: 0.36, volume: 0.03  },
        ];

        for (const n of notes) {
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now + n.debut);
            gain.gain.linearRampToValueAtTime(n.volume, now + n.debut + 0.06);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duree);
            gain.connect(lowpass);

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = n.freq;
            osc.connect(gain);
            osc.start(now + n.debut);
            osc.stop(now + duree);
        }

        setTimeout(() => { try { ctx.close(); } catch (_) {} }, (duree + 0.4) * 1000);
    } catch (_) {
        // Audio bloqué — ignoré.
    }
};
