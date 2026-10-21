#!/bin/bash
# Runs once, the first time the MongoDB data volume is empty.
# Creates a writer account for analytics and a read-only account for show-results.
set -e

mongosh --quiet \
  -u "${MONGO_INITDB_ROOT_USERNAME}" -p "${MONGO_INITDB_ROOT_PASSWORD}" \
  --authenticationDatabase admin "${MONGO_DB}" <<JS
db.createUser({
  user: "${MONGO_WRITER_USER}",
  pwd: "${MONGO_WRITER_PASSWORD}",
  roles: [{ role: "readWrite", db: "${MONGO_DB}" }]
});
db.createUser({
  user: "${MONGO_READER_USER}",
  pwd: "${MONGO_READER_PASSWORD}",
  roles: [{ role: "read", db: "${MONGO_DB}" }]
});
JS
