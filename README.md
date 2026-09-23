# Farm2me

A produce marketplace connecting farmers, buyers and transporters, with escrow-protected payments.

## Structure

- **farm2me-backend** — Node/Express + Prisma API (PostgreSQL), escrow payments, transport negotiation, notifications
- **farm2me-web** — Public marketplace frontend (Vite + React + Tailwind)
- **farm2me-admin** — Admin dashboard (Vite + React + Tailwind)
- **farm2me-mobile** — React Native app (Expo) for farmers, buyers and transporters

Each project has its own `.env.example` and `README`/`AGENTS.md` with setup details.
