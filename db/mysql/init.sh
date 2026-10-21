#!/bin/bash
# Runs once, the first time the MySQL data volume is empty.
# Creates the tables and one least-privilege account per service.
# Variables come from the mysql container environment (see docker-compose.yml).
set -e

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" <<SQL
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS measurements (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)   NOT NULL,
  value      DECIMAL(12,4) NOT NULL,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_measurements_username (username)
);

-- auth: reads users, creates the seed user
CREATE USER IF NOT EXISTS '${AUTH_DB_USER}'@'%' IDENTIFIED BY '${AUTH_DB_PASSWORD}';
GRANT SELECT, INSERT ON ${MYSQL_DATABASE}.users TO '${AUTH_DB_USER}'@'%';

-- enter-data: writes and reads measurements only
CREATE USER IF NOT EXISTS '${ENTER_DB_USER}'@'%' IDENTIFIED BY '${ENTER_DB_PASSWORD}';
GRANT SELECT, INSERT ON ${MYSQL_DATABASE}.measurements TO '${ENTER_DB_USER}'@'%';

-- analytics: read-only on measurements
CREATE USER IF NOT EXISTS '${ANALYTICS_DB_USER}'@'%' IDENTIFIED BY '${ANALYTICS_DB_PASSWORD}';
GRANT SELECT ON ${MYSQL_DATABASE}.measurements TO '${ANALYTICS_DB_USER}'@'%';

FLUSH PRIVILEGES;
SQL
