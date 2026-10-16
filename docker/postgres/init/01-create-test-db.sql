-- Runs once, on first container start. A separate database for automated tests
-- so test runs never touch development data.
CREATE DATABASE telecare_test OWNER telecare;
