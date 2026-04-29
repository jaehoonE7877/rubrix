# Artifact under evaluation: iOS LoginViewController refactor

The artifact is the iOS app's `LoginViewController.swift` and the new `LoginInteractor.swift`, evaluated after `git apply` of the proposed refactor diff.

## Inputs evaluators may read

- `LoginViewController.swift` (after refactor)
- `LoginInteractor.swift` (new)
- `git diff main..HEAD -- LoginViewController.swift` (for `row_api`)
- `xcodebuild test -scheme App -destination 'platform=iOS Simulator,name=iPhone 15'` output (for `row_tests`)

## Out of scope

- Style nits not encoded in the rubric
- Performance micro-benchmarks not in the rubric

## Notes

This example is illustrative — the actual `LoginViewController.swift`/`LoginInteractor.swift` files are not in this repo. To run the example, copy `examples/ios-refactor/rubrix.json` into an iOS project, populate `scores[]` from real evaluator runs, then run `rubrix gate examples/ios-refactor/rubrix.json --apply`.
