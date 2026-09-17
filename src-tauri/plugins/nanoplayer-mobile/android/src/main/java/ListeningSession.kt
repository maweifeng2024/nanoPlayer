package app.nanoplayer.mobile

/** Same rule as store.completePlayback: natural end, no seek, full duration ±750ms. */
class ListeningSession(var listenedMs: Long = 0, var counted: Boolean = false, var seeked: Boolean = false) {
    fun advance(elapsedMs: Long, playing: Boolean) {
        if (playing) listenedMs += elapsedMs.coerceAtLeast(0)
    }
    fun complete(durationMs: Long): Boolean {
        if (counted || seeked || durationMs <= 0 || listenedMs < maxOf(1L, durationMs - 750)) return false
        counted = true
        return true
    }
}
