// Basit yük üretici: farklı kullanıcılar ile farklı endpointlere istek atar.
// Kullanım: node scripts/loadTest.js
// Ortam değişkenleri: BASE_URL, DURATION_SEC, RPS

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DURATION_SEC = Number(process.env.DURATION_SEC || 60);
const RPS = Number(process.env.RPS || 10);

const users = ['ahmet', 'mehmet', 'ayse', 'fatma', 'can', 'zeynep'];

const endpoints = [
  { method: 'GET', path: '/api/products', weight: 5 },
  { method: 'GET', path: '/api/products/1', weight: 3 },
  { method: 'GET', path: '/api/products/2', weight: 2 },
  { method: 'GET', path: '/api/profile', weight: 4 },
  { method: 'POST', path: '/api/orders', weight: 2, body: { items: [{ id: 1, qty: 2 }] } },
  { method: 'GET', path: '/api/slow', weight: 1 },
  { method: 'GET', path: '/api/error', weight: 1 },
];

// Ağırlıklı seçim için flatten
const weighted = endpoints.flatMap((e) => Array(e.weight).fill(e));

function pickUser() {
  // Bazı kullanıcılar daha aktif olsun diye ağırlık verelim
  const r = Math.random();
  if (r < 0.4) return users[0]; // ahmet en aktif
  if (r < 0.65) return users[1]; // mehmet
  return users[2 + Math.floor(Math.random() * (users.length - 2))];
}

async function fire() {
  const user = pickUser();
  const ep = weighted[Math.floor(Math.random() * weighted.length)];
  const url = BASE_URL + ep.path;

  try {
    const res = await fetch(url, {
      method: ep.method,
      headers: {
        'content-type': 'application/json',
        'x-user-id': user,
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    process.stdout.write(`${res.status} ${ep.method} ${ep.path} user=${user}\n`);
  } catch (err) {
    process.stdout.write(`ERR  ${ep.method} ${ep.path} user=${user} → ${err.message}\n`);
  }
}

async function main() {
  console.log(`Yük testi başlıyor: ${RPS} req/s, ${DURATION_SEC}s, ${BASE_URL}`);
  const intervalMs = 1000 / RPS;
  const end = Date.now() + DURATION_SEC * 1000;

  while (Date.now() < end) {
    fire(); // beklemiyoruz, fire-and-forget
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  // Son isteklerin bitmesi için kısa bekleme
  await new Promise((r) => setTimeout(r, 1000));
  console.log('Yük testi tamamlandı.');
}

main();
