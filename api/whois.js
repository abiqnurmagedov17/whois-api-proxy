import Cors from 'cors';

const cors = Cors({
  origin: '*', // Bisa ganti dengan domain spesifik: 'https://domain-anda.com'
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function handler(req, res) {
  await runMiddleware(req, res, cors);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { domain } = req.query;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain parameter is required' });
  }
  
  try {
    const response = await fetch(`https://rewhois.com/api/whois?domain=${encodeURIComponent(domain)}`);
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Error fetching WHOIS data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch WHOIS data',
      message: error.message 
    });
  }
}