import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';

// Konfigurasi Bot
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WHOIS_API_URL = 'https://whois-api-proxy.vercel.app/api/whois';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://whois-api-proxy.vercel.app/api/telegram';

// Inisialisasi bot
const bot = new Telegraf(BOT_TOKEN);

// Format tanggal ke format Indonesia
function formatDate(dateStr) {
  if (!dateStr) return 'Tidak tersedia';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Class untuk Rate Limit per user (memory-based sederhana)
const userCooldown = new Map();

function checkCooldown(userId) {
  const now = Date.now();
  const lastRequest = userCooldown.get(userId);
  const cooldownTime = 10000; // 10 detik
  
  if (lastRequest && (now - lastRequest) < cooldownTime) {
    const remaining = Math.ceil((cooldownTime - (now - lastRequest)) / 1000);
    return { allowed: false, remaining };
  }
  
  userCooldown.set(userId, now);
  return { allowed: true, remaining: 0 };
}

// Fungsi fetch WHOIS
async function fetchWhois(domain) {
  try {
    const response = await fetch(`${WHOIS_API_URL}?domain=${encodeURIComponent(domain)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('WHOIS API error:', error);
    return { error: true, message: error.message };
  }
}

// Format response WHOIS ke pesan
function formatWhoisMessage(domain, data) {
  if (data.error || !data.existed) {
    return `❌ <b>WHOIS Lookup Gagal</b>\n\n` +
           `Domain: <code>${domain}</code>\n\n` +
           `⚠️ ${data.message || 'Domain tidak ditemukan atau tidak valid'}\n\n` +
           `💡 <i>Contoh penggunaan yang benar:</i>\n` +
           `/whois google.com\n` +
           `/whois github.com`;
  }
  
  let message = `🔍 <b>WHOIS Lookup: ${domain}</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  message += `📅 <b>Registrasi:</b>\n`;
  message += `<code>${formatDate(data.createdDate)}</code>\n\n`;
  
  message += `⏰ <b>Kadaluarsa:</b>\n`;
  message += `<code>${formatDate(data.expiryDate)}</code>\n\n`;
  
  // Hitung sisa hari
  if (data.expiryDate) {
    const expiry = new Date(data.expiryDate);
    const now = new Date();
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft > 0) {
      const emoji = daysLeft < 30 ? '⚠️' : '✅';
      message += `${emoji} <b>Sisa waktu:</b> <code>${daysLeft} hari</code>\n\n`;
    }
  }
  
  message += `🏢 <b>Registrar:</b>\n`;
  message += `<code>${data.registrar || 'Tidak tersedia'}</code>\n\n`;
  
  if (data.nameservers && data.nameservers.length > 0) {
    message += `🌍 <b>Nameservers:</b>\n`;
    data.nameservers.forEach(ns => {
      message += `• <code>${ns}</code>\n`;
    });
    message += `\n`;
  }
  
  if (data.status && data.status.length > 0) {
    message += `📊 <b>Status:</b>\n`;
    data.status.slice(0, 5).forEach(status => {
      message += `• ${status}\n`;
    });
  }
  
  return message;
}

// ============================================================
// BOT COMMANDS
// ============================================================

// Start command
bot.start(async (ctx) => {
  const welcomeMessage = `🌐 <b>Selamat datang di WHOIS Lookup Bot!</b>\n\n` +
    `Bot ini membantu Anda mengecek informasi kepemilikan domain seperti:\n` +
    `• Tanggal registrasi & kadaluarsa\n` +
    `• Registrar / penyedia domain\n` +
    `• Nameservers (DNS)\n` +
    `• Status domain\n` +
    `• Sisa waktu hingga kadaluarsa\n\n` +
    `<b>📌 Cara Penggunaan:</b>\n` +
    `Kirimkan domain atau gunakan command:\n` +
    `<code>/whois nama-domain.com</code>\n\n` +
    `<b>📝 Contoh:</b>\n` +
    `<code>/whois google.com</code>\n` +
    `<code>/whois github.com</code>\n\n` +
    `Bot ini gratis dan tidak ada batasan penggunaan! 🚀`;
  
  await ctx.reply(welcomeMessage, {
    parse_mode: 'HTML',
    ...Markup.keyboard([
      ['/whois google.com', '/whois github.com'],
      ['/whois twitter.com', '/whois microsoft.com'],
      ['/help', '/about']
    ]).resize()
  });
});

// Help command
bot.help(async (ctx) => {
  const helpMessage = `🆘 <b>Bantuan Penggunaan</b>\n\n` +
    `<b>📝 Command yang tersedia:</b>\n` +
    `• <code>/start</code> - Memulai bot\n` +
    `• <code>/help</code> - Menampilkan bantuan ini\n` +
    `• <code>/about</code> - Informasi tentang bot\n` +
    `• <code>/whois &lt;domain&gt;</code> - Cek WHOIS domain\n` +
    `• <code>/ping</code> - Cek status bot\n\n` +
    `<b>💡 Tips:</b>\n` +
    `• Cukup kirim nama domain saja (tanpa command)\n` +
    `• Contoh format domain: google.com (tanpa http://)\n` +
    `• Bot akan membalas dengan informasi lengkap domain`;
  
  await ctx.reply(helpMessage, { parse_mode: 'HTML' });
});

// About command
bot.command('about', async (ctx) => {
  const aboutMessage = `ℹ️ <b>Tentang Bot Ini</b>\n\n` +
    `🤖 <b>Nama:</b> WHOIS Lookup Bot\n` +
    `📡 <b>API:</b> Custom WHOIS API Proxy\n` +
    `⚡ <b>Technology:</b> Node.js + Telegraf + Vercel\n` +
    `📦 <b>Rate Limit:</b> 30 request per 60 detik (per IP)\n` +
    `💾 <b>Cache:</b> Redis Upstash\n\n` +
    `👨‍💻 <b>Developer:</b> @Abiqnurmagedov17\n\n` +
    `✨ Bot ini menggunakan sliding window rate limiting untuk performa optimal!`;
  
  await ctx.reply(aboutMessage, { parse_mode: 'HTML' });
});

// Ping command
bot.command('ping', async (ctx) => {
  const start = Date.now();
  await ctx.reply('🏓 Pinging...');
  const latency = Date.now() - start;
  await ctx.reply(`🏓 Pong! Latency: <code>${latency}ms</code>`, { parse_mode: 'HTML' });
});

// WHOIS command
bot.command('whois', async (ctx) => {
  const userId = ctx.from.id;
  const cooldown = checkCooldown(userId);
  
  if (!cooldown.allowed) {
    await ctx.reply(`⏳ <b>Mohon tunggu ${cooldown.remaining} detik</b> sebelum melakukan request lagi.\n\nIni untuk menjaga performa bot.`, {
      parse_mode: 'HTML'
    });
    return;
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    await ctx.reply(
      `❌ <b>Format salah!</b>\n\n` +
      `Gunakan: <code>/whois nama-domain.com</code>\n\n` +
      `Contoh: <code>/whois google.com</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }
  
  const domain = args[1].toLowerCase().trim();
  
  // Validasi domain sederhana
  if (!domain.match(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i)) {
    await ctx.reply(
      `❌ <b>Domain tidak valid!</b>\n\n` +
      `Pastikan format domain benar.\n` +
      `Contoh: <code>google.com</code>, <code>github.io</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }
  
  await ctx.replyWithChatAction('typing');
  
  try {
    const whoisData = await fetchWhois(domain);
    const message = formatWhoisMessage(domain, whoisData);
    
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Command error:', error);
    await ctx.reply(
      `❌ <b>Terjadi kesalahan</b>\n\n` +
      `Gagal memproses domain <code>${domain}</code>.\n` +
      `Silakan coba beberapa saat lagi.`,
      { parse_mode: 'HTML' }
    );
  }
});

// Handle text messages (tanpa command)
bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Skip jika itu command
  if (text.startsWith('/')) return;
  
  // Cek apakah text adalah domain (sederhana)
  const domainRegex = /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!domainRegex.test(text)) {
    await ctx.reply(
      `❌ <b>Input tidak dikenali</b>\n\n` +
      `Kirimkan <b>nama domain</b> atau gunakan command <code>/help</code> untuk bantuan.\n\n` +
      `Contoh domain yang valid:\n` +
      `• <code>google.com</code>\n` +
      `• <code>github.io</code>\n` +
      `• <code>vercel.app</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }
  
  const userId = ctx.from.id;
  const cooldown = checkCooldown(userId);
  
  if (!cooldown.allowed) {
    await ctx.reply(`⏳ Tunggu ${cooldown.remaining} detik lagi untuk request berikutnya.`);
    return;
  }
  
  await ctx.replyWithChatAction('typing');
  
  try {
    const whoisData = await fetchWhois(text);
    const message = formatWhoisMessage(text, whoisData);
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Message error:', error);
    await ctx.reply(`❌ Gagal memproses domain <code>${text}</code>. Coba lagi nanti.`, {
      parse_mode: 'HTML'
    });
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Bot error for ${ctx.updateType}:`, err);
  ctx.reply('⚠️ Terjadi error internal. Silakan coba lagi nanti.');
});

// ============================================================
// VERCEL WEBHOOK HANDLER
// ============================================================
export default async function handler(req, res) {
  // Set CORS
  const corsMiddleware = Cors({ origin: '*', methods: ['POST'] });
  await new Promise((resolve, reject) => {
    corsMiddleware(req, res, (result) => {
      if (result instanceof Error) reject(result);
      else resolve(result);
    });
  });
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Set webhook URL saat pertama kali dijalankan (opsional)
    if (req.query?.set_webhook === 'true') {
      const webhookInfo = await bot.telegram.setWebhook(WEBHOOK_URL);
      console.log('Webhook set:', webhookInfo);
    }
    
    // Handle update dari Telegram
    await bot.handleUpdate(req.body, res);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ ok: false, error: error.message });
  }
}

// Untuk development lokal (optional)
if (process.env.NODE_ENV === 'development') {
  bot.launch();
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}