const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ----- Prometheus Registry ve Default Metrikler -----
const register = new client.Registry();
register.setDefaultLabels({ app: 'node-prometheus-grafana' });
client.collectDefaultMetrics({ register });

// ----- Özel Metrikler -----
// Her istek için kullanıcı / endpoint / method / status code bazında sayaç
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Toplam HTTP istek sayısı (kullanıcı bazlı)',
  labelNames: ['method', 'route', 'status_code', 'user_id'],
});

// İstek süresi histogramı (gecikme ölçümü için)
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP isteklerinin saniye cinsinden süre dağılımı',
  labelNames: ['method', 'route', 'status_code', 'user_id'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

// Aktif kullanıcı sayısı (basit demo amaçlı set yapısı)
const activeUsers = new client.Gauge({
  name: 'active_users',
  help: 'Son 60 saniyede istek atan kullanıcı sayısı',
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDurationSeconds);
register.registerMetric(activeUsers);

// ----- Aktif kullanıcı takibi (in-memory, demo amaçlı) -----
const seenUsers = new Map(); // userId -> lastSeenTimestamp
const ACTIVE_WINDOW_MS = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [userId, ts] of seenUsers.entries()) {
    if (now - ts > ACTIVE_WINDOW_MS) seenUsers.delete(userId);
  }
  activeUsers.set(seenUsers.size);
}, 5000);

// ----- Metrik Toplama Middleware -----
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  if (req.path !== '/metrics') console.log('istek geldi');
  // Kullanıcıyı header, query veya body üzerinden al; yoksa 'anonymous'
  const userId =
    req.header('x-user-id') ||
    req.query.userId ||
    (req.body && req.body.userId) ||
    'anonymous';
  req.userId = String(userId);

  seenUsers.set(req.userId, Date.now());

  res.on('finish', () => {
    // /metrics endpoint'ini metriklerin içine almıyoruz ki gürültü olmasın
    if (req.path === '/metrics') return;

    // Express route pattern'ini al (örn: /users/:id) - cardinality için önemli
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
      user_id: req.userId,
    };

    httpRequestsTotal.inc(labels);

    const durationNs = Number(process.hrtime.bigint() - start);
    httpRequestDurationSeconds.observe(labels, durationNs / 1e9);
  });

  next();
});

// ----- Demo API Endpoint'leri -----
app.get('/', (req, res) => {
  res.json({
    message: 'Node.js + Prometheus + Grafana demo',
    user: req.userId,
    endpoints: [
      'GET  /api/products',
      'GET  /api/products/:id',
      'POST /api/orders',
      'GET  /api/profile',
      'GET  /api/slow',
      'GET  /api/error',
      'GET  /metrics',
    ],
  });
});

app.get('/api/products', (req, res) => {
  res.json({
    user: req.userId,
    products: [
      { id: 1, name: 'Laptop', price: 25000 },
      { id: 2, name: 'Telefon', price: 18000 },
      { id: 3, name: 'Kulaklık', price: 1500 },
    ],
  });
});

app.get('/api/products/:id', (req, res) => {
  res.json({ user: req.userId, productId: req.params.id, name: 'Demo ürün' });
});

app.post('/api/orders', (req, res) => {
  res.status(201).json({
    user: req.userId,
    orderId: Math.floor(Math.random() * 100000),
    items: req.body.items || [],
  });
});

app.get('/api/profile', (req, res) => {
  res.json({ user: req.userId, name: 'Demo User', plan: 'pro' });
});

// Yapay yavaş endpoint - histogram bucketları görmek için
app.get('/api/slow', async (req, res) => {
  const delay = 200 + Math.random() * 800;
  await new Promise((r) => setTimeout(r, delay));
  res.json({ user: req.userId, delayMs: Math.round(delay) });
});

// Yapay hata endpoint'i - status code metriklerini test etmek için
app.get('/api/error', (req, res) => {
  res.status(500).json({ user: req.userId, error: 'Demo amaçlı hata' });
});

// ----- Prometheus scrape endpoint'i -----
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ user: req.userId, error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`API çalışıyor: http://localhost:${PORT}`);
  console.log(`Metrikler:    http://localhost:${PORT}/metrics`);
});
