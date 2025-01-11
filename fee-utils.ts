interface FeeEstimates {
  [confirmationTarget: string]: number;
}

export async function getFeeEstimate(preferredConfirmation: number = 3): Promise<number> {
  try {
    const response = await fetch('https://api.nintondo.io/api/fee-estimates');
    const estimates: FeeEstimates = await response.json();
    
    // Convert the preferred confirmation target to string to match the API response
    const target = preferredConfirmation.toString();
    
    let feeRate: number;

    // If the exact target exists, use it
    if (estimates[target]) {
      feeRate = estimates[target];
    } else {
      // Otherwise, find the closest available target
      const availableTargets = Object.keys(estimates)
        .map(Number)
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);
      
      const closest = availableTargets.reduce((prev, curr) => {
        return Math.abs(curr - preferredConfirmation) < Math.abs(prev - preferredConfirmation) 
          ? curr 
          : prev;
      });
      
      feeRate = estimates[closest.toString()];
    }

    // Add 30% buffer to the fee rate
    const bufferedFeeRate = feeRate * 1.3;

    return Math.ceil(bufferedFeeRate);
  } catch (error) {
    console.error(chalk.red('Error fetching fee estimates:', error));
    // Return the default fee rate if the API call fails
    return CONFIG.feeRate;
  }
}

