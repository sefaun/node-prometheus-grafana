# Node.js + Prometheus + Grafana — Kullanıcı Bazlı API İzleme

## Mimari

```
┌──────────┐    /metrics    ┌────────────┐    PromQL     ┌─────────┐
│ Node API │ ─────────────▶ │ Prometheus │ ◀──────────── │ Grafana │
│  :3000   │  scrape (5s)   │   :9090    │               │  :3001  │
└──────────┘                └────────────┘               └─────────┘
```

## Start

```bash
docker stack deploy -c stack.yml monitoring    # swarm başlat
docker stack rm monitoring                     # swarm durdur
```
