# Shared Kernel Foundation

This directory implements RFC-001 as an additive, infrastructure-free internal contract.

It owns only meanings shared by every bounded context: strong identifiers, deterministic decimals and money, quantities, versions, trusted time, operational context, command/event envelopes, typed outcomes, errors, immutable snapshots, validation, and read-model metadata.

It must not import NestJS, Prisma, transports, persistence, environment configuration, or another bounded context. Domain engines adopt these contracts only through separately reviewed changes. Existing engine and persistence contracts are intentionally not migrated by RFC-001.

Money and decimal values serialize as canonical decimal strings. Timestamps serialize as UTC ISO-8601 strings. Snapshot checksums detect accidental corruption and are not authentication signatures.
