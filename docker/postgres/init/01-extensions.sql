-- Creates the vector extension in every database the entrypoint initializes.
--
-- The entrypoint runs this directory only on first initialization of an empty
-- PGDATA, so databases that already exist get the extension from the Drizzle
-- migration that introduces the retrieval tables. Both paths use
-- IF NOT EXISTS, so applying one after the other is harmless.
--
-- pgvector is installed in the image; this only registers it in the database.

CREATE EXTENSION IF NOT EXISTS vector;
