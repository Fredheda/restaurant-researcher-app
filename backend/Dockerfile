# One image for both backend apps; APP_ROLE (api or agent) picks the routes.
# Build context: backend/  ->  docker build -t restaurant-researcher-backend backend
FROM python:3.13-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir "poetry>=2.0,<3.0" \
    && poetry config virtualenvs.in-project true
COPY pyproject.toml poetry.lock ./
RUN poetry install --only main --no-interaction --no-ansi
COPY app/ ./app/

FROM python:3.13-slim
WORKDIR /app

# mssql-python bundles its own driver; these are its only runtime system
# dependencies (Kerberos and dynamic loading). No ODBC driver manager.
RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends \
    libltdl7 \
    libkrb5-3 \
    libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv ./.venv
COPY --from=builder /app/app ./app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1
RUN useradd --system --uid 10001 app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
