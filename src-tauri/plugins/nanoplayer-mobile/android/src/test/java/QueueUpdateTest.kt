package app.nanoplayer.mobile

import org.junit.Assert.*
import org.junit.Test

class QueueUpdateTest {
    private fun apply(old: List<String>, next: List<String>, current: Int): List<String> {
        val edits = queueReplacements(old, next, current)
        assertTrue(edits.size <= 2)
        val result = old.toMutableList()
        for (edit in edits) {
            if (current >= 0 && old[current] in next) assertFalse(current in edit.from until edit.to)
            result.subList(edit.from, edit.to).clear()
            result.addAll(edit.from, next.subList(edit.itemsFrom, edit.itemsTo))
        }
        return result
    }
    @Test fun filtersTenThousandTracksInTwoCallsAndKeepsCurrentSource() {
        val old = (0 until 10000).map { it.toString() }
        val next = old.filterIndexed { index, _ -> index % 2 == 0 }
        assertEquals(next, apply(old, next, 5000))
    }
    @Test fun handlesReorderInsertionDeletionAndUnchangedQueue() {
        val old = listOf("a", "b", "c", "d")
        for (next in listOf(listOf("d", "b", "a"), listOf("x", "b", "y"), listOf("b"), old))
            assertEquals(next, apply(old, next, 1))
        assertTrue(queueReplacements(old, old, 1).isEmpty())
    }
    @Test fun handlesMissingCurrentAndEmptyQueues() {
        assertEquals(listOf("a"), apply(emptyList(), listOf("a"), -1))
        assertEquals(emptyList<String>(), apply(listOf("a"), emptyList(), 0))
        assertEquals(listOf("x"), apply(listOf("a"), listOf("x"), 0))
    }
}
