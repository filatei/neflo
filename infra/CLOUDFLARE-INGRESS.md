# Neflo dedicated ingress (Cloudflare → Caddy)

Goal: `neflo.torama.money` is served by Neflo's **own** Caddy container on port
**8443**, fronted by Cloudflare. Apache (and its shared mod_evasive) never sees
Neflo traffic, so Neflo can't be blocked by — or block — the other apps.

```
Browser ──TLS──> Cloudflare (edge: TLS, rate limit, DDoS)
                     │  Origin Rule: neflo.torama.money → origin port 8443
                     ▼
            Linode :8443  ──> neflo-caddy (Caddy, Origin Cert)
                                   │ reverse_proxy (private net)
                                   ▼
                              neflo-app:3000
```

Do this once. It's additive — Apache keeps serving Neflo on 443 until the final
cutover step, so you can verify before flipping.

## 1. Cloudflare Origin Certificate
Cloudflare dashboard → **SSL/TLS → Origin Server → Create Certificate**.
- Hostnames: `neflo.torama.money` (or `*.torama.money`)
- Copy the **certificate** and **private key**.

On the server, install them where the compose mounts them:
```bash
sudo mkdir -p /opt/neflo/origin
sudo tee /opt/neflo/origin/cert.pem >/dev/null   # paste the certificate, save
sudo tee /opt/neflo/origin/key.pem  >/dev/null   # paste the private key, save
sudo chmod 600 /opt/neflo/origin/key.pem
```

## 2. Firewall — allow 8443 only from Cloudflare
```bash
# UFW example: allow 8443 from Cloudflare IP ranges only (repeat per range)
for r in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 \
  141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 \
  197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 \
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
  sudo ufw allow from "$r" to any port 8443 proto tcp
done
```
(Full list: https://www.cloudflare.com/ips/)

## 3. Deploy (brings up the Caddy container)
Push the repo (compose now includes the `caddy` service), let the deploy run, then:
```bash
cd /opt/neflo/app
docker compose --env-file ../.env.ports --env-file ./.env up -d
docker compose ps          # neflo-caddy should be Up
# Local origin check (Host header + skip cert name check):
curl -k -H 'Host: neflo.torama.money' https://127.0.0.1:8443/  -I
```

## 4. Cloudflare DNS + routing
- **DNS**: `A  neflo.torama.money → <Linode IP>`, **Proxied** (orange cloud).
- **SSL/TLS mode**: **Full (strict)**.
- **Origin Rule** (Rules → Origin Rules): _When_ hostname = `neflo.torama.money`,
  _set_ **Origin port = 8443**. This is what sends Cloudflare to Caddy instead
  of Apache's 443.
- (Recommended) **Rate limiting rule** scoped to `neflo.torama.money` — e.g. 100
  req / 10s per IP → managed challenge. Per-hostname, so it can't affect other apps.

Verify end-to-end:
```bash
curl -I https://neflo.torama.money/         # served via Cloudflare → Caddy
```
Confirm sign-in, checkout, and that the **SSE** live status works (payment flips
without reload — Caddy `flush_interval -1` keeps the stream unbuffered).

## 5. Cutover — stop Apache serving Neflo
Once Cloudflare→Caddy is confirmed healthy:
```bash
sudo a2dissite neflo.torama.money neflo.torama.money-le-ssl
sudo systemctl reload apache2
```
Now Neflo is fully isolated. The other apps are untouched.

## Rollback
Re-enable Apache and point Cloudflare back:
```bash
sudo a2ensite neflo.torama.money neflo.torama.money-le-ssl
sudo systemctl reload apache2
```
…and in Cloudflare delete the Origin Rule (origin returns to 443) or grey-cloud
the DNS record.

## Next: same pattern for Otuburu
Repeat per app: its own Caddy on a distinct port (e.g. 9443), its own Origin
Rule. Each app isolated; Apache shrinks to whatever's left, and eventually
retires.
