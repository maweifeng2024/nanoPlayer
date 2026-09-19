package app.nanoplayer.mobile

import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random

class QueueOrderTest {
    @Test fun shuffleBeginsWithCurrentAndVisitsEveryQueueEntryOnce() {
        val order = shuffledQueueIndices(20, 9, Random(42))
        assertEquals(9, order.first())
        assertEquals((0 until 20).toSet(), order.toSet())
        assertEquals(20, order.size)
        assertFalse(order.drop(1) == (0 until 20).filter { it != 9 })
    }
    @Test fun handlesEmptySingleAndUnavailableCurrentIndex() {
        assertArrayEquals(intArrayOf(), shuffledQueueIndices(0, -1))
        assertArrayEquals(intArrayOf(0), shuffledQueueIndices(1, -1))
        assertEquals(0, shuffledQueueIndices(5, -1).first())
    }
}
