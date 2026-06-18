import logger from './logger.js';

/**
 * Optional Twilio SMS — enabled when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER are set.
 */
export async function sendTwilioSms(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return false;
  }

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: from,
        Body: body.slice(0, 1600),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error('[Twilio] SMS failed:', errText);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[Twilio] SMS error:', err);
    return false;
  }
}
