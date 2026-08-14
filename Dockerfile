# PIN - update.sh re-pins from docker/docker-compose.yml, :latest never
FROM envoyproxy/envoy:v1.39.0
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 nginx-light && rm -rf /var/lib/apt/lists/*
COPY docker/volumes/api/envoy/envoy.yaml docker/volumes/api/envoy/cds.yaml docker/volumes/api/envoy/lds.template.yaml /etc/envoy/
COPY docker/volumes/api/envoy/docker-entrypoint.sh /docker-entrypoint.sh
COPY dritte/ /dritte/
COPY apps/www/public/images/supabase-logo-icon.svg /dritte/favicon.svg
ENV DRITTE_APP=supa
ENTRYPOINT []
CMD ["python3", "/dritte/dritte.py", "--", "/bin/sh", "/dritte/start.sh"]
