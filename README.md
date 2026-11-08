# Lawha (working name)

Board-based work management for Tafseel Boxes, Arabic first. Rebuilt clean-room from the plan in `../replica/`.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # data layer tests
npm run typecheck
npm run demo       # single-file demo in dist-demo/index.html
```

Data currently lives in the browser (`src/lib/data/fake.ts`). The backend stage replaces it with Supabase behind the same `DataLayer` interface (`src/lib/data/types.ts`); schema and access rules are in `../replica/schema.sql`.

Design tokens come from `../replica/design/` (run `python3 ../replica/design/build_tokens.py`, then copy `tokens.css` and `tailwind.tokens.js` here).
