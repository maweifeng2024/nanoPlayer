package app.nanoplayer.mobile
import org.junit.Assert.*
import org.junit.Test
class ListeningSessionTest {
    @Test fun countsOnlyFullNaturalCompletionOnce() {
        val session = ListeningSession()
        session.advance(5000, true)
        assertFalse(session.complete(10000))
        session.advance(4500, true)
        assertTrue(session.complete(10000))
        assertFalse(session.complete(10000))
    }
    @Test fun pauseAndSeekNeverCreateListenedTime() {
        val session = ListeningSession()
        session.advance(10000, false)
        assertEquals(0, session.listenedMs)
        session.advance(10000, true)
        session.seeked = true
        assertFalse(session.complete(10000))
    }
    @Test fun restoredCountCannotCountAgain() {
        assertFalse(ListeningSession(10000, true).complete(10000))
        assertFalse(ListeningSession().complete(0))
    }
}
