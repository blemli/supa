# supa

*Firebase without Google*

[Supabase](https://github.com/supabase/supabase) for problem.li — the official images plus a thin dritte layer: kamal, `/up`, logli. Nothing else.

Dashboard: <https://supa.problem.li> · API: `https://supa.problem.li/{auth,rest,realtime,storage,functions,graphql}/v1` · Postgres: `supa.problem.li:5432` (session) / `:6543` (transaction, user `postgres.supa`). Logins in 1PW (`supa`, `supa patrik`).

## deploy

```bash
gh repo clone blemli/supa
cd supa
kamal setup   # first time only, afterwards: kamal deploy
```

Secrets come from 1password (`op signin`), see `.kamal/secrets`. DNS: `supa.problem.li` → webhost.

## update

```bash
./update.sh   # merge upstream master, re-pin all image tags from docker/docker-compose.yml - review, commit, kamal deploy
```

## dritte layer

Everything upstream is untouched; ours is only:

- `Dockerfile` — `FROM` the official envoy image, pinned; bakes in upstream's `docker/volumes/api/envoy/` config
- `Dockerfile.dockerignore` — keeps the monorepo out of the build context
- `dritte/dritte.py` — stdout → logli (RFC5424 + HMAC, lossy)
- `dritte/nginx.conf` + `dritte/start.sh` — contribute `/up` (proxied to studio's health route) and a second dashboard login (`DASHBOARD2_*` mapped onto the primary basic-auth pair)
- `config/deploy.yml`, `.kamal/secrets`, `update.sh`, this README

The compose sidecars run as kamal accessories (db, meta, auth, rest, realtime, imgproxy, storage, functions, studio, supavisor) with `network-alias` recreating the compose hostnames. Logflare/vector analytics are deliberately absent (upstream default).

Edge functions live in `docker/volumes/functions/` — add a `<name>/index.ts` there, list it under the `functions` and `studio` accessory `files:` in `config/deploy.yml` (kamal cannot mount directories), then `kamal accessory reboot functions studio`.
