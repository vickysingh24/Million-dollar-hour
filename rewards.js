// Million Dollar Hour - Rewards & Gamification Logic
function calculateRewards(completedTasksCount) {
    let baseCoins = completedTasksCount * 100;
    let currentCoins = parseInt(localStorage.getItem('mdh_coins') || '0');
    let newTotalCoins = currentCoins + baseCoins;

    localStorage.setItem('mdh_coins', newTotalCoins);
    
    // Trigger virtual cash-register feedback
    console.log(`Earned ${baseCoins} coins! Total coins: ${newTotalCoins}`);
    alert(`Shabash! Aapne ${baseCoins} virtual coins kamaye. Total coins: ${newTotalCoins}`);
}

function getLadderRank(coins) {
    let title = "Intern";
    for (let i = 0; i < CONFIG.ladder.length; i++) {
        if (coins >= CONFIG.ladder[i].minCoins) {
            title = CONFIG.ladder[i].title;
        }
    }
    return title;
}
