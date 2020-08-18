import stripe from 'stripe';
require('dotenv').config();

const client = new stripe(`${process.env.STRIPE_SECRET_KEY}`, { apiVersion: '2020-03-02' });

export const Stripe = {
  connect: async (code: string) => {
    const response = await client.oauth.token({
      /* eslint-disable @typescript-eslint/camelcase */
      grant_type: 'authorization_code',
      code
      /* eslint-enable @typescript-eslint/camelcase */
    });


    return response;
  },
  disconnect: async (stripeUserId: string) => {
    // @ts-ignore
    const response = await client.oauth.deauthorize({
      /* eslint-disable @typescript-eslint/camelcase */
      client_id: `${process.env.STRIPE_CLIENT_ID}`,
      stripe_user_id: stripeUserId
      /* eslint-enable @typescript-eslint/camelcase */
    });

    return response;
  },
  charge: async (amount: number, source: string, stripeAccount: string) => {
    debugger
    const res = await client.charges.create({
      amount,
      source: 'tok_visa',
      currency: 'usd',
      /* eslint-disable-next-line @typescript-eslint/camelcase */
      application_fee_amount: Math.round(amount * 0.05),
    }, {
      stripeAccount

    });
      if (res.status !== "succeeded") {
        throw new Error("failed to create charge with Stripe");
      }
  }
};
