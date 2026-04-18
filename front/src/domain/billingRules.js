export const canBuyPlanFromWallet = ({ walletBalanceMinor, planPriceMinor }) =>
	Number(walletBalanceMinor || 0) >= Number(planPriceMinor || 0)
