import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { loadLocalEnv } from '../common/config/load-env';

loadLocalEnv();

function parseArgs(): Record<string, string | boolean> {
  const args = process.argv.slice(2);
  const result: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        result[key] = args[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

/** Reads the order's server-computed total so the default webhook is a valid payment. */
function fetchOrderTotal(orderUrl: string): Promise<number> {
  const clientLib = new URL(orderUrl).protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    clientLib
      .get(orderUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GET ${orderUrl} returned ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data).totalPaise);
          } catch {
            reject(new Error(`GET ${orderUrl} returned invalid JSON: ${data}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function main() {
  const flags = parseArgs();

  const orderId = (flags.orderId as string) || (flags['order-id'] as string);
  if (!orderId) {
    console.error('❌ Error: --orderId <uuid> is required.');
    console.log(`
Usage:
  npm run send-webhook -- --orderId <uuid> --amount <paise> [options]

Options:
  --orderId <uuid>     The order UUID to pay
  --amount <paise>     Amount in paise (default: the order's total, fetched from the API)
  --eventId <string>   Custom event ID (default: random)
  --status <status>    Event status (default: 'captured')
  --bad-sig            Deliberately send an invalid HMAC signature
  --url <url>          Target webhook URL (default: http://localhost:3000/payments/webhook)
  --secret <secret>    Webhook shared secret (default: process.env.WEBHOOK_SECRET)
    `);
    process.exit(1);
  }

  const status = (flags.status as string) || 'captured';
  const eventId = (flags.eventId as string) || (flags['event-id'] as string) || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const secret = (flags.secret as string) || process.env.WEBHOOK_SECRET || 'pickup-secret-key-12345';
  const targetUrl = (flags.url as string) || 'http://localhost:3000/payments/webhook';

  let amountPaise: number;
  if (typeof flags.amount === 'string') {
    if (!/^-?\d+$/.test(flags.amount)) {
      console.error(`❌ Error: --amount must be an integer number of paise, got "${flags.amount}".`);
      process.exit(1);
    }
    amountPaise = parseInt(flags.amount, 10);
  } else {
    const orderUrl = new URL(`/orders/${encodeURIComponent(orderId)}`, targetUrl).toString();
    try {
      amountPaise = await fetchOrderTotal(orderUrl);
    } catch (err) {
      console.error(`❌ Error: could not read the order total (${(err as Error).message}). Pass --amount <paise> explicitly.`);
      process.exit(1);
    }
    console.log(`ℹ️ --amount not given: using the order total from the API (${amountPaise} paise).`);
  }
  const isBadSig = Boolean(flags['bad-sig'] || flags.badSig);

  const payload = {
    eventId,
    orderId,
    amountPaise,
    status,
  };

  const rawBody = JSON.stringify(payload);
  let signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  if (isBadSig) {
    console.log('⚠️ --bad-sig specified: Corrupting HMAC signature...');
    signature = signature.replace(/[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a'));
  }

  console.log('----------------------------------------------------');
  console.log(`Target URL:  ${targetUrl}`);
  console.log(`Event ID:    ${eventId}`);
  console.log(`Order ID:    ${orderId}`);
  console.log(`Amount:      ${amountPaise} paise`);
  console.log(`Status:      ${status}`);
  console.log(`Signature:   ${signature}`);
  console.log('----------------------------------------------------');

  const parsedUrl = new URL(targetUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const clientLib = isHttps ? https : http;

  const req = clientLib.request(
    targetUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
        'x-signature': signature,
      },
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log(`Response Status: ${res.statusCode} ${res.statusMessage}`);
        try {
          console.log('Response Body:', JSON.stringify(JSON.parse(data), null, 2));
        } catch {
          console.log('Response Body:', data);
        }
      });
    },
  );

  req.on('error', (err) => {
    console.error('❌ Request error:', err.message);
    process.exit(1);
  });

  req.write(rawBody);
  req.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
