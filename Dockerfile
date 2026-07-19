# DistroMap backend container — used by `fly deploy`.
# Keep the image slim: no build tools, no git, no curl. python:3.12-slim
# is ~120 MB; pip-only install adds ~50 MB. Total ~180 MB, well within
# Fly's free layer.
FROM python:3.12-slim

# Don't write .pyc, don't buffer stdout/stderr (Fly reads logs live).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first → cache layer between code-only deploys.
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --upgrade pip && \
    pip install -r /app/backend/requirements.txt

# Copy the backend module + the seed-cache folder so the volume
# mount at /app/.cache/api can target an EXISTING directory.
COPY backend/  /app/backend/
COPY .cache/   /app/.cache/

# uvicorn binds to Fly's internal port 8080 (matches fly.toml).
EXPOSE 8080

# Don't run as root — minimal defence-in-depth for a tiny maintainer
# API. The volume mount at /app/.cache/api stays writable because Fly
# binds it as the running uid (1000) at machine start.
RUN useradd --create-home --uid 1000 --shell /bin/false distromap && \
    chown -R distromap:distromap /app
USER distromap

# Two workers would help, but the file-on-disk Flask layer needs a
# process-local threading.Lock — multiple workers would each lock
# independently and could lose rows. One worker for v0.5.
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
