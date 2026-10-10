# Release runbook

Repository: `valentinhttr/gladys-meteoswiss`. Image: `ghcr.io/valentinhttr/gladys-meteoswiss`. Code maintenance: [MAINTENANCE.md](MAINTENANCE.md).

## Commits and version selection

Write commit subjects in **English**, using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
feat(scenes): add forecast triggers
fix(forecast): preserve Swiss dates at midnight
perf(provider): reduce parsing allocations
docs: explain scene thresholds
feat(api)!: remove a published field
```

Describe incompatibilities and migration steps in the commit body. Both `!` in the subject and `BREAKING CHANGE:` / `BREAKING-CHANGE:` in the body mark breaking changes.

Choose the release type manually in the **Release** workflow:

| Type      | When to use                                                         | Example                                    |
| --------- | ------------------------------------------------------------------- | ------------------------------------------ |
| `patch`   | Fixes and maintenance without new functionality or breaking changes | 1.2.0 → 1.2.1                              |
| `minor`   | Backward-compatible functionality (`feat`)                          | 1.2.0 → 1.3.0                              |
| `major`   | Any breaking change                                                 | 1.2.0 → 2.0.0                              |
| `initial` | First release only, with no existing version tag                    | Uses the version already in `package.json` |

The generator refuses a patch for commits containing a feature, and refuses patch/minor for breaking changes. It does not pick a version automatically. A larger bump remains possible when justified. Release commits (`chore(release): ...`) are excluded from the notes.

## GitHub release format

**Titles and notes must be English only.** Use `vX.Y.Z` as the title. The generator produces sections named **Breaking Changes**, **Features**, **Bug Fixes**, **Performance**, **Documentation** and **Maintenance**, omitting empty sections.

Every entry retains its semantic commit subject, links the short hash to the full commit and credits the author. Example structure:

```text
### Features

- feat(scenes): add forecast triggers ([short SHA](commit URL)) by @author

**Full Changelog**: https://github.com/owner/repository/compare/v1.2.0...v1.3.0
```

The workflow gives the generator `GH_TOKEN` so it can resolve the GitHub account associated with each commit. If lookup is unavailable, the generator uses a GitHub noreply identity when present, otherwise the Git author name. It never invents an account from a display name or publishes author email addresses. Local preparation works without GitHub access.

The generator does not translate subjects: review commits and notes for English before publication. Unknown commit types remain visible under Maintenance. Add any hand-written migration or usage details in English, retaining generated commit references, credits and the comparison link. Forum announcements may be French; keep them separate from GitHub release notes.

## Prepare and publish

1. Review `git status`, the diff, and changes since the latest version tag. Fetch `origin` and tags. Confirm the intended release content is on top of the latest `main`; resolve concurrent changes before proceeding.
2. Run `npm test`, `npm run check`, `git diff --check`, and `npm audit --omit=dev`. Update relevant documentation and record verification limits in [VALIDATION.md](VALIDATION.md).
3. Commit the intended changes with English Conventional Commit subjects and push `main`. Check that CI succeeds on Node.js 22 and 24.
4. Run **Actions → Release → Run workflow**, selecting `main` and the appropriate release type. From the CLI, for example:

   ```sh
   gh workflow run release.yml --ref main -f release_type=minor
   ```

5. Wait for the workflow to finish successfully. Inspect the GitHub Release, its notes, tag, manifest image and version. Do not report publication as complete while the build is still running.
6. Run **Verify public installation** (`gh workflow run verify-install.yml --ref main`). It pulls the manifest's image without registry credentials and checks the installed SDK. Confirm the registry index also contains both `linux/amd64` and `linux/arm64`.
7. Fast-forward the local checkout from `origin/main`, fetch tags, and confirm the working tree is clean and versions agree. Share the release link and the checks actually completed. A public image smoke check does not prove end-to-end behavior on a real Gladys instance.

Do not manually bump versions before dispatching the workflow. `npm run release:prepare -- minor` changes the local package, lockfile, manifest, changelog and ignored `release-notes.md`; it does not publish. Use an isolated clean checkout to preview notes rather than leaving a prepared bump on `main`.

## Publication ordering and guarantees

The workflow:

1. Installs locked dependencies, validates the manifest/style, runs tests and audits production dependencies.
2. Generates the next version and English notes from commits after the latest version tag. It updates `package.json`, both lockfile version entries, the integration manifest and `CHANGELOG.md` together.
3. Creates the release commit and annotated tag locally in CI.
4. Builds and publishes the versioned image for `linux/amd64` and `linux/arm64`.
5. Only after the image exists, atomically pushes the release commit and tag, then creates the GitHub Release from `release-notes.md`.

The manifest uses an explicit version, never `latest`. One release runs at a time. Builds run inside the release workflow, not in a separate workflow relying on events from a `GITHUB_TOKEN`-created tag. Node.js 24 Alpine does not provide ARMv7 support.

## Failure recovery

| Failure                                      | Recovery                                                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests, audit or image build fails            | No new public manifest/tag should exist. Fix the cause, push the correction and rerun after inspecting the failed run.                                                       |
| Release type is too small                    | Select at least the minimum reported by the generator. Do not hide a breaking marker to pass validation.                                                                     |
| Atomic push rejected                         | Inspect branch protection or concurrent `main` changes. No partial commit/tag push occurs; an unreferenced image may exist. Resolve the cause and rerun from current `main`. |
| GitHub Release creation fails after the push | The tag and version commit already exist. Recover the matching changelog section and create the release for that tag; do not bump again.                                     |
| Author lookup fails                          | Git attribution remains in the notes. Correct the attribution if necessary without changing the version or tag.                                                              |
| Anonymous image pull fails                   | Check package visibility, image tag and registry publication. A successful authenticated build is not enough.                                                                |
| Published code has a regression              | Publish a corrective version. Do not move or overwrite a published version tag/image to hide the change.                                                                     |

For a notes-only correction, write the reviewed English Markdown to a file and use `gh release edit vX.Y.Z --notes-file <file>`. Keep the tag, image and version unchanged.

## Initial repository setup

The GitHub repository must be public. Enable Actions with `contents: write` and `packages: write`; branch protection must permit the release bot's version commit. Add the `gladys-assistant-integration` topic for catalog discovery.

After the first publication, make the GHCR package public and verify an anonymous pull before advertising installation. The `initial` workflow selection is only for a repository without version tags.

To change the repository, run `npm run setup:repository -- owner/repository` and update documentation links. In GitHub Actions, `GITHUB_REPOSITORY` determines image and commit URLs. Without it, local preparation uses the owner/repository from the manifest's GHCR image.
