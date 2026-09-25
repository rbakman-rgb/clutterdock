# Mac Prism refresh — RON-510 / RON-511

Ronald approved the Prism visual direction on September 24, 2026. This implementation starts at main `8ceaf919` and changes the native Mac interface only.

## Experience

- Shared pearl/smoked material surfaces with restrained blue selection and grouped Settings controls.
- A 480-point launcher with one to three icon rows according to stack size; larger collections scroll. Empty, locked, onboarding, list, workspace and keyboard-hint states reserve their own space. Filtering does not resize the window.
- One footer for item count, missing-item warning, sorting, Grid/List, keyboard help and Settings.
- A persistent six-section Settings sidebar; stack tabs above grouped properties and clean item rows. Paths remain in tooltips and Show in Finder. Stack/item reorder, add, rename, remove, custom imagery and feature gates remain available.
- System/Light/Dark appearance, with System as the default. Explicit existing keyboard-hint preferences are preserved; otherwise the cleaner footer is the default, with help always available.
- Reduced-transparency and increased-contrast surfaces, and reduced-motion handling for panel transitions and hover/scroll motion.
- The borderless launcher explicitly accepts keyboard focus, fixing typing and keyboard launching (RON-511).

## Verification

- Native arm64 release-mode compilation on this Mac; the installed bundle passes `codesign --verify --deep --strict`.
- All 70 Mac model checks pass, including 11 layout checks for columns, bounded large stacks, empty/locked/onboarding states, optional bars and list height.
- Live Mac verification: launcher and Settings screenshots in light and dark; typing `Clock` filters to one result; Return launches Clock; clear-search and Grid/List controls work. Stacks, Workspaces, General, Pro, Backup and About open and expose their existing controls.
- The Pro section uses direct view groups rather than a custom GroupBoxStyle; the latter disrupted native accessibility inspection during testing. The final Pro page was inspected successfully.
- Real stack contents were preserved. No license activation/deactivation, purchase, import replacement, customer update or website deployment was performed.
- Large-stack sizing is covered by model checks; drag-and-drop, Pro-only workflows, and macOS accessibility-setting combinations still need the normal release smoke pass before a customer release.

## Local delivery

Installed at `/Applications/ClutterDock.app`. The existing customer version number remains 1.4.10; this is a local Prism preview, not a published release. The previous installed app and preferences/stack configuration are backed up under the ignored `build/prism-safety-backup` folder.

This worktree is inside a file-provider-managed Documents folder. macOS adds Finder metadata to its `.app` output, invalidating that output's ad-hoc signature after compilation. For local delivery, the compiled bundle was copied without extended attributes to a local staging directory, ad-hoc signed and verified there, then installed and verified in Applications. Production signing material was read from the existing ignored local secret file and was never added to Git.
