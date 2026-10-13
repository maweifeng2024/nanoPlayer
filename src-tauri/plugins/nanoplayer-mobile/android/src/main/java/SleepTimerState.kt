package app.nanoplayer.mobile

/** Monotonic countdown owned by the service, independent of Activity/WebView lifetime. */
class SleepTimerState {
    enum class Expiry { NONE, PAUSE, FINISH_TRACK }
    var deadline = 0L
        private set
    var finishTrack = false
        private set
    var waiting = false
        private set

    fun start(minutes: Int, finish: Boolean, now: Long) {
        require(minutes in 0..1440)
        cancel()
        if (minutes == 0) return
        finishTrack = finish
        deadline = now + minutes * 60000L
    }
    fun cancel() { deadline = 0; waiting = false; finishTrack = false }
    fun expire(now: Long, hasTrack: Boolean, ended: Boolean): Expiry {
        if (deadline == 0L || waiting || now < deadline) return Expiry.NONE
        if (finishTrack && hasTrack && !ended) {
            waiting = true
            return Expiry.FINISH_TRACK
        }
        cancel()
        return Expiry.PAUSE
    }
}
