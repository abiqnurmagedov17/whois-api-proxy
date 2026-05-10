import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WHOIS_API_URL = 'https://whois-api-proxy.vercel.app/api/whois';

// Cek token
if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Telegraf(BOT_TOKEN);

// Format tanggal
function formatDate(dateStr) {
  if (!dateStr) return 'Tidak tersedia';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

// Rate limit per user (sederhana)
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

// Fetch WHOIS dari API sendiri
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

// Format pesan WHOIS
function formatWhoisMessage(domain, data) {
  if (data.error || !data.existed) {
    return `❌ <b>WHOIS Lookup Gagal</b>\n\n` +
           `Domain: <code>${domain}</code>\n\n` +
           `⚠️ ${data.message || 'Domain tidak ditemukan atau tidak valid'}\n\n` +
           `💡 Contoh penggunaan:\n` +
           `<code>/whois google.com</code>`;
  }
  
  let message = `🔍 <b>WHOIS Lookup: ${domain}</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  message += `📅 <b>Registrasi:</b>\n<code>${formatDate(data.createdDate)}</code>\n\n`;
  message += `⏰ <b>Kadaluarsa:</b>\n<code>${formatDate(data.expiryDate)}</code>\n\n`;
  
  if (data.expiryDate) {
    const expiry = new Date(data.expiryDate);
    const now = new Date();
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft > 0 && isFinite(daysLeft)) {
      const emoji = daysLeft < 30 ? '⚠️' : '✅';
      message += `${emoji} <b>Sisa waktu:</b> <code>${daysLeft} hari</code>\n\n`;
    }
  }
  
  message += `🏢 <b>Registrar:</b>\n<code>${data.registrar || 'Tidak tersedia'}</code>\n\n`;
  
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

bot.start(async (ctx) => {
  await ctx.reply(
    `🌐 <b>Selamat datang di WHOIS Lookup Bot!</b>\n\n` +
    `Bot ini membantu mengecek informasi domain seperti:\n` +
    `• Tanggal registrasi & kadaluarsa\n` +
    `• Registrar / penyedia domain\n` +
    `• Nameservers (DNS)\n` +
    `• Status domain\n` +
    `• Sisa waktu hingga kadaluarsa\n\n` +
    `<b>📌 Cara Penggunaan:</b>\n` +
    `Kirim domain atau gunakan command:\n` +
    `<code>/whois nama-domain.com</code>\n\n` +
    `<b>📝 Contoh:</b>\n` +
    `<code>/whois google.com</code>\n` +
    `<code>/whois github.com</code>`,
    {
      parse_mode: 'HTML',
      ...Markup.keyboard([
        ['/whois google.com', '/whois github.com'],
        ['/whois twitter.com', '/whois microsoft.com'],
        ['/help', '/about']
      ]).resize()
    }
  );
});

bot.help(async (ctx) => {
  await ctx.reply(
    `🆘 <b>Bantuan Penggunaan</b>\n\n` +
    `<b>📝 Command yang tersedia:</b>\n` +
    `• <code>/start</code> - Memulai bot\n` +
    `• <code>/help</code> - Menampilkan bantuan ini\n` +
    `• <code>/about</code> - Informasi tentang bot\n` +
    `• <code>/whois &lt;domain&gt;</code> - Cek WHOIS domain\n` +
    `• <code>/ping</code> - Cek status bot\n\n` +
    `<b>💡 Tips:</b>\n` +
    `• Cukup kirim nama domain saja (tanpa command)\n` +
    `• Contoh: google.com\n` +
    `• Bot akan membalas dengan informasi lengkap domain`,
    { parse_mode: 'HTML' }
  );
});

bot.command('about', async (ctx) => {
  await ctx.reply(
    `ℹ️ <b>Tentang Bot Ini</b>\n\n` +
    `🤖 <b>Nama:</b> WHOIS Lookup Bot\n` +
    `📡 <b>API:</b> Custom WHOIS API Proxy\n` +
    `⚡ <b>Technology:</b> Node.js + Telegraf + Vercel\n` +
    `📦 <b>Rate Limit:</b> 30 request per 60 detik\n` +
    `💾 <b>Cache:</b> Redis Upstash\n\n` +
    `👨‍💻 <b>Developer:</b> @Abiqnurmagedov17\n\n` +
    `✨ Bot menggunakan sliding window rate limiting!`,
    { parse_mode: 'HTML' }
  );
});

bot.command('ping', async (ctx) => {
  const start = Date.now();
  const msg = await ctx.reply('🏓 Pinging...');
  const latency = Date.now() - start;
  await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null, `🏓 Pong! Latency: <code>${latency}ms</code>`, { parse_mode: 'HTML' });
});

bot.command('whois', async (ctx) => {
  const userId = ctx.from.id;
  const cooldown = checkCooldown(userId);
  
  if (!cooldown.allowed) {
    await ctx.reply(`⏳ <b>Mohon tunggu ${cooldown.remaining} detik</b> sebelum melakukan request lagi.`, { parse_mode: 'HTML' });
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
  
  // Validasi domain
  if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
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

// Handle text messages (domain langsung)
bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Skip jika command
  if (text.startsWith('/')) return;
  
  // Validasi domain
  const domainRegex = /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!domainRegex.test(text)) {
    await ctx.reply(
      `❌ <b>Input tidak dikenali</b>\n\n` +
      `Kirimkan <b>nama domain</b> atau gunakan command <code>/help</code>.\n\n` +
      `Contoh domain valid:\n` +
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
    await ctx.reply(`⏳ Tunggu ${cooldown.remaining} detik lagi.`);
    return;
  }
  
  await ctx.replyWithChatAction('typing');
  
  try {
    const whoisData = await fetchWhois(text);
    const message = formatWhoisMessage(text, whoisData);
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Message error:', error);
    await ctx.reply(`❌ Gagal memproses domain <code>${text}</code>. Coba lagi nanti.`, { parse_mode: 'HTML' });
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Bot error:`, err);
  ctx.reply('⚠️ Terjadi error internal. Silakan coba lagi nanti.');
});

// ============================================================
// VERCEL WEBHOOK HANDLER (FIXED)
// ============================================================
export default async function handler(req, res) {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // Hanya accept POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    // Optional: set webhook
    if (req.query?.set_webhook === 'true') {
      const webhookUrl = `https://${req.headers.host}/api/telegram`;
      const webhookInfo = await bot.telegram.setWebhook(webhookUrl);
      console.log('Webhook set:', webhookInfo);
      res.status(200).json({ ok: true, message: 'Webhook set', url: webhookUrl });
      return;
    }
    
    // Handle update dari Telegram
    await bot.handleUpdate(req.body, res);
    
    // ⚠️ PENTING: Jangan kirim response lagi di sini!
    // bot.handleUpdate() sudah mengirim response
    
  } catch (error) {
    console.error('Webhook error:', error);
    // Hanya kirim response jika headers belum dikirim
    if (!res.headersSent) {
      res.status(200).json({ ok: false, error: error.message });
    }
  }
}

// Untuk development lokal (optional)
if (process.env.NODE_ENV === 'development' && BOT_TOKEN) {
  bot.launch();
  console.log('Bot running in development mode');
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}