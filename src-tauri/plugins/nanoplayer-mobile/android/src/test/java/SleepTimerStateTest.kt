package app.nanoplayer.mobile

import org.junit.Assert.*
import org.junit.Test

class SleepTimerStateTest {
    @Test fun deadlineUsesElapsedTimeAndExpiresWhileUiIsAbsent() {
        val timer = SleepTimerState()
        timer.start(15, false, 100)
        assertEquals(SleepTimerState.Expiry.NONE, timer.expire(900099, true, false))
        assertEquals(SleepTimerState.Expiry.PAUSE, timer.expire(900100, true, false))
        assertEquals(0L, timer.deadline)
        assertEquals(SleepTimerState.Expiry.NONE, timer.expire(999999, true, false))
    }
    @Test fun finishModeArmsOnlyOnceAndIgnoresRepeatMode() {
        val timer = SleepTimerState()
        timer.start(1, true, 0)
        assertEquals(SleepTimerState.Expiry.FINISH_TRACK, timer.expire(60000, true, false))
        assertTrue(timer.waiting)
        assertEquals(SleepTimerState.Expiry.NONE, timer.expire(61000, true, false))
        timer.cancel()
        assertFalse(timer.waiting)
        assertEquals(0L, timer.deadline)
    }
    @Test fun emptyOrAlreadyEndedQueueStopsImmediately() {
        for ((hasTrack, ended) in listOf(false to false, true to true)) {
            val timer = SleepTimerState()
            timer.start(1, true, 0)
            assertEquals(SleepTimerState.Expiry.PAUSE, timer.expire(60000, hasTrack, ended))
        }
    }
    @Test fun replacementAndCancellationClearWaiting() {
        val timer = SleepTimerState()
        timer.start(1, true, 0)
        timer.expire(60000, true, false)
        timer.start(30, false, 70000)
        assertFalse(timer.waiting)
        assertEquals(1870000L, timer.deadline)
        timer.start(0, true, 80000)
        assertEquals(0L, timer.deadline)
    }
    @Test(expected = IllegalArgumentException::class) fun invalidCustomDurationIsRejected() {
        SleepTimerState().start(1441, false, 0)
    }
}
