// Million Dollar Hour - Timer & Session Logic
let sessionTimer = null;

function startSession() {
    // Check free session limit via localStorage
    let today = new Date().toDateString();
    let savedDate = localStorage.getItem('mdh_date');
    let sessionCount = parseInt(localStorage.getItem('mdh_count') || '0');

    if (savedDate !== today) {
        localStorage.setItem('mdh_date', today);
        localStorage.setItem('mdh_count', '0');
        sessionCount = 0;
    }

    if (sessionCount >= CONFIG.limits.freeSessionsPerDay) {
        alert("Aapke aaj ke free sessions poore ho gaye hain. Unlimited sessions ke liye Pro upgrade karein!");
        openUpgradeModal();
        return;
    }

    // Increment count and save start time
    localStorage.setItem('mdh_count', sessionCount + 1);
    localStorage.setItem('mdh_startTime', Date.now());

    // Switch screens
    document.getElementById('screen-home').classList.add('hidden');
    document.getElementById('screen-planning').classList.remove('hidden');
}

function lockPlan() {
    document.getElementById('screen-planning').classList.add('hidden');
    document.getElementById('screen-work').classList.remove('hidden');
    
    // Start the 60-min interval loop using timestamp logic
    sessionTimer = setInterval(updateTimer, 1000);
}

function updateTimer() {
    const startTime = parseInt(localStorage.getItem('mdh_startTime') || Date.now());
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const totalSec = 60 * 60; // 60 minutes
    const remainingSec = totalSec - elapsedSec;

    if (remainingSec <= 0) {
        clearInterval(sessionTimer);
        document.getElementById('timer-display').innerText = "00:00";
        alert("Session poora ho gaya! Review screen par chalte hain.");
        // TODO: Transition to review screen
        return;
    }

    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    document.getElementById('timer-display').innerText = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
