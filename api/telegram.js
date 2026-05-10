import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WHOIS_API_URL = 'https://whois-api-proxy.vercel.app/api/whois';

const bot = new Telegraf(BOT_TOKEN);

function formatDate(dateStr) {
  if (!dateStr) return 'Tidak tersedia';
  return new Date(dateStr).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
}

const userCooldown = new Map();
function checkCooldown(userId) {
  const now = Date.now();
  const lastRequest = userCooldown.get(userId);
  const cooldownTime = 10000;
  if (lastRequest && (now - lastRequest) < cooldownTime) {
    return { allowed: false, remaining: Math.ceil((cooldownTime - (now - lastRequest)) / 1000) };
  }
  userCooldown.set(userId, now);
  return { allowed: true, remaining: 0 };
}

async function fetchWhois(domain) {
  try {
    const response = await fetch(`${WHOIS_API_URL}?domain=${encodeURIComponent(domain)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    return { error: true, message: error.message };
  }
}

function formatWhoisMessage(domain, data) {
  if (data.error || !data.existed) {
    return `❌ <b>WHOIS Lookup Gagal</b>\n\nDomain: <code>${domain}</code>\n\n⚠️ ${data.message || 'Domain tidak ditemukan'}\n\n💡 Contoh: /whois google.com`;
  }
  let message = `🔍 <b>WHOIS Lookup: ${domain}</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `📅 <b>Registrasi:</b>\n<code>${formatDate(data.createdDate)}</code>\n\n`;
  message += `⏰ <b>Kadaluarsa:</b>\n<code>${formatDate(data.expiryDate)}</code>\n\n`;
  if (data.expiryDate) {
    const daysLeft = Math.ceil((new Date(data.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 0) message += `${daysLeft < 30 ? '⚠️' : '✅'} <b>Sisa waktu:</b> <code>${daysLeft} hari</code>\n\n`;
  }
  message += `🏢 <b>Registrar:</b>\n<code>${data.registrar || 'Tidak tersedia'}</code>\n\n`;
  if (data.nameservers?.length) {
    message += `🌍 <b>Nameservers:</b>\n${data.nameservers.map(ns => `• <code>${ns}</code>`).join('\n')}\n\n`;
  }
  return message;
}

// Commands
bot.start(async (ctx) => {
  await ctx.reply(`🌐 <b>Selamat datang di WHOIS Lookup Bot!</b>\n\nKirimkan domain atau gunakan:\n<code>/whois nama-domain.com</code>\n\nContoh: <code>/whois google.com</code>`, {
    parse_mode: 'HTML',
    ...Markup.keyboard([['/whois google.com', '/whois github.com'], ['/help', '/about']]).resize()
  });
});

bot.help(async (ctx) => {
  await ctx.reply(`🆘 <b>Bantuan</b>\n\n• <code>/start</code> - Mulai\n• <code>/help</code> - Bantuan\n• <code>/whois &lt;domain&gt;</code> - Cek WHOIS\n• Kirim domain langsung (contoh: google.com)`, { parse_mode: 'HTML' });
});

bot.command('about', async (ctx) => {
  await ctx.reply(`ℹ️ <b>WHOIS Lookup Bot</b>\n\n🤖 Technology: Node.js + Telegraf + Vercel\n📦 Rate Limit: 30/menit\n👨‍💻 Developer: @Abiqnurmagedov17`, { parse_mode: 'HTML' });
});

bot.command('ping', async (ctx) => {
  const start = Date.now();
  await ctx.reply('🏓 Pong!', { parse_mode: 'HTML' });
  const latency = Date.now() - start;
  await ctx.reply(`Latency: <code>${latency}ms</code>`, { parse_mode: 'HTML' });
});

bot.command('whois', async (ctx) => {
  const userId = ctx.from.id;
  const cooldown = checkCooldown(userId);
  if (!cooldown.allowed) {
    return ctx.reply(`⏳ Tunggu ${cooldown.remaining} detik lagi.`);
  }
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply(`❌ Gunakan: <code>/whois domain.com</code>`, { parse_mode: 'HTML' });
  const domain = args[1].toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return ctx.reply(`❌ Domain tidak valid! Contoh: <code>google.com</code>`, { parse_mode: 'HTML' });
  }
  await ctx.replyWithChatAction('typing');
  const whoisData = await fetchWhois(domain);
  await ctx.reply(formatWhoisMessage(domain, whoisData), { parse_mode: 'HTML' });
});

bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;
  if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) {
    return ctx.reply(`❌ Kirimkan <b>nama domain</b> yang valid.\nContoh: <code>google.com</code>`, { parse_mode: 'HTML' });
  }
  const userId = ctx.from.id;
  const cooldown = checkCooldown(userId);
  if (!cooldown.allowed) return ctx.reply(`⏳ Tunggu ${cooldown.remaining} detik.`);
  await ctx.replyWithChatAction('typing');
  const whoisData = await fetchWhois(text);
  await ctx.reply(formatWhoisMessage(text, whoisData), { parse_mode: 'HTML' });
});

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('⚠️ Terjadi error. Coba lagi nanti.');
});

// Vercel webhook handler
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (req.query?.set_webhook === 'true') {
      await bot.telegram.setWebhook(`https://${req.headers.host}/api/telegram`);
    }
    await bot.handleUpdate(req.body, res);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ ok: false, error: error.message });
  }
}