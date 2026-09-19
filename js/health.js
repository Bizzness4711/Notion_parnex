function updateFinancialHealth({ totalIncome = 0, totalExpense = 0, savingsRate = 0, netBalance = 0 } = {}) {
    const scoreEl = document.getElementById('financialHealthScore');
    const ringEl = document.getElementById('financialHealthRing');
    const hintEl = document.getElementById('financialHealthHint');
    if (!scoreEl || !ringEl || !hintEl) return;

    const savingsScore = totalIncome > 0 ? Math.max(0, Math.min(40, savingsRate * 1.6)) : 0;
    const balanceScore = totalIncome > 0
        ? Math.max(0, Math.min(35, (netBalance / totalIncome) * 35 + 17.5))
        : 0;
    const currentBudgets = budgets.filter(b => b.month === currentMonth && Number(b.limit) > 0);
    let budgetScore = 12.5;
    let budgetUsage = 50;
    if (currentBudgets.length) {
        const usage = currentBudgets.reduce((sum, budget) => {
            return sum + Math.min(1.25, getBudgetSpent(budget.category, budget.month) / Number(budget.limit));
        }, 0) / currentBudgets.length;
        budgetUsage = Math.round(Math.min(100, usage * 100));
        budgetScore = Math.max(0, Math.min(25, 25 - usage * 20));
    }
    const dataScore = totalIncome > 0 || totalExpense > 0
        ? Math.round(Math.max(0, Math.min(100, savingsScore + balanceScore + budgetScore)))
        : 0;

    if (isHidden) {
        scoreEl.textContent = '••';
        ringEl.style.setProperty('--score', '0deg');
        hintEl.textContent = 'Gizlilik modu açık. Skor ayrıntıları gizlendi.';
        ['healthSavingsLabel', 'healthBalanceLabel', 'healthBudgetLabel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '••';
        });
        ['healthSavingsBar', 'healthBalanceBar', 'healthBudgetBar'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.width = '0%';
        });
        return;
    }

    scoreEl.textContent = dataScore || '--';
    ringEl.style.setProperty('--score', `${dataScore * 3.6}deg`);
    const tone = dataScore >= 75 ? 'strong' : dataScore >= 50 ? 'steady' : 'attention';
    ringEl.dataset.tone = tone;
    hintEl.textContent = !dataScore
        ? 'Skorunu oluşturmak için bu ay bir gelir ve birkaç işlem ekle.'
        : dataScore >= 75
            ? 'Ritmin güçlü görünüyor. Bu alışkanlıkları koru.'
            : dataScore >= 50
                ? 'İyi bir temel var. Bütçe ve tasarruf tarafında küçük iyileştirmeler yapabilirsin.'
                : 'Harcamalarını ve bütçe limitlerini gözden geçirmek iyi bir başlangıç olabilir.';

    const setMeter = (labelId, barId, label, value) => {
        const labelEl = document.getElementById(labelId);
        const barEl = document.getElementById(barId);
        if (labelEl) labelEl.textContent = label;
        if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, value))}%`;
    };
    setMeter('healthSavingsLabel', 'healthSavingsBar', `${Math.round(Math.max(0, savingsRate))}%`, savingsScore / 40 * 100);
    setMeter('healthBalanceLabel', 'healthBalanceBar', netBalance >= 0 ? 'Pozitif' : 'Negatif', balanceScore / 35 * 100);
    setMeter('healthBudgetLabel', 'healthBudgetBar', currentBudgets.length ? `%${budgetUsage}` : 'Plan yok', currentBudgets.length ? Math.max(0, 100 - budgetUsage) : 50);
}