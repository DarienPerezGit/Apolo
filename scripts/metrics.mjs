import fs from 'fs';
import path from 'path';

const metricsFile = path.resolve('metrics.json');

export function trackMetric(event, amountWei = '0') {
  try {
    let data = { created: 0, settled: 0, refunded: 0, volumeLockedWei: '0' };
    if (fs.existsSync(metricsFile)) {
      try {
        data = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      } catch (e) {
        // If file is corrupted, ignore and overwrite.
      }
    }

    if (event === 'created') {
      data.created += 1;
      const currentVol = BigInt(data.volumeLockedWei || '0');
      const addedVol = BigInt(amountWei || '0');
      data.volumeLockedWei = (currentVol + addedVol).toString();
    } else if (event === 'settled') {
      data.settled += 1;
    } else if (event === 'refunded') {
      data.refunded += 1;
    }

    fs.writeFileSync(metricsFile, JSON.stringify(data, null, 2));

    console.log(`\n📊 [METRICS] Bounties - Created: ${data.created} | Settled: ${data.settled} | Refunded: ${data.refunded}`);
    
    const bnbVolume = Number(BigInt(data.volumeLockedWei)) / 1e18;
    console.log(`📊 [METRICS] Volume Locked: ${bnbVolume} BNB\n`);

  } catch (error) {
    console.error('Failed to log metrics:', error);
  }
}
