import { hashTypedData } from 'viem';

const domain = {
  name: 'Rebyt',
  version: '1',
  chainId: 97
};

const types = {
  PaymentIntent: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'condition', type: 'string' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }
  ]
};

export async function signPaymentIntent(walletClient, account, intent) {
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: 'PaymentIntent',
    message: intent
  });

  const intentHash = hashTypedData({
    domain,
    types,
    primaryType: 'PaymentIntent',
    message: intent
  });

  return { signature, intentHash };
}
