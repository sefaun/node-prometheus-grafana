# Node.js + Prometheus + Grafana — Kullanıcı Bazlı API İzleme

Express tabanlı basit bir REST API'nin Prometheus + Grafana ile nasıl izleneceğini gösteren bir örnek proje. Odak noktası: **hangi kullanıcı hangi endpoint'i ne kadar kullanıyor**.

## Mimari

```
┌──────────┐    /metrics    ┌────────────┐    PromQL     ┌─────────┐
│ Node API │ ─────────────▶ │ Prometheus │ ◀──────────── │ Grafana │
│  :3000   │  scrape (5s)   │   :9090    │               │  :3001  │
└──────────┘                └────────────┘               └─────────┘
```

## Proje Yapısı

```
.
├── src/server.js              # Express API + prom-client metrikleri
├── scripts/loadTest.js        # Test trafiği üretici (farklı kullanıcı/endpoint)
├── prometheus/prometheus.yml  # Prometheus scrape config
├── grafana/
│   ├── provisioning/          # Datasource + dashboard auto-load
│   └── dashboards/            # Hazır dashboard JSON
├── Dockerfile                 # Node app image
└── docker-compose.yml         # app + prometheus + grafana
```

## Hızlı Başlangıç

### Hepsini Docker ile çalıştır (önerilen)

```bash
docker compose up -d --build
```

Sonra:
- API:        http://localhost:3000
- Metrics:    http://localhost:3000/metrics
- Prometheus: http://localhost:9090
- Grafana:    http://localhost:3001  (admin / admin)

Grafana'da **Dashboards → API Kullanıcı Metrikleri** açılınca paneller hazır gelir.

### Sadece Node uygulamasını yerelde, Prometheus/Grafana'yı Docker'da

```bash
# 1) Node bağımlılıkları
npm install

# 2) Sadece izleme stack'ini ayağa kaldır
docker compose up -d prometheus grafana

# 3) API'yi yerel başlat
npm start
```

Not: Bu modda Prometheus container'ı `app:3000` adresine erişemez. Bunun için `prometheus/prometheus.yml` içindeki target'ı `host.docker.internal:3000` olarak değiştirin (Docker Desktop, Windows/Mac için çalışır).

## API Endpoint'leri

Tümü `x-user-id` header'ı (veya `?userId=` query) ile gönderilen kullanıcıyı etiketler. Belirtilmezse `anonymous` olarak kaydedilir.

| Method | Path                | Açıklama                          |
| ------ | ------------------- | --------------------------------- |
| GET    | `/`                 | API tanıtım & endpoint listesi    |
| GET    | `/api/products`     | Ürün listesi                      |
| GET    | `/api/products/:id` | Ürün detay                        |
| POST   | `/api/orders`       | Sipariş oluştur                   |
| GET    | `/api/profile`      | Profil bilgisi                    |
| GET    | `/api/slow`         | Yapay yavaş (200–1000 ms)         |
| GET    | `/api/error`        | Her zaman 500 döner               |
| GET    | `/metrics`          | Prometheus scrape endpoint'i      |

### Manuel test

```bash
# Ahmet'in istekleri
curl -H "x-user-id: ahmet" http://localhost:3000/api/products
curl -H "x-user-id: ahmet" http://localhost:3000/api/profile

# Mehmet'in istekleri
curl -H "x-user-id: mehmet" http://localhost:3000/api/products/1
curl -X POST -H "x-user-id: mehmet" -H "Content-Type: application/json" \
  -d '{"items":[{"id":1,"qty":2}]}' http://localhost:3000/api/orders
```

PowerShell için:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/products -Headers @{ "x-user-id" = "ahmet" }
```

### Trafik üreteç (önerilen — Grafana'da hareket görmek için)

```bash
# 60 saniye boyunca saniyede 10 istek üretir
npm run load-test

# Parametrik kullanım
RPS=20 DURATION_SEC=120 npm run load-test
```

PowerShell:
```powershell
$env:RPS=20; $env:DURATION_SEC=120; npm run load-test
```

## Toplanan Metrikler

| Metrik                              | Tip       | Etiketler                                  |
| ----------------------------------- | --------- | ------------------------------------------ |
| `http_requests_total`               | Counter   | `method, route, status_code, user_id`      |
| `http_request_duration_seconds`     | Histogram | `method, route, status_code, user_id`      |
| `active_users`                      | Gauge     | —                                          |
| `process_*` / `nodejs_*`            | Default   | (prom-client default metrikleri)           |

> **Önemli:** `user_id` etiketinin cardinality'si yüksek (binlerce kullanıcı) olursa Prometheus için sorun yaratır. Demo amaçlı kullanıyoruz. Üretimde kullanıcı bazlı izleme için ya küçük kullanıcı kümeleri (örn. tier/plan) ya da Loki/structured loglar tercih edilmelidir.

## Faydalı PromQL Sorguları

Prometheus UI'de (http://localhost:9090) deneyin:

```promql
# Her kullanıcının saniyedeki istek hızı
sum by (user_id) (rate(http_requests_total[1m]))

# En aktif 10 kullanıcı (son 5 dakika)
topk(10, sum by (user_id) (increase(http_requests_total[5m])))

# Belirli bir kullanıcının endpoint dağılımı
sum by (route) (rate(http_requests_total{user_id="ahmet"}[5m]))

# Kullanıcı + endpoint kombinasyonları (kim neyi kullanıyor)
sum by (user_id, route) (increase(http_requests_total[1h]))

# Kullanıcı başına p95 yanıt süresi
histogram_quantile(0.95, sum by (user_id, le) (rate(http_request_duration_seconds_bucket[5m])))

# 5xx hata oranı
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m]))
```

## Grafana Dashboard Panelleri

- **Toplam İstek (req/s)** — anlık global throughput
- **Aktif Kullanıcı** — son 60 saniyede istek atan kullanıcı sayısı
- **İstek Süresi p95** — global gecikme
- **Hata Oranı (5xx)** — global error rate
- **Kullanıcı Bazında İstek Hızı** — her kullanıcı için ayrı çizgi
- **Endpoint Bazında İstek Hızı** — her endpoint için ayrı çizgi
- **En Aktif Kullanıcılar** — sıralı tablo
- **Kullanıcı × Endpoint Kullanım Matrisi** — kim hangi endpoint'i ne kadar kullanmış
- **Kullanıcı / Endpoint Dağılımı (stacked bar)** — görsel kıyas
- **Status Code Dağılımı** — 2xx/4xx/5xx zaman serisi

## Durdurma & Temizleme

```bash
docker compose down            # container'ları durdur
docker compose down -v         # volume'leri de sil (Prometheus/Grafana verisi)
```
