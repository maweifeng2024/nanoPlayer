package app.nanoplayer.mobile

internal fun scanFingerprint(size: Long, modified: Long, lyricId: String?, lyricSize: Long?, lyricModified: Long?): String =
    "$size:$modified:${lyricId.orEmpty()}:${lyricSize ?: 0}:${lyricModified ?: 0}"

// Providers that omit modification times cannot safely support incremental reuse.
internal fun canReuseScan(modified: Long, lyricModified: Long?, known: String, fingerprint: String): Boolean =
    modified > 0 && (lyricModified == null || lyricModified > 0) && known == fingerprint
