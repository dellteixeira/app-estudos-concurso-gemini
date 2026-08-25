from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing anchor in {path}: {old[:100]}")
    p.write_text(text.replace(old, new))


replace(
    "public/js/app-state.js",
    "        global.OfflineSyncMetadataStability?.install?.();\n        if (!global.OfflineSyncMetadataExpansion) await loadExtensionScript('./js/core/offline-sync-metadata-expansion.js?v=10.41.0', 'offline-sync-metadata-expansion');",
    "        global.OfflineSyncMetadataStability?.install?.();\n        if (!global.OfflineSyncMetadataExpandedStability) await loadExtensionScript('./js/core/offline-sync-metadata-expanded-stability.js?v=10.41.0', 'offline-sync-metadata-expanded-stability');\n        global.OfflineSyncMetadataExpandedStability?.install?.();\n        if (!global.OfflineSyncMetadataExpansion) await loadExtensionScript('./js/core/offline-sync-metadata-expansion.js?v=10.41.0', 'offline-sync-metadata-expansion');",
)
replace(
    "public/js/app-state.js",
    "            metadataStability:global.OfflineSyncMetadataStability?.getDiagnostics?.() || null,\n            metadataExpansion:global.OfflineSyncMetadataExpansion?.getDiagnostics?.() || null,",
    "            metadataStability:global.OfflineSyncMetadataStability?.getDiagnostics?.() || null,\n            metadataExpandedStability:global.OfflineSyncMetadataExpandedStability?.getDiagnostics?.() || null,\n            metadataExpansion:global.OfflineSyncMetadataExpansion?.getDiagnostics?.() || null,",
)
replace(
    "public/js/app-state.js",
    "        getOfflineSyncMetadataStabilityDiagnostics:() => global.OfflineSyncMetadataStability?.getDiagnostics?.() || null,\n        getOfflineSyncMetadataExpansionDiagnostics:() => global.OfflineSyncMetadataExpansion?.getDiagnostics?.() || null,",
    "        getOfflineSyncMetadataStabilityDiagnostics:() => global.OfflineSyncMetadataStability?.getDiagnostics?.() || null,\n        getOfflineSyncMetadataExpandedStabilityDiagnostics:() => global.OfflineSyncMetadataExpandedStability?.getDiagnostics?.() || null,\n        getOfflineSyncMetadataExpansionDiagnostics:() => global.OfflineSyncMetadataExpansion?.getDiagnostics?.() || null,",
)

manifest = Path("config/app-assets.json")
text = manifest.read_text()
anchor = '"/js/core/offline-sync-metadata-stability.js", "/js/core/offline-sync-metadata-expansion.js"'
if text.count(anchor) != 4:
    raise SystemExit(f"expected 4 manifest anchors, got {text.count(anchor)}")
manifest.write_text(
    text.replace(
        anchor,
        '"/js/core/offline-sync-metadata-stability.js", "/js/core/offline-sync-metadata-expanded-stability.js", "/js/core/offline-sync-metadata-expansion.js"',
    )
)

sw = Path("public/sw.js")
text = sw.read_text()
critical = "'./js/core/offline-sync-metadata-stability.js', './js/core/offline-sync-metadata-expansion.js'"
core = "'/js/core/offline-sync-metadata-stability.js', '/js/core/offline-sync-metadata-expansion.js'"
if text.count(critical) != 1 or text.count(core) != 1:
    raise SystemExit("unexpected service-worker anchors")
text = text.replace(
    critical,
    "'./js/core/offline-sync-metadata-stability.js', './js/core/offline-sync-metadata-expanded-stability.js', './js/core/offline-sync-metadata-expansion.js'",
)
text = text.replace(
    core,
    "'/js/core/offline-sync-metadata-stability.js', '/js/core/offline-sync-metadata-expanded-stability.js', '/js/core/offline-sync-metadata-expansion.js'",
)
sw.write_text(text)

replace(
    "src/worker.js",
    "  '/js/core/offline-sync-metadata-stability.js',\n  '/js/core/offline-sync-metadata-expansion.js',",
    "  '/js/core/offline-sync-metadata-stability.js',\n  '/js/core/offline-sync-metadata-expanded-stability.js',\n  '/js/core/offline-sync-metadata-expansion.js',",
)
replace(
    "public/_headers",
    "/js/core/offline-sync-metadata-stability.js\n  Cache-Control: no-cache, no-store, must-revalidate\n\n/js/core/offline-sync-metadata-expansion.js",
    "/js/core/offline-sync-metadata-stability.js\n  Cache-Control: no-cache, no-store, must-revalidate\n\n/js/core/offline-sync-metadata-expanded-stability.js\n  Cache-Control: no-cache, no-store, must-revalidate\n\n/js/core/offline-sync-metadata-expansion.js",
)
