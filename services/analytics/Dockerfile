# Stage 1: build/install dependencies (wheels, pip cache and build tooling stay in this stage)
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: slim runtime with only the installed packages and our source, non-root user
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=builder /install /usr/local
COPY src ./src
USER app
EXPOSE 8000
CMD ["python", "src/main.py"]
