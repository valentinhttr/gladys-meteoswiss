# Repository maintenance

Read [docs/MAINTENANCE.md](docs/MAINTENANCE.md) before changing integration behavior or release tooling. Follow [docs/RELEASING.md](docs/RELEASING.md) when preparing or publishing a release.

- Write commit subjects in English using Conventional Commits: `feat`, `fix`, `docs`, `perf`, `refactor`, `test`, `build`, `ci`, or `chore`, with a scope where useful.
- GitHub release titles and notes must be English only. Generate notes from commits, with a commit link and author on every entry, and a full changelog link. Do not replace them with bilingual announcements.
- User-facing integration content and guides remain available in English and French. Update the internal maintenance documentation when behavior, contracts, tests, or release procedures change.
- Preserve published widget and scene-trigger keys, forecast units, freshness checks, and scene deduplication guarantees.
- Run the checks appropriate to the change. Release preparation requires `npm test`, `npm run check`, `git diff --check`, and a production dependency audit.
- Publish a release when the user requests it. Use the release workflow; it publishes the image before advancing the public manifest and tag. Do not create a new version solely to edit existing release notes.
